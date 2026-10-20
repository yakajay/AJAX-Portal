import React, { useMemo, useState } from 'react';
import { Ban, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import type { User } from '../types';
import { apiJson, apiSend } from '../lib/api';
import { can } from '../lib/permissions';
import { currentMonth, errorMessage, formatDate, monthLabel } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { HolidayManager, LeavePolicyEditor } from '../components/leave/LeaveAdmin';
import { Badge, Button, Card, Empty, ErrorNote, Field, PageHeader, Spinner, Tabs, Th, inputClass, statusTone } from '../components/ui';

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

const ApplyLeaveForm = ({ onApplied, balances, holidays, types }: {
  onApplied: () => void; balances: Balance[]; holidays: Holiday[]; types: string[];
}) => {
  const blank = { type: '', startDate: '', endDate: '', halfDay: false, halfDayPart: 'First Half', reason: '' };
  const [form, setForm] = useState(blank);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [saving, setSaving] = useState(false);

  const holidaySet = useMemo(() => new Set(holidays.map((h) => holidayIso(h.date)).filter((d): d is string => !!d)), [holidays]);
  const valid = form.startDate && form.endDate && form.endDate >= form.startDate;
  const estimate = valid ? (form.halfDay ? 0.5 : workingDaysBetween(form.startDate, form.endDate, holidaySet)) : null;
  const chosen = form.type || types[0] || '';
  const balance = balances.find((b) => b.type === chosen);

  const set = (patch: Partial<typeof form>) => {
    setSent(false);
    setForm((f) => {
      const next = { ...f, ...patch };
      // A half day is a single date
      if (next.halfDay && next.startDate) next.endDate = next.startDate;
      return next;
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiSend('POST', '/user/leaves', { ...form, type: form.type || types[0], halfDayPart: form.halfDay ? form.halfDayPart : undefined });
      setForm(blank);
      setSent(true);
      onApplied();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex-[2] basis-80 min-w-0 p-6 rounded-2xl bg-white border border-slate-200 flex flex-col gap-4">
      <h2 className="text-lg font-extrabold text-slate-900">Request leave</h2>
      <ErrorNote error={error} />
      <fieldset className="flex flex-col gap-2 border-0 p-0 m-0">
        <legend className="p-0 mb-2 text-[13px] font-bold text-slate-600">Type</legend>
        <div className="flex flex-wrap gap-2">
          {types.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={chosen === t}
              onClick={() => set({ type: t })}
              className={`min-h-11 px-4 rounded-full text-sm font-bold border-[1.5px] border-blue-600 transition-colors ${chosen === t ? 'bg-blue-600 text-white' : 'bg-white text-blue-800 hover:bg-blue-50'}`}
            >
              {t}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-3">
        <div className="flex-1 basis-36"><Field label="From"><input required type="date" className={inputClass} value={form.startDate} onChange={(e) => set({ startDate: e.target.value, endDate: form.endDate < e.target.value || form.halfDay ? e.target.value : form.endDate })} /></Field></div>
        <div className="flex-1 basis-36"><Field label="To"><input required type="date" min={form.startDate} disabled={form.halfDay} className={inputClass} value={form.endDate} onChange={(e) => set({ endDate: e.target.value })} /></Field></div>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 min-h-11 text-sm font-semibold text-slate-700"><input type="checkbox" className="w-5 h-5" checked={form.halfDay} onChange={(e) => set({ halfDay: e.target.checked })} />Half day</label>
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
        {balance && <span className="block text-[13px] text-slate-500 mt-1">You have {balance.remaining} {chosen.toLowerCase()} day(s) available.</span>}
      </div>
      <Field label="Reason"><textarea required rows={3} className={inputClass} value={form.reason} onChange={(e) => set({ reason: e.target.value })} placeholder="A brief reason for your manager" /></Field>
      <Button type="submit" disabled={saving || estimate === 0}>{saving ? 'Submitting…' : 'Submit request'}</Button>
      {sent && <span role="status" className="text-sm font-semibold text-blue-800">Request sent to your manager for approval.</span>}
    </form>
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
            {WEEKDAYS.map((d) => <div key={d} className="bg-slate-50 py-2 text-center text-xs font-extrabold text-slate-400">{d}</div>)}
            {cells.map((day, i) => {
              if (!day) return <div key={`blank-${i}`} className="bg-slate-50 min-h-24" />;
              const date = iso(day);
              const out = data?.leaves.filter((l) => l.startDate <= date && date <= l.endDate) ?? [];
              const holiday = data?.holidays.find((h) => h.date === date);
              const weekend = (i % 7) >= 5;
              return (
                <div key={date} className={`min-h-24 p-1.5 ${weekend ? 'bg-slate-50' : 'bg-white'} ${date === today ? 'ring-2 ring-inset ring-blue-500' : ''}`}>
                  <div className="text-xs font-bold text-slate-500">{day}</div>
                  {holiday && <div className="mt-1 text-xs font-bold text-emerald-700 bg-emerald-100 rounded px-1 truncate" title={holiday.name}>{holiday.name}</div>}
                  <ul className="mt-1 space-y-0.5">
                    {out.slice(0, 3).map((l) => (
                      <li key={l.id} title={`${l.name} · ${l.type}${l.halfDay ? ' (half day)' : ''} · ${l.status}`} className={`flex items-center gap-1 text-xs font-semibold rounded px-1 truncate ${l.status === 'Pending' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${TYPE_DOT[l.type] ?? 'bg-slate-400'}`} />
                        <span className="truncate">{l.name.split(' ')[0]}{l.halfDay ? ' ½' : ''}</span>
                      </li>
                    ))}
                    {out.length > 3 && <li className="text-xs font-bold text-slate-400">+{out.length - 3} more</li>}
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

type TabId = 'my' | 'calendar' | 'team' | 'approvals' | 'setup';

const LeaveManagement = ({ user }: { user: User | null }) => {
  const isApprover = can(user, 'leave', 'read');
  const canDecide = can(user, 'leave', 'write');
  const [tab, setTab] = useState<TabId>('my');
  const [actionError, setActionError] = useState<string | null>(null);

  const mine = useAsync(() => apiJson<LeaveRequest[]>('/user/leaves'));
  const balances = useAsync(() => apiJson<Balance[]>('/user/leaves/balance'));
  const holidays = useAsync(() => apiJson<Holiday[]>('/user/holidays'));
  const leaveTypes = useAsync(() => apiJson<{ type: string }[]>('/user/leaves/types'));
  const canSetup = can(user, 'leave', 'write') || can(user, 'hr', 'write');
  const team = useAsync(() => apiJson<LeaveRequest[]>('/user/team/leaves'));
  const everyone = useAsync(() => (isApprover ? apiJson<LeaveRequest[]>('/admin/leaves') : Promise.resolve([] as LeaveRequest[])), [isApprover]);

  const refreshAll = () => { void mine.reload(); void balances.reload(); void team.reload(); void everyone.reload(); };

  const pendingTeam = team.data?.filter((l) => l.status === 'Pending').length ?? 0;
  const pendingAll = everyone.data?.filter((l) => l.status === 'Pending').length ?? 0;
  const tabs: { id: TabId; label: string; badge?: number }[] = [
    { id: 'my', label: 'My leave' },
    { id: 'calendar', label: 'Team calendar' },
    ...((team.data?.length ?? 0) > 0 ? [{ id: 'team' as const, label: 'My team', badge: pendingTeam }] : []),
    ...(isApprover ? [{ id: 'approvals' as const, label: 'All approvals', badge: pendingAll }] : []),
    ...(canSetup ? [{ id: 'setup' as const, label: 'Policy & holidays' }] : [])
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
    <div className="space-y-6 max-w-6xl">
      <PageHeader title="Leave" subtitle={`Leave year ${new Date().getFullYear()} · track balances, see who's out, and submit or approve requests`} />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      <ErrorNote error={actionError ?? mine.error ?? balances.error} />

      {tab === 'my' && (
        <>
          <section className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-5">
            {balances.data?.map((b) => (
              <div key={b.type} className="p-5 rounded-2xl bg-white border border-slate-200 flex flex-col gap-2.5">
                <span className="text-[13px] font-semibold text-slate-500">{b.type}</span>
                <span className="text-3xl font-extrabold tracking-tight text-slate-900">
                  {b.remaining} <span className="text-[15px] font-semibold text-slate-500">of {b.total} days left</span>
                </span>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden flex" role="img" aria-label={`${b.taken} taken, ${b.pending} pending of ${b.total}`}>
                  <div className="h-2 bg-blue-600" style={{ width: `${b.total ? (b.taken / b.total) * 100 : 0}%` }} />
                  <div className="h-2 bg-amber-300" style={{ width: `${b.total ? (b.pending / b.total) * 100 : 0}%` }} />
                </div>
                <span className="text-[13px] text-slate-500">
                  {b.taken} taken{b.pending > 0 && ` · ${b.pending} pending`}
                  {b.accrued < b.total ? ` · ${b.accrued} accrued so far` : ''}
                  {b.carriedForward > 0 && ` · ${b.carriedForward} carried forward`}
                </span>
              </div>
            ))}
          </section>

          <section className="flex flex-wrap gap-5 items-start">
            <ApplyLeaveForm onApplied={refreshAll} balances={balances.data ?? []} holidays={holidays.data ?? []} types={(leaveTypes.data ?? []).map((t) => t.type)} />
            <div className="flex-[3] basis-[26rem] min-w-0 flex flex-col gap-5">
              <Card title="History" flush>
                {mine.loading && !mine.data ? <Spinner /> : !mine.data?.length ? <Empty>No leave requests found.</Empty> : (
                  <LeaveTable rows={mine.data} showEmployee={false} actions={(l) => l.status === 'Pending' ? (
                    <Button small variant="ghost" onClick={() => apiSend('PATCH', `/user/leaves/${l.id}/cancel`).then(refreshAll).catch((e) => setActionError(errorMessage(e)))}>Cancel</Button>
                  ) : null} />
                )}
              </Card>
              <Card title="Upcoming holidays">
                <div className="space-y-3.5">
                  {upcoming.length === 0 ? <p className="text-sm text-slate-500">No upcoming holidays.</p> : upcoming.slice(0, 4).map((h) => (
                    <div key={h.id} className="flex items-center gap-4">
                      <div className="w-11 h-11 rounded-xl bg-slate-50 flex flex-col items-center justify-center border border-slate-200">
                        <span className="text-xs font-bold text-slate-500 leading-none">{formatDate(holidayIso(h.date), { month: 'short' })}</span>
                        <span className="text-sm font-extrabold text-slate-900 leading-none mt-0.5">{formatDate(holidayIso(h.date), { day: 'numeric' })}</span>
                      </div>
                      <p className="text-[15px] font-bold text-slate-900">{h.name}</p>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </section>
        </>
      )}

      {tab === 'calendar' && <TeamCalendar />}

      {tab === 'setup' && (
        <div className="space-y-6">
          {can(user, 'leave', 'write') && <LeavePolicyEditor onSaved={() => { void balances.reload(); void leaveTypes.reload(); }} />}
          {can(user, 'hr', 'write') && <HolidayManager onChanged={() => void holidays.reload()} />}
        </div>
      )}

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

    </div>
  );
};

export default LeaveManagement;
