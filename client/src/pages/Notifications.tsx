import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, Trash2 } from 'lucide-react';
import { apiJson, apiSend } from '../lib/api';
import { timeAgo, errorMessage } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { Button, Card, Empty, ErrorNote, PageHeader, Spinner, Tabs } from '../components/ui';
import type { AppNotification } from '../components/layout/NotificationBell';

interface Inbox { items: AppNotification[]; unread: number }

const Notifications = () => {
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { data, loading, reload } = useAsync(
    () => apiJson<Inbox>(`/user/notifications?limit=100${filter === 'unread' ? '&unread=1' : ''}`), [filter]
  );

  const run = async (action: () => Promise<unknown>) => {
    try {
      setError(null);
      await action();
      await reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const open = (n: AppNotification) => {
    if (!n.readAt) void apiSend('PATCH', `/user/notifications/${n.id}/read`).catch(() => undefined);
    if (n.link) navigate(n.link);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        title="Notifications"
        subtitle="Approvals, replies, payslips and company news."
        actions={<Button variant="secondary" disabled={!data?.unread} onClick={() => run(() => apiSend('PATCH', '/user/notifications/read-all'))}><Check size={14} />Mark all read</Button>}
      />
      <Tabs tabs={[{ id: 'all', label: 'All' }, { id: 'unread', label: 'Unread', badge: data?.unread }]} value={filter} onChange={setFilter} />
      <ErrorNote error={error} />
      <Card flush>
        {loading && !data ? <Spinner /> : !data?.items.length ? (
          <Empty><Bell className="mx-auto mb-2" />Nothing here.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.items.map((n) => (
              <li key={n.id} className={`flex items-start gap-3 px-6 py-4 ${n.readAt ? '' : 'bg-blue-50/50'}`}>
                <span className={`mt-2 w-2 h-2 rounded-full shrink-0 ${n.readAt ? 'bg-transparent' : 'bg-blue-600'}`} aria-hidden="true" />
                <button onClick={() => open(n)} className="flex-1 min-w-0 text-left">
                  <span className="block text-sm font-bold text-slate-900">{n.title}</span>
                  {n.body && <span className="block text-sm text-slate-500">{n.body}</span>}
                  <span className="block text-xs text-slate-400 mt-1">{timeAgo(n.createdAt)}</span>
                </button>
                <button aria-label="Delete notification" onClick={() => run(() => apiSend('DELETE', `/user/notifications/${n.id}`))} className="p-2 text-slate-400 hover:text-rose-600">
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
};

export default Notifications;
