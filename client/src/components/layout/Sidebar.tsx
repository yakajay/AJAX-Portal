import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  UserCheck,
  CreditCard,
  Settings,
  X,
  Clock,
  FileText,
  Calendar as CalendarIcon
} from 'lucide-react';
import type { User } from '../../types';

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
        <span className="text-xl font-bold tracking-wider text-blue-400">AJAX HR PORTAL</span>
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

export default Sidebar;
