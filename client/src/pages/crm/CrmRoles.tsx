import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { User } from '../../types';
import { apiSend } from '../../lib/api';
import { errorMessage } from '../../lib/format';
import { ErrorNote, PageHeader, Spinner } from '../../components/ui';
import { PersonChip, ROLE_LABEL, useEmployees, type Employee } from '../../components/crm/shared';

const PERMISSIONS_FOR: Record<Employee['role'], string> = { USER: 'read', ADMIN: 'read,write', SUPER_ADMIN: 'all' };

const ROLE_CARDS: { role: Employee['role']; opens: string; desc: string }[] = [
  { role: 'USER', opens: 'Opens HRMS only', desc: 'Attendance, leave, payslips, documents and directory for their own records.' },
  { role: 'ADMIN', opens: 'Opens HRMS and CRM', desc: 'Manages people, approvals, holidays, leave balances and payroll within the permissions you grant.' },
  { role: 'SUPER_ADMIN', opens: 'Opens everything', desc: 'Everything an Admin can do, plus deletes, roles and access, company settings and the audit log.' }
];

// What each role can do in each area (Admins get these by default; their access can be narrowed per area)
const MATRIX: [string, string, string, string][] = [
  ['Attendance & leave', 'Own records', 'View · Edit', 'View · Edit · Delete'],
  ['Employees', 'Directory only', 'View · Add · Edit', 'View · Add · Edit · Delete'],
  ['Approvals', '—', 'Approve · Reject', 'Approve · Reject'],
  ['Holiday calendar', 'View', 'Add · Edit', 'Add · Edit · Request removal'],
  ['Payroll', 'Own payslips', 'Run · Mark paid', 'Run · Mark paid'],
  ['Roles & access', '—', '—', 'Assign roles'],
  ['Company settings & audit log', '—', '—', 'Full access']
];

const Roles = ({ user }: { user: User }) => {
  const employees = useEmployees();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const list = employees.data ?? [];

  const assign = async (person: Employee, role: Employee['role']) => {
    setBusy(person.id);
    setError(null);
    setMsg(null);
    try {
      const updated = await apiSend<Employee>('PUT', `/admin/users/${person.id}`, { role, permissions: PERMISSIONS_FOR[role] });
      employees.setData(list.map((e) => (e.id === updated.id ? updated : e)));
      setMsg(`${person.name} is now ${ROLE_LABEL[role]}.`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <PageHeader title="Roles & access" subtitle="Super Admin · decide who sees the CRM" />
      <ErrorNote error={error ?? employees.error} />

      <section className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-5">
        {ROLE_CARDS.map((c) => (
          <div key={c.role} className="p-5 rounded-2xl bg-white border border-slate-200 flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-lg font-extrabold text-slate-900">{ROLE_LABEL[c.role]}</span>
              <span className="text-[13px] font-semibold text-slate-500">{list.filter((e) => e.role === c.role).length === 1 ? '1 person' : `${list.filter((e) => e.role === c.role).length} people`}</span>
            </div>
            <span className="text-sm font-bold text-blue-800">{c.opens}</span>
            <span className="text-sm leading-relaxed text-slate-600">{c.desc}</span>
          </div>
        ))}
      </section>

      <section className="flex flex-wrap gap-5 items-start">
        <div className="flex-[3] basis-[28rem] min-w-0 p-5 rounded-2xl bg-white border border-slate-200 flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-lg font-extrabold text-slate-900">Assign roles</h2>
            <Link to="/settings" className="text-sm font-bold text-blue-800 hover:underline">Fine-tune Admin permissions →</Link>
          </div>
          {msg && <p role="status" className="text-sm font-semibold text-blue-800">{msg}</p>}
          {employees.loading && !employees.data ? <Spinner /> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[460px] text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wider text-slate-500">
                    <th scope="col" className="px-3 py-2.5 border-b border-slate-200 font-bold">Employee</th>
                    <th scope="col" className="px-3 py-2.5 border-b border-slate-200 font-bold">Department</th>
                    <th scope="col" className="px-3 py-2.5 border-b border-slate-200 font-bold">Role</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((p) => {
                    const self = p.id === user.id;
                    return (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="px-3 py-3 border-b border-slate-100">
                          <div className="flex items-center gap-3">
                            <PersonChip person={p} />
                            <span className="flex flex-col"><span className="font-bold text-slate-900">{p.name}</span><span className="text-[13px] text-slate-500">{self ? 'You · cannot change your own role' : p.designation || p.email}</span></span>
                          </div>
                        </td>
                        <td className="px-3 py-3 border-b border-slate-100">{p.department || '—'}</td>
                        <td className="px-3 py-3 border-b border-slate-100">
                          <select
                            aria-label={`Role for ${p.name}`}
                            className="min-h-11 px-3 rounded-[10px] border-[1.5px] border-slate-300 bg-white text-[15px] font-semibold disabled:opacity-60"
                            value={p.role}
                            disabled={self || busy === p.id}
                            onChange={(e) => void assign(p, e.target.value as Employee['role'])}
                          >
                            {(Object.keys(ROLE_LABEL) as Employee['role'][]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex-[2] basis-80 min-w-0 p-5 rounded-2xl bg-white border border-slate-200 flex flex-col gap-4">
          <h2 className="text-lg font-extrabold text-slate-900">What each role can do</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-slate-500">
                  <th scope="col" className="px-2 py-2 border-b border-slate-200 font-bold">Area</th>
                  <th scope="col" className="px-2 py-2 border-b border-slate-200 font-bold">User</th>
                  <th scope="col" className="px-2 py-2 border-b border-slate-200 font-bold">Admin</th>
                  <th scope="col" className="px-2 py-2 border-b border-slate-200 font-bold">Super</th>
                </tr>
              </thead>
              <tbody>
                {MATRIX.map(([area, u, a, s]) => (
                  <tr key={area}>
                    <th scope="row" className="px-2 py-2.5 border-b border-slate-100 font-bold text-slate-900">{area}</th>
                    <td className="px-2 py-2.5 border-b border-slate-100 text-slate-600">{u}</td>
                    <td className="px-2 py-2.5 border-b border-slate-100 text-slate-600">{a}</td>
                    <td className="px-2 py-2.5 border-b border-slate-100 text-slate-600">{s}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Roles;
