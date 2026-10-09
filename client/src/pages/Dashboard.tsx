import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  CreditCard,
  Briefcase,
  ChevronRight,
  UserPlus,
  Play,
  FileText,
  LogIn,
  LogOut
} from 'lucide-react';
import type { User } from '../types';
import { apiFetch } from '../lib/api';
import { formatDuration, formatTime, localDayKey } from '../lib/datetime';

interface StatCardProps {
  title: string;
  value: string;
  icon: React.ElementType;
}

const StatCard = ({ title, value, icon: Icon }: StatCardProps) => (
  <div className="bg-white p-5 rounded-2xl border border-slate-200 flex flex-col gap-1.5">
    <div className="flex items-center justify-between">
      <h3 className="text-slate-500 text-[13px] font-semibold">{title}</h3>
      <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
        <Icon size={18} />
      </div>
    </div>
    <p className="text-3xl font-extrabold text-slate-900 tracking-tight">{value}</p>
  </div>
);

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const TARGET_HOURS = 8;

// Hours worked on each weekday of the current week, from the attendance log
const weekHours = (logs: any[]) => {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  return WEEKDAYS.map((day, i) => {
    const key = localDayKey(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i));
    const ms = logs
      .filter(l => localDayKey(l.checkInAt) === key)
      .reduce((sum, l) => sum + ((l.checkOutAt ? new Date(l.checkOutAt) : now).getTime() - new Date(l.checkInAt).getTime()), 0);
    return { day, hours: ms / 3600000 };
  });
};

const Dashboard = ({ user }: { user: User | null }) => {
  const navigate = useNavigate();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const [stats, setStats] = useState<{ workforce?: number; monthlySpend?: number; pendingLeaves: number; documents?: number; daysPresent?: number } | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [holiday, setHoliday] = useState<{ date: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => {
    apiFetch(isAdmin ? '/admin/dashboard/stats' : `/user/dashboard?tz=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}`)
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('Failed to load stats'))))
      .then(setStats)
      .catch(err => console.error(err));

    apiFetch('/user/attendance')
      .then(res => (res.ok ? res.json() : []))
      .then(setLogs)
      .catch(err => console.error(err));

    apiFetch('/user/holidays')
      .then(res => (res.ok ? res.json() : []))
      .then((list: { date: string; name: string }[]) => {
        const today = localDayKey(new Date());
        setHoliday(list.filter(h => h.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0] || null);
      })
      .catch(err => console.error(err));
  }, []);

  // Keep the running session's duration fresh
  useEffect(() => {
    const id = setInterval(() => tick(n => n + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const openSession = logs.find(l => !l.checkOutAt);
  const todayKey = localDayKey(new Date());
  const todayLogs = logs.filter(l => localDayKey(l.checkInAt) === todayKey);
  const todayMs = todayLogs.reduce(
    (sum, l) => sum + ((l.checkOutAt ? new Date(l.checkOutAt) : new Date()).getTime() - new Date(l.checkInAt).getTime()), 0);

  const toggleClock = async () => {
    setBusy(true);
    try {
      const res = await apiFetch(`/user/attendance/${openSession ? 'check-out' : 'check-in'}`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'Attendance action failed');
      setLogs(prev => (openSession ? prev.map(l => (l.id === body.id ? body : l)) : [body, ...prev]));
    } catch (err: any) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  };

  const week = weekHours(logs);
  const todayDow = (new Date().getDay() + 6) % 7;
  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening';
  const formatSpend = (n: number) =>
    n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-500">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <h1 className="text-[32px] font-extrabold text-slate-900 tracking-tight">{greeting}, {user?.name?.split(' ')[0]}</h1>
        </div>
        <button
          onClick={() => navigate('/leave')}
          className="px-5 py-3 rounded-[10px] border-[1.5px] border-blue-600 text-blue-800 bg-white font-bold text-[15px] hover:bg-blue-50 transition-colors"
        >
          Request leave
        </button>
      </div>

      <div className="flex flex-wrap gap-5">
        <div className="flex-1 basis-80 p-6 rounded-2xl bg-blue-600 text-white flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="font-bold text-[15px]">Today's attendance</span>
            <span className="text-[13px] font-bold px-2.5 py-1 rounded-full bg-white/20">{openSession ? 'Clocked in' : 'Clocked out'}</span>
          </div>
          <div className="text-[44px] leading-none font-extrabold tracking-tight">
            {todayLogs.length ? formatDuration(new Date(Date.now() - todayMs).toISOString(), new Date().toISOString()) : '—'}
          </div>
          <div className="text-sm text-blue-100">
            {openSession ? `In since ${formatTime(openSession.checkInAt)}` : todayLogs.length ? 'Session ended for today' : 'Not clocked in yet today'}
          </div>
          <button
            onClick={toggleClock}
            disabled={busy}
            className="min-h-12 rounded-[10px] bg-white text-blue-800 font-bold text-base flex items-center justify-center gap-2 hover:bg-blue-50 disabled:opacity-60 transition-colors"
          >
            {openSession ? <LogOut size={18} /> : <LogIn size={18} />}
            {openSession ? 'Clock out' : 'Clock in'}
          </button>
        </div>

        <div className="flex-[2] basis-96 grid grid-cols-1 sm:grid-cols-2 gap-5 content-start">
          {isAdmin ? (
            <>
              <StatCard title="Total workforce" value={stats?.workforce != null ? stats.workforce.toLocaleString() : '—'} icon={Users} />
              <StatCard title="Monthly spend" value={stats?.monthlySpend != null ? formatSpend(stats.monthlySpend) : '—'} icon={CreditCard} />
              <StatCard title="Pending leave requests" value={stats ? String(stats.pendingLeaves) : '—'} icon={Briefcase} />
            </>
          ) : (
            <>
              <StatCard title="Days present this month" value={stats?.daysPresent != null ? String(stats.daysPresent) : '—'} icon={Users} />
              <StatCard title="My pending leaves" value={stats ? String(stats.pendingLeaves) : '—'} icon={Briefcase} />
              <StatCard title="My HR documents" value={stats?.documents != null ? String(stats.documents) : '—'} icon={FileText} />
            </>
          )}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 flex flex-col gap-1.5">
            <h3 className="text-slate-500 text-[13px] font-semibold">Next holiday</h3>
            <p className="text-xl font-extrabold text-slate-900">{holiday ? holiday.name : '—'}</p>
            <p className="text-[13px] text-slate-500">
              {holiday ? new Date(`${holiday.date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'short' }) : 'None scheduled'}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-5">
        <div className="flex-[3] basis-96 min-w-0 bg-white p-6 rounded-2xl border border-slate-200 flex flex-col gap-5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-extrabold text-slate-900">Hours this week</h2>
            <span className="text-[13px] text-slate-500">Target {TARGET_HOURS}h per day</span>
          </div>
          <div className="flex items-end gap-4 h-44 border-b border-slate-200">
            {week.map((d, i) => (
              <div key={d.day} className="flex-1 flex flex-col items-center justify-end gap-1.5 h-full">
                <span className="text-xs font-bold text-slate-600">{d.hours ? `${d.hours.toFixed(1)}h` : '–'}</span>
                <div
                  className={`w-full max-w-14 rounded-t-lg ${i === todayDow ? 'bg-blue-300' : 'bg-blue-600'}`}
                  style={{ height: `${Math.min(d.hours, 10) * 14}px` }}
                />
              </div>
            ))}
          </div>
          <div className="flex gap-4">
            {week.map(d => (
              <span key={d.day} className="flex-1 text-center text-[13px] font-semibold text-slate-500">{d.day}</span>
            ))}
          </div>
        </div>

        <div className="flex-[2] basis-72 min-w-0 bg-white p-6 rounded-2xl border border-slate-200">
          <h2 className="text-lg font-extrabold text-slate-900 mb-4">Quick actions</h2>
          <div className="flex flex-col gap-3">
            {isAdmin && (
              <>
                <button onClick={() => navigate('/directory')} className="group p-4 bg-slate-50 rounded-xl hover:bg-blue-600 transition-all flex items-center justify-between">
                  <span className="flex items-center gap-3 text-sm font-bold text-slate-700 group-hover:text-white">
                    <UserPlus size={18} className="text-blue-600 group-hover:text-white" />Add employee
                  </span>
                  <ChevronRight size={18} className="text-slate-400 group-hover:text-white" />
                </button>
                <button onClick={() => navigate('/payroll')} className="group p-4 bg-slate-50 rounded-xl hover:bg-blue-600 transition-all flex items-center justify-between">
                  <span className="flex items-center gap-3 text-sm font-bold text-slate-700 group-hover:text-white">
                    <Play size={18} className="text-blue-600 group-hover:text-white" />Run payroll
                  </span>
                  <ChevronRight size={18} className="text-slate-400 group-hover:text-white" />
                </button>
              </>
            )}
            <button onClick={() => navigate('/attendance')} className="group p-4 bg-slate-50 rounded-xl hover:bg-blue-600 transition-all flex items-center justify-between">
              <span className="flex items-center gap-3 text-sm font-bold text-slate-700 group-hover:text-white">
                <LogIn size={18} className="text-blue-600 group-hover:text-white" />Manage attendance
              </span>
              <ChevronRight size={18} className="text-slate-400 group-hover:text-white" />
            </button>
            <button onClick={() => navigate('/hr-hub')} className="group p-4 bg-slate-50 rounded-xl hover:bg-blue-600 transition-all flex items-center justify-between">
              <span className="flex items-center gap-3 text-sm font-bold text-slate-700 group-hover:text-white">
                <FileText size={18} className="text-blue-600 group-hover:text-white" />Upload docs
              </span>
              <ChevronRight size={18} className="text-slate-400 group-hover:text-white" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
