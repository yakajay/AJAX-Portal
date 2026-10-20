import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import type { User } from '../../types';
import { apiJson, apiSend, requestDelete } from '../../lib/api';
import { can } from '../../lib/permissions';
import { currentMonth, errorMessage, formatDate, monthLabel } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Badge, Button, ErrorNote, Field, Modal, Spinner, inputClass } from '../../components/ui';
import { PersonChip, RoleBadge, ROLE_LABEL, useEmployees, type Employee } from '../../components/crm/shared';

interface AttendanceRow { userId: string; daysPresent: number; avgHours: number; lateDays: number; overtimeHours: number }
interface BalanceRow { userId: string; balances: { type: string; remaining: number; total: number }[] }

const PERMISSIONS_FOR: Record<Employee['role'], string> = { USER: 'read', ADMIN: 'read,write', SUPER_ADMIN: 'all' };

const tenure = (joinDate?: string | null) => {
  if (!joinDate) return '—';
  const months = Math.max(0, Math.floor((Date.now() - new Date(`${joinDate}T00:00:00Z`).getTime()) / (30.44 * 86400000)));
  const y = Math.floor(months / 12);
  const m = months % 12;
  return [y ? `${y} yr` : '', m || !y ? `${m} mo` : ''].filter(Boolean).join(' ');
};

const EmployeeDetail = ({ user }: { user: User }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const employees = useEmployees();
  const month = currentMonth();
  const attendance = useAsync(() => apiJson<{ rows: AttendanceRow[] }>(`/admin/attendance/report?month=${month}`).catch(() => ({ rows: [] as AttendanceRow[] })));
  const balances = useAsync(() => apiJson<BalanceRow[]>('/admin/leave-balances').catch(() => [] as BalanceRow[]));

  const person = employees.data?.find((e) => e.id === id);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Employee | null>(null);
  const [dialog, setDialog] = useState<'suspend' | 'delete' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => { if (person && !editing) setForm(person); }, [person, editing]);

  const canWrite = can(user, 'users', 'write');
  const isSuper = user.role === 'SUPER_ADMIN';
  const isSelf = person?.id === user.id;
  // Admins manage plain users; Super Admins manage everyone (mirrors the API)
  const manageable = !!person && canWrite && (isSuper || person.role === 'USER' || isSelf);
  const roleLocked = !isSuper || isSelf;

  if (employees.loading && !employees.data) return <Spinner />;
  if (!person || !form) {
    return (
      <section className="max-w-xl p-8 rounded-2xl bg-white border border-slate-200 flex flex-col gap-3">
        <h1 className="text-2xl font-extrabold text-slate-900">Employee not found</h1>
        <p className="text-[15px] text-slate-600">They may have been removed from the company.</p>
        <Link to="/crm/employees" className="self-start min-h-11 inline-flex items-center px-5 rounded-[10px] bg-blue-600 text-white font-bold hover:bg-blue-700">Back to employees</Link>
      </section>
    );
  }

  const set = (k: keyof Employee) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });
  const ro = !editing;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const roleChanged = form.role !== person.role;
      const updated = await apiSend<Employee>('PUT', `/admin/users/${person.id}`, {
        name: form.name, email: form.email, department: form.department, managerId: form.managerId || null,
        designation: form.designation ?? '', phone: form.phone ?? '', employeeId: form.employeeId || null,
        joinDate: form.joinDate || null, dateOfBirth: form.dateOfBirth || null,
        ...(roleChanged ? { role: form.role, permissions: PERMISSIONS_FOR[form.role] } : {})
      });
      employees.setData((employees.data ?? []).map((e) => (e.id === updated.id ? updated : e)));
      setEditing(false);
      setNotice('Changes saved.');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const setLocked = async (locked: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const updated = await apiSend<Employee>('PATCH', `/admin/users/${person.id}/lock`, { locked });
      employees.setData((employees.data ?? []).map((e) => (e.id === updated.id ? updated : e)));
      setNotice(locked ? `${person.name} is suspended and signed out everywhere.` : `${person.name} can sign in again.`);
      setDialog(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      const message = await requestDelete(`/admin/users/${person.id}`);
      setDialog(null);
      navigate('/crm/employees', { state: { notice: message } });
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  const att = attendance.data?.rows.find((r) => r.userId === person.id);
  const bal = balances.data?.find((r) => r.userId === person.id);
  const snapshot = [
    { label: 'Days present', value: att ? String(att.daysPresent) : '—' },
    { label: 'Average hours', value: att ? `${att.avgHours}h` : '—' },
    { label: 'Late days', value: att ? String(att.lateDays) : '—' },
    ...(bal?.balances ?? []).map((b) => ({ label: `${b.type} left`, value: `${b.remaining} of ${b.total}` })),
    { label: 'Tenure', value: tenure(person.joinDate) }
  ];
  const managers = (employees.data ?? []).filter((e) => e.id !== person.id);

  return (
    <div className="space-y-6 max-w-6xl">
      <Link to="/crm/employees" className="inline-flex items-center gap-1 min-h-11 text-sm font-bold text-blue-800 hover:underline"><ChevronLeft size={16} aria-hidden="true" />All employees</Link>

      <section className="p-6 rounded-2xl bg-white border border-slate-200 flex flex-wrap items-center justify-between gap-5">
        <div className="flex items-center gap-4 min-w-0">
          <PersonChip person={person} size={64} />
          <div className="flex flex-col gap-1.5 min-w-0">
            <h1 className="text-[28px] leading-tight font-extrabold text-slate-900 break-words">{person.name}</h1>
            <span className="text-[15px] text-slate-600">{[person.designation, person.department, person.employeeId].filter(Boolean).join(' · ') || person.email}</span>
            <div className="flex flex-wrap gap-2">
              <Badge tone={person.locked ? 'rose' : 'green'}>{person.locked ? 'Suspended' : 'Active'}</Badge>
              <RoleBadge role={person.role} />
            </div>
          </div>
        </div>
        {manageable && (
          <div className="flex flex-wrap gap-2.5">
            {editing ? (
              <>
                <Button variant="secondary" onClick={() => { setEditing(false); setForm(person); setError(null); }}>Cancel</Button>
                <Button onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</Button>
              </>
            ) : (
              <>
                <Button variant="secondary" onClick={() => { setEditing(true); setNotice(null); }}>Edit</Button>
                {!isSelf && !person.locked && <Button variant="secondary" onClick={() => setDialog('suspend')}>Suspend</Button>}
                {can(user, 'users', 'delete') && !isSelf && <Button variant="danger" onClick={() => setDialog('delete')}>Delete</Button>}
              </>
            )}
          </div>
        )}
      </section>

      {notice && <p role="status" className="text-sm font-semibold text-blue-800">{notice}</p>}
      <ErrorNote error={error ?? employees.error} />

      {person.locked && manageable && (
        <section className="p-5 rounded-2xl bg-amber-50 border border-amber-200 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="font-extrabold text-amber-800">Suspended</span>
            <span className="text-sm text-amber-800">They can no longer sign in. Their records are kept; use Offboarding for a formal exit and final settlement.</span>
          </div>
          <Button variant="secondary" onClick={() => setLocked(false)} disabled={busy}>Reinstate</Button>
        </section>
      )}

      <section className="flex flex-wrap gap-5 items-start">
        <div className="flex-[3] basis-96 min-w-0 flex flex-col gap-5">
          <div className="p-6 rounded-2xl bg-white border border-slate-200 flex flex-col gap-4">
            <h2 className="text-lg font-extrabold text-slate-900">Personal details</h2>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
              <Field label="Full name"><input className={inputClass} value={form.name} onChange={set('name')} disabled={ro} /></Field>
              <Field label="Work email"><input type="email" className={inputClass} value={form.email} onChange={set('email')} disabled={ro} /></Field>
              <Field label="Phone"><input type="tel" className={inputClass} value={form.phone ?? ''} onChange={set('phone')} disabled={ro} /></Field>
              <Field label="Date of birth"><input type="date" className={inputClass} value={form.dateOfBirth ?? ''} onChange={set('dateOfBirth')} disabled={ro} /></Field>
            </div>
          </div>
          <div className="p-6 rounded-2xl bg-white border border-slate-200 flex flex-col gap-4">
            <h2 className="text-lg font-extrabold text-slate-900">Employment</h2>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
              <Field label="Employee ID"><input className={inputClass} value={form.employeeId ?? ''} onChange={set('employeeId')} disabled={ro} /></Field>
              <Field label="Designation"><input className={inputClass} value={form.designation ?? ''} onChange={set('designation')} disabled={ro} /></Field>
              <Field label="Department">
                <select className={inputClass} value={form.department ?? ''} onChange={set('department')} disabled={ro}>
                  {[...new Set([form.department ?? '', ...(employees.data ?? []).map((e) => e.department ?? '')].filter(Boolean))].map((d) => <option key={d}>{d}</option>)}
                </select>
              </Field>
              <Field label="Reporting manager">
                <select className={inputClass} value={form.managerId ?? ''} onChange={set('managerId')} disabled={ro}>
                  <option value="">No manager</option>
                  {managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </Field>
              <Field label="Date of joining"><input type="date" className={inputClass} value={form.joinDate ?? ''} onChange={set('joinDate')} disabled={ro} /></Field>
              <Field label="Access role" hint={roleLocked ? 'Only Super Admins can change access roles.' : undefined}>
                <select className={inputClass} value={form.role} onChange={set('role')} disabled={ro || roleLocked}>
                  {(Object.keys(ROLE_LABEL) as Employee['role'][]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                </select>
              </Field>
            </div>
          </div>
        </div>

        <aside className="flex-[2] basis-72 min-w-0 p-6 rounded-2xl bg-white border border-slate-200 flex flex-col gap-3.5">
          <h2 className="text-lg font-extrabold text-slate-900">{monthLabel(month)} snapshot</h2>
          {snapshot.map((x) => (
            <div key={x.label} className="flex items-baseline justify-between gap-3 pb-3 border-b border-slate-100 last:border-0">
              <span className="text-sm text-slate-600">{x.label}</span>
              <span className="text-[15px] font-extrabold text-slate-900">{x.value}</span>
            </div>
          ))}
          {person.joinDate && <span className="text-[13px] text-slate-500">Joined {formatDate(person.joinDate)}</span>}
        </aside>
      </section>

      <Modal open={dialog === 'suspend'} title={`Suspend ${person.name}`} onClose={() => setDialog(null)}>
        <div className="space-y-4">
          <p className="text-[15px] text-slate-600">Sign-in is blocked and they are signed out on every device. All attendance, leave and payslip records are kept, and you can reinstate them at any time.</p>
          <div className="flex justify-end gap-2.5">
            <Button variant="secondary" onClick={() => setDialog(null)}>Cancel</Button>
            <Button onClick={() => setLocked(true)} disabled={busy}>Suspend</Button>
          </div>
        </div>
      </Modal>
      <Modal open={dialog === 'delete'} title={`Delete ${person.name}?`} onClose={() => setDialog(null)}>
        <div className="space-y-4">
          <p className="text-[15px] text-slate-600">
            This removes their profile and records and can’t be undone. {isSuper ? '' : 'Your request goes to the platform administrator for approval. '}If they’re leaving, suspend them instead to keep their records.
          </p>
          <div className="flex justify-end gap-2.5">
            <Button variant="secondary" onClick={() => setDialog(null)}>Cancel</Button>
            <Button variant="danger" onClick={remove} disabled={busy}>{isSuper ? 'Delete permanently' : 'Request deletion'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default EmployeeDetail;
