import { Link } from 'react-router-dom';
import { apiJson } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Badge, Empty, ErrorNote, PageHeader, StatTile } from '../../components/ui';
import { PersonChip } from '../../components/crm/shared';

interface Stats { workforce: number; pendingLeaves: number; pendingExpenses?: number; openTickets?: number }
interface Analytics {
  headcountByDepartment: { department: string; count: number }[];
  attendanceRate: { date: string; present: number; rate: number }[];
  totalPeople: number;
}
interface LeaveRow { id: string; userId: string; type: string; startDate: string; endDate: string; status: string; user?: { name: string } }
interface Correction { id: string; userId: string; checkInAt: string; user?: { name: string } }

const Overview = () => {
  const stats = useAsync(() => apiJson<Stats>('/admin/dashboard/stats'));
  const analytics = useAsync(() => apiJson<Analytics>('/admin/dashboard/analytics'));
  const leaves = useAsync(() => apiJson<LeaveRow[]>('/admin/leaves'));
  const corrections = useAsync(() => apiJson<Correction[]>('/admin/attendance/regularizations').catch(() => [] as Correction[]));

  const today = new Date().toISOString().slice(0, 10);
  const allLeaves = leaves.data ?? [];
  const pendingLeaves = allLeaves.filter((l) => l.status === 'Pending');
  const onLeaveToday = allLeaves.filter((l) => l.status === 'Approved' && l.startDate <= today && today <= l.endDate).length;
  const pendingCorrections = corrections.data ?? [];
  const pendingExpenses = stats.data?.pendingExpenses ?? 0;
  const pendingTotal = pendingLeaves.length + pendingCorrections.length + pendingExpenses;

  const rates = analytics.data?.attendanceRate ?? [];
  const rate = rates[rates.length - 1];
  const headcount = analytics.data?.headcountByDepartment ?? [];
  const total = headcount.reduce((sum, d) => sum + d.count, 0);

  const waiting = [
    ...pendingLeaves.map((l) => ({
      key: `l-${l.id}`, userId: l.userId, name: l.user?.name ?? 'Employee', what: l.type,
      when: l.startDate === l.endDate ? formatDate(l.startDate, { day: 'numeric', month: 'short' }) : `${formatDate(l.startDate, { day: 'numeric', month: 'short' })} – ${formatDate(l.endDate, { day: 'numeric', month: 'short' })}`
    })),
    ...pendingCorrections.map((c) => ({
      key: `c-${c.id}`, userId: c.userId, name: c.user?.name ?? 'Employee', what: 'Regularization',
      when: formatDate(c.checkInAt, { day: 'numeric', month: 'short' })
    }))
  ];

  return (
    <div className="space-y-6 max-w-6xl">
      <PageHeader
        title="CRM overview"
        subtitle={`${new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })} · whole organisation`}
        actions={<>
          <Link to="/crm/employees?add=1" className="min-h-11 inline-flex items-center px-5 rounded-[10px] border-[1.5px] border-blue-600 text-blue-800 bg-white font-bold text-[15px] hover:bg-blue-50">Add employee</Link>
          <Link to="/crm/approvals" className="min-h-11 inline-flex items-center px-5 rounded-[10px] bg-blue-600 text-white font-bold text-[15px] hover:bg-blue-700">Review approvals</Link>
        </>}
      />
      <ErrorNote error={stats.error ?? analytics.error ?? leaves.error} />

      <section className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-5">
        <StatTile label="Headcount" value={stats.data ? stats.data.workforce.toLocaleString() : '—'} hint={`${analytics.data?.totalPeople ?? '—'} active accounts`} />
        <StatTile label="Present today" value={rate ? rate.present.toLocaleString() : '—'} hint={rate ? `${rate.rate}% of active workforce` : undefined} />
        <StatTile label="On leave today" value={leaves.data ? String(onLeaveToday) : '—'} hint="Approved leave covering today" />
        <StatTile
          label="Pending approvals"
          value={leaves.data ? String(pendingTotal) : '—'}
          hint={`${pendingLeaves.length} leave · ${pendingCorrections.length} regularization · ${pendingExpenses} expense`}
        />
      </section>

      <section className="flex flex-wrap gap-5 items-start">
        <div className="flex-[3] basis-96 min-w-0 bg-white p-6 rounded-2xl border border-slate-200 flex flex-col gap-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-extrabold text-slate-900">Headcount by department</h2>
            <span className="text-[13px] text-slate-500">{total} people</span>
          </div>
          {headcount.length === 0 ? <Empty>No employees yet.</Empty> : headcount.map((d) => {
            const pct = total ? Math.round((d.count / total) * 100) : 0;
            return (
              <div key={d.department} className="flex flex-col gap-2">
                <div className="flex justify-between text-[15px]">
                  <span className="font-bold text-slate-900">{d.department}</span>
                  <span className="font-semibold text-slate-600">{d.count} · {pct}%</span>
                </div>
                <div className="h-2.5 rounded-full bg-slate-100" role="img" aria-label={`${d.department}: ${d.count} of ${total} people`}>
                  <div className="h-2.5 rounded-full bg-blue-600" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex-[2] basis-72 min-w-0 bg-white p-6 rounded-2xl border border-slate-200 flex flex-col gap-3.5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-extrabold text-slate-900">Waiting for you</h2>
            <Link to="/crm/approvals" className="text-sm font-bold text-blue-800 hover:underline">See all</Link>
          </div>
          {waiting.length === 0 ? <p className="text-sm text-slate-500">Nothing is waiting for approval.</p> : waiting.slice(0, 5).map((w) => (
            <div key={w.key} className="flex items-center gap-3 pb-3.5 border-b border-slate-100 last:border-0">
              <PersonChip person={{ id: w.userId, name: w.name }} />
              <div className="flex flex-col min-w-0 flex-1">
                <span className="font-bold text-sm text-slate-900 truncate">{w.name}</span>
                <span className="text-[13px] text-slate-500">{w.what} · {w.when}</span>
              </div>
              <Badge tone="amber">Pending</Badge>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default Overview;
