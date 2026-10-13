import { Link } from 'react-router-dom';
import { Cake, Megaphone, PartyPopper, Pin, AlertTriangle, Receipt, LifeBuoy } from 'lucide-react';
import { apiJson } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { useI18n } from '../../lib/i18n';
import { BarChart, ChartCard, HBar, LineChart } from '../charts/Charts';

interface Feed {
  announcements: { id: string; title: string; body: string; pinned: boolean; createdAt: string; author?: { name: string } | null }[];
  upcoming: { kind: 'birthday' | 'anniversary'; userId: string; name: string; department?: string; inDays: number; years?: number }[];
}

/** Company announcements plus birthdays and work anniversaries in the next two weeks. */
export const FeedPanels = () => {
  const { t } = useI18n();
  const { data } = useAsync(() => apiJson<Feed>('/user/feed'));
  if (!data) return null;

  const when = (days: number) => (days === 0 ? t('dash.today') : days === 1 ? t('dash.tomorrow') : t('dash.inDays', { n: days }));

  return (
    <div className="flex flex-wrap gap-5">
      <section className="flex-[3] basis-96 min-w-0 bg-white p-6 rounded-2xl border border-slate-200">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2"><Megaphone size={18} className="text-blue-600" aria-hidden="true" />{t('dash.announcements')}</h2>
          <Link to="/announcements" className="text-xs font-black uppercase tracking-widest text-blue-600 hover:underline">{t('header.viewAll')}</Link>
        </div>
        {data.announcements.length === 0 ? <p className="text-sm text-slate-400">{t('dash.noAnnouncements')}</p> : (
          <ul className="space-y-4">
            {data.announcements.slice(0, 3).map((a) => (
              <li key={a.id}>
                <p className="text-sm font-bold text-slate-900 flex items-center gap-2">{a.pinned && <Pin size={13} className="text-blue-600" aria-label="Pinned" />}{a.title}</p>
                <p className="text-sm text-slate-500 line-clamp-2">{a.body}</p>
                <p className="text-xs text-slate-400 mt-0.5">{a.author?.name ?? 'Admin'} · {formatDateTime(a.createdAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex-[2] basis-72 min-w-0 bg-white p-6 rounded-2xl border border-slate-200">
        <h2 className="text-lg font-extrabold text-slate-900 mb-4">{t('dash.celebrations')}</h2>
        {data.upcoming.length === 0 ? <p className="text-sm text-slate-400">{t('dash.nothingSoon')}</p> : (
          <ul className="space-y-3">
            {data.upcoming.slice(0, 6).map((u) => (
              <li key={`${u.kind}-${u.userId}`} className="flex items-center gap-3">
                <span className={`w-9 h-9 rounded-full flex items-center justify-center ${u.kind === 'birthday' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-800'}`} aria-hidden="true">
                  {u.kind === 'birthday' ? <Cake size={17} /> : <PartyPopper size={17} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-slate-900 truncate">{u.name}</span>
                  <span className="block text-xs text-slate-500">{u.kind === 'birthday' ? t('dash.birthday') : t('dash.anniversary', { n: u.years ?? 0 })}</span>
                </span>
                <span className={`text-xs font-black ${u.inDays === 0 ? 'text-blue-600' : 'text-slate-400'}`}>{when(u.inDays)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

interface Analytics {
  headcountByDepartment: { department: string; count: number }[];
  leaveTrend: { month: string; days: number }[];
  attendanceRate: { date: string; present: number; rate: number }[];
  totalPeople: number;
}
interface AdminStats { expiringContracts?: number; pendingExpenses?: number; openTickets?: number }

const shortMonth = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
const shortDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });

/** Admin-only: items needing attention, then headcount / leave / attendance charts. */
export const AdminAnalytics = ({ stats }: { stats: AdminStats | null }) => {
  const { t } = useI18n();
  const { data } = useAsync(() => apiJson<Analytics>('/admin/dashboard/analytics'));

  const attention = [
    { show: (stats?.expiringContracts ?? 0) > 0, to: '/outsourcing', icon: AlertTriangle, text: `${stats?.expiringContracts} contract(s) ending soon` },
    { show: (stats?.pendingExpenses ?? 0) > 0, to: '/expenses', icon: Receipt, text: `${stats?.pendingExpenses} expense claim(s) to review` },
    { show: (stats?.openTickets ?? 0) > 0, to: '/support', icon: LifeBuoy, text: `${stats?.openTickets} open support ticket(s)` }
  ].filter((a) => a.show);

  return (
    <div className="space-y-5">
      {attention.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {attention.map((a) => (
            <Link key={a.to} to={a.to} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-50 text-amber-800 text-sm font-bold border border-amber-200 hover:bg-amber-100">
              <a.icon size={16} aria-hidden="true" />{a.text}
            </Link>
          ))}
        </div>
      )}
      {data && (
        <div className="grid lg:grid-cols-3 gap-5">
          <ChartCard title={t('dash.headcount')}>
            <HBar label={t('dash.headcount')} data={data.headcountByDepartment.map((d) => ({ label: d.department, value: d.count }))} />
          </ChartCard>
          <ChartCard title={t('dash.leaveTrend')}>
            <BarChart label={t('dash.leaveTrend')} unit="d" data={data.leaveTrend.map((m) => ({ label: shortMonth(m.month), value: m.days }))} />
          </ChartCard>
          <ChartCard title={t('dash.attendanceTrend')}>
            <LineChart label={t('dash.attendanceTrend')} unit="%" data={data.attendanceRate.map((d) => ({ label: shortDay(d.date), value: d.rate }))} />
          </ChartCard>
        </div>
      )}
    </div>
  );
};
