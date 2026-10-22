import { Link } from 'react-router-dom';
import { Avatar, initialsOf } from '../Avatar';
import { Badge } from '../ui';
import { apiJson } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';

/** An employee as the admin API returns them (no passwords, tokens or sensitive data). */
export interface Employee {
  id: string;
  name: string;
  email: string;
  role: 'USER' | 'ADMIN' | 'SUPER_ADMIN';
  permissions?: string;
  department?: string;
  designation?: string;
  employeeId?: string | null;
  phone?: string;
  joinDate?: string | null;
  dateOfBirth?: string | null;
  managerId?: string | null;
  manager?: { id: string; name: string } | null;
  locked?: boolean;
  avatarVersion?: number | null;
}

export const ROLE_LABEL: Record<Employee['role'], string> = { USER: 'User', ADMIN: 'Admin', SUPER_ADMIN: 'Super Admin' };
export const ROLE_TONE: Record<Employee['role'], 'slate' | 'blue' | 'green'> = { USER: 'slate', ADMIN: 'blue', SUPER_ADMIN: 'green' };

export const RoleBadge = ({ role }: { role: Employee['role'] }) => <Badge tone={ROLE_TONE[role]}>{ROLE_LABEL[role]}</Badge>;

/** Round photo-or-initials chip. */
export const PersonChip = ({ person, size = 36 }: { person: { id: string; name: string; avatarVersion?: number | null }; size?: number }) => (
  <span
    aria-hidden="true"
    style={{ width: size, height: size }}
    className="shrink-0 rounded-full bg-blue-100 text-blue-800 overflow-hidden flex items-center justify-center font-extrabold text-[13px]"
  >
    <Avatar person={person} initials={initialsOf(person.name)} />
  </span>
);

export const useEmployees = () => useAsync(() => apiJson<Employee[]>('/admin/users'));

/**
 * What a person sees on a CRM page they cannot open. Admins who lack Super Admin rights are told who
 * to ask; employees are sent back to the portal.
 */
export const Restricted = ({ superOnly }: { superOnly: boolean }) => (
  <section className="max-w-xl p-8 rounded-2xl bg-white border border-slate-200 flex flex-col gap-3">
    <span className="text-[13px] font-bold uppercase tracking-wider text-rose-700">Restricted</span>
    <h1 className="text-2xl font-extrabold text-slate-900">{superOnly ? 'Super Admins only' : 'CRM access needed'}</h1>
    <p className="text-[15px] leading-relaxed text-slate-600">
      {superOnly
        ? 'Only Super Admins can assign roles and change access. Ask a Super Admin if someone needs a different role.'
        : 'The CRM is for Admins and Super Admins. Your account uses the HRMS portal for attendance, leave and payslips.'}
    </p>
    <Link to={superOnly ? '/crm' : '/'} className="self-start mt-2 min-h-11 inline-flex items-center px-5 rounded-[10px] bg-blue-600 text-white font-bold text-[15px] hover:bg-blue-700">
      {superOnly ? 'Back to CRM overview' : 'Go to HRMS portal'}
    </Link>
  </section>
);

export const DEPARTMENT_FALLBACK = 'Unassigned';

/** What anyone but Ajax platform staff sees on a Portal page. */
export const PortalRestricted = ({ isAdmin }: { isAdmin: boolean }) => (
  <section className="max-w-xl p-8 rounded-2xl bg-white border border-slate-200 flex flex-col gap-3">
    <span className="text-[13px] font-bold uppercase tracking-wider text-rose-700">Restricted</span>
    <h1 className="text-2xl font-extrabold text-slate-900">Portal admins only</h1>
    <p className="text-[15px] leading-relaxed text-slate-600">
      The client portal is for Ajax platform staff. Company Admins and Super Admins manage their own organisation in the CRM.
    </p>
    <Link to={isAdmin ? '/crm' : '/'} className="self-start mt-2 min-h-11 inline-flex items-center px-5 rounded-[10px] bg-blue-600 text-white font-bold text-[15px] hover:bg-blue-700">
      {isAdmin ? 'Go to CRM' : 'Go to HRMS portal'}
    </Link>
  </section>
);
