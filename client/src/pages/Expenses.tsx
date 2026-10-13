import { useState } from 'react';
import { Plus, Check, X, Banknote, Trash2 } from 'lucide-react';
import type { User } from '../types';
import { apiJson, apiSend } from '../lib/api';
import { can } from '../lib/permissions';
import { formatDate, money, errorMessage } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { Badge, Button, Card, Empty, ErrorNote, Field, Modal, PageHeader, Spinner, StatTile, Tabs, Th, inputClass, statusTone } from '../components/ui';

const CATEGORIES = ['Travel', 'Meals', 'Accommodation', 'Equipment', 'Software', 'Training', 'Other'];

interface ExpenseRecord {
  id: string;
  title: string;
  category: string;
  amount: number;
  currency: string;
  date: string;
  description: string;
  receiptRef: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Reimbursed';
  reviewNote: string;
  user?: { name: string; department?: string };
}

const today = () => new Date().toISOString().slice(0, 10);

const Expenses = ({ user }: { user: User | null }) => {
  const canReview = can(user, 'expenses', 'read');
  const canWrite = can(user, 'expenses', 'write');
  const [tab, setTab] = useState<'mine' | 'review'>('mine');
  const mine = useAsync(() => apiJson<ExpenseRecord[]>('/user/expenses'));
  const all = useAsync(() => (canReview ? apiJson<ExpenseRecord[]>('/admin/expenses') : Promise.resolve([] as ExpenseRecord[])), [canReview]);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', category: 'Travel', amount: '', date: today(), receiptRef: '', description: '' });
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await apiSend('POST', '/user/expenses', { ...form, amount: Number(form.amount) });
      setOpen(false);
      setForm({ title: '', category: 'Travel', amount: '', date: today(), receiptRef: '', description: '' });
      await Promise.all([mine.reload(), all.reload()]);
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const act = async (fn: () => Promise<unknown>) => {
    try {
      setActionError(null);
      await fn();
      await Promise.all([mine.reload(), all.reload()]);
    } catch (err) {
      setActionError(errorMessage(err));
    }
  };

  const review = (id: string, status: 'Approved' | 'Rejected') => {
    const note = status === 'Rejected' ? window.prompt('Reason for rejecting (shown to the employee):') ?? '' : '';
    return act(() => apiSend('PUT', `/admin/expenses/${id}/review`, { status, note }));
  };

  const totals = (mine.data ?? []).reduce(
    (acc, e) => {
      if (e.status === 'Pending') acc.pending += e.amount;
      if (e.status === 'Approved') acc.approved += e.amount;
      if (e.status === 'Reimbursed') acc.paid += e.amount;
      return acc;
    },
    { pending: 0, approved: 0, paid: 0 }
  );
  const queue = (all.data ?? []).filter((e) => e.status === 'Pending' || e.status === 'Approved');

  return (
    <div className="space-y-6">
      <PageHeader title="Expenses" subtitle="Claim work expenses and track their reimbursement." actions={<Button onClick={() => setOpen(true)}><Plus size={14} />New claim</Button>} />
      {canReview && <Tabs tabs={[{ id: 'mine', label: 'My claims' }, { id: 'review', label: 'Review claims', badge: queue.filter((e) => e.status === 'Pending').length }]} value={tab} onChange={setTab} />}
      <ErrorNote error={actionError ?? mine.error ?? all.error} />

      {tab === 'mine' && (
        <>
          <div className="grid sm:grid-cols-3 gap-4">
            <StatTile label="Awaiting review" value={money(totals.pending)} />
            <StatTile label="Approved, unpaid" value={money(totals.approved)} />
            <StatTile label="Reimbursed" value={money(totals.paid)} />
          </div>
          <Card flush>
            {mine.loading ? <Spinner /> : !mine.data?.length ? <Empty>No claims yet.</Empty> : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50"><tr><Th>Expense</Th><Th>Date</Th><Th>Amount</Th><Th>Status</Th><Th right /></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {mine.data.map((e) => (
                      <tr key={e.id}>
                        <td className="px-6 py-4"><p className="text-sm font-bold text-slate-900">{e.title}</p><p className="text-xs text-slate-400">{e.category}{e.receiptRef ? ` · ${e.receiptRef}` : ''}</p>{e.reviewNote && <p className="text-xs text-slate-500 mt-1">Note: {e.reviewNote}</p>}</td>
                        <td className="px-6 py-4 text-sm text-slate-600">{formatDate(e.date)}</td>
                        <td className="px-6 py-4 text-sm font-black text-slate-900">{money(e.amount, e.currency)}</td>
                        <td className="px-6 py-4"><Badge tone={statusTone(e.status)}>{e.status}</Badge></td>
                        <td className="px-6 py-4 text-right">
                          {e.status === 'Pending' && <button aria-label={`Withdraw ${e.title}`} className="p-2 text-slate-400 hover:text-rose-600" onClick={() => act(() => apiSend('DELETE', `/user/expenses/${e.id}`))}><Trash2 size={16} /></button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {tab === 'review' && (
        <Card flush>
          {all.loading ? <Spinner /> : !queue.length ? <Empty>Nothing waiting for review.</Empty> : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50"><tr><Th>Employee</Th><Th>Expense</Th><Th>Amount</Th><Th>Status</Th><Th right>Actions</Th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {queue.map((e) => (
                    <tr key={e.id}>
                      <td className="px-6 py-4 text-sm font-bold text-slate-900">{e.user?.name ?? 'Unknown'}</td>
                      <td className="px-6 py-4"><p className="text-sm text-slate-900">{e.title}</p><p className="text-xs text-slate-400">{e.category} · {formatDate(e.date)}{e.receiptRef ? ` · ${e.receiptRef}` : ''}</p></td>
                      <td className="px-6 py-4 text-sm font-black text-slate-900">{money(e.amount, e.currency)}</td>
                      <td className="px-6 py-4"><Badge tone={statusTone(e.status)}>{e.status}</Badge></td>
                      <td className="px-6 py-4">
                        {canWrite && (
                          <div className="flex justify-end gap-2">
                            {e.status === 'Pending' && <>
                              <Button small variant="secondary" aria-label={`Approve ${e.title}`} onClick={() => review(e.id, 'Approved')}><Check size={13} />Approve</Button>
                              <Button small variant="ghost" aria-label={`Reject ${e.title}`} onClick={() => review(e.id, 'Rejected')}><X size={13} />Reject</Button>
                            </>}
                            {e.status === 'Approved' && <Button small onClick={() => act(() => apiSend('POST', `/admin/expenses/${e.id}/reimburse`))}><Banknote size={13} />Reimburse</Button>}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      <Modal open={open} title="New expense claim" onClose={() => setOpen(false)}>
        <form onSubmit={submit} className="space-y-4">
          <ErrorNote error={formError} />
          <Field label="What was it for?"><input required className={inputClass} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Taxi to client site" /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Category"><select className={inputClass} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Amount (USD)"><input required type="number" step="0.01" min="0.01" className={inputClass} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Date spent"><input required type="date" max={today()} className={inputClass} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
            <Field label="Receipt no. / link"><input className={inputClass} value={form.receiptRef} onChange={(e) => setForm({ ...form, receiptRef: e.target.value })} /></Field>
          </div>
          <Field label="Notes"><textarea rows={3} className={inputClass} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <Button type="submit" disabled={saving} className="w-full">{saving ? 'Submitting…' : 'Submit claim'}</Button>
        </form>
      </Modal>
    </div>
  );
};

export default Expenses;
