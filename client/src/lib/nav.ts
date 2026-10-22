import {
  LayoutDashboard, Users, UserCheck, CreditCard, Clock, FileText, Calendar, Receipt, Target, ClipboardCheck,
  Megaphone, Bell, Settings, ScrollText, LifeBuoy, SlidersHorizontal, WalletCards, UserPlus, Building2, Trash2, Building, UserMinus, BarChart3, ShieldCheck, Landmark,
  UserCircle, FolderOpen, Palette, ShieldPlus, Globe, Inbox, CalendarDays, CalendarCheck, KeyRound, LayoutGrid, type LucideIcon
} from 'lucide-react';
import type { User } from '../types';
import { isAdminRole, isPlatformRole } from './api';
import { portalCan, type Module } from './permissions';
import type { MessageKey } from './locales';

export interface NavItem {
  path: string;
  label: MessageKey;
  icon: LucideIcon;
  group: 'workspace' | 'people' | 'crm' | 'admin' | 'platform';
  /** Hidden when the company's plan does not include this module */
  module?: Module;
  /** Extra words the command palette matches on */
  keywords?: string;
  visible?: (user: User | null) => boolean;
}

/** The portal has two workspaces: HRMS (everyone) and CRM (admins). Which one an item belongs to follows its group. */
export type Tool = 'hrms' | 'crm';
export const toolOfGroup = (group: NavItem['group']): Tool => (group === 'crm' || group === 'admin' ? 'crm' : 'hrms');

const isAdmin = (u: User | null) => isAdminRole(u?.role);

export const NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'nav.dashboard', icon: LayoutDashboard, group: 'workspace', keywords: 'home overview' },
  { path: '/attendance', label: 'nav.attendance', icon: Clock, group: 'workspace', module: 'attendance', keywords: 'clock in out timesheet hours' },
  { path: '/leave', label: 'nav.leave', icon: Calendar, group: 'workspace', module: 'leave', keywords: 'vacation holiday time off calendar' },
  { path: '/payslips', label: 'nav.payslips', icon: WalletCards, group: 'workspace', module: 'payroll', keywords: 'salary pay slip pdf' },
  { path: '/documents', label: 'nav.documents', icon: FolderOpen, group: 'workspace', module: 'hr', keywords: 'offer letter appointment tax form certificate files' },
  { path: '/expenses', label: 'nav.expenses', icon: Receipt, group: 'workspace', module: 'expenses', keywords: 'reimbursement claim receipt' },
  { path: '/performance', label: 'nav.performance', icon: Target, group: 'workspace', module: 'performance', keywords: 'review goals okr' },
  { path: '/onboarding', label: 'nav.onboarding', icon: ClipboardCheck, group: 'workspace', module: 'onboarding', keywords: 'offboarding checklist' },
  { path: '/offboarding', label: 'nav.offboarding', icon: UserMinus, group: 'workspace', module: 'onboarding', keywords: 'resign resignation exit leaving settlement full final notice' },
  { path: '/directory', label: 'nav.directory', icon: Users, group: 'people', keywords: 'employees org chart departments' },
  { path: '/profile', label: 'nav.profile', icon: UserCircle, group: 'people', keywords: 'account details photo phone address' },
  { path: '/hr-hub', label: 'nav.hrHub', icon: FileText, group: 'people', module: 'hr', keywords: 'documents policies' },
  { path: '/announcements', label: 'nav.announcements', icon: Megaphone, group: 'people', module: 'announcements', keywords: 'news' },
  { path: '/notifications', label: 'nav.notifications', icon: Bell, group: 'people' },
  { path: '/support', label: 'nav.support', icon: LifeBuoy, group: 'people', module: 'support', keywords: 'ticket help' },
  { path: '/preferences', label: 'nav.preferences', icon: SlidersHorizontal, group: 'people', keywords: 'language security 2fa sessions password' },
  { path: '/crm', label: 'nav.crmOverview', icon: LayoutGrid, group: 'crm', keywords: 'admin home headcount present today', visible: isAdmin },
  { path: '/crm/employees', label: 'nav.employees', icon: Users, group: 'crm', module: 'users', keywords: 'people staff add employee suspend details', visible: isAdmin },
  { path: '/crm/approvals', label: 'nav.approvals', icon: Inbox, group: 'crm', module: 'leave', keywords: 'pending leave regularisation expense approve reject requests', visible: isAdmin },
  { path: '/crm/holidays', label: 'nav.holidays', icon: CalendarDays, group: 'crm', module: 'hr', keywords: 'public holiday calendar festival', visible: isAdmin },
  { path: '/crm/leave-balances', label: 'nav.leaveBalances', icon: CalendarCheck, group: 'crm', module: 'leave', keywords: 'entitlement policy accrual days left', visible: isAdmin },
  { path: '/crm/payroll', label: 'nav.payroll', icon: CreditCard, group: 'crm', module: 'payroll', keywords: 'salary run payslips generate month', visible: isAdmin },
  { path: '/crm/address', label: 'nav.signInAddress', icon: Globe, group: 'crm', keywords: 'subdomain domain url link own address shared ticket', visible: isAdmin },
  { path: '/crm/branding', label: 'nav.branding', icon: Palette, group: 'crm', keywords: 'logo company name white label custom brand powered by', visible: (u) => u?.role === 'SUPER_ADMIN' },
  { path: '/crm/roles', label: 'nav.rolesAccess', icon: KeyRound, group: 'crm', keywords: 'permissions admin super admin assign role', visible: (u) => u?.role === 'SUPER_ADMIN' },
  { path: '/payroll', label: 'nav.payrollTools', icon: CreditCard, group: 'admin', module: 'payroll', keywords: 'salary structure bank file accounting journal checks tax', visible: (u) => isAdminRole(u?.role) },
  { path: '/recruitment', label: 'nav.recruitment', icon: UserPlus, group: 'admin', module: 'recruitment', keywords: 'hiring jobs candidates interview applicants openings', visible: (u) => isAdminRole(u?.role) },
  { path: '/reports', label: 'nav.reports', icon: BarChart3, group: 'admin', keywords: 'analytics headcount attrition export csv overtime payroll cost', visible: (u) => isAdminRole(u?.role) },
  { path: '/compliance', label: 'nav.compliance', icon: ShieldCheck, group: 'admin', module: 'hr', keywords: 'rules filings deadlines minimum wage notice period overdue labour law', visible: (u) => isAdminRole(u?.role) },
  { path: '/employers', label: 'nav.employers', icon: Landmark, group: 'admin', module: 'hr', keywords: 'legal entity subsidiary company registration branch employer of record', visible: (u) => isAdminRole(u?.role) },
  { path: '/outsourcing', label: 'nav.outsourcing', icon: UserCheck, group: 'admin', module: 'outsourcing', keywords: 'contractors invoices timesheets', visible: (u) => isAdminRole(u?.role) },
  { path: '/settings', label: 'nav.userManagement', icon: Settings, group: 'admin', module: 'users', keywords: 'accounts roles permissions', visible: (u) => u?.role === 'SUPER_ADMIN' },
  { path: '/company', label: 'nav.companySettings', icon: Building, group: 'admin', keywords: 'company profile domain subdomain sso single sign-on saml oidc support access', visible: (u) => u?.role === 'SUPER_ADMIN' },
  { path: '/delete-requests', label: 'nav.deleteRequests', icon: Trash2, group: 'admin', keywords: 'approval pending approved rejected remove', visible: (u) => isAdminRole(u?.role) },
  { path: '/audit', label: 'nav.auditLog', icon: ScrollText, group: 'admin', keywords: 'history changes security', visible: (u) => u?.role === 'SUPER_ADMIN' },
  // Portal (Ajax platform staff only)
  { path: '/portal', label: 'nav.portalOverview', icon: LayoutGrid, group: 'platform', keywords: 'platform clients home overview', visible: (u) => isPlatformRole(u?.role) },
  { path: '/portal/clients', label: 'nav.clients', icon: Building2, group: 'platform', keywords: 'companies tenants subscription plan suspend manage', visible: (u) => isPlatformRole(u?.role) },
  { path: '/portal/onboard', label: 'nav.onboardClient', icon: UserPlus, group: 'platform', keywords: 'new company tenant create subdomain', visible: (u) => portalCan(u, 'admin') },
  { path: '/portal/plans', label: 'nav.plansBilling', icon: CreditCard, group: 'platform', keywords: 'seats subscription renewal billing invoices', visible: (u) => isPlatformRole(u?.role) },
  { path: '/portal/support', label: 'nav.supportActivity', icon: LifeBuoy, group: 'platform', keywords: 'delete requests approve reject audit history support access', visible: (u) => isPlatformRole(u?.role) },
  { path: '/portal/team', label: 'nav.platformTeam', icon: ShieldPlus, group: 'platform', keywords: 'portal admins staff access requests roles viewer super', visible: (u) => portalCan(u, 'super') }
];

/** The platform account only sees its console; company people see their workspace, minus modules their plan lacks. */
export const visibleNav = (user: User | null, modules?: readonly string[]) =>
  NAV_ITEMS.filter((item) => {
    if (isPlatformRole(user?.role)) return item.group === 'platform' && (!item.visible || item.visible(user));
    if (item.group === 'platform') return false;
    if (item.module && modules && !modules.includes(item.module)) return false;
    return !item.visible || item.visible(user);
  });

/** Active when the page is the item itself, or (for CRM pages) a screen opened from it such as an employee's details. */
export const isActivePath = (pathname: string, path: string) =>
  pathname === path || (path !== '/' && path !== '/crm' && pathname.startsWith(`${path}/`));

/** Which workspace the current page belongs to, so the sidebar shows the right list. */
export const toolForPath = (pathname: string): Tool => {
  const item = NAV_ITEMS.find((i) => isActivePath(pathname, i.path));
  return item ? toolOfGroup(item.group) : 'hrms';
};
