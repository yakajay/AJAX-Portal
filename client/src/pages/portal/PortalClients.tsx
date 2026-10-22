import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { formatDateTime } from '../../lib/format';
import { Badge, Button, Card, Empty, ErrorNote, PageHeader, Spinner, Th, inputClass } from '../../components/ui';
import { overSeats, statusTone, useClients, usePortalStats } from './shared';

/** Every client company, filterable by name, status and plan. "Manage" opens the client's details page. */
const PortalClients = () => {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [plan, setPlan] = useState('');
  const stats = usePortalStats();
  const clients = useClients(status === 'deleted' ? 'deleted' : '');
  const plans = stats.data?.plans ?? {};

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (clients.data ?? []).filter((c) =>
      (!status || c.status === status) && (!plan || c.subscription.plan === plan) &&
      (!needle || `${c.name} ${c.slug} ${c.primaryContact.name}`.toLowerCase().includes(needle))
    );
  }, [clients.data, q, status, plan]);

  const total = clients.data?.length ?? 0;
  const people = (clients.data ?? []).reduce((sum, c) => sum + c.usage.employees, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clients"
        subtitle={`${total} companies · ${people.toLocaleString()} employees`}
        actions={<Link to="/portal/onboard" className="inline-flex items-center gap-2 min-h-11 px-5 rounded-[10px] bg-blue-600 text-white font-bold text-[15px] hover:bg-blue-700"><Plus size={14} />Onboard client</Link>}
      />
      <div className="flex flex-wrap gap-3">
        <input aria-label="Search clients" className={`${inputClass} flex-1 min-w-56`} placeholder="Search by name, subdomain or contact…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Filter by status" className={`${inputClass} w-44`} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="active">Active</option><option value="suspended">Suspended</option><option value="inactive">Inactive</option><option value="deleted">Deleted</option>
        </select>
        <select aria-label="Filter by plan" className={`${inputClass} w-44`} value={plan} onChange={(e) => setPlan(e.target.value)}>
          <option value="">All plans</option>
          {Object.entries(plans).map(([id, p]) => <option key={id} value={id}>{p.label}</option>)}
        </select>
      </div>
      <ErrorNote error={clients.error} />
      <Card flush>
        {clients.loading && !clients.data ? <Spinner /> : !rows.length ? <Empty>{total ? 'No clients match these filters.' : 'No clients yet. Onboard your first one.'}</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50"><tr><Th>Company</Th><Th>Plan</Th><Th>Seats</Th><Th>Status</Th><Th>Last active</Th><Th /></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/50">
                    <td className="px-6 py-3"><p className="font-bold text-slate-900">{c.name}</p><p className="font-mono text-xs text-slate-400">{c.domain}</p></td>
                    <td className="px-6 py-3 text-sm text-slate-600">{plans[c.subscription.plan]?.label ?? c.subscription.plan}</td>
                    <td className="px-6 py-3 text-sm text-slate-600">{c.usage.employees} / {c.usage.seatLimit}{overSeats(c) && <Badge tone="rose">over</Badge>}</td>
                    <td className="px-6 py-3"><Badge tone={statusTone(c.status)}>{c.status}</Badge></td>
                    <td className="px-6 py-3 text-xs text-slate-500">{c.usage.lastActiveAt ? formatDateTime(c.usage.lastActiveAt) : 'never'}</td>
                    <td className="px-6 py-3 text-right"><Link to={`/portal/clients/${c.id}`} aria-label={`Manage ${c.name}`} className="inline-flex items-center min-h-9 px-3 rounded-[10px] border-[1.5px] border-blue-600 text-sm font-bold text-blue-800 hover:bg-blue-50">Manage</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {!clients.data && !clients.loading && <Button variant="secondary" onClick={() => void clients.reload()}>Retry</Button>}
    </div>
  );
};

export default PortalClients;
