import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { apiJson, apiSend } from '../../lib/api';
import { timeAgo } from '../../lib/format';
import { useI18n } from '../../lib/i18n';

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string;
  readAt: string | null;
  createdAt: string;
}

interface Inbox { items: AppNotification[]; unread: number }

const POLL_MS = 60_000;

const NotificationBell = () => {
  const [open, setOpen] = useState(false);
  const [inbox, setInbox] = useState<Inbox>({ items: [], unread: 0 });
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { t } = useI18n();

  const load = useCallback(() => {
    apiJson<Inbox>('/user/notifications?limit=8').then(setInbox).catch(() => {
      // a failed poll just keeps the previous list
    });
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    // Refresh when the tab becomes visible again
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const openItem = async (n: AppNotification) => {
    setOpen(false);
    if (!n.readAt) {
      setInbox((cur) => ({ unread: Math.max(cur.unread - 1, 0), items: cur.items.map((i) => (i.id === n.id ? { ...i, readAt: new Date().toISOString() } : i)) }));
      apiSend('PATCH', `/user/notifications/${n.id}/read`).catch(() => undefined);
    }
    if (n.link) navigate(n.link);
  };

  const markAll = async () => {
    await apiSend('PATCH', '/user/notifications/read-all').catch(() => undefined);
    load();
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`${t('header.notifications')}${inbox.unread ? ` (${inbox.unread} unread)` : ''}`}
        aria-haspopup="true"
        aria-expanded={open}
        className="relative flex items-center justify-center w-10 h-10 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <Bell size={18} />
        {inbox.unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center">
            {inbox.unread > 9 ? '9+' : inbox.unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-2xl border border-slate-100 z-[100] overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <span className="text-sm font-black text-slate-900">{t('header.notifications')}</span>
            {inbox.unread > 0 && (
              <button onClick={markAll} className="text-xs font-bold text-blue-600 hover:underline">{t('header.markAllRead')}</button>
            )}
          </div>
          <ul className="max-h-96 overflow-y-auto divide-y divide-slate-100">
            {inbox.items.length === 0 && <li className="p-6 text-center text-sm text-slate-400 font-semibold">{t('header.noNotifications')}</li>}
            {inbox.items.map((n) => (
              <li key={n.id}>
                <button onClick={() => openItem(n)} className={`w-full text-left px-4 py-3 hover:bg-slate-50 flex gap-3 ${n.readAt ? '' : 'bg-blue-50/50'}`}>
                  <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${n.readAt ? 'bg-transparent' : 'bg-blue-600'}`} aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-slate-900">{n.title}</span>
                    {n.body && <span className="block text-xs text-slate-500 truncate">{n.body}</span>}
                    <span className="block text-[11px] text-slate-400 mt-0.5">{timeAgo(n.createdAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <Link to="/notifications" onClick={() => setOpen(false)} className="block text-center py-3 text-xs font-black uppercase tracking-widest text-blue-600 border-t border-slate-100 hover:bg-slate-50">
            {t('header.viewAll')}
          </Link>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
