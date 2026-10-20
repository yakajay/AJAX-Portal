import React, { useState, useEffect } from 'react';
import { 
  LogIn, 
  LogOut, 
  Calendar as CalendarIcon, 
  CheckCircle2, 
  History,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { formatDate, formatTime, formatDuration, localDayKey, userTimeZone } from '../lib/datetime';
import { apiFetch, downloadFile } from '../lib/api';
import { can } from '../lib/permissions';
import { getLocation } from '../lib/geolocation';
import { Tabs } from '../components/ui';
import { MonthlySummary, CorrectionsQueue, AttendanceReport, AttendanceEditor, ShiftManager } from '../components/attendance/AttendanceExtras';

type DayMode = 'leave' | 'regularize' | 'manual';

const DEFAULT_LEAVE_TYPES = ['Annual Leave', 'Sick Leave', 'Casual Leave'];
const STATUS_DOT: Record<string, string> = {
  Present: 'bg-emerald-500',
  Leave: 'bg-sky-500',
  Pending: 'bg-amber-500'
};

const inputCls = 'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30';
const labelCls = 'block text-xs font-extrabold text-slate-400 mb-1.5';

// Hovering (or focusing/tapping) a date opens it here, with the three ways to fix it up
const DayPanel = ({ dayKey, logs, leaves, onLogAdded, onLeaveAdded }: {
  dayKey: string; logs: any[]; leaves: any[]; onLogAdded: (log: any) => void; onLeaveAdded: (leave: any) => void;
}) => {
  const todayKey = localDayKey(new Date());
  const isFuture = dayKey > todayKey;
  const date = new Date(`${dayKey}T00:00:00`);
  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
  const dayLogs = logs.filter(l => localDayKey(l.checkInAt) === dayKey);
  const dayLeave = leaves.find(l => l.status !== 'Rejected' && l.startDate <= dayKey && dayKey <= l.endDate);

  const [mode, setMode] = useState<DayMode>('manual');
  const [leaveTypes, setLeaveTypes] = useState(DEFAULT_LEAVE_TYPES);
  const [leaveType, setLeaveType] = useState(DEFAULT_LEAVE_TYPES[0]);
  useEffect(() => {
    apiFetch('/user/leaves/types').then((r) => (r.ok ? r.json() : [])).then((rows: { type: string; yearly: number | null }[]) => {
      const paid = rows.filter((t) => t.yearly !== null).map((t) => t.type);
      if (paid.length) { setLeaveTypes(paid); setLeaveType(paid[0]); }
    }).catch(() => {});
  }, []);
  const [inTime, setInTime] = useState('09:00');
  const [outTime, setOutTime] = useState('18:00');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // A new date starts a fresh form; future dates only allow leave
  useEffect(() => {
    setMessage(null);
    setReason('');
    setMode(isFuture ? 'leave' : 'manual');
  }, [dayKey, isFuture]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      if (mode === 'leave') {
        const res = await apiFetch('/user/leaves', {
          method: 'POST',
          body: JSON.stringify({ type: leaveType, startDate: dayKey, endDate: dayKey, days: 1, reason })
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.message || 'Failed to apply for leave');
        onLeaveAdded(body);
        setMessage({ ok: true, text: 'Leave request sent for approval.' });
      } else {
        const res = await apiFetch('/user/attendance/manual', {
          method: 'POST',
          body: JSON.stringify({
            kind: mode,
            checkInAt: new Date(`${dayKey}T${inTime}`).toISOString(),
            checkOutAt: new Date(`${dayKey}T${outTime}`).toISOString(),
            reason
          })
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.message || 'Failed to save attendance');
        onLogAdded(body);
        setMessage({ ok: true, text: mode === 'regularize' ? 'Regularization sent for approval.' : 'Punch times saved.' });
      }
    } catch (err: any) {
      setMessage({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const summary = dayLogs.length
    ? dayLogs.map(l => `${formatTime(l.checkInAt)} – ${l.checkOutAt ? formatTime(l.checkOutAt) : 'still working'}`).join(', ')
    : 'No punches recorded';
  const status = dayLeave ? `Leave (${dayLeave.status})` : dayLogs[0]?.status || (isWeekend ? 'Weekend' : isFuture ? 'Upcoming' : 'No record');

  const tabs: { key: DayMode; label: string; disabled: boolean }[] = [
    { key: 'leave', label: 'Apply leave', disabled: isWeekend },
    { key: 'regularize', label: 'Regularize', disabled: isFuture },
    { key: 'manual', label: 'Manual punch', disabled: isFuture }
  ];

  return (
    <div className="border-t border-slate-100 p-6 space-y-4" aria-live="polite">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="font-extrabold text-slate-900 tracking-tight">
            {date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </h4>
          <p className="text-xs text-slate-500 mt-0.5">{summary}</p>
        </div>
        <span className="text-xs font-extrabold px-3 py-1 rounded-lg bg-slate-100 text-slate-600 whitespace-nowrap">{status}</span>
      </div>

      <div role="tablist" className="flex flex-wrap gap-2">
        {tabs.map(t => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={mode === t.key}
            disabled={t.disabled}
            onClick={() => { setMode(t.key); setMessage(null); }}
            className={`px-4 py-2 text-xs font-extrabold rounded-xl border transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
              mode === t.key ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-4">
        {mode === 'leave' ? (
          <div>
            <label className={labelCls} htmlFor="day-leave-type">Leave type</label>
            <select id="day-leave-type" className={inputCls} value={leaveType} onChange={e => setLeaveType(e.target.value)}>
              {leaveTypes.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls} htmlFor="day-in">Login time</label>
              <input id="day-in" type="time" required className={inputCls} value={inTime} onChange={e => setInTime(e.target.value)} />
            </div>
            <div>
              <label className={labelCls} htmlFor="day-out">Logout time</label>
              <input id="day-out" type="time" required className={inputCls} value={outTime} onChange={e => setOutTime(e.target.value)} />
            </div>
          </div>
        )}
        {mode !== 'manual' && (
          <div>
            <label className={labelCls} htmlFor="day-reason">Reason{mode === 'regularize' ? '' : ' (optional)'}</label>
            <textarea id="day-reason" rows={2} required={mode === 'regularize'} className={inputCls} value={reason} onChange={e => setReason(e.target.value)} />
          </div>
        )}
        <div className="flex items-center gap-4">
          <button type="submit" disabled={busy || (mode === 'leave' && isWeekend)} className="px-6 py-3 bg-blue-600 text-white rounded-xl text-xs font-extrabold hover:bg-blue-700 disabled:opacity-50 transition-all">
            {busy ? 'Saving…' : mode === 'leave' ? 'Submit leave request' : mode === 'regularize' ? 'Send regularization' : 'Save punch times'}
          </button>
          {message && (
            <span role="status" className={`text-sm font-bold ${message.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{message.text}</span>
          )}
        </div>
      </form>
    </div>
  );
};

const CalendarView = ({ logs, leaves, onLogAdded, onLeaveAdded }: {
  logs: any[]; leaves: any[]; onLogAdded: (log: any) => void; onLeaveAdded: (leave: any) => void;
}) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selected, setSelected] = useState(localDayKey(new Date()));

  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const days = daysInMonth(year, month);
  const startDay = firstDayOfMonth(year, month);

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const getDayStatus = (dayKey: string): string | null => {
    const log = logs.find(l => localDayKey(l.checkInAt) === dayKey);
    if (log) return log.status === 'Present' ? 'Present' : 'Pending';
    const leave = leaves.find(l => l.status !== 'Rejected' && l.startDate <= dayKey && dayKey <= l.endDate);
    return leave ? 'Leave' : null;
  };

  const calendarDays: (number | null)[] = [];
  for (let i = 0; i < startDay; i++) calendarDays.push(null);
  for (let i = 1; i <= days; i++) calendarDays.push(i);

  const todayKey = localDayKey(new Date());

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <h2 className="text-lg font-extrabold text-slate-900 flex items-center">
          <CalendarIcon size={18} className="mr-2 text-blue-600" aria-hidden="true" />
          {monthNames[month]} {year}
        </h2>
        <div className="flex gap-2">
          <button onClick={prevMonth} aria-label="Previous month" className="w-11 h-11 flex items-center justify-center hover:bg-slate-100 rounded-lg text-slate-600"><ChevronLeft size={18} /></button>
          <button onClick={nextMonth} aria-label="Next month" className="w-11 h-11 flex items-center justify-center hover:bg-slate-100 rounded-lg text-slate-600"><ChevronRight size={18} /></button>
        </div>
      </div>
      <div className="p-4">
        <div className="grid grid-cols-7 gap-1 mb-2">
          {dayNames.map(d => (
            <div key={d} className="text-center text-xs font-bold text-slate-500 py-2">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((day, idx) => {
            if (day === null) return <div key={`empty-${idx}`} className="h-14"></div>;
            const dayKey = localDayKey(new Date(year, month, day));
            const status = getDayStatus(dayKey);
            const isToday = dayKey === todayKey;
            const isSelected = dayKey === selected;
            const select = () => setSelected(dayKey);

            return (
              <button
                type="button"
                key={day}
                onMouseEnter={select}
                onFocus={select}
                onClick={select}
                aria-pressed={isSelected}
                aria-label={`${monthNames[month]} ${day}${status ? `, ${status}` : ''}`}
                className={`h-14 flex flex-col items-center justify-center gap-0.5 rounded-xl text-sm font-bold transition-colors ${
                  isToday ? 'bg-blue-600 text-white' : 'bg-slate-50 hover:bg-blue-50 text-slate-800'
                } ${isSelected ? 'ring-2 ring-slate-900' : ''}`}
              >
                {day}
                <span className={`h-1.5 w-1.5 rounded-full ${status ? STATUS_DOT[status] : 'bg-transparent'}`} aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </div>
      <DayPanel dayKey={selected} logs={logs} leaves={leaves} onLogAdded={onLogAdded} onLeaveAdded={onLeaveAdded} />
    </div>
  );
};

const Attendance = ({ user }: { user: any }) => {
  const [logs, setLogs] = useState<any[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeView, setActiveView] = useState<'history' | 'calendar' | 'summary' | 'corrections' | 'report' | 'edit' | 'shifts'>('calendar');
  const [pendingCorrections, setPendingCorrections] = useState(0);
  const isAdminUser = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const canSeeReport = can(user, 'attendance', 'read');

  useEffect(() => {
    if (user?.id) {
      fetchLogs();
      refreshCorrections();
    }
  }, [user?.id]);

  // Managers (and admins) get a Corrections tab with a badge when requests are waiting
  const refreshCorrections = async () => {
    try {
      const team = await apiFetch('/user/team/regularizations').then(r => (r.ok ? r.json() : []));
      const all = canSeeReport ? await apiFetch('/admin/attendance/regularizations').then(r => (r.ok ? r.json() : [])) : [];
      setPendingCorrections(new Set([...team, ...all].map((c: any) => c.id)).size);
    } catch {
      setPendingCorrections(0);
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await apiFetch('/user/attendance');
      const data = await res.json();
      setLogs(data); 
      const activeSession = data.find((log: any) => !log.checkOutAt);
      setIsCheckedIn(!!activeSession);
    } catch (err) {
      console.error("Failed to fetch logs", err);
    }
  };

  // One attendance entry per day: after clocking out, today is done
  const todayKey = localDayKey(new Date());
  const doneToday = !isCheckedIn && logs.some((l: any) => l.status !== 'Rejected' && localDayKey(l.checkInAt) === todayKey);

  // Stats count distinct days and real hours this month (not one "day" per entry)
  const monthKey = todayKey.slice(0, 7);
  const monthLogs = logs.filter((l: any) => l.status !== 'Rejected' && l.status !== 'Regularization Pending' && localDayKey(l.checkInAt).startsWith(monthKey));
  const daysPresent = new Set(monthLogs.map((l: any) => localDayKey(l.checkInAt))).size;
  const hoursWorked = monthLogs.reduce((sum: number, l: any) => sum + ((l.checkOutAt ? new Date(l.checkOutAt) : new Date()).getTime() - new Date(l.checkInAt).getTime()), 0) / 3600000;

  const handleAction = async () => {
    setIsLoading(true);
    const endpoint = isCheckedIn ? 'check-out' : 'check-in';
    // Clock-ins carry the device location when the browser allows it (offices may require it)
    const location = isCheckedIn ? null : await getLocation();

    apiFetch(`/user/attendance/${endpoint}`, { method: 'POST', body: JSON.stringify({ tz: userTimeZone(), ...(location ? { location } : {}) }) })
    .then(async res => {
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'Attendance action failed');
      return body;
    })
    .then(newLog => {
      if (isCheckedIn) {
        setLogs(logs.map((log: any) => log.id === newLog.id ? newLog : log) as any);
      } else {
        setLogs([newLog, ...logs] as any);
      }
      setIsCheckedIn(!isCheckedIn);
      setIsLoading(false);
    })
    .catch(err => {
      console.error(err);
      alert(err.message);
      setIsLoading(false);
    });
  };

  const tabs: { id: typeof activeView; label: string; badge?: number }[] = [
    { id: 'calendar', label: 'Calendar' },
    { id: 'history', label: 'History' },
    { id: 'summary', label: 'Summary' },
    ...(isAdminUser || pendingCorrections > 0 ? [{ id: 'corrections' as const, label: 'Corrections', badge: pendingCorrections }] : []),
    ...(canSeeReport ? [{ id: 'report' as const, label: 'Report' }, { id: 'edit' as const, label: 'Edit' }, { id: 'shifts' as const, label: 'Shifts' }] : [])
  ];

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-slate-500">{new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} · hover or tap a date to manage it</span>
          <h1 className="text-[32px] leading-tight font-extrabold text-slate-900 tracking-tight">Attendance</h1>
        </div>
        <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-slate-600" aria-label="Calendar key">
          {[['bg-emerald-500', 'Present'], ['bg-amber-500', 'Pending'], ['bg-sky-500', 'Leave']].map(([dot, label]) => (
            <li key={label} className="flex items-center gap-2"><span className={`w-2.5 h-2.5 rounded-full ${dot}`} aria-hidden="true" />{label}</li>
          ))}
        </ul>
      </div>

      <Tabs tabs={tabs} value={activeView} onChange={setActiveView} />

      <div className="flex flex-wrap gap-5 items-start">
        <div className="flex-1 basis-72 min-w-0 flex flex-col gap-5">
          <div className="p-6 rounded-2xl bg-blue-600 text-white flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <span className="font-bold text-[15px]">Today's attendance</span>
              <span className="text-[13px] font-bold px-2.5 py-1 rounded-full bg-white/20">{isCheckedIn ? 'Clocked in' : doneToday ? 'Done for today' : 'Clocked out'}</span>
            </div>
            <p className="text-sm text-blue-100">
              {isCheckedIn ? 'Tracking your working hours in real time.' : doneToday ? "Today's attendance is recorded as a single entry. Use the calendar to request a correction." : 'Clock in to start today’s session.'}
            </p>
            <button
              onClick={handleAction}
              disabled={isLoading || doneToday}
              className="min-h-12 rounded-[10px] bg-white text-blue-800 font-bold text-base flex items-center justify-center gap-2 hover:bg-blue-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {isCheckedIn ? <LogOut size={18} aria-hidden="true" /> : <LogIn size={18} aria-hidden="true" />}
              {isLoading ? 'Working…' : isCheckedIn ? 'Clock out' : doneToday ? 'Done for today' : 'Clock in'}
            </button>
          </div>

          <div className="p-6 rounded-2xl bg-white border border-slate-200 flex flex-col gap-3.5">
            <h2 className="text-lg font-extrabold text-slate-900">Month summary</h2>
            {[['Days present', String(daysPresent)], ['Hours worked', `${Math.round(hoursWorked * 10) / 10}h`], ['Average per day', daysPresent ? `${(hoursWorked / daysPresent).toFixed(1)}h` : '—']].map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-3 pb-3 border-b border-slate-100 last:border-0">
                <span className="text-sm text-slate-600">{k}</span>
                <span className="text-xl font-extrabold text-slate-900">{v}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-[2] basis-[28rem] min-w-0">
          {activeView === 'summary' ? (
            <MonthlySummary />
          ) : activeView === 'corrections' ? (
            <CorrectionsQueue user={user} onChanged={refreshCorrections} />
          ) : activeView === 'report' ? (
            <AttendanceReport />
          ) : activeView === 'edit' ? (
            <AttendanceEditor user={user} />
          ) : activeView === 'shifts' ? (
            <ShiftManager user={user} />
          ) : activeView === 'calendar' ? (
            <CalendarView
              logs={logs}
              leaves={leaves}
              onLogAdded={(log) => setLogs((prev) => [log, ...prev])}
              onLeaveAdded={(leave) => setLeaves((prev) => [leave, ...prev])}
            />
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                  <History size={18} className="text-blue-600" aria-hidden="true" />
                  History
                  <span className="text-[13px] font-semibold text-slate-500">Times in {userTimeZone()}</span>
                </h2>
                <button
                  onClick={() => downloadFile(`/user/attendance/export?month=${new Date().toISOString().slice(0, 7)}&tz=${encodeURIComponent(userTimeZone())}`, 'attendance.csv').catch((e) => alert(e.message))}
                  className="min-h-11 px-2 text-sm font-bold text-blue-800 hover:underline"
                >
                  Download log
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50">
                      {['Date', 'In', 'Out', 'Duration', 'Status'].map((h) => <th key={h} scope="col" className="px-6 py-3 text-xs font-bold text-slate-500">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {logs.length > 0 ? logs.map((log: any) => (
                      <tr key={log.id} className="hover:bg-slate-50">
                        <td className="px-6 py-4 font-bold text-slate-900">{formatDate(log.checkInAt)}</td>
                        <td className="px-6 py-4 text-sm font-semibold text-slate-600">{formatTime(log.checkInAt)}</td>
                        <td className="px-6 py-4 text-sm font-semibold text-slate-600">{log.checkOutAt ? formatTime(log.checkOutAt) : '--:--'}</td>
                        <td className="px-6 py-4 text-sm font-semibold text-slate-700">
                          {log.checkOutAt ? formatDuration(log.checkInAt, log.checkOutAt) : <span className="text-blue-800">Tracking…</span>}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[13px] font-bold ${log.status === 'Present' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                            <CheckCircle2 size={13} className="mr-1" aria-hidden="true" />
                            {log.status}
                          </span>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={5} className="px-6 py-16 text-center text-slate-500 font-semibold text-sm">No activity recorded yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Attendance;
