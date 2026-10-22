import mongoose from 'mongoose';
import { userModel } from '../models/user.model.js';
import { Session } from '../models/session.model.js';
import { verifyToken } from '../utils/token.js';
import { ADMIN_ROLES, PLATFORM_ROLE } from '../utils/format.js';
import { hasPermission } from '../utils/permissions.js';

// Verifies the Bearer JWT, checks its session hasn't been revoked, then reloads the user so role
// changes and locks apply immediately
export const authenticate = async (req, res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }

  const session = mongoose.isValidObjectId(payload.sid) ? await Session.findById(payload.sid) : null;
  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    return res.status(401).json({ message: 'Session ended. Please sign in again.' });
  }

  const user = await userModel.findById(payload.sub);
  if (!user) return res.status(401).json({ message: 'Account no longer exists.' });
  if (user.locked) return res.status(403).json({ message: 'Account is locked. Please contact support.' });

  req.user = user;
  req.session = session;
  next();
};

export const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ message: 'You do not have permission to perform this action.' });
  }
  next();
};

export const requireAdmin = requireRole(...ADMIN_ROLES);
// Inside a company, SUPER_ADMIN is the company admin
export const requireSuperAdmin = requireRole('SUPER_ADMIN');
export const requirePlatformAdmin = requireRole(PLATFORM_ROLE);

// Inside the portal, platform staff have one of three levels: viewer (read only), admin (manage clients, no
// deleting), super (everything, including the platform team). Accounts without a level predate this and are 'super'.
export const platformLevel = (user) => user?.platformRole ?? 'super';
const LEVEL_RANK = { viewer: 0, admin: 1, super: 2 };
export const requirePlatformLevel = (level) => (req, res, next) => {
  if (LEVEL_RANK[platformLevel(req.user)] >= LEVEL_RANK[level]) return next();
  const needs = { admin: 'a Portal Admin', super: 'a Portal Super Admin' }[level];
  res.status(403).json({ message: `Only ${needs} can do this. Ask a Portal Super Admin to change your role.` });
};
// Reads are open to every platform account; any change needs at least Portal Admin
export const platformReadWrite = (req, res, next) =>
  ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? next() : requirePlatformLevel('admin')(req, res, next);

// Fine-grained checks for admins; SUPER_ADMIN always passes. `module` scopes the check
// (e.g. `payroll:write`); global tokens like `write` still apply to every module.
export const requirePermission = (permission, module) => {
  const handler = (req, res, next) => {
    if (module && req.company && !req.company.modules.includes(module)) {
      return res.status(403).json({ code: 'MODULE_DISABLED', message: `The ${module} module is not part of your company's plan.` });
    }
    if (hasPermission(req.user, module, permission)) return next();
    const scope = module ? ` on ${module}` : '';
    res.status(403).json({ message: `Missing "${permission}" permission${scope}.` });
  };
  handler.meta = { permission, module }; // read by the OpenAPI generator
  return handler;
};

// Shorthand used in the admin router: can('payroll').read / .write / .delete
export const can = (module) => ({
  read: requirePermission('read', module),
  write: requirePermission('write', module),
  delete: requirePermission('delete', module)
});
