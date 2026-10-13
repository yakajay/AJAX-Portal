import React, { useMemo, useState } from 'react';
import { AlertCircle, Ban, Check, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import type { User } from '../types';
import { apiJson, apiSend } from '../lib/api';
import { can } from '../lib/permissions';
import { currentMonth, errorMessage, formatDate, monthLabel } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { Badge, Button, Card, Empty, ErrorNote, Field, Modal, PageHeader, Spinner, Tabs, Th, inputClass, statusTone } from '../components/ui';

interface LeaveRequest {
  id: string; userId: string; type: string; startDate: string; endDate: string; days: number;
  halfDay: boolean; halfDayPart: string | null; status: string; reason?: string | null; reviewNote?: string;
  user?: { name: string };
}
interface Holiday { id: string; date: string; name: string }
interface Balance { type: string; total: number; carriedForward: number; accrued: number; taken: number; pending: number; remaining: number }
interface CalendarData {
  month: string;
  leaves: { id: string; userId: string; name: string; department: string; type: string; startDate: string; endDate: string; days: number; halfDay: boolean; status: string }[];
  holidays: { date: string; name: string }[];
}

const LEAVE_TYPES = ['Annual Leave', 'Sick Leave', 'Casual Leave', 'Unpaid Leave'];
const TYPE_DOT: Record<string, string> = { 'Annual Leave': 'bg-blue-500', 'Sick Leave': 'bg-rose-500', 'Casual Leave': 'bg-amber-500', 'Unpaid Leave': 'bg-slate-400' };

// "Oct 2, 2026" -> "2026-10-02"
const holidayIso = (label: string) => {
  const t = Date.parse(`${label} UTC`);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
};

const workingDaysBetween = (start: string, end: string, holidays: Set<string>) => {
  let count = 0;
  for (let t = Date.parse(`${start}T00:00:00Z`); t <= Date.parse(`${end}T00:00:00Z`); t += 86400000) {
    const d = new Date(t);
    const iso = d.toISOString().slice(0, 10);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6 && !holidays.has(iso)) count++;
  }
  return count;
};

const ApplyLeaveModal = ({ open, onClose, onApplied, balances, holidays }: {
  open: boolean; onClose: () => void; onApplied: () => void; balances: Balance[]; holidays: Holiday[];
}) => {
  const blank = { type: 'Annual Leave', startDate: '', endDate: '', halfDay: false, halfDayPart: 'First Half', reason: '' };
  const [form, setForm] = useState(blank);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const holidaySet = useMemo(() => new Set(holidays.map((h) => holidayIso(h.date)).filter((d): d is string => !!d)), [holidays]);
  const valid = form.startDate && form.endDate && form.endDate >= form.startDate;
  const estimate = valid ? (form.halfDay ? 0.5 : workingDaysBetween(form.startDate, form.endDate, holidaySet)) : null;
  const balance = balances.find((b) => b.type === form.type);

  const set = (patch: Partial<typeof form>) => setForm((f) => {
    const next = { ...f, ...patch };
    // A half day is a single date
    if (next.halfDay && next.startDate) next.endDate = next.startDate;
    return next;
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiSend('POST', '/user/leaves', { ...form, halfDayPart: form.halfDay ? form.halfDayPart : undefined });
      setForm(blank);
      onApplied();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} title="Apply for leave" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <ErrorNote error={error} />
        <Field label="Leave type">
          <select className={inputClass} value={form.type} onChange={(e) => set({ type: e.target.value })}>{LEAVE_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Start date"><input required type="date" className={inputClass} value={form.startDate} onChange={(e) => set({ startDate: e.target.value, endDate: form.endDate < e.target.value || form.halfDay ? e.target.value : form.endDate })} /></Field>
          <Field label="End date"><input required type="date" min={form.startDate} disabled={form.halfDay} className={inputClass} value={form.endDate} onChange={(e) => set({ endDate: e.target.value })} /></Field>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={form.halfDay} onChange={(e) => set({ halfDay: e.target.checked })} />Half day</label>
          {form.halfDay && (
            <select aria-label="Which half" className={`${inputClass} !w-auto`} value={form.halfDayPart} onChange={(e) => set({ halfDayPart: e.target.value })}>
              <option>First Half</option><option>Second Half</option>
            </select>
          )}
        </div>
        <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-600" aria-live="polite">
          {estimate === null ? 'Pick your dates to see the length.' : estimate === 0
            ? 'These dates are weekends or holidays only.'
            : <><strong className="text-slate-900">{estimate} working day{estimate === 1 ? '' : 's'}</strong> (weekends and public holidays are not counted).</>}
          {balance && <span className="block text-xs text-slate-400 mt-1">You have {balance.remaining} {form.type.toLowerCase()} day(s) available.</span>}
        </div>
        <Field label="Reason"><textarea required rows={3} className={inputClass} value={form.reason} onChange={(e) => set({ reason: e.target.value })} placeholder="Provide a brief reason for your leave…" /></Field>
        <Button type="submit" disabled={saving || estimate === 0} className="w-full">{saving ? 'Submitting…' : 'Submit request'}</Button>
      </form>
    </Modal>
  );
};

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const TeamCalendar = () => {
  const [month, setMonth] = useState(currentMonth());
  const { data, loading, error } = useAsync(() => apiJson<CalendarData>(`/user/leaves/calendar?month=${month}`), [month]);

  const shift = (delta: number) => {
    const [y, m] = month.split('-').map(Number);
    setMonth(new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7));
  };

  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const offset = (first.getUTCDay() + 6) % 7;
  const cells = [...Array<null>(offset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const iso = (day: number) => `${month}-${String(day).padStart(2, '0')}`;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <Card
      title={monthLabel(month)}
      actions={<div className="flex gap-1">
        <button aria-label="Previous month" className="p-2 rounded-lg hover:bg-slate-100" onClick={() => shift(-1)}><ChevronLeft size={18} /></button>
        <button aria-label="Next month" className="p-2 rounded-lg hover:bg-slate-100" onClick={() => shift(1)}><ChevronRight size={18} /></button>
      </div>}
    >
      <ErrorNote error={error} />
      {loading && !data ? <Spinner /> : (
        <div className="overflow-x-auto">
          <div className="grid grid-cols-7 gap-px bg-slate-200 border border-slate-200 rounded-xl overflow-hidden min-w-[640px]">
            {WEEKDAYS.map((d) => <div key={d} className="bg-slate-50 py-2 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">{d}</div>)}
            {cells.map((day, i) => {
              if (!day) return <div key={`blank-${i}`} className="bg-slate-50 min-h-24" />;
              const date = iso(day);
              const out = data?.leaves.filter((l) => l.startDate <= date && date <= l.endDate) ?? [];
              const holiday = data?.holidays.find((h) => h.date === date);
              const weekend = (i % 7) >= 5;
              return (
                <div key={date} className={`min-h-24 p-1.5 ${weekend ? 'bg-slate-50' : 'bg-white'} ${date === today ? 'ring-2 ring-inset ring-blue-500' : ''}`}>
                  <div className="text-xs font-bold text-slate-500">{day}</div>
                  {holiday && <div className="mt-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 rounded px-1 truncate" title={holiday.name}>{holiday.name}</div>}
                  <ul className="mt-1 space-y-0.5">
                    {out.slice(0, 3).map((l) => (
                      <li key={l.id} title={`${l.name} · ${l.type}${l.halfDay ? ' (half day)' : ''} · ${l.status}`} className={`flex items-center gap-1 text-[10px] font-semibold rounded px-1 truncate ${l.status === 'Pending' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${TYPE_DOT[l.type] ?? 'bg-slate-400'}`} />
                        <span className="truncate">{l.name.split(' ')[0]}{l.halfDay ? ' ½' : ''}</span>
                      </li>
                    ))}
                    {out.length > 3 && <li className="text-[10px] font-bold text-slate-400">+{out.length - 3} more</li>}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <p className="mt-3 text-xs text-slate-400">Amber entries are still waiting for approval.</p>
    </Card>
  );
};

const LeaveTable = ({ rows, showEmployee, actions }: { rows: LeaveRequest[]; showEmployee: boolean; actions?: (l: LeaveRequest) => React.ReactNode }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-left">
      <thead className="bg-slate-50">
        <tr>{showEmployee && <Th>Employee</Th>}<Th>Type</Th><Th>Dates</Th><Th>Days</Th><Th>Status</Th>{actions && <Th right>Actions</Th>}</tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map((l) => (
          <tr key={l.id} className="hover:bg-slate-50/50">
            {showEmployee && <td className="px-6 py-4 text-sm font-bold text-slate-900">{l.user?.name ?? 'Unknown'}</td>}
            <td className="px-6 py-4 text-sm font-bold text-slate-700">{l.type}{l.halfDay && <span className="block text-xs font-normal text-slate-400">{l.halfDayPart}</span>}</td>
            <td className="px-6 py-4 text-xs font-semibold text-slate-600">{formatDate(l.startDate, { month: 'short', day: 'numeric' })}{l.endDate !== l.startDate && ` – ${formatDate(l.endDate)}`}{l.endDate === l.startDate && `, ${l.startDate.slice(0, 4)}`}</td>
            <td className="px-6 py-4 text-sm font-bold text-slate-900">{l.days}</td>
            <td className="px-6 py-4"><Badge tone={statusTone(l.status)}>{l.status}</Badge>{l.reviewNote && <span className="block text-xs text-slate-400 mt-1">{l.reviewNote}</span>}</td>
            {actions && <td className="px-6 py-4 text-right">{actions(l)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

type TabId = 'my' | 'calendar' | 'team' | 'approvals';

const LeaveManagement = ({ user }: { user: User | null }) => {
  const isApprover = can(user, 'leave', 'read');
  const canDecide = can(user, 'leave', 'write');
  const [tab, setTab] = useState<TabId>('my');
  const [applyOpen, setApplyOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const mine = useAsync(() => apiJson<LeaveRequest[]>('/user/leaves'));
  const balances = useAsync(() => apiJson<Balance[]>('/user/leaves/balance'));
  const holidays = useAsync(() => apiJson<Holiday[]>('/user/holidays'));
  const team = useAsync(() => apiJson<LeaveRequest[]>('/user/team/leaves'));
  const everyone = useAsync(() => (isApprover ? apiJson<LeaveRequest[]>('/admin/leaves') : Promise.resolve([] as LeaveRequest[])), [isApprover]);

  const refreshAll = () => { void mine.reload(); void balances.reload(); void team.reload(); void everyone.reload(); };

  const pendingTeam = team.data?.filter((l) => l.status === 'Pending').length ?? 0;
  const pendingAll = everyone.data?.filter((l) => l.status === 'Pending').length ?? 0;
  const tabs: { id: TabId; label: string; badge?: number }[] = [
    { id: 'my', label: 'My leave' },
    { id: 'calendar', label: 'Team calendar' },
    ...((team.data?.length ?? 0) > 0 ? [{ id: 'team' as const, label: 'My team', badge: pendingTeam }] : []),
    ...(isApprover ? [{ id: 'approvals' as const, label: 'All approvals', badge: pendingAll }] : [])
  ];

  const decide = async (l: LeaveRequest, status: 'Approved' | 'Rejected', viaTeam: boolean) => {
    const note = status === 'Rejected' ? window.prompt('Reason for rejecting (shown to the employee):') ?? '' : '';
    try {
      setActionError(null);
      await apiSend('PUT', viaTeam ? `/user/team/leaves/${l.id}` : `/admin/leaves/${l.id}`, { status, note });
      refreshAll();
    } catch (e) {
      setActionError(errorMessage(e));
    }
  };

  const reviewActions = (viaTeam: boolean, allowed: boolean) => (l: LeaveRequest) =>
    l.status === 'Pending' && allowed ? (
      <div className="flex justify-end gap-2">
        <button aria-label={`Approve ${l.user?.name}'s leave`} onClick={() => decide(l, 'Approved', viaTeam)} className="p-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg"><Check size={16} /></button>
        <button aria-label={`Reject ${l.user?.name}'s leave`} onClick={() => decide(l, 'Rejected', viaTeam)} className="p-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg"><Ban size={16} /></button>
      </div>
    ) : null;

  const upcoming = (holidays.data ?? []).filter((h) => (holidayIso(h.date) ?? '') >= new Date().toISOString().slice(0, 10)).sort((a, b) => (holidayIso(a.date) ?? '').localeCompare(holidayIso(b.date) ?? ''));

  return (
    <div className="space-y-6">
      <PageHeader title="Leave Management" subtitle="Track balances, see who's out, and submit or approve requests."
        actions={<Button onClick={() => setApplyOpen(true)}><Plus size={14} />Apply for leave</Button>} />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      <ErrorNote error={actionError ?? mine.error ?? balances.error} />

      {tab === 'my' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {balances.data?.map((b) => (
              <div key={b.type} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-bold text-slate-500 uppercase tracking-wider">{b.type}</span>
                  <div className={`w-2 h-2 rounded-full ${TYPE_DOT[b.type] ?? 'bg-slate-500'}`} />
                </div>
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-3xl font-black text-slate-900">{b.remaining}</p>
                    <p className="text-xs text-slate-400 font-bold mt-1">DAYS AVAILABLE</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-slate-600">{b.taken} / {b.total}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Taken this year</p>
                  </div>
                </div>
                <div className="mt-4 w-full bg-slate-100 h-2 rounded-full overflow-hidden flex" role="img" aria-label={`${b.taken} taken, ${b.pending} pending of ${b.total}`}>
                  <div className={`h-full ${TYPE_DOT[b.type] ?? 'bg-slate-500'}`} style={{ width: `${(b.taken / b.total) * 100}%` }} />
                  <div className="h-full bg-amber-300" style={{ width: `${(b.pending / b.total) * 100}%` }} />
                </div>
                <p className="mt-3 text-[11px] text-slate-400">
                  {b.accrued < b.total ? `${b.accrued} accrued so far` : 'Fully accrued'}
                  {b.carriedForward > 0 && ` · includes ${b.carriedForward} carried forward`}
                  {b.pending > 0 && ` · ${b.pending} pending`}
                </p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card title="Leave history" flush className="lg:col-span-2">
              {mine.loading && !mine.data ? <Spinner /> : !mine.data?.length ? <Empty>No leave requests found.</Empty> : (
                <LeaveTable rows={mine.data} showEmployee={false} actions={(l) => l.status === 'Pending' ? (
                  <Button small variant="ghost" onClick={() => apiSend('PATCH', `/user/leaves/${l.id}/cancel`).then(refreshAll).catch((e) => setActionError(errorMessage(e)))}>Cancel</Button>
                ) : null} />
              )}
            </Card>
            <div className="space-y-6">
              <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-xl shadow-slate-900/20">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-blue-500/20 rounded-lg text-blue-400"><AlertCircle size={20} /></div>
                  <h2 className="font-bold tracking-tight">Leave policy</h2>
                </div>
                <ul className="text-slate-300 text-xs leading-relaxed space-y-2 list-disc pl-4">
                  <li>Annual leave accrues monthly (1.25 days); up to 5 unused days carry into next year.</li>
                  <li>Sick and casual leave are granted in full on 1 January.</li>
                  <li>Weekends and public holidays aren't counted against your balance.</li>
                  <li>Unpaid leave is unlimited but reduces that month's pay.</li>
                </ul>
              </div>
              <Card title="Upcoming holidays">
                <div className="space-y-4">
                  {upcoming.length === 0 ? <p className="text-xs text-slate-400 italic">No upcoming holidays.</p> : upcoming.slice(0, 6).map((h) => (
                    <div key={h.id} className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-slate-50 flex flex-col items-center justify-center border border-slate-100">
                        <span className="text-[10px] font-black text-slate-400 uppercase leading-none">{formatDate(holidayIso(h.date), { month: 'short' })}</span>
                        <span className="text-sm font-black text-slate-900 leading-none mt-0.5">{formatDate(holidayIso(h.date), { day: 'numeric' })}</span>
                      </div>
                      <p className="text-sm font-bold text-slate-900">{h.name}</p>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        </>
      )}

      {tab === 'calendar' && <TeamCalendar />}

      {tab === 'team' && (
        <Card title="Requests from your direct reports" flush>
          {!team.data?.length ? <Empty>No requests.</Empty> : <LeaveTable rows={team.data} showEmployee actions={reviewActions(true, true)} />}
        </Card>
      )}

      {tab === 'approvals' && (
        <Card title="All leave requests" flush>
          {everyone.loading && !everyone.data ? <Spinner /> : !everyone.data?.length ? <Empty>No requests.</Empty> : (
            <LeaveTable rows={[...everyone.data].sort((a, b) => Number(b.status === 'Pending') - Number(a.status === 'Pending'))} showEmployee actions={reviewActions(false, canDecide)} />
          )}
        </Card>
      )}

      <ApplyLeaveModal open={applyOpen} onClose={() => setApplyOpen(false)} onApplied={refreshAll} balances={balances.data ?? []} holidays={holidays.data ?? []} />
    </div>
  );
};

export default LeaveManagement;
