import { apiJson } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { MODULES } from '../../lib/permissions';
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
  usage: { employees: number; admins: number; seatLimit: number; lastActiveAt: string | null };
  pendingDeleteRequests?: number;
  supportAccess?: { active: boolean; expiresAt?: string; reason?: string };
}

export interface PortalStats {
  companies: Record<Status, number>;
  employees: number;
  pendingDeleteRequests: number;
  plans: Record<string, { label: string; seats: number }>;
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
