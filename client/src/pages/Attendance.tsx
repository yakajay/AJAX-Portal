import React, { useState, useEffect } from 'react';
import { 
  Clock, 
  LogIn, 
  LogOut, 
  Calendar as CalendarIcon, 
  CheckCircle2, 
  AlertCircle, 
  TrendingUp, 
  History,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { formatDate, formatTime, formatDuration, localDayKey, userTimeZone } from '../lib/datetime';
import { apiFetch } from '../lib/api';

type DayMode = 'leave' | 'regularize' | 'manual';

const LEAVE_TYPES = ['Annual Leave', 'Sick Leave', 'Casual Leave'];
const STATUS_DOT: Record<string, string> = {
  Present: 'bg-emerald-500',
  Leave: 'bg-sky-500',
  Pending: 'bg-amber-500'
};

const inputCls = 'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30';
const labelCls = 'block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5';

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
  const [leaveType, setLeaveType] = useState(LEAVE_TYPES[0]);
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
          <h4 className="font-black text-slate-900 tracking-tight">
            {date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </h4>
          <p className="text-xs text-slate-500 mt-0.5">{summary}</p>
        </div>
        <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-lg bg-slate-100 text-slate-600 whitespace-nowrap">{status}</span>
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
            className={`px-4 py-2 text-xs font-black uppercase tracking-widest rounded-xl border transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
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
              {LEAVE_TYPES.map(t => <option key={t}>{t}</option>)}
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
          <button type="submit" disabled={busy || (mode === 'leave' && isWeekend)} className="px-6 py-3 bg-blue-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 disabled:opacity-50 transition-all">
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
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden h-full">
      <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/30">
        <h3 className="font-black text-slate-900 tracking-tight flex items-center">
          <CalendarIcon size={18} className="mr-2 text-blue-600" />
          {monthNames[month]} {year}
        </h3>
        <div className="flex gap-2">
          <button onClick={prevMonth} aria-label="Previous month" className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400"><ChevronLeft size={18} /></button>
          <button onClick={nextMonth} aria-label="Next month" className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400"><ChevronRight size={18} /></button>
        </div>
      </div>
      <div className="p-4">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Hover or tap a date to manage it</p>
        <div className="grid grid-cols-7 gap-1 mb-2">
          {dayNames.map(d => (
            <div key={d} className="text-center text-[10px] font-black text-slate-400 uppercase tracking-widest py-2">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((day, idx) => {
            if (day === null) return <div key={`empty-${idx}`} className="h-12"></div>;
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
                className={`h-12 flex flex-col items-center justify-center rounded-xl text-xs font-bold transition-all relative ${
                  isToday ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'hover:bg-slate-50 text-slate-700'
                } ${isSelected ? 'ring-2 ring-slate-900' : ''}`}
              >
                {day}
                {status && (
                  <div className={`absolute bottom-1.5 w-1 h-1 rounded-full ${STATUS_DOT[status]}`}></div>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div className="px-6 py-4 bg-slate-50/50 border-t border-slate-100 flex items-center justify-center gap-6 flex-wrap">
        {[['bg-emerald-500', 'Present'], ['bg-sky-500', 'Leave'], ['bg-amber-500', 'Pending / Half Day']].map(([dot, label]) => (
          <div key={label} className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${dot}`}></div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
          </div>
        ))}
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
  const [activeView, setActiveView] = useState<'history' | 'calendar'>('calendar');

  useEffect(() => {
    if (user?.id) {
      fetchLogs();
    }
  }, [user?.id]);

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

  const handleAction = () => {
    setIsLoading(true);
    const endpoint = isCheckedIn ? 'check-out' : 'check-in';
    
    apiFetch(`/user/attendance/${endpoint}`, { method: 'POST' })
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

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Attendance</h1>
          <p className="text-slate-500 text-sm mt-1">Track your hours and manage your daily working sessions.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200 shadow-sm">
            <button 
              onClick={() => setActiveView('calendar')}
              className={`px-6 py-2 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${activeView === 'calendar' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Calendar
            </button>
            <button 
              onClick={() => setActiveView('history')}
              className={`px-6 py-2 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${activeView === 'history' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              History
            </button>
          </div>
          <div className="text-[10px] font-black uppercase tracking-widest bg-white px-4 py-2 rounded-xl border border-slate-200 text-slate-400 shadow-sm">
            Today: <span className="text-slate-900 ml-1">{new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm text-center space-y-8 relative overflow-hidden group">
            <div className={`absolute top-0 inset-x-0 h-1.5 ${isCheckedIn ? 'bg-blue-500' : 'bg-slate-200'}`}></div>
            
            <div className={`w-24 h-24 rounded-3xl mx-auto flex items-center justify-center transition-all duration-500 ${isCheckedIn ? 'bg-blue-50 text-blue-600 shadow-lg shadow-blue-600/10' : 'bg-slate-50 text-slate-300'}`}>
              <Clock size={48} className={isCheckedIn ? 'animate-pulse' : ''} />
            </div>
            
            <div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">{isCheckedIn ? 'Session Active' : 'Start Session'}</h2>
              <p className="text-sm font-bold text-slate-400 mt-2 leading-relaxed">
                {isCheckedIn ? 'Tracking your working hours in real-time.' : 'Clock in to begin tracking your productivity for today.'}
              </p>
            </div>

            <button 
              onClick={handleAction}
              disabled={isLoading}
              className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition-all transform active:scale-95 shadow-xl flex items-center justify-center group/btn ${
                isCheckedIn 
                ? 'bg-rose-600 text-white hover:bg-rose-700 shadow-rose-600/20' 
                : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-600/20'
              }`}
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : isCheckedIn ? (
                <>
                  <LogOut size={18} className="mr-2 group-hover/btn:-translate-x-1 transition-transform" />
                  Clock Out Now
                </>
              ) : (
                <>
                  <LogIn size={18} className="mr-2 group-hover/btn:translate-x-1 transition-transform" />
                  Clock In Now
                </>
              )}
            </button>
          </div>

          <div className="bg-slate-900 p-6 rounded-3xl text-white shadow-xl shadow-slate-900/20 relative overflow-hidden group">
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-6">
                <div className="p-1.5 bg-blue-500/20 rounded-lg text-blue-400">
                  <TrendingUp size={16} />
                </div>
                <h3 className="font-black text-[10px] uppercase tracking-widest">Performance Insights</h3>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-3xl font-black tracking-tight">{logs.length}</p>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Days Present</p>
                </div>
                <div>
                  <p className="text-3xl font-black tracking-tight">{logs.length * 8}h</p>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Est. Hours</p>
                </div>
              </div>
            </div>
            <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-blue-500 rounded-full opacity-10 blur-3xl group-hover:scale-150 transition-transform duration-700"></div>
          </div>
        </div>

        <div className="lg:col-span-2">
          {activeView === 'calendar' ? (
            <CalendarView
              logs={logs}
              leaves={leaves}
              onLogAdded={(log) => setLogs((prev) => [log, ...prev])}
              onLeaveAdded={(leave) => setLeaves((prev) => [leave, ...prev])}
            />
          ) : (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden h-full">
              <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/30">
                <h3 className="font-black text-slate-900 tracking-tight flex items-center">
                  <History size={18} className="mr-2 text-blue-600" />
                  Attendance History
                  <span className="ml-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Times in {userTimeZone()}</span>
                </h3>
                <button className="text-[10px] font-black uppercase tracking-widest text-blue-600 hover:underline">Download Log</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">In</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Out</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Duration</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {logs.length > 0 ? logs.map((log: any) => (
                      <tr key={log.id} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="px-6 py-4 font-black text-slate-900">{formatDate(log.checkInAt)}</td>
                        <td className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-tighter">{formatTime(log.checkInAt)}</td>
                        <td className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-tighter">{log.checkOutAt ? formatTime(log.checkOutAt) : '--:--'}</td>
                        <td className="px-6 py-4 text-sm font-bold text-slate-600">
                          {log.checkOutAt ? formatDuration(log.checkInAt, log.checkOutAt) : <span className="text-blue-600 animate-pulse">Tracking...</span>}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-widest ${
                            log.status === 'Present' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            <CheckCircle2 size={12} className="mr-1" />
                            {log.status}
                          </span>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={5} className="px-6 py-20 text-center text-slate-400 font-bold text-sm italic">
                          No activity recorded yet.
                        </td>
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
