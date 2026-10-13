import { useState } from 'react';
import { Check, Download, X } from 'lucide-react';
import type { User } from '../../types';
import { apiJson, apiSend, downloadFile } from '../../lib/api';
import { can } from '../../lib/permissions';
import { currentMonth, errorMessage, formatDate, formatDateTime } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Badge, Button, Card, Empty, ErrorNote, Spinner, StatTile, Th, inputClass } from '../ui';

const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—');

interface DaySummary { date: string; firstIn: string; lastOut: string | null; hours: number; late: boolean; earlyOut: boolean }
interface Summary { month: string; daysPresent: number; totalHours: number; avgHours: number; lateDays: number; earlyOutDays: number; days: DaySummary[] }

const MonthPicker = ({ value, onChange }: { value: string; onChange: (m: string) => void }) => (
  <input type="month" aria-label="Month" max={currentMonth()} className={`${inputClass} w-44`} value={value} onChange={(e) => e.target.value && onChange(e.target.value)} />
);

export const MonthlySummary = () => {
  const [month, setMonth] = useState(currentMonth());
  const [exportError, setExportError] = useState<string | null>(null);
  const { data, loading, error } = useAsync(() => apiJson<Summary>(`/user/attendance/summary?month=${month}&tz=${encodeURIComponent(tz())}`), [month]);

  const exportCsv = () =>
    downloadFile(`/user/attendance/export?month=${month}&tz=${encodeURIComponent(tz())}`, `attendance-${month}.csv`).then(() => setExportError(null), (e) => setExportError(errorMessage(e)));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthPicker value={month} onChange={setMonth} />
        <Button variant="secondary" onClick={exportCsv}><Download size={14} />Export CSV</Button>
      </div>
      <ErrorNote error={error ?? exportError} />
      {loading && !data ? <Spinner /> : data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <StatTile label="Days present" value={data.daysPresent} />
            <StatTile label="Total hours" value={`${data.totalHours}h`} />
            <StatTile label="Average / day" value={`${data.avgHours}h`} />
            <StatTile label="Late arrivals" value={data.lateDays} hint="After the configured start time" />
            <StatTile label="Early departures" value={data.earlyOutDays} />
          </div>
          <Card flush>
            {!data.days.length ? <Empty>No attendance recorded for this month.</Empty> : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50"><tr><Th>Date</Th><Th>First in</Th><Th>Last out</Th><Th>Hours</Th><Th>Flags</Th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.days.map((d) => (
                      <tr key={d.date}>
                        <td className="px-6 py-3 text-sm font-bold text-slate-900">{formatDate(d.date, { weekday: 'short', month: 'short', day: 'numeric' })}</td>
                        <td className="px-6 py-3 text-sm text-slate-600">{time(d.firstIn)}</td>
                        <td className="px-6 py-3 text-sm text-slate-600">{time(d.lastOut)}</td>
                        <td className="px-6 py-3 text-sm font-black text-slate-900">{d.hours}h</td>
                        <td className="px-6 py-3 space-x-1">{d.late && <Badge tone="amber">Late</Badge>}{d.earlyOut && <Badge tone="amber">Early out</Badge>}{!d.late && !d.earlyOut && <span className="text-slate-300">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
};

interface Correction {
  id: string;
  checkInAt: string;
  checkOutAt: string | null;
  reason: string | null;
  createdAt: string;
  user?: { name: string };
}

export const CorrectionsQueue = ({ user, onChanged }: { user: User; onChanged?: () => void }) => {
  const adminRead = can(user, 'attendance', 'read');
  const adminWrite = can(user, 'attendance', 'write');
  const { data, loading, error, reload } = useAsync(async () => {
    const team = await apiJson<Correction[]>('/user/team/regularizations');
    const all = adminRead ? await apiJson<Correction[]>('/admin/attendance/regularizations') : [];
    const teamIds = new Set(team.map((c) => c.id));
    return [...team.map((c) => ({ ...c, viaTeam: true })), ...all.filter((c) => !teamIds.has(c.id)).map((c) => ({ ...c, viaTeam: false }))];
  }, [adminRead]);
  const [actionError, setActionError] = useState<string | null>(null);

  const decide = async (c: Correction & { viaTeam: boolean }, status: 'Approved' | 'Rejected') => {
    const note = status === 'Rejected' ? window.prompt('Reason for rejecting (shown to the employee):') ?? '' : '';
    try {
      setActionError(null);
      await apiSend('PUT', c.viaTeam ? `/user/team/regularizations/${c.id}` : `/admin/attendance/${c.id}/review`, { status, note });
      await reload();
      onChanged?.();
    } catch (e) {
      setActionError(errorMessage(e));
    }
  };

  return (
    <Card flush>
      <ErrorNote error={error ?? actionError} />
      {loading && !data ? <Spinner /> : !data?.length ? <Empty>No attendance corrections are waiting for review.</Empty> : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50"><tr><Th>Employee</Th><Th>Requested times</Th><Th>Reason</Th><Th right>Decision</Th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((c) => (
                <tr key={c.id}>
                  <td className="px-6 py-4 text-sm font-bold text-slate-900">{c.user?.name ?? 'Unknown'}<span className="block text-xs font-normal text-slate-400">Sent {formatDateTime(c.createdAt)}</span></td>
                  <td className="px-6 py-4 text-sm text-slate-600">{formatDate(c.checkInAt.slice(0, 10))}<span className="block text-xs text-slate-400">{time(c.checkInAt)} – {time(c.checkOutAt)}</span></td>
                  <td className="px-6 py-4 text-sm text-slate-600 max-w-xs">{c.reason}</td>
                  <td className="px-6 py-4">
                    <div className="flex justify-end gap-2">
                      {(c.viaTeam || adminWrite) && <>
                        <Button small variant="secondary" aria-label="Approve correction" onClick={() => decide(c, 'Approved')}><Check size={13} />Approve</Button>
                        <Button small variant="ghost" aria-label="Reject correction" onClick={() => decide(c, 'Rejected')}><X size={13} />Reject</Button>
                      </>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
};

interface ReportRow { userId: string; name: string; department: string; daysPresent: number; totalHours: number; avgHours: number; lateDays: number; earlyOutDays: number }

export const AttendanceReport = () => {
  const [month, setMonth] = useState(currentMonth());
  const [exportError, setExportError] = useState<string | null>(null);
  const { data, loading, error } = useAsync(() => apiJson<{ rows: ReportRow[] }>(`/admin/attendance/report?month=${month}&tz=${encodeURIComponent(tz())}`), [month]);

  const exportCsv = () =>
    downloadFile(`/admin/attendance/report?month=${month}&tz=${encodeURIComponent(tz())}&format=csv`, `attendance-report-${month}.csv`).then(() => setExportError(null), (e) => setExportError(errorMessage(e)));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthPicker value={month} onChange={setMonth} />
        <Button variant="secondary" onClick={exportCsv}><Download size={14} />Export CSV</Button>
      </div>
      <ErrorNote error={error ?? exportError} />
      <Card flush>
        {loading && !data ? <Spinner /> : !data?.rows.length ? <Empty>No data.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50"><tr><Th>Employee</Th><Th>Department</Th><Th>Days</Th><Th>Hours</Th><Th>Avg / day</Th><Th>Late</Th><Th>Early out</Th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.rows.map((r) => (
                  <tr key={r.userId}>
                    <td className="px-6 py-3 text-sm font-bold text-slate-900">{r.name}</td>
                    <td className="px-6 py-3 text-sm text-slate-500">{r.department}</td>
                    <td className="px-6 py-3 text-sm text-slate-900">{r.daysPresent}</td>
                    <td className="px-6 py-3 text-sm text-slate-900">{r.totalHours}h</td>
                    <td className="px-6 py-3 text-sm text-slate-600">{r.avgHours}h</td>
                    <td className="px-6 py-3 text-sm">{r.lateDays ? <Badge tone="amber">{r.lateDays}</Badge> : <span className="text-slate-300">0</span>}</td>
                    <td className="px-6 py-3 text-sm">{r.earlyOutDays ? <Badge tone="amber">{r.earlyOutDays}</Badge> : <span className="text-slate-300">0</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
