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
    <>
      {isOpen && <div className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden" onClick={toggleSidebar} aria-hidden="true" />}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 transform ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 lg:shrink-0 overflow-y-auto`}
      >
        <div className="flex items-center justify-between h-[68px] px-6 border-b border-slate-200 lg:hidden">
          <span className="text-lg font-extrabold text-slate-900">Ajax HRMS</span>
          <button onClick={toggleSidebar} aria-label="Close menu">
            <X size={24} />
          </button>
        </div>
        <nav className="p-5 flex flex-col gap-1">
          {filteredMenuItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.name}
                to={item.path}
                onClick={() => isOpen && toggleSidebar()}
                className={`flex items-center px-4 py-3 text-[15px] rounded-[10px] transition-colors duration-200 ${
                  isActive ? 'bg-blue-100 text-blue-800 font-bold' : 'text-slate-600 font-semibold hover:bg-blue-50'
                }`}
              >
                <item.icon size={20} className="mr-3" />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
};

export default Sidebar;
