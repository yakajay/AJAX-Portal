import { userModel } from '../models/user.model.js';
import { verifyToken } from '../utils/token.js';
import { ADMIN_ROLES } from '../utils/format.js';

// Verifies the Bearer JWT, then reloads the user so role changes and locks apply immediately
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

  const user = await userModel.findById(payload.sub);
  if (!user) return res.status(401).json({ message: 'Account no longer exists.' });
  if (user.locked) return res.status(403).json({ message: 'Account is locked. Please contact support.' });

  req.user = user;
  next();
};

export const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ message: 'You do not have permission to perform this action.' });
  }
  next();
};

export const requireAdmin = requireRole(...ADMIN_ROLES);
export const requireSuperAdmin = requireRole('SUPER_ADMIN');

// Fine-grained write/delete checks for admins; SUPER_ADMIN always passes
export const requirePermission = (permission) => (req, res, next) => {
  const granted = (req.user.permissions || '').split(',');
  if (req.user.role === 'SUPER_ADMIN' || granted.includes(permission) || granted.includes('all')) {
    return next();
  }
  res.status(403).json({ message: `Missing "${permission}" permission.` });
};
