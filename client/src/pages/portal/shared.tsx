import { apiJson } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { MODULES, portalLevel, type PortalLevel } from '../../lib/permissions';
import type { User } from '../../types';
import type { Tone } from '../../components/ui';

export type Status = 'active' | 'suspended' | 'inactive' | 'deleted';

export interface CompanySummary {
  id: string;
  name: string;
  slug: string;
  domain: string;
  origin: string;
  status: Status;
  statusReason: string;
  primaryContact: { name: string; email: string; phone: string };
  subscription: { plan: string; seatLimit: number; expiresAt: string | null };
  modules: string[];
  features: { customLogo: boolean; customEmail: boolean };
  /** True when the client signs in at its own address (<slug>.<base>) instead of the shared one */
  dedicatedAddress?: boolean;
  usage: { employees: number; admins: number; seatLimit: number; lastActiveAt: string | null };
  pendingDeleteRequests?: number;
  supportAccess?: { active: boolean; expiresAt?: string; reason?: string };
}

export interface PortalStats {
  companies: Record<Status, number>;
  employees: number;
  pendingDeleteRequests: number;
  plans: Record<string, { label: string; seats: number }>;
  /** Where people sign in: the shared address, and the base that company addresses hang from */
  addresses?: { shared: string; baseDomain: string };
  pendingAddressRequests?: number;
}

export const statusTone = (s: Status): Tone => (s === 'active' ? 'green' : s === 'suspended' ? 'amber' : 'slate');

export const usePortalStats = () => useAsync(() => apiJson<PortalStats>('/platform/stats'), []);

/** Every client that is not deleted; the Overview, Plans and Clients screens all summarise this one list. */
export const useClients = (status = '') =>
  useAsync(() => apiJson<CompanySummary[]>(`/platform/companies${status ? `?status=${status}` : ''}`), [status]);

export const daysUntil = (iso: string | null | undefined) =>
  iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000) : null;

export const overSeats = (c: CompanySummary) => c.usage.employees > c.usage.seatLimit;

export const ModuleBoxes = ({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) => (
  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
    {MODULES.map((m) => (
      <label key={m} className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={value.includes(m)} onChange={(e) => onChange(e.target.checked ? [...value, m] : value.filter((x) => x !== m))} />
        {m}
      </label>
    ))}
  </div>
);

/** The signed-in portal account (the app keeps it in the session), for screens that hide actions a role cannot use. */
export const useMyPortalLevel = (): PortalLevel => {
  try {
    const stored = JSON.parse(sessionStorage.getItem('user') ?? 'null') as User | null;
    return portalLevel(stored) ?? 'viewer';
  } catch {
    return 'viewer';
  }
};
export const useCan = (needs: PortalLevel) => {
  const level = useMyPortalLevel();
  return level === 'super' || (needs === 'admin' && level === 'admin') || needs === 'viewer';
};

/** A numbered ticket for a change to a company's own sign-in address; kept for audits. */
export interface AddressTicket {
  id: string;
  ticketNo: string;
  company: string;
  companyName: string;
  action: 'enable' | 'disable' | 'rename';
  source: 'company' | 'platform';
  status: 'Pending' | 'Approved' | 'Rejected';
  requestedSlug: string;
  reason: string;
  requestedBy: { name: string; email: string; role: string };
  decidedBy: { name: string };
  decisionNote: string;
  decidedAt: string | null;
  before: { dedicated: boolean | null; slug: string };
  after: { dedicated: boolean | null; slug: string };
  createdAt: string;
}
export const ACTION_LABEL: Record<AddressTicket['action'], string> = { enable: 'Own address on', disable: 'Back to shared address', rename: 'Rename subdomain' };
export const ticketTone = (s: AddressTicket['status']): Tone => (s === 'Approved' ? 'green' : s === 'Rejected' ? 'rose' : 'amber');
