import React, { useState } from 'react';
import Sidebar from '../components/layout/Sidebar';
import Header from '../components/layout/Header';
import type { User } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  user: User | null;
  onLogout: () => void;
}

const Layout = ({ children, user, onLogout }: LayoutProps) => {
  const [isOpen, setIsOpen] = useState(false);

  const toggleSidebar = () => setIsOpen((open) => !open);

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
