import { Link } from 'react-router-dom';
import { Menu, Search } from 'lucide-react';
import UserDropdown from './UserDropdown';
import ThemeToggle from './ThemeToggle';
import NotificationBell from './NotificationBell';
import { useI18n } from '../../lib/i18n';
import { useWorkspace } from '../../lib/workspace';
import type { User } from '../../types';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

const Header = ({ toggleSidebar, user, onLogout, onOpenPalette }: {
  toggleSidebar: () => void; user: User | null; onLogout: () => void; onOpenPalette: () => void;
}) => {
  const { t } = useI18n();
  const { workspace } = useWorkspace();
  const logoUrl = workspace?.logoUrl;
  return (
    <header className="relative z-40 flex items-center justify-between h-[68px] px-4 sm:px-7 bg-white border-b border-slate-200">
      <div className="flex items-center gap-3">
        <button className="text-slate-500 lg:hidden w-10 h-10 flex items-center justify-center" onClick={toggleSidebar} aria-label="Open menu">
          <Menu size={24} />
        </button>
        <Link to="/" className="flex items-center gap-3">
          {logoUrl ? (
            // The company's own logo replaces ours (a feature the platform enables per company)
            <>
              <img src={logoUrl} alt={`${workspace?.name ?? 'Company'} logo`} className="h-10 max-w-[10rem] object-contain" />
              <span className="hidden sm:block text-xs text-slate-500">{t('header.portal')}</span>
            </>
          ) : (
            <>
              <div className="w-10 h-10 rounded-[10px] bg-blue-600 text-white flex items-center justify-center font-extrabold text-xl">A</div>
              <div className="hidden sm:flex flex-col leading-tight">
                <span className="font-extrabold text-lg text-slate-900">Ajax Portal</span>
                <span className="text-xs text-slate-500">{t('header.portal')}</span>
              </div>
            </>
          )}
        </Link>
      </div>

      <button
        type="button"
        onClick={onOpenPalette}
        className="hidden md:flex items-center gap-3 w-72 lg:w-96 px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-400 hover:bg-white transition-colors"
        aria-label={t('header.search')}
      >
        <Search size={16} aria-hidden="true" />
        <span className="flex-1 text-left">{t('header.search')}</span>
        <kbd className="text-[10px] font-bold border border-slate-200 rounded px-1.5 py-0.5">{isMac ? '⌘' : 'Ctrl'} K</kbd>
      </button>

      <div className="flex items-center space-x-3">
        <button type="button" onClick={onOpenPalette} aria-label={t('header.search')} className="md:hidden flex items-center justify-center w-10 h-10 rounded-full border border-slate-200 text-slate-600">
          <Search size={18} />
        </button>
        <NotificationBell />
        <ThemeToggle />
        <UserDropdown user={user} onLogout={onLogout} />
      </div>
    </header>
  );
};

export default Header;
