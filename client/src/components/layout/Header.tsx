import { Menu } from 'lucide-react';
import UserDropdown from './UserDropdown';
import type { User } from '../../types';

const Header = ({ toggleSidebar, user, onLogout }: { toggleSidebar: () => void; user: User | null; onLogout: () => void }) => {
  return (
    <header className="flex items-center justify-between h-16 px-6 bg-white border-b border-slate-200">
      <div className="flex items-center">
        <button className="text-slate-500 lg:hidden mr-4" onClick={toggleSidebar}>
          <Menu size={24} />
        </button>
      </div>
      
      <div className="flex items-center space-x-4">
        <UserDropdown user={user} onLogout={onLogout} />
      </div>
    </header>
  );
};

export default Header;
