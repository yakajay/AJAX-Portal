import { useState } from 'react';
import { Check, X, UserMinus, Undo2, Landmark } from 'lucide-react';
import type { User } from '../types';
import { apiJson, apiSend } from '../lib/api';
import { can } from '../lib/permissions';
import { formatDate, money, errorMessage } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { Badge, Button, Card, Empty, ErrorNote, Field, Modal, PageHeader, Spinner, Tabs, Th, inputClass, statusTone } from '../components/ui';

interface ExitRecord {
  id: string;
  type: string;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Withdrawn' | 'Settled';
  requestedLastDay: string | null;
  lastWorkingDay: string | null;
  reviewNote: string;
  settlement?: { total: number; currency: string; salaryDue: number; leaveEncashment: number; expensesDue: number; deductions: number; note: string };
  user?: { id: string; name: string; department?: string };
}
interface Preview { salaryDue: number; leaveEncashment: number; expensesDue: number; deductions: number; total: number; currency: string; annualLeaveAvailable: number }

const today = () => new Date().toISOString().slice(0, 10);
const OTHER_TYPES = ['Termination', 'Retirement', 'End of contract'];

const Offboarding = ({ user }: { user: User | null }) => {
  const canManage = can(user, 'onboarding', 'read');
  const canWrite = can(user, 'onboarding', 'write') && can(user, 'payroll', 'write');
  const [tab, setTab] = useState<'mine' | 'manage'>('mine');
  const mine = useAsync(() => apiJson<ExitRecord[]>('/user/exits'));
  const all = useAsync(() => (canManage ? apiJson<ExitRecord[]>('/admin/exits') : Promise.resolve([] as ExitRecord[])), [canManage]);
  const people = useAsync(() => (canManage ? apiJson<{ id: string; name: string }[]>('/admin/users') : Promise.resolve([])), [canManage]);

  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ reason: '', requestedLastDay: '' });
  const [starting, setStarting] = useState(false);
  const [start, setStart] = useState({ userId: '', type: OTHER_TYPES[0], lastWorkingDay: today(), reason: '' });
  const [settling, setSettling] = useState<ExitRecord | null>(null);
  const [adj, setAdj] = useState({ leaveEncashmentDays: '0', deductions: '0', note: '' });
  const [preview, setPreview] = useState<Preview | null>(null);

  const act = async (fn: () => Promise<unknown>) => {
    try {
      setError(null);
      await fn();
      await Promise.all([mine.reload(), all.reload()]);
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    }
  };

  const active = (mine.data ?? []).find((e) => e.status === 'Pending' || e.status === 'Approved');
  const queue = (all.data ?? []).filter((e) => e.status === 'Pending' || e.status === 'Approved');
  const history = (all.data ?? []).filter((e) => e.status === 'Settled' || e.status === 'Rejected' || e.status === 'Withdrawn');

  const approve = (e: ExitRecord) => {
    const day = window.prompt('Last working day (YYYY-MM-DD):', e.requestedLastDay ?? today());
    if (!day) return;
    return act(() => apiSend('PUT', `/admin/exits/${e.id}/review`, { status: 'Approved', lastWorkingDay: day }));
  };
  const reject = (e: ExitRecord) => {
    const note = window.prompt('Reason for declining (shown to the employee):') ?? '';
    return act(() => apiSend('PUT', `/admin/exits/${e.id}/review`, { status: 'Rejected', note }));
  };

  const query = (a: typeof adj) => `leaveEncashmentDays=${encodeURIComponent(a.leaveEncashmentDays || '0')}&deductions=${encodeURIComponent(a.deductions || '0')}`;
  const refreshPreview = async (e: ExitRecord, a: typeof adj) => {
    try {
      setPreview(await apiJson<Preview>(`/admin/exits/${e.id}/settlement?${query(a)}`));
      setError(null);
    } catch (err) {
      setPreview(null);
      setError(errorMessage(err));
    }
  };
  const openSettle = (e: ExitRecord) => {
    const a = { leaveEncashmentDays: '0', deductions: '0', note: '' };
    setAdj(a);
    setSettling(e);
    void refreshPreview(e, a);
  };
  const confirmSettle = async () => {
    if (!settling) return;
    const ok = await act(() => apiSend('POST', `/admin/exits/${settling.id}/settle`, {
      leaveEncashmentDays: Number(adj.leaveEncashmentDays || 0), deductions: Number(adj.deductions || 0), note: adj.note
    }));
    if (ok) setSettling(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Offboarding" subtitle="Resign, and settle final pay when someone leaves." actions={canManage && canWrite ? <Button onClick={() => setStarting(true)}><UserMinus size={14} />Start an exit</Button> : undefined} />
      {canManage && <Tabs tabs={[{ id: 'mine', label: 'My resignation' }, { id: 'manage', label: 'Exits', badge: queue.filter((e) => e.status === 'Pending').length }]} value={tab} onChange={setTab} />}
      <ErrorNote error={error ?? mine.error ?? all.error} />

      {tab === 'mine' && (
        <>
          {!active && (
            <Card>
              <form className="space-y-4 max-w-lg" onSubmit={async (ev) => { ev.preventDefault(); if (await act(() => apiSend('POST', '/user/exits', form))) setForm({ reason: '', requestedLastDay: '' }); }}>
                <p className="text-sm text-slate-600">Submit your resignation. HR confirms your last working day.</p>
                <Field label="Proposed last working day"><input required type="date" min={today()} className={inputClass} value={form.requestedLastDay} onChange={(e) => setForm({ ...form, requestedLastDay: e.target.value })} /></Field>
                <Field label="Reason"><textarea required rows={3} maxLength={1000} className={inputClass} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>
                <Button type="submit">Submit resignation</Button>
              </form>
            </Card>
          )}
          <Card flush>
            {mine.loading ? <Spinner /> : !mine.data?.length ? <Empty>You have no exit requests.</Empty> : (
              <table className="w-full text-left">
                <thead className="bg-slate-50"><tr><Th>Type</Th><Th>Last working day</Th><Th>Status</Th><Th right /></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {mine.data.map((e) => (
                    <tr key={e.id}>
                      <td className="px-6 py-4"><p className="text-sm font-bold text-slate-900">{e.type}</p><p className="text-xs text-slate-400">{e.reason}</p>{e.reviewNote && <p className="text-xs text-slate-500 mt-1">Note: {e.reviewNote}</p>}</td>
                      <td className="px-6 py-4 text-sm text-slate-600">{e.lastWorkingDay ? formatDate(e.lastWorkingDay) : `${formatDate(e.requestedLastDay ?? '')} (proposed)`}</td>
                      <td className="px-6 py-4"><Badge tone={statusTone(e.status)}>{e.status}</Badge></td>
                      <td className="px-6 py-4 text-right">
                        {e.type === 'Resignation' && (e.status === 'Pending' || e.status === 'Approved') && <Button small variant="ghost" onClick={() => act(() => apiSend('DELETE', `/user/exits/${e.id}`))}><Undo2 size={13} />Withdraw</Button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}

      {tab === 'manage' && (
        <>
          <Card flush>
            {all.loading ? <Spinner /> : !queue.length ? <Empty>No exits in progress.</Empty> : (
              <table className="w-full text-left">
                <thead className="bg-slate-50"><tr><Th>Employee</Th><Th>Type</Th><Th>Last working day</Th><Th>Status</Th><Th right>Actions</Th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {queue.map((e) => (
                    <tr key={e.id}>
                      <td className="px-6 py-4 text-sm font-bold text-slate-900">{e.user?.name ?? 'Unknown'}<p className="text-xs font-normal text-slate-400">{e.reason}</p></td>
                      <td className="px-6 py-4 text-sm text-slate-600">{e.type}</td>
                      <td className="px-6 py-4 text-sm text-slate-600">{e.lastWorkingDay ? formatDate(e.lastWorkingDay) : `${formatDate(e.requestedLastDay ?? '')} (proposed)`}</td>
                      <td className="px-6 py-4"><Badge tone={statusTone(e.status)}>{e.status}</Badge></td>
                      <td className="px-6 py-4">
                        {canManage && (
                          <div className="flex justify-end gap-2">
                            {e.status === 'Pending' && <>
                              <Button small variant="secondary" aria-label={`Approve ${e.user?.name}`} onClick={() => approve(e)}><Check size={13} />Approve</Button>
                              <Button small variant="ghost" aria-label={`Decline ${e.user?.name}`} onClick={() => reject(e)}><X size={13} />Decline</Button>
                            </>}
                            {e.status === 'Approved' && canWrite && <Button small onClick={() => openSettle(e)}><Landmark size={13} />Settle</Button>}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
          {!!history.length && (
            <Card flush>
              <table className="w-full text-left">
                <thead className="bg-slate-50"><tr><Th>Employee</Th><Th>Type</Th><Th>Status</Th><Th>Final settlement</Th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {history.map((e) => (
                    <tr key={e.id}>
                      <td className="px-6 py-4 text-sm font-bold text-slate-900">{e.user?.name ?? 'Unknown'}</td>
                      <td className="px-6 py-4 text-sm text-slate-600">{e.type}</td>
                      <td className="px-6 py-4"><Badge tone={statusTone(e.status)}>{e.status}</Badge></td>
                      <td className="px-6 py-4 text-sm font-black text-slate-900">{e.settlement && e.status === 'Settled' ? money(e.settlement.total, e.settlement.currency) : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}

      <Modal open={starting} title="Start an exit" onClose={() => setStarting(false)}>
        <form className="space-y-4" onSubmit={async (ev) => { ev.preventDefault(); if (await act(() => apiSend('POST', '/admin/exits', start))) setStarting(false); }}>
          <Field label="Employee"><select required className={inputClass} value={start.userId} onChange={(e) => setStart({ ...start, userId: e.target.value })}><option value="">Choose…</option>{(people.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <Field label="Type"><select className={inputClass} value={start.type} onChange={(e) => setStart({ ...start, type: e.target.value })}>{OTHER_TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
          <Field label="Last working day"><input required type="date" className={inputClass} value={start.lastWorkingDay} onChange={(e) => setStart({ ...start, lastWorkingDay: e.target.value })} /></Field>
          <Field label="Reason"><textarea rows={2} className={inputClass} value={start.reason} onChange={(e) => setStart({ ...start, reason: e.target.value })} /></Field>
          <Button type="submit">Record exit</Button>
        </form>
      </Modal>

      <Modal open={!!settling} title={`Full & final settlement${settling?.user ? ` - ${settling.user.name}` : ''}`} onClose={() => setSettling(null)}>
        {settling && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Annual leave days to encash" hint={preview ? `${preview.annualLeaveAvailable} available` : undefined}>
                <input type="number" min={0} step="0.5" className={inputClass} value={adj.leaveEncashmentDays} onChange={(e) => { const a = { ...adj, leaveEncashmentDays: e.target.value }; setAdj(a); void refreshPreview(settling, a); }} />
              </Field>
              <Field label="Other deductions (notice shortfall, assets)">
                <input type="number" min={0} className={inputClass} value={adj.deductions} onChange={(e) => { const a = { ...adj, deductions: e.target.value }; setAdj(a); void refreshPreview(settling, a); }} />
              </Field>
            </div>
            <Field label="Note"><input className={inputClass} value={adj.note} maxLength={500} onChange={(e) => setAdj({ ...adj, note: e.target.value })} /></Field>
            {preview && (
              <dl className="text-sm divide-y divide-slate-100 border border-slate-200 rounded-xl">
                {([['Final month salary (prorated)', preview.salaryDue], ['Leave encashment', preview.leaveEncashment], ['Approved expense claims', preview.expensesDue], ['Deductions', -preview.deductions]] as const).map(([label, value]) => (
                  <div key={label} className="flex justify-between px-4 py-2"><dt className="text-slate-500">{label}</dt><dd className="font-bold">{money(value, preview.currency)}</dd></div>
                ))}
                <div className="flex justify-between px-4 py-3 bg-slate-50"><dt className="font-bold">Total payable</dt><dd className="font-black">{money(preview.total, preview.currency)}</dd></div>
              </dl>
            )}
            <p className="text-xs text-slate-500">Settling locks the account, signs the person out everywhere and records the payout in the payments ledger. It cannot be undone.</p>
            <Button onClick={confirmSettle} disabled={!preview}>Settle and close account</Button>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Offboarding;
