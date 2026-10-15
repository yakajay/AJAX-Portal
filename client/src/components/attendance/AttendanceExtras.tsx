import React, { useState } from 'react';
import { Check, Download, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { User } from '../../types';
import { apiJson, apiSend, downloadFile } from '../../lib/api';
import { can } from '../../lib/permissions';
import { currentMonth, errorMessage, formatDate, formatDateTime } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Badge, Button, Card, Empty, ErrorNote, Field, Modal, Spinner, StatTile, Th, inputClass, statusTone } from '../ui';

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

interface Record { id: string; checkInAt: string; checkOutAt: string | null; status: string; source: string; reason: string | null; reviewNote: string }
interface EditorForm { id: string | null; date: string; inTime: string; outTime: string; status: string; reason: string }

const pad = (n: number) => String(n).padStart(2, '0');
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

// Admins add, correct or remove one employee's entries directly; every change needs a reason and is audited
export const AttendanceEditor = ({ user }: { user: User }) => {
  const canWrite = can(user, 'attendance', 'write');
  const canDelete = can(user, 'attendance', 'delete');
  const [month, setMonth] = useState(currentMonth());
  const [userId, setUserId] = useState('');
  const [form, setForm] = useState<EditorForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const people = useAsync(() => apiJson<{ rows: ReportRow[] }>(`/admin/attendance/report?month=${month}&tz=${encodeURIComponent(tz())}`), []);
  const records = useAsync(
    () => (userId ? apiJson<Record[]>(`/admin/attendance/records?userId=${userId}&month=${month}&tz=${encodeURIComponent(tz())}`) : Promise.resolve([] as Record[])),
    [userId, month]
  );

  const openNew = () => setForm({ id: null, date: localDate(new Date()), inTime: '09:00', outTime: '18:00', status: 'Present', reason: '' });
  const openEdit = (r: Record) => {
    const start = new Date(r.checkInAt);
    setForm({ id: r.id, date: localDate(start), inTime: localTime(start), outTime: r.checkOutAt ? localTime(new Date(r.checkOutAt)) : '', status: r.status === 'Rejected' ? 'Rejected' : 'Present', reason: '' });
  };
  const set = (patch: Partial<EditorForm>) => setForm((f) => (f ? { ...f, ...patch } : f));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    setFormError(null);
    const checkInAt = new Date(`${form.date}T${form.inTime}`).toISOString();
    const checkOutAt = new Date(`${form.date}T${form.outTime}`).toISOString();
    try {
      if (form.id) await apiSend('PUT', `/admin/attendance/${form.id}`, { checkInAt, checkOutAt, status: form.status, reason: form.reason, tz: tz() });
      else await apiSend('POST', '/admin/attendance', { userId, checkInAt, checkOutAt, reason: form.reason, tz: tz() });
      setForm(null);
      await records.reload();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (r: Record) => {
    const reason = window.prompt('Reason for removing this entry (shown to the employee):');
    if (!reason?.trim()) return;
    try {
      setActionError(null);
      await apiSend('DELETE', `/admin/attendance/${r.id}`, { reason });
      await records.reload();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <select aria-label="Employee" className={`${inputClass} w-56`} value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">Select an employee…</option>
            {people.data?.rows.filter((r) => r.userId !== user.id).map((r) => <option key={r.userId} value={r.userId}>{r.name}</option>)}
          </select>
          <MonthPicker value={month} onChange={setMonth} />
        </div>
        {canWrite && <Button disabled={!userId} onClick={openNew}><Plus size={14} />Add entry</Button>}
      </div>
      <ErrorNote error={people.error ?? records.error ?? actionError} />
      <Card flush>
        {!userId ? <Empty>Pick an employee to review their entries.</Empty> : records.loading && !records.data ? <Spinner /> : !records.data?.length ? <Empty>No entries for this month.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50"><tr><Th>Date</Th><Th>In</Th><Th>Out</Th><Th>Status</Th><Th>Note</Th><Th right>Actions</Th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {records.data.map((r) => (
                  <tr key={r.id}>
                    <td className="px-6 py-3 text-sm font-bold text-slate-900">{formatDate(r.checkInAt)}</td>
                    <td className="px-6 py-3 text-sm text-slate-600">{time(r.checkInAt)}</td>
                    <td className="px-6 py-3 text-sm text-slate-600">{time(r.checkOutAt)}</td>
                    <td className="px-6 py-3"><Badge tone={statusTone(r.status)}>{r.status}</Badge></td>
                    <td className="px-6 py-3 text-sm text-slate-500 max-w-xs">{r.source === 'admin' ? r.reviewNote || r.reason : r.reason}</td>
                    <td className="px-6 py-3">
                      <div className="flex justify-end gap-2">
                        {canWrite && r.checkOutAt && <Button small variant="secondary" aria-label="Edit entry" onClick={() => openEdit(r)}><Pencil size={13} />Edit</Button>}
                        {canDelete && <Button small variant="ghost" aria-label="Remove entry" onClick={() => remove(r)}><Trash2 size={13} />Remove</Button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={!!form} title={form?.id ? 'Edit attendance entry' : 'Add attendance entry'} onClose={() => setForm(null)}>
        {form && (
          <form onSubmit={save} className="space-y-4">
            <Field label="Date"><input type="date" required max={localDate(new Date())} disabled={!!form.id} className={inputClass} value={form.date} onChange={(e) => set({ date: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Login time"><input type="time" required className={inputClass} value={form.inTime} onChange={(e) => set({ inTime: e.target.value })} /></Field>
              <Field label="Logout time"><input type="time" required className={inputClass} value={form.outTime} onChange={(e) => set({ outTime: e.target.value })} /></Field>
            </div>
            {form.id && (
              <Field label="Status">
                <select className={inputClass} value={form.status} onChange={(e) => set({ status: e.target.value })}>
                  <option value="Present">Present</option>
                  <option value="Rejected">Rejected (not counted)</option>
                </select>
              </Field>
            )}
            <Field label="Reason" hint="Shown to the employee and recorded in the audit log."><textarea required rows={2} className={inputClass} value={form.reason} onChange={(e) => set({ reason: e.target.value })} /></Field>
            <ErrorNote error={formError} />
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};
