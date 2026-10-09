import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User as UserIcon, LogOut, HelpCircle, ChevronDown, Pencil } from 'lucide-react';
import type { User } from '../../types';

const UserDropdown = ({ user, onLogout }: { user: User | null; onLogout: () => void }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const initials = user?.name?.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase() || 'U';

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAction = (path: string) => {
    setIsOpen(false);
    navigate(path);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="flex items-center space-x-2 p-1.5 pr-3 rounded-full border border-slate-200 hover:bg-slate-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold shadow-sm">
          {initials}
        </div>
        <div className="hidden sm:flex flex-col items-start leading-tight">
          <span className="text-sm font-bold text-slate-900">{user?.name}</span>
          <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">{user?.role?.replace('_', ' ')}</span>
        </div>
        <ChevronDown size={14} className={`text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div role="menu" className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-2xl border border-slate-100 py-2 z-[100] animate-in fade-in zoom-in-95 duration-200">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3">
            <div className="w-11 h-11 shrink-0 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold">{initials}</div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate">{user?.name}</p>
              <p className="text-xs text-slate-500 truncate">{user?.email}</p>
              <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mt-0.5">
                {user?.role?.replace('_', ' ')}{user?.department ? ` · ${user.department}` : ''}
              </p>
            </div>
          </div>
          
          <div className="py-1">
            <button 
              onClick={() => handleAction('/profile')}
              className="flex items-center w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <UserIcon size={16} className="mr-3 text-slate-400" />
              My Profile
            </button>
            <button 
              onClick={() => handleAction('/profile')}
              className="flex items-center w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Pencil size={16} className="mr-3 text-slate-400" />
              Edit Profile
            </button>
            <button 
              onClick={() => handleAction('/support')}
              className="flex items-center w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <HelpCircle size={16} className="mr-3 text-slate-400" />
              Help & Support
            </button>
          </div>

          <div className="border-t border-slate-50 mt-1 pt-1">
            <button 
              onClick={onLogout}
              className="flex items-center w-full px-4 py-2 text-sm text-rose-600 hover:bg-rose-50 transition-colors font-semibold"
            >
              <LogOut size={16} className="mr-3" />
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserDropdown;
