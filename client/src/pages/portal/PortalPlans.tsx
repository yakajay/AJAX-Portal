import { Link } from 'react-router-dom';
import { Badge, Card, Empty, ErrorNote, PageHeader, Spinner, Th } from '../../components/ui';
import { formatDateTime } from '../../lib/format';
import { daysUntil, useClients, usePortalStats } from './shared';

/** The plan catalogue and who is on each plan. Prices and invoices are not tracked by the platform yet. */
const PortalPlans = () => {
  const stats = usePortalStats();
  const clients = useClients();
  if (!stats.data || !clients.data) return stats.error || clients.error ? <ErrorNote error={stats.error ?? clients.error} /> : <Spinner />;

  const billable = clients.data.filter((c) => c.status !== 'inactive');
  const ending = billable
    .filter((c) => c.subscription.expiresAt)
    .sort((a, b) => (a.subscription.expiresAt ?? '').localeCompare(b.subscription.expiresAt ?? ''));

  return (
    <div className="space-y-6">
      <PageHeader title="Plans & billing" subtitle="Seats and subscription terms for every client" />
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Object.entries(stats.data.plans).map(([id, p]) => {
          const mine = billable.filter((c) => c.subscription.plan === id);
          return (
            <Card key={id} title={p.label}>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-slate-500">Included seats</dt><dd className="font-bold text-slate-900">{p.seats.toLocaleString()}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Clients</dt><dd className="font-bold text-slate-900">{mine.length}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Employees</dt><dd className="font-bold text-slate-900">{mine.reduce((sum, c) => sum + c.usage.employees, 0).toLocaleString()}</dd></div>
              </dl>
            </Card>
          );
        })}
      </div>
      <Card title="Subscription terms" flush>
        {!ending.length ? <Empty>No client has an end date set.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50"><tr><Th>Company</Th><Th>Plan</Th><Th>Seats used</Th><Th>Ends</Th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {ending.map((c) => {
                  const left = daysUntil(c.subscription.expiresAt) ?? 0;
                  return (
                    <tr key={c.id} className="hover:bg-slate-50/50">
                      <td className="px-6 py-3"><Link to={`/portal/clients/${c.id}`} className="font-bold text-slate-900 hover:underline">{c.name}</Link></td>
                      <td className="px-6 py-3 text-sm text-slate-600">{stats.data.plans[c.subscription.plan]?.label ?? c.subscription.plan}</td>
                      <td className="px-6 py-3 text-sm text-slate-600">{c.usage.employees} / {c.usage.seatLimit}</td>
                      <td className="px-6 py-3 text-sm text-slate-600">{formatDateTime(c.subscription.expiresAt)} <Badge tone={left < 0 ? 'rose' : left <= 45 ? 'amber' : 'slate'}>{left < 0 ? `${-left} days ago` : `in ${left} days`}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="text-sm text-slate-500">Plan prices and invoices are not recorded in the platform yet. Change a client's plan or seat limit from its details page.</p>
    </div>
  );
};

export default PortalPlans;
