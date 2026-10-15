// Per-module permissions for admins.
//
// `User.permissions` is a comma separated list. Tokens are either global (`read`, `write`, `delete`,
// `all`) - which apply to every module, as before - or scoped to one module (`payroll:write`,
// `hr:read`, `users:*`). An admin with `read,payroll:write` can read everything but only change payroll.
export const MODULES = [
  'users', 'leave', 'attendance', 'hr', 'payroll', 'outsourcing', 'support',
  'org', 'announcements', 'performance', 'expenses', 'onboarding', 'recruitment'
];
export const ACTIONS = ['read', 'write', 'delete'];

export const parsePermissions = (permissions) =>
  (Array.isArray(permissions) ? permissions : String(permissions || '').split(','))
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);

export const hasPermission = (user, module, action) => {
  if (!user) return false;
  if (user.role === 'SUPER_ADMIN') return true;
  const tokens = parsePermissions(user.permissions);
  if (tokens.includes('all') || tokens.includes(action)) return true;
  if (module && (tokens.includes(`${module}:${action}`) || tokens.includes(`${module}:*`))) return true;
  // Being able to change or delete a module's data implies being able to read it
  if (action === 'read') {
    return tokens.some((t) => ACTIONS.includes(t) || (module && t.startsWith(`${module}:`)));
  }
  return false;
};

// Returns the first invalid token, or null when the list is valid
export const findInvalidPermission = (permissions) => {
  for (const token of parsePermissions(permissions)) {
    if (token === 'all' || ACTIONS.includes(token)) continue;
    const [module, action] = token.split(':');
    if (MODULES.includes(module) && (action === '*' || ACTIONS.includes(action))) continue;
    return token;
  }
  return null;
};
