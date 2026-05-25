import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
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
  Calendar as CalendarIcon
} from 'lucide-react';

const UserDropdown = ({ user, onLogout }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAction = (path) => {
    setIsOpen(false);
    navigate(path);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-3 p-1 rounded-lg hover:bg-slate-100 transition-colors focus:outline-none"
      >
        <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold border-2 border-white shadow-sm">
          {user?.name?.substring(0, 2).toUpperCase() || 'U'}
        </div>
        <div className="hidden md:block text-left mr-1">
          <p className="text-sm font-bold text-slate-900 leading-none">{user?.name || 'User'}</p>
          <p className="text-[10px] text-slate-500 uppercase font-bold mt-1 tracking-wider">{user?.role?.replace('_', ' ')}</p>
        </div>
        <ChevronDown size={16} className={`text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-100 py-2 z-[100] animate-in fade-in slide-in-from-top-2">
          <div className="px-4 py-3 border-b border-slate-50">
            <p className="text-sm font-bold text-slate-900">{user?.name}</p>
            <p className="text-xs text-slate-500 truncate">{user?.email}</p>
          </div>
          
          <div className="py-1">
            <button 
              onClick={() => handleAction('/profile')}
              className="flex items-center w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <UserIcon size={18} className="mr-3 text-slate-400" />
              Update Profile
            </button>
            <button 
              onClick={() => handleAction('/support')}
              className="flex items-center w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <HelpCircle size={18} className="mr-3 text-slate-400" />
              Support Page
            </button>
          </div>

          <div className="border-t border-slate-50 mt-1 pt-1">
            <button 
              onClick={onLogout}
              className="flex items-center w-full px-4 py-2 text-sm text-rose-600 hover:bg-rose-50 transition-colors font-medium"
            >
              <LogOut size={18} className="mr-3" />
              Logout
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const Sidebar = ({ isOpen, toggleSidebar, user }) => {
  const location = useLocation();

  const menuItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Outsourcing', path: '/outsourcing', icon: Users },
    { name: 'Payroll', path: '/payroll', icon: CreditCard },
    { name: 'Attendance', path: '/attendance', icon: Clock },
    { name: 'HR Hub', path: '/hr-hub', icon: FileText },
    { name: 'Products', path: '/products', icon: Briefcase },
  ];

  // Only Super Admin can see Settings/User Management
  if (user?.role === 'SUPER_ADMIN') {
    menuItems.push({ name: 'User Management', path: '/settings', icon: Settings });
  }

  return (
    <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 text-white transform ${isOpen ? 'translate-x-0' : '-translate-x-full'} transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0`}>
      <div className="flex items-center justify-between h-16 px-6 bg-slate-900 border-b border-slate-800">
        <span className="text-xl font-bold tracking-wider text-emerald-400">YAKFLOW</span>
        <button className="lg:hidden" onClick={toggleSidebar}>
          <X size={24} />
        </button>
      </div>
      <nav className="mt-6">
        {menuItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.name}
              to={item.path}
              className={`flex items-center px-6 py-3 mt-2 text-sm transition-colors duration-200 ${
                isActive ? 'bg-slate-800 text-emerald-400 border-r-4 border-emerald-400' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
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

const Header = ({ toggleSidebar, user, onLogout }) => {
  return (
    <header className="flex items-center justify-between h-16 px-6 bg-white border-b border-slate-200">
      <button className="text-slate-500 lg:hidden" onClick={toggleSidebar}>
        <Menu size={24} />
      </button>
      <div className="flex-1 px-4 hidden md:block">
        <div className="text-sm font-medium text-slate-500">
          Yaksofts / <span className="text-slate-900 font-bold">YakFlow Portal</span>
        </div>
      </div>
      <div className="flex items-center">
        <UserDropdown user={user} onLogout={onLogout} />
      </div>
    </header>
  );
};

const Layout = ({ children, user, onLogout }) => {
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
