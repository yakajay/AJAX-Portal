import React, { useCallback, useEffect, useState } from 'react';
import Sidebar from '../components/layout/Sidebar';
import Header from '../components/layout/Header';
import CommandPalette from '../components/layout/CommandPalette';
import type { User } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  user: User | null;
  onLogout: () => void;
}

const Layout = ({ children, user, onLogout }: LayoutProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const toggleSidebar = () => setIsOpen((open) => !open);
  const closePalette = useCallback(() => setPaletteOpen(false), []);

  // Ctrl/Cmd+K opens the command palette from anywhere
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      <Header toggleSidebar={toggleSidebar} user={user} onLogout={onLogout} onOpenPalette={() => setPaletteOpen(true)} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar isOpen={isOpen} toggleSidebar={toggleSidebar} user={user} />
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-slate-50 p-6 lg:p-10">
          {children}
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={closePalette} user={user} onLogout={onLogout} />
    </div>
  );
};

export default Layout;
