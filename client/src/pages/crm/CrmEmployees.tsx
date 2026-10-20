import React, { useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { User } from '../../types';
import { apiJson, apiSend } from '../../lib/api';
import { errorMessage } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Badge, Button, ErrorNote, Field, PageHeader, PasswordInput, Spinner, inputClass } from '../../components/ui';
import { PersonChip, RoleBadge, useEmployees, type Employee } from '../../components/crm/shared';
import { can } from '../../lib/permissions';

const blank = { name: '', email: '', employeeId: '', phone: '', designation: '', department: '', role: 'USER', password: '' };

const Employees = ({ user }: { user: User }) => {
  const [params, setParams] = useSearchParams();
  const flash = (useLocation().state as { notice?: string } | null)?.notice;
  const employees = useEmployees();
  const departments = useAsync(() => apiJson<{ name: string }[]>('/user/departments'));
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('All');
  const [adding, setAdding] = useState(params.get('add') === '1');
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(flash ?? null);

  const canWrite = can(user, 'users', 'write');
  const isSuper = user.role === 'SUPER_ADMIN';
  const list = employees.data ?? [];
  const deptNames = useMemo(
    () => [...new Set([...(departments.data ?? []).map((d) => d.name), ...list.map((e) => e.department ?? '')].filter(Boolean))].sort(),
    [departments.data, list]
  );
  const rows = list.filter((e) => {
    const needle = q.trim().toLowerCase();
    return (dept === 'All' || e.department === dept) &&
      (!needle || `${e.name} ${e.employeeId ?? ''} ${e.designation ?? ''} ${e.email}`.toLowerCase().includes(needle));
  });

  const toggleAdd = () => {
    const next = !adding;
    setAdding(next);
    setNotice(null);
    setError(null);
    if (!next && params.has('add')) setParams({}, { replace: true });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const created = await apiSend<Employee>('POST', '/admin/users', {
        ...form,
        department: form.department || deptNames[0] || 'Engineering',
        employeeId: form.employeeId || null
      });
      employees.setData([...list, created]);
      setNotice(`${created.name} was added. Share their temporary password so they can sign in.`);
      setForm(blank);
      setAdding(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-6 max-w-6xl">
      <PageHeader
        title="Employees"
        subtitle={`${list.length} people · showing ${rows.length}`}
        actions={canWrite && <Button onClick={toggleAdd} aria-expanded={adding}>{adding ? 'Close form' : 'Add employee'}</Button>}
      />

      {adding && (
        <form onSubmit={submit} className="p-6 rounded-2xl bg-white border-2 border-blue-600 flex flex-col gap-4">
          <h2 className="text-lg font-extrabold text-slate-900">New employee</h2>
          <ErrorNote error={error} />
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
            <Field label="Full name"><input required className={inputClass} value={form.name} onChange={set('name')} /></Field>
            <Field label="Work email"><input required type="email" className={inputClass} value={form.email} onChange={set('email')} /></Field>
            <Field label="Employee ID"><input className={inputClass} value={form.employeeId} onChange={set('employeeId')} /></Field>
            <Field label="Phone"><input type="tel" className={inputClass} value={form.phone} onChange={set('phone')} /></Field>
            <Field label="Designation"><input className={inputClass} value={form.designation} onChange={set('designation')} /></Field>
            <Field label="Department">
              <select className={inputClass} value={form.department || deptNames[0] || ''} onChange={set('department')}>
                {(deptNames.length ? deptNames : ['Engineering']).map((d) => <option key={d}>{d}</option>)}
              </select>
            </Field>
            <Field label="Access role">
              <select className={inputClass} value={form.role} onChange={set('role')}>
                <option value="USER">User</option>
                {isSuper && <option value="ADMIN">Admin</option>}
              </select>
            </Field>
            <Field label="Temporary password" hint="At least 6 characters.">
              <PasswordInput required minLength={6} autoComplete="new-password" className={inputClass} value={form.password} onChange={set('password')} />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save employee'}</Button>
            <Button variant="secondary" onClick={toggleAdd}>Cancel</Button>
          </div>
        </form>
      )}
      {notice && <p role="status" className="text-sm font-semibold text-blue-800">{notice}</p>}
      <ErrorNote error={employees.error} />

      <section className="p-5 rounded-2xl bg-white border border-slate-200 flex flex-col gap-4">
        <div className="flex flex-wrap gap-3 items-end justify-between">
          <label className="flex-1 basis-64 max-w-sm text-[13px] font-bold text-slate-600">
            Search
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, ID or designation" className={`${inputClass} mt-1.5`} />
          </label>
          <div role="group" aria-label="Filter by department" className="flex flex-wrap gap-2">
            {['All', ...deptNames].map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={dept === d}
                onClick={() => setDept(d)}
                className={`min-h-11 px-3.5 rounded-full text-sm font-bold border-[1.5px] border-blue-600 transition-colors ${dept === d ? 'bg-blue-600 text-white' : 'bg-white text-blue-800 hover:bg-blue-50'}`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
        {employees.loading && !employees.data ? <Spinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-slate-500">
                  {['Employee', 'Emp ID', 'Department', 'Designation', 'Role', 'Status'].map((h) => <th key={h} scope="col" className="px-3 py-2.5 border-b border-slate-200 font-bold">{h}</th>)}
                  <th scope="col" className="px-3 py-2.5 border-b border-slate-200"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-3 py-3 border-b border-slate-100">
                      <div className="flex items-center gap-3">
                        <PersonChip person={p} />
                        <span className="flex flex-col min-w-0">
                          <Link to={`/crm/employees/${p.id}`} className="font-bold text-slate-900 hover:underline">{p.name}</Link>
                          <span className="text-[13px] text-slate-500 truncate">{p.email}</span>
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 border-b border-slate-100 font-semibold text-slate-600">{p.employeeId || '—'}</td>
                    <td className="px-3 py-3 border-b border-slate-100">{p.department || '—'}</td>
                    <td className="px-3 py-3 border-b border-slate-100 text-slate-600">{p.designation || '—'}</td>
                    <td className="px-3 py-3 border-b border-slate-100"><RoleBadge role={p.role} /></td>
                    <td className="px-3 py-3 border-b border-slate-100"><Badge tone={p.locked ? 'rose' : 'green'}>{p.locked ? 'Suspended' : 'Active'}</Badge></td>
                    <td className="px-3 py-3 border-b border-slate-100 text-right">
                      <Link to={`/crm/employees/${p.id}`} aria-label={`View details for ${p.name}`} className="inline-flex items-center gap-1 min-h-11 px-3 rounded-[10px] text-sm font-bold text-blue-800 hover:bg-blue-50 whitespace-nowrap">
                        View<ChevronRight size={16} aria-hidden="true" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && <p className="mt-4 text-[15px] text-slate-500">No employees match this search.</p>}
          </div>
        )}
      </section>
    </div>
  );
};

export default Employees;
