import { useState } from 'react';
import { AlertTriangle, Check, Plus, X } from 'lucide-react';
import type { User } from '../../types';
import { apiJson, apiSend } from '../../lib/api';
import { can } from '../../lib/permissions';
import { errorMessage, formatDate, money } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Badge, Button, Card, Empty, ErrorNote, Field, Modal, Spinner, Th, inputClass, statusTone } from '../ui';

export interface ContractorLite { id: string; name: string; company: string; hourlyRate: number; currency: string }
interface Alert extends ContractorLite { contractEnd: string; daysLeft: number }

/** Banner listing contracts that end soon or have already lapsed. */
export const ContractAlerts = () => {
  const { data } = useAsync(() => apiJson<{ days: number; expiring: Alert[]; expired: Alert[] }>('/admin/contractors/alerts'));
  if (!data || (!data.expiring.length && !data.expired.length)) return null;
  return (
    <div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex gap-3">
      <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={20} aria-hidden="true" />
      <div className="text-sm text-amber-900 space-y-1">
        {data.expired.length > 0 && <p><strong>Contract ended:</strong> {data.expired.map((c) => `${c.name} (${formatDate(c.contractEnd)})`).join(', ')}</p>}
        {data.expiring.length > 0 && <p><strong>Ending within {data.days} days:</strong> {data.expiring.map((c) => `${c.name} — ${c.daysLeft === 0 ? 'today' : `${c.daysLeft} day${c.daysLeft === 1 ? '' : 's'}`}`).join(', ')}</p>}
      </div>
    </div>
  );
};

interface TimesheetRow { id: string; contractorId: string; weekStart: string; hours: number; notes: string; status: 'Submitted' | 'Approved' | 'Rejected' }

const mondayOf = (date = new Date()) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};

export const Timesheets = ({ user, contractors }: { user: User; contractors: ContractorLite[] }) => {
  const canWrite = can(user, 'outsourcing', 'write');
  const [contractorId, setContractorId] = useState('');
  const { data, loading, error, reload } = useAsync(() => apiJson<TimesheetRow[]>('/admin/timesheets'));
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ contractorId: '', weekStart: mondayOf(), hours: '40', notes: '' });
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const byId = new Map(contractors.map((c) => [c.id, c]));
  const rows = (data ?? []).filter((t) => !contractorId || t.contractorId === contractorId);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiSend('POST', `/admin/contractors/${form.contractorId}/timesheets`, { weekStart: form.weekStart, hours: Number(form.hours), notes: form.notes });
      setOpen(false);
      await reload();
    } catch (err) { setFormError(errorMessage(err)); }
  };
  const review = (t: TimesheetRow, status: 'Approved' | 'Rejected') =>
    apiSend('PUT', `/admin/timesheets/${t.id}`, { status }).then(() => reload()).catch((e) => setActionError(errorMessage(e)));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <select aria-label="Filter by contractor" className={`${inputClass} w-64`} value={contractorId} onChange={(e) => setContractorId(e.target.value)}>
          <option value="">All contractors</option>
          {contractors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {canWrite && <Button onClick={() => { setForm({ ...form, contractorId: contractorId || contractors[0]?.id || '' }); setFormError(null); setOpen(true); }}><Plus size={14} />Log timesheet</Button>}
      </div>
      <ErrorNote error={error ?? actionError} />
      <Card flush>
        {loading && !data ? <Spinner /> : !rows.length ? <Empty>No timesheets.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50"><tr><Th>Contractor</Th><Th>Week of</Th><Th>Hours</Th><Th>Cost</Th><Th>Status</Th><Th right /></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((t) => {
                  const c = byId.get(t.contractorId);
                  return (
                    <tr key={t.id}>
                      <td className="px-6 py-3 text-sm font-bold text-slate-900">{c?.name ?? 'Unknown'}<span className="block text-xs font-normal text-slate-400">{t.notes}</span></td>
                      <td className="px-6 py-3 text-sm text-slate-600">{formatDate(t.weekStart)}</td>
                      <td className="px-6 py-3 text-sm font-extrabold text-slate-900">{t.hours}h</td>
                      <td className="px-6 py-3 text-sm text-slate-600">{c && c.hourlyRate ? money(t.hours * c.hourlyRate, c.currency) : '—'}</td>
                      <td className="px-6 py-3"><Badge tone={statusTone(t.status)}>{t.status}</Badge></td>
                      <td className="px-6 py-3 text-right">{canWrite && t.status === 'Submitted' && (
                        <span className="inline-flex gap-2">
                          <Button small variant="secondary" aria-label="Approve timesheet" onClick={() => review(t, 'Approved')}><Check size={12} /></Button>
                          <Button small variant="ghost" aria-label="Reject timesheet" onClick={() => review(t, 'Rejected')}><X size={12} /></Button>
                        </span>
                      )}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Modal open={open} title="Log a timesheet" onClose={() => setOpen(false)}>
        <form onSubmit={save} className="space-y-4">
          <ErrorNote error={formError} />
          <Field label="Contractor"><select required className={inputClass} value={form.contractorId} onChange={(e) => setForm({ ...form, contractorId: e.target.value })}>{contractors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Week starting (Monday)"><input required type="date" className={inputClass} value={form.weekStart} onChange={(e) => setForm({ ...form, weekStart: e.target.value })} /></Field>
            <Field label="Hours"><input required type="number" min="0" max="168" step="0.5" className={inputClass} value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} /></Field>
          </div>
          <Field label="Notes"><input className={inputClass} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          <Button type="submit" className="w-full">Save timesheet</Button>
        </form>
      </Modal>
    </div>
  );
};

interface InvoiceRow {
  id: string; number: string; amount: number; currency: string; issueDate: string; dueDate: string;
  status: 'Draft' | 'Sent' | 'Paid'; displayStatus: string; contractor?: { name: string; company: string };
}

export const Invoices = ({ user, contractors }: { user: User; contractors: ContractorLite[] }) => {
  const canWrite = can(user, 'outsourcing', 'write');
  const { data, loading, error, reload } = useAsync(() => apiJson<InvoiceRow[]>('/admin/invoices'));
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const blank = { contractorId: '', number: '', amount: '', issueDate: today, dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10) };
  const [form, setForm] = useState(blank);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiSend('POST', '/admin/invoices', { ...form, amount: Number(form.amount) });
      setOpen(false);
      await reload();
    } catch (err) { setFormError(errorMessage(err)); }
  };
  const setStatus = (i: InvoiceRow, status: string) => apiSend('PUT', `/admin/invoices/${i.id}`, { status }).then(() => reload()).catch((e) => setActionError(errorMessage(e)));

  const outstanding = (data ?? []).filter((i) => i.status !== 'Paid').reduce((s, i) => s + i.amount, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">Outstanding: <strong className="text-slate-900">{money(outstanding)}</strong></p>
        {canWrite && <Button onClick={() => { setForm({ ...blank, contractorId: contractors[0]?.id ?? '' }); setFormError(null); setOpen(true); }}><Plus size={14} />Record invoice</Button>}
      </div>
      <ErrorNote error={error ?? actionError} />
      <Card flush>
        {loading && !data ? <Spinner /> : !data?.length ? <Empty>No invoices recorded.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50"><tr><Th>Invoice</Th><Th>Contractor</Th><Th>Amount</Th><Th>Due</Th><Th>Status</Th><Th right /></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.map((i) => (
                  <tr key={i.id}>
                    <td className="px-6 py-3 text-sm font-bold text-slate-900">{i.number}<span className="block text-xs font-normal text-slate-400">Issued {formatDate(i.issueDate)}</span></td>
                    <td className="px-6 py-3 text-sm text-slate-600">{i.contractor?.name}<span className="block text-xs text-slate-400">{i.contractor?.company}</span></td>
                    <td className="px-6 py-3 text-sm font-extrabold text-slate-900">{money(i.amount, i.currency)}</td>
                    <td className="px-6 py-3 text-sm text-slate-600">{formatDate(i.dueDate)}</td>
                    <td className="px-6 py-3"><Badge tone={statusTone(i.displayStatus)}>{i.displayStatus}</Badge></td>
                    <td className="px-6 py-3 text-right">{canWrite && i.status !== 'Paid' && (
                      <Button small variant="secondary" onClick={() => setStatus(i, i.status === 'Draft' ? 'Sent' : 'Paid')}>{i.status === 'Draft' ? 'Mark sent' : 'Mark paid'}</Button>
                    )}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Modal open={open} title="Record an invoice" onClose={() => setOpen(false)}>
        <form onSubmit={save} className="space-y-4">
          <ErrorNote error={formError} />
          <Field label="Contractor"><select required className={inputClass} value={form.contractorId} onChange={(e) => setForm({ ...form, contractorId: e.target.value })}>{contractors.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.company}</option>)}</select></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Invoice number"><input required className={inputClass} value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} /></Field>
            <Field label="Amount"><input required type="number" min="0.01" step="0.01" className={inputClass} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Issued"><input required type="date" className={inputClass} value={form.issueDate} onChange={(e) => setForm({ ...form, issueDate: e.target.value })} /></Field>
            <Field label="Due"><input required type="date" min={form.issueDate} className={inputClass} value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></Field>
          </div>
          <Button type="submit" className="w-full">Save invoice</Button>
        </form>
      </Modal>
    </div>
  );
};
