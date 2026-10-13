import type { User } from '../types';

// Mirrors server/src/utils/permissions.js so the UI can hide actions the API would refuse.
export type Module =
  | 'users' | 'leave' | 'attendance' | 'hr' | 'payroll' | 'outsourcing' | 'support'
  | 'org' | 'announcements' | 'performance' | 'expenses' | 'onboarding';
export type Action = 'read' | 'write' | 'delete';

export const MODULES: Module[] = [
  'users', 'leave', 'attendance', 'hr', 'payroll', 'outsourcing', 'support',
  'org', 'announcements', 'performance', 'expenses', 'onboarding'
];

export const parsePermissions = (permissions?: string | string[] | null): string[] =>
  (Array.isArray(permissions) ? permissions : String(permissions ?? '').split(','))
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);

export const can = (user: Pick<User, 'role' | 'permissions'> | null | undefined, module: Module, action: Action): boolean => {
  if (!user) return false;
  if (user.role === 'SUPER_ADMIN') return true;
  if (user.role !== 'ADMIN') return false;
  const tokens = parsePermissions(user.permissions);
  if (tokens.includes('all') || tokens.includes(action) || tokens.includes(`${module}:${action}`) || tokens.includes(`${module}:*`)) {
    return true;
  }
  if (action === 'read') {
    return tokens.some((t) => t === 'read' || t === 'write' || t === 'delete' || t.startsWith(`${module}:`));
  }
  return false;
};
