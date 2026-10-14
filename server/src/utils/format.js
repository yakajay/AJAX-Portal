export const todayLabel = () =>
  new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export const timeLabel = () =>
  new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

// Plain JSON for a user document; the schema transform already strips the password hash
export const sanitizeUser = (user) => (user.toJSON ? user.toJSON() : user);

export const normalizePermissions = (permissions) =>
  Array.isArray(permissions) ? permissions.join(',') : permissions;

export const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN'];
export const ALL_ROLES = ['USER', ...ADMIN_ROLES];

// The platform owner's staff (companyId null) manage companies; they never exist inside a company.
// Inside a company, SUPER_ADMIN is the company admin: it manages the workspace, SSO and support access.
export const PLATFORM_ROLE = 'PLATFORM_ADMIN';
export const ROLES = [...ALL_ROLES, PLATFORM_ROLE];
