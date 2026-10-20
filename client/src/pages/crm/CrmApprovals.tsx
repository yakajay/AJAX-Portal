import React, { useState } from 'react';
import type { User } from '../../types';
import { apiJson, apiSend } from '../../lib/api';
import { can } from '../../lib/permissions';
import { errorMessage, formatDate, money } from '../../lib/format';
import { formatTime } from '../../lib/datetime';
import { useAsync } from '../../lib/useAsync';
import { Badge, Button, ErrorNote, Field, Modal, PageHeader, Spinner, inputClass, statusTone } from '../../components/ui';
import { PersonChip } from '../../components/crm/shared';

type Kind = 'leave' | 'attendance' | 'expense';
interface Item {
  key: string; kind: Kind; id: string; userId: string; name: string; label: string; when: string; reason?: string | null; status: string;
}

interface LeaveRow { id: string; userId: string; type: string; startDate: string; endDate: string; days: number; halfDay: boolean; reason?: string | null; status: string; user?: { name: string } }
interface Correction { id: string; userId: string; checkInAt: string; checkOutAt: string | null; reason?: string | null; user?: { name: string } }
interface ExpenseRow { id: string; userId: string; title: string; category: string; amount: number; currency: string; date: string; description?: string; status: string; user?: { name: string } }

const KIND_LABEL: Record<Kind, string> = { leave: 'Leave', attendance: 'Attendance', expense: 'Expenses' };
const SHORT = { day: 'numeric', month: 'short' } as const;

const Approvals = ({ user }: { user: User }) => {
  const canLeave = can(user, 'leave', 'write');
  const canAttendance = can(user, 'attendance', 'write');
  const canExpense = can(user, 'expenses', 'write');
  const leaves = useAsync(() => (can(user, 'leave', 'read') ? apiJson<LeaveRow[]>('/admin/leaves') : Promise.resolve([] as LeaveRow[])));
  const corrections = useAsync(() => (can(user, 'attendance', 'read') ? apiJson<Correction[]>('/admin/attendance/regularizations') : Promise.resolve([] as Correction[])));
  const expenses = useAsync(() => (can(user, 'expenses', 'read') ? apiJson<ExpenseRow[]>('/admin/expenses') : Promise.resolve([] as ExpenseRow[])));

  const [tab, setTab] = useState<'all' | Kind>('all');
  const [decided, setDecided] = useState<Record<string, 'Approved' | 'Rejected'>>({});
  const [rejecting, setRejecting] = useState<Item | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const items: Item[] = [
    ...(leaves.data ?? []).filter((l) => l.status === 'Pending' || decided[`leave-${l.id}`]).map((l): Item => ({
      key: `leave-${l.id}`, kind: 'leave', id: l.id, userId: l.userId, name: l.user?.name ?? 'Employee',
      label: `${l.type}${l.halfDay ? ' (half day)' : ''} · ${l.days} day${l.days === 1 ? '' : 's'}`,
      when: l.startDate === l.endDate ? formatDate(l.startDate, SHORT) : `${formatDate(l.startDate, SHORT)} – ${formatDate(l.endDate, SHORT)}`,
      reason: l.reason, status: l.status
    })),
    ...(corrections.data ?? []).map((c): Item => ({
      key: `attendance-${c.id}`, kind: 'attendance', id: c.id, userId: c.userId, name: c.user?.name ?? 'Employee',
      label: 'Attendance regularization',
      when: `${formatDate(c.checkInAt, SHORT)} · ${formatTime(c.checkInAt)}${c.checkOutAt ? ` – ${formatTime(c.checkOutAt)}` : ''}`,
      reason: c.reason, status: 'Pending'
    })),
    ...(expenses.data ?? []).filter((x) => x.status === 'Pending' || decided[`expense-${x.id}`]).map((x): Item => ({
      key: `expense-${x.id}`, kind: 'expense', id: x.id, userId: x.userId, name: x.user?.name ?? 'Employee',
      label: `${x.title} · ${money(x.amount, x.currency)}`, when: `${x.category} · ${formatDate(x.date, SHORT)}`,
      reason: x.description, status: x.status
    }))
  ];

  const isOpen = (i: Item) => !decided[i.key] && i.status === 'Pending';
  const countOf = (k: 'all' | Kind) => items.filter((i) => isOpen(i) && (k === 'all' || i.kind === k)).length;
  const shown = items.filter((i) => tab === 'all' || i.kind === tab);
  const mayDecide = (k: Kind) => (k === 'leave' ? canLeave : k === 'attendance' ? canAttendance : canExpense);

  const reload = (kind: Kind) => void (kind === 'leave' ? leaves : kind === 'attendance' ? corrections : expenses).reload();

  const decide = async (item: Item, status: 'Approved' | 'Rejected', reviewNote = '') => {
    setBusy(true);
    setError(null);
    try {
      const path = item.kind === 'leave' ? `/admin/leaves/${item.id}` : item.kind === 'attendance' ? `/admin/attendance/${item.id}/review` : `/admin/expenses/${item.id}/review`;
      await apiSend('PUT', path, { status, note: reviewNote });
      setDecided((d) => ({ ...d, [item.key]: status }));
      reload(item.kind);
      setRejecting(null);
      setNote('');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  // Only leave can be moved back to pending
  const undo = async (item: Item) => {
    setBusy(true);
    setError(null);
    try {
      await apiSend('PUT', `/admin/leaves/${item.id}`, { status: 'Pending' });
      setDecided((d) => { const next = { ...d }; delete next[item.key]; return next; });
      reload('leave');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const loading = (leaves.loading && !leaves.data) || (corrections.loading && !corrections.data) || (expenses.loading && !expenses.data);
  const approvedNow = Object.values(decided).filter((s) => s === 'Approved').length;
  const rejectedNow = Object.values(decided).filter((s) => s === 'Rejected').length;
  const summary: [string, number][] = [['Waiting for you', countOf('all')], ['Approved this session', approvedNow], ['Rejected this session', rejectedNow]];

  return (
    <div className="space-y-6 max-w-6xl">
      <PageHeader title="Approvals" subtitle="Leave, attendance and expense requests from your teams" />
      <ErrorNote error={error ?? leaves.error ?? corrections.error ?? expenses.error} />
      <section className="flex flex-wrap gap-5 items-start">
        <div className="flex-[3] basis-[28rem] min-w-0 flex flex-col gap-4">
          <div role="tablist" aria-label="Request type" className="flex flex-wrap gap-2">
            {(['all', 'leave', 'attendance', 'expense'] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={`min-h-11 px-4 rounded-[10px] text-sm font-bold border-[1.5px] border-blue-600 transition-colors ${tab === k ? 'bg-blue-600 text-white' : 'bg-white text-blue-800 hover:bg-blue-50'}`}
              >
                {k === 'all' ? 'All' : KIND_LABEL[k]} · {countOf(k)}
              </button>
            ))}
          </div>
          {loading ? <Spinner /> : shown.length === 0 ? (
            <div className="p-8 rounded-2xl bg-white border border-slate-200 text-[15px] text-slate-500">Nothing is waiting here. New requests appear as soon as your teams send them.</div>
          ) : shown.map((item) => {
            const done = decided[item.key];
            return (
              <article key={item.key} className="p-5 rounded-2xl bg-white border border-slate-200 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-start gap-3.5 min-w-0 flex-1 basis-64">
                  <PersonChip person={{ id: item.userId, name: item.name }} size={40} />
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="font-extrabold text-[15px] text-slate-900">{item.name}</span>
                    <span className="text-sm font-semibold text-slate-700">{item.label}</span>
                    <span className="text-[13px] text-slate-500">{item.when}</span>
                    {item.reason && <span className="text-sm text-slate-600 italic break-words">“{item.reason}”</span>}
                  </div>
                </div>
                {isOpen(item) && mayDecide(item.kind) && (
                  <div className="flex gap-2.5">
                    <Button variant="secondary" disabled={busy} onClick={() => { setRejecting(item); setNote(''); }} aria-label={`Reject ${item.name}'s request`}>Reject</Button>
                    <Button disabled={busy} onClick={() => decide(item, 'Approved')} aria-label={`Approve ${item.name}'s request`}>Approve</Button>
                  </div>
                )}
                {isOpen(item) && !mayDecide(item.kind) && <Badge tone="slate">View only</Badge>}
                {done && (
                  <div className="flex items-center gap-3">
                    <Badge tone={statusTone(done)}>{done}</Badge>
                    {item.kind === 'leave' && <Button small variant="ghost" disabled={busy} onClick={() => undo(item)}>Undo</Button>}
                  </div>
                )}
              </article>
            );
          })}
        </div>
        <aside className="flex-1 basis-64 min-w-0 p-6 rounded-2xl bg-white border border-slate-200 flex flex-col gap-3.5">
          <h2 className="text-lg font-extrabold text-slate-900">Today</h2>
          {summary.map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-3 pb-3 border-b border-slate-100 last:border-0">
              <span className="text-sm text-slate-600">{label}</span>
              <span className="text-xl font-extrabold text-slate-900">{value}</span>
            </div>
          ))}
        </aside>
      </section>

      <Modal open={!!rejecting} title={`Reject ${rejecting?.name ?? ''}'s request`} onClose={() => setRejecting(null)}>
        <form
          className="space-y-4"
          onSubmit={(e: React.FormEvent) => { e.preventDefault(); if (rejecting) void decide(rejecting, 'Rejected', note); }}
        >
          <Field label="Reason (shown to the employee)">
            <textarea rows={3} className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2.5">
            <Button variant="secondary" onClick={() => setRejecting(null)}>Cancel</Button>
            <Button type="submit" variant="danger" disabled={busy}>Reject request</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Approvals;
