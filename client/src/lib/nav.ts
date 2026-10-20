import {
  LayoutDashboard, Users, UserCheck, CreditCard, Clock, FileText, Calendar, Receipt, Target, ClipboardCheck,
  Megaphone, Bell, Settings, ScrollText, LifeBuoy, SlidersHorizontal, WalletCards, UserPlus, Building2, Trash2, Building, UserMinus, BarChart3, type LucideIcon
} from 'lucide-react';
import type { User } from '../types';
import { isAdminRole, isPlatformRole } from './api';
import type { Module } from './permissions';
import type { MessageKey } from './locales';

export interface NavItem {
  path: string;
  label: MessageKey;
  icon: LucideIcon;
  group: 'workspace' | 'people' | 'admin' | 'platform';
  /** Hidden when the company's plan does not include this module */
  module?: Module;
  /** Extra words the command palette matches on */
  keywords?: string;
  visible?: (user: User | null) => boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'nav.dashboard', icon: LayoutDashboard, group: 'workspace', keywords: 'home overview' },
  { path: '/attendance', label: 'nav.attendance', icon: Clock, group: 'workspace', module: 'attendance', keywords: 'clock in out timesheet hours' },
  { path: '/leave', label: 'nav.leave', icon: Calendar, group: 'workspace', module: 'leave', keywords: 'vacation holiday time off calendar' },
  { path: '/payslips', label: 'nav.payslips', icon: WalletCards, group: 'workspace', module: 'payroll', keywords: 'salary pay slip pdf' },
  { path: '/expenses', label: 'nav.expenses', icon: Receipt, group: 'workspace', module: 'expenses', keywords: 'reimbursement claim receipt' },
  { path: '/performance', label: 'nav.performance', icon: Target, group: 'workspace', module: 'performance', keywords: 'review goals okr' },
  { path: '/onboarding', label: 'nav.onboarding', icon: ClipboardCheck, group: 'workspace', module: 'onboarding', keywords: 'offboarding checklist' },
  { path: '/offboarding', label: 'nav.offboarding', icon: UserMinus, group: 'workspace', module: 'onboarding', keywords: 'resign resignation exit leaving settlement full final notice' },
  { path: '/directory', label: 'nav.directory', icon: Users, group: 'people', keywords: 'employees org chart departments' },
  { path: '/hr-hub', label: 'nav.hrHub', icon: FileText, group: 'people', module: 'hr', keywords: 'documents policies' },
  { path: '/announcements', label: 'nav.announcements', icon: Megaphone, group: 'people', module: 'announcements', keywords: 'news' },
  { path: '/notifications', label: 'nav.notifications', icon: Bell, group: 'people' },
  { path: '/support', label: 'nav.support', icon: LifeBuoy, group: 'people', module: 'support', keywords: 'ticket help' },
  { path: '/preferences', label: 'nav.preferences', icon: SlidersHorizontal, group: 'people', keywords: 'language security 2fa sessions password' },
  { path: '/payroll', label: 'nav.payroll', icon: CreditCard, group: 'admin', module: 'payroll', keywords: 'salary run structure', visible: (u) => isAdminRole(u?.role) },
  { path: '/recruitment', label: 'nav.recruitment', icon: UserPlus, group: 'admin', module: 'recruitment', keywords: 'hiring jobs candidates interview applicants openings', visible: (u) => isAdminRole(u?.role) },
  { path: '/reports', label: 'nav.reports', icon: BarChart3, group: 'admin', keywords: 'analytics headcount attrition export csv overtime payroll cost', visible: (u) => isAdminRole(u?.role) },
  { path: '/outsourcing', label: 'nav.outsourcing', icon: UserCheck, group: 'admin', module: 'outsourcing', keywords: 'contractors invoices timesheets', visible: (u) => isAdminRole(u?.role) },
  { path: '/settings', label: 'nav.userManagement', icon: Settings, group: 'admin', module: 'users', keywords: 'accounts roles permissions', visible: (u) => u?.role === 'SUPER_ADMIN' },
  { path: '/company', label: 'nav.companySettings', icon: Building, group: 'admin', keywords: 'company profile domain subdomain sso single sign-on saml oidc support access', visible: (u) => u?.role === 'SUPER_ADMIN' },
  { path: '/delete-requests', label: 'nav.deleteRequests', icon: Trash2, group: 'admin', keywords: 'approval pending approved rejected remove', visible: (u) => isAdminRole(u?.role) },
  { path: '/audit', label: 'nav.auditLog', icon: ScrollText, group: 'admin', keywords: 'history changes security', visible: (u) => u?.role === 'SUPER_ADMIN' },
  // Super Admin console (platform account only)
  { path: '/platform', label: 'nav.companies', icon: Building2, group: 'platform', keywords: 'tenants onboard subscription plan suspend', visible: (u) => isPlatformRole(u?.role) },
  { path: '/platform/requests', label: 'nav.deleteRequests', icon: Trash2, group: 'platform', keywords: 'approve reject deletion', visible: (u) => isPlatformRole(u?.role) },
  { path: '/platform/audit', label: 'nav.platformAudit', icon: ScrollText, group: 'platform', keywords: 'history support access', visible: (u) => isPlatformRole(u?.role) }
];

/** The platform account only sees its console; company people see their workspace, minus modules their plan lacks. */
export const visibleNav = (user: User | null, modules?: readonly string[]) =>
  NAV_ITEMS.filter((item) => {
    if (isPlatformRole(user?.role)) return item.group === 'platform';
    if (item.group === 'platform') return false;
    if (item.module && modules && !modules.includes(item.module)) return false;
    return !item.visible || item.visible(user);
  });
