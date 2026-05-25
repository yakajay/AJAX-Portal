import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  UserCheck,
  CreditCard, 
  Briefcase, 
  Settings,
  Menu,
  X,
  User as UserIcon,
  LogOut,
  HelpCircle,
  ChevronDown,
  Clock,
  FileText,
  Calendar as CalendarIcon,
  Search
} from 'lucide-react';

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  department?: string;
}

interface LayoutProps {
  children: React.ReactNode;
  user: User | null;
  onLogout: () => void;
}

const UserDropdown = ({ user, onLogout }: { user: User | null; onLogout: () => void }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

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
        className="flex items-center space-x-2 p-1.5 rounded-full hover:bg-slate-100 transition-colors focus:outline-none"
      >
        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold shadow-sm">
          {user?.name?.substring(0, 2).toUpperCase() || 'U'}
        </div>
        <ChevronDown size={14} className={`text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-2xl border border-slate-100 py-2 z-[100] animate-in fade-in zoom-in-95 duration-200">
          <div className="px-4 py-3 border-b border-slate-50">
            <p className="text-sm font-bold text-slate-900">{user?.name}</p>
            <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mt-0.5">{user?.role?.replace('_', ' ')}</p>
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

const Sidebar = ({ isOpen, toggleSidebar, user }: { isOpen: boolean; toggleSidebar: () => void; user: User | null }) => {
  const location = useLocation();

  const menuItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Directory', path: '/directory', icon: Users },
    { name: 'Leave', path: '/leave', icon: CalendarIcon },
    { name: 'Outsourcing', path: '/outsourcing', icon: UserCheck },
    { name: 'Payroll', path: '/payroll', icon: CreditCard },
    { name: 'Attendance', path: '/attendance', icon: Clock },
    { name: 'HR Hub', path: '/hr-hub', icon: FileText },
    { name: 'Products', path: '/products', icon: Briefcase },
  ];

  // Restrict Outsourcing and Payroll to Admin/Super Admin
  const filteredMenuItems = menuItems.filter(item => {
    if (item.name === 'Outsourcing' || item.name === 'Payroll') {
      return user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
    }
    return true;
  });

  if (user?.role === 'SUPER_ADMIN') {
    filteredMenuItems.push({ name: 'User Management', path: '/settings', icon: Settings });
  }

  return (
    <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 text-white transform ${isOpen ? 'translate-x-0' : '-translate-x-full'} transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0`}>
      <div className="flex items-center justify-between h-16 px-6 bg-slate-900 border-b border-slate-800">
        <span className="text-xl font-bold tracking-wider text-blue-400">DARWINBOX</span>
        <button className="lg:hidden" onClick={toggleSidebar}>
          <X size={24} />
        </button>
      </div>
      <nav className="mt-6">
        {filteredMenuItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.name}
              to={item.path}
              className={`flex items-center px-6 py-3 mt-2 text-sm transition-colors duration-200 ${
                isActive ? 'bg-slate-800 text-blue-400 border-r-4 border-blue-400' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <item.icon size={20} className="mr-3" />
              {item.name}
            </Link>
          );
        })}
      </nav>
    </div>
  );
};

const Header = ({ toggleSidebar, user, onLogout }: { toggleSidebar: () => void; user: User | null; onLogout: () => void }) => {
  return (
    <header className="flex items-center justify-between h-16 px-6 bg-white border-b border-slate-200">
      <div className="flex items-center">
        <button className="text-slate-500 lg:hidden mr-4" onClick={toggleSidebar}>
          <Menu size={24} />
        </button>
        <div className="hidden md:flex items-center bg-slate-100 rounded-lg px-3 py-1.5 w-64 lg:w-96 transition-all focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:bg-white border border-transparent focus-within:border-slate-200">
          <Search size={18} className="text-slate-400 mr-2" />
          <input 
            type="text" 
            placeholder="Search employees, tasks, or files..." 
            className="bg-transparent border-none focus:outline-none text-sm w-full text-slate-600 placeholder:text-slate-400"
          />
        </div>
      </div>
      
      <div className="flex items-center space-x-4">
        <div className="hidden lg:flex items-center text-xs font-bold text-slate-400 tracking-widest uppercase border-r border-slate-200 pr-4 h-8">
          <span className="text-blue-600 mr-1">YAK SOFTWARE SOLUTIONS</span>
        </div>
        <UserDropdown user={user} onLogout={onLogout} />
      </div>
    </header>
  );
};

const Layout = ({ children, user, onLogout }: LayoutProps) => {
  const [isOpen, setIsOpen] = React.useState(false);

  const toggleSidebar = () => setIsOpen(!isOpen);

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar isOpen={isOpen} toggleSidebar={toggleSidebar} user={user} />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header toggleSidebar={toggleSidebar} user={user} onLogout={onLogout} />
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-slate-50 p-6">
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;
