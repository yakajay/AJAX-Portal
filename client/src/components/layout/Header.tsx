import { Link } from 'react-router-dom';
import { Menu } from 'lucide-react';
import UserDropdown from './UserDropdown';
import ThemeToggle from './ThemeToggle';
import type { User } from '../../types';

const Header = ({ toggleSidebar, user, onLogout }: { toggleSidebar: () => void; user: User | null; onLogout: () => void }) => {
  return (
    <header className="relative z-40 flex items-center justify-between h-[68px] px-4 sm:px-7 bg-white border-b border-slate-200">
      <div className="flex items-center gap-3">
        <button className="text-slate-500 lg:hidden w-10 h-10 flex items-center justify-center" onClick={toggleSidebar} aria-label="Open menu">
          <Menu size={24} />
        </button>
        <Link to="/" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-[10px] bg-blue-600 text-white flex items-center justify-center font-extrabold text-xl">A</div>
          <div className="flex flex-col leading-tight">
            <span className="font-extrabold text-lg text-slate-900">Ajax HRMS</span>
            <span className="text-xs text-slate-500">Employee portal</span>
          </div>
        </Link>
      </div>

      <div className="flex items-center space-x-3">
        <ThemeToggle />
        <UserDropdown user={user} onLogout={onLogout} />
      </div>
    </header>
  );
};

export default Header;
