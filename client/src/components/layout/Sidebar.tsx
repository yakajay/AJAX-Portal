import { Link, useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
import type { User } from '../../types';
import { isActivePath, toolForPath, toolOfGroup, visibleNav, type Tool } from '../../lib/nav';
import { isAdminRole } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import type { MessageKey } from '../../lib/locales';
import { useWorkspace } from '../../lib/workspace';
import { appUrl, crmUrl, isCrmHost } from '../../lib/host';

const GROUP_TITLES: Record<string, string | null> = { workspace: null, people: 'People & company', crm: null, admin: 'More admin tools', platform: 'Client portal' };

const TOOLS: { id: Tool; label: string; sub: string; to: string }[] = [
  { id: 'hrms', label: 'HRMS', sub: 'Portal', to: '/' },
  { id: 'crm', label: 'CRM', sub: 'Admin', to: '/crm' }
];

const Sidebar = ({ isOpen, toggleSidebar, user }: { isOpen: boolean; toggleSidebar: () => void; user: User | null }) => {
  const location = useLocation();
  const { t } = useI18n();
  const { workspace } = useWorkspace();
  // At crm.<domain> only the CRM is shown; HRMS pages like My Profile live on the employee address
  const tool: Tool = isCrmHost() ? 'crm' : toolForPath(location.pathname);
  const platform = user?.role === 'PLATFORM_ADMIN';
  // Admins switch between the employee portal and the CRM; everyone else only has the portal
  const showSwitcher = !platform && isAdminRole(user?.role);
  const items = visibleNav(user, workspace?.modules).filter((i) => platform || toolOfGroup(i.group) === tool);
  const groups = (['workspace', 'people', 'crm', 'admin', 'platform'] as const)
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
          {workspace?.logoUrl ? (
            <img src={workspace.logoUrl} alt={`${workspace.name} logo`} className="h-9 max-w-[10rem] object-contain" />
          ) : (
            <span className="text-lg font-extrabold text-slate-900">Ajax Portal</span>
          )}
          <button onClick={toggleSidebar} aria-label="Close menu" className="w-10 h-10 flex items-center justify-center">
            <X size={24} />
          </button>
        </div>
        <div className="p-5 flex flex-col gap-6">
          {showSwitcher && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Workspace</span>
              <div role="group" aria-label="Switch tool" className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-50 border border-slate-200">
                {TOOLS.map((tl) => {
                  const className = `min-h-11 flex flex-col items-center justify-center rounded-[9px] text-center transition-colors ${
                    tl.id === tool ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-blue-50'
                  }`;
                  const label = (
                    <>
                      <span className="text-sm font-extrabold leading-tight">{tl.label}</span>
                      <span className="text-[11px] font-semibold opacity-85 leading-tight">{tl.sub}</span>
                    </>
                  );
                  // The two tools can live on different addresses (crm.<domain> and the employee portal)
                  const external = tl.id === 'crm' ? crmUrl() && `${crmUrl()}/crm` : tl.id === 'hrms' ? appUrl() : '';
                  return external ? (
                    <a key={tl.id} href={external} aria-current={tl.id === tool ? 'page' : undefined} className={className}>{label}</a>
                  ) : (
                    <Link key={tl.id} to={tl.to} onClick={() => isOpen && toggleSidebar()} aria-current={tl.id === tool ? 'page' : undefined} className={className}>{label}</Link>
                  );
                })}
              </div>
            </div>
          )}
          <nav className="flex flex-col gap-1" aria-label="Main">
            {groups.map(({ group, items: groupItems }) => (
              <div key={group} className="flex flex-col gap-1">
                {GROUP_TITLES[group] && (
                  <p className="px-3.5 pt-4 pb-1 text-xs font-bold uppercase tracking-wider text-slate-500">{GROUP_TITLES[group]}</p>
                )}
                {groupItems.map((item) => {
                  const isActive = isActivePath(location.pathname, item.path);
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => isOpen && toggleSidebar()}
                      aria-current={isActive ? 'page' : undefined}
                      className={`flex items-center min-h-11 px-3.5 py-2.5 text-[15px] rounded-[10px] transition-colors ${
                        isActive ? 'bg-blue-100 text-blue-800 font-bold' : 'text-slate-600 font-semibold hover:bg-blue-50'
                      }`}
                    >
                      {t(item.label as MessageKey)}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
