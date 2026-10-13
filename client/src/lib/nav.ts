import {
  LayoutDashboard, Users, UserCheck, CreditCard, Clock, FileText, Calendar, Receipt, Target, ClipboardCheck,
  Megaphone, Bell, Settings, ScrollText, LifeBuoy, SlidersHorizontal, WalletCards, type LucideIcon
} from 'lucide-react';
import type { User } from '../types';
import { isAdminRole } from './api';
import type { MessageKey } from './locales';

export interface NavItem {
  path: string;
  label: MessageKey;
  icon: LucideIcon;
  group: 'workspace' | 'people' | 'admin';
  /** Extra words the command palette matches on */
  keywords?: string;
  visible?: (user: User | null) => boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'nav.dashboard', icon: LayoutDashboard, group: 'workspace', keywords: 'home overview' },
  { path: '/attendance', label: 'nav.attendance', icon: Clock, group: 'workspace', keywords: 'clock in out timesheet hours' },
  { path: '/leave', label: 'nav.leave', icon: Calendar, group: 'workspace', keywords: 'vacation holiday time off calendar' },
  { path: '/payslips', label: 'nav.payslips', icon: WalletCards, group: 'workspace', keywords: 'salary pay slip pdf' },
  { path: '/expenses', label: 'nav.expenses', icon: Receipt, group: 'workspace', keywords: 'reimbursement claim receipt' },
  { path: '/performance', label: 'nav.performance', icon: Target, group: 'workspace', keywords: 'review goals okr' },
  { path: '/onboarding', label: 'nav.onboarding', icon: ClipboardCheck, group: 'workspace', keywords: 'offboarding checklist' },
  { path: '/directory', label: 'nav.directory', icon: Users, group: 'people', keywords: 'employees org chart departments' },
  { path: '/hr-hub', label: 'nav.hrHub', icon: FileText, group: 'people', keywords: 'documents policies' },
  { path: '/announcements', label: 'nav.announcements', icon: Megaphone, group: 'people', keywords: 'news' },
  { path: '/notifications', label: 'nav.notifications', icon: Bell, group: 'people' },
  { path: '/support', label: 'nav.support', icon: LifeBuoy, group: 'people', keywords: 'ticket help' },
  { path: '/preferences', label: 'nav.preferences', icon: SlidersHorizontal, group: 'people', keywords: 'language security 2fa sessions password' },
  { path: '/payroll', label: 'nav.payroll', icon: CreditCard, group: 'admin', keywords: 'salary run structure', visible: (u) => isAdminRole(u?.role) },
  { path: '/outsourcing', label: 'nav.outsourcing', icon: UserCheck, group: 'admin', keywords: 'contractors invoices timesheets', visible: (u) => isAdminRole(u?.role) },
  { path: '/settings', label: 'nav.userManagement', icon: Settings, group: 'admin', keywords: 'accounts roles permissions', visible: (u) => u?.role === 'SUPER_ADMIN' },
  { path: '/audit', label: 'nav.auditLog', icon: ScrollText, group: 'admin', keywords: 'history changes security', visible: (u) => u?.role === 'SUPER_ADMIN' }
];

export const visibleNav = (user: User | null) => NAV_ITEMS.filter((item) => !item.visible || item.visible(user));
