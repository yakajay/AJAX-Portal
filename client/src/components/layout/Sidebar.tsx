import { Link, useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
import type { User } from '../../types';
import { visibleNav } from '../../lib/nav';
import { useI18n } from '../../lib/i18n';
import type { MessageKey } from '../../lib/locales';

const GROUP_TITLES: Record<string, string | null> = { workspace: null, people: 'People & company', admin: 'Administration' };

const Sidebar = ({ isOpen, toggleSidebar, user }: { isOpen: boolean; toggleSidebar: () => void; user: User | null }) => {
  const location = useLocation();
  const { t } = useI18n();
  const items = visibleNav(user);
  const groups = (['workspace', 'people', 'admin'] as const)
    .map((group) => ({ group, items: items.filter((i) => i.group === group) }))
    .filter((g) => g.items.length > 0);

  return (
    <>
      {isOpen && <div className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden" onClick={toggleSidebar} aria-hidden="true" />}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 transform ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 lg:shrink-0 overflow-y-auto`}
      >
        <div className="flex items-center justify-between h-[68px] px-6 border-b border-slate-200 lg:hidden">
          <span className="text-lg font-extrabold text-slate-900">Ajax Portal</span>
          <button onClick={toggleSidebar} aria-label="Close menu">
            <X size={24} />
          </button>
        </div>
        <nav className="p-5 flex flex-col gap-1" aria-label="Main">
          {groups.map(({ group, items: groupItems }) => (
            <div key={group} className="flex flex-col gap-1">
              {GROUP_TITLES[group] && (
                <p className="px-4 pt-4 pb-1 text-[10px] font-black uppercase tracking-widest text-slate-400">{GROUP_TITLES[group]}</p>
              )}
              {groupItems.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => isOpen && toggleSidebar()}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex items-center px-4 py-2.5 text-[15px] rounded-[10px] transition-colors duration-200 ${
                      isActive ? 'bg-blue-100 text-blue-800 font-bold' : 'text-slate-600 font-semibold hover:bg-blue-50'
                    }`}
                  >
                    <item.icon size={20} className="mr-3 shrink-0" />
                    {t(item.label as MessageKey)}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
};

export default Sidebar;
