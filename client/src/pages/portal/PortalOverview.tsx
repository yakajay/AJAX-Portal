import { Link } from 'react-router-dom';
import { Building2, FlaskConical, Hourglass, Plus, Users } from 'lucide-react';
import { formatDateTime } from '../../lib/format';
import { Badge, Card, Empty, ErrorNote, PageHeader, Spinner, StatTile } from '../../components/ui';
import { daysUntil, overSeats, useClients, usePortalStats, type CompanySummary } from './shared';

interface Attention { client: CompanySummary; issue: string; tone: 'rose' | 'amber' | 'blue' }

const attentionFor = (c: CompanySummary): Attention | null => {
  if (c.status === 'suspended') return { client: c, issue: `Suspended${c.statusReason ? ` · ${c.statusReason}` : ''}`, tone: 'rose' };
  if (c.status === 'inactive') return { client: c, issue: 'Deactivated', tone: 'rose' };
  if (overSeats(c)) return { client: c, issue: `Over seat limit by ${c.usage.employees - c.usage.seatLimit}`, tone: 'rose' };
  const left = daysUntil(c.subscription.expiresAt);
  if (left !== null && left < 0) return { client: c, issue: `Subscription ended ${-left} days ago`, tone: 'rose' };
  if (left !== null && left <= 45) return { client: c, issue: `${c.subscription.plan === 'trial' ? 'Trial ends' : 'Renews'} in ${left} days`, tone: c.subscription.plan === 'trial' ? 'amber' : 'blue' };
  return null;
};

/** The platform team's home: how many clients, what needs attention, and what is renewing soon. */
const PortalOverview = () => {
  const stats = usePortalStats();
  const clients = useClients();
  if (!stats.data || !clients.data) return stats.error || clients.error ? <ErrorNote error={stats.error ?? clients.error} /> : <Spinner />;

  const live = clients.data.filter((c) => c.status === 'active');
  const trials = live.filter((c) => c.subscription.plan === 'trial').length;
  const attention = clients.data.map(attentionFor).filter((a): a is Attention => !!a);
  const byPlan = Object.entries(stats.data.plans).map(([id, p]) => {
    const mine = clients.data.filter((c) => c.subscription.plan === id && c.status !== 'inactive');
    return { id, label: p.label, count: mine.length, seats: mine.reduce((sum, c) => sum + c.usage.employees, 0) };
  });
  const top = Math.max(1, ...byPlan.map((p) => p.count));
  const renewals = live
    .filter((c) => { const d = daysUntil(c.subscription.expiresAt); return d !== null && d >= 0 && d <= 90; })
    .sort((a, b) => (a.subscription.expiresAt ?? '').localeCompare(b.subscription.expiresAt ?? ''));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Portal overview"
        subtitle="All client companies"
        actions={<Link to="/portal/onboard" className="inline-flex items-center gap-2 min-h-11 px-5 rounded-[10px] bg-blue-600 text-white font-bold text-[15px] hover:bg-blue-700"><Plus size={14} />Onboard client</Link>}
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile label="Active clients" value={stats.data.companies.active} icon={Building2} hint={`${stats.data.companies.suspended} suspended · ${stats.data.companies.inactive} inactive`} />
        <StatTile label="On trial" value={trials} icon={FlaskConical} hint="Active clients on the trial plan" />
        <StatTile label="Employees on platform" value={stats.data.employees.toLocaleString()} icon={Users} />
        <StatTile label="Waiting for you" value={stats.data.pendingDeleteRequests + (stats.data.pendingAddressRequests ?? 0)} icon={Hourglass} hint={`${stats.data.pendingDeleteRequests} delete requests · ${stats.data.pendingAddressRequests ?? 0} address tickets`} />
      </div>
      <div className="grid lg:grid-cols-[2fr_1fr] gap-6">
        <Card title="Needs attention" actions={<Link to="/portal/clients" className="text-sm font-bold text-blue-800 hover:underline">All clients</Link>} flush>
          {!attention.length ? <Empty>Nothing needs attention.</Empty> : (
            <ul className="divide-y divide-slate-100">
              {attention.map(({ client, issue, tone }) => (
                <li key={client.id}>
                  <Link to={`/portal/clients/${client.id}`} className="flex items-center justify-between gap-4 px-6 py-3 hover:bg-slate-50/50">
                    <span><span className="block font-bold text-slate-900">{client.name}</span><span className="block font-mono text-xs text-slate-400">{client.domain}</span></span>
                    <Badge tone={tone}>{issue}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Clients by plan">
          <ul className="space-y-4">
            {byPlan.map((p) => (
              <li key={p.id}>
                <div className="flex justify-between text-sm"><span className="font-bold text-slate-900">{p.label}</span><span className="text-slate-500">{p.count} clients · {p.seats.toLocaleString()} employees</span></div>
                <div className="mt-1.5 h-2 rounded-full bg-slate-100" role="presentation"><div className="h-2 rounded-full bg-blue-600" style={{ width: `${Math.round((p.count / top) * 100)}%` }} /></div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <Card title="Upcoming renewals" flush>
        {!renewals.length ? <Empty>No renewals in the next 90 days.</Empty> : (
          <ul className="divide-y divide-slate-100">
            {renewals.map((c) => (
              <li key={c.id}>
                <Link to={`/portal/clients/${c.id}`} className="flex items-center justify-between gap-4 px-6 py-3 hover:bg-slate-50/50">
                  <span className="font-bold text-slate-900">{c.name}</span>
                  <span className="text-sm text-slate-500">{stats.data.plans[c.subscription.plan]?.label ?? c.subscription.plan} · {formatDateTime(c.subscription.expiresAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
};

export default PortalOverview;
