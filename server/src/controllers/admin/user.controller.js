import crypto from 'node:crypto';
import { userModel } from '../../models/user.model.js';
import { hashPassword } from '../../utils/password.js';
import { sanitizeUser, normalizePermissions, ALL_ROLES } from '../../utils/format.js';
import { findInvalidPermission } from '../../utils/permissions.js';
import { isValidIso } from '../../utils/dates.js';
import { revokeAllSessions } from '../../utils/sessions.js';
import { audit } from '../../utils/audit.js';
import { assertSeatAvailable } from '../../services/company.service.js';

// SUPER_ADMIN manages everyone; ADMIN manages plain USER accounts (and cannot mint privileged roles)
const canManage = (actor, target) => actor.role === 'SUPER_ADMIN' || target.role === 'USER';
const canAssignRole = (actor, role) => actor.role === 'SUPER_ADMIN' || role === 'USER';
const forbidden = (res, message = 'You do not have permission to manage this account.') =>
  res.status(403).json({ message });

const loadTarget = async (req, res) => {
  const target = await userModel.findById(req.params.id);
  if (!target) res.status(404).json({ message: 'User not found.' });
  return target;
};

// Validates the optional HR fields shared by create and update
const readProfileFields = (body) => {
  const data = {};
  if (body.designation !== undefined) data.designation = String(body.designation).trim();
  for (const key of ['dateOfBirth', 'joinDate']) {
    if (body[key] === undefined) continue;
    if (body[key] && !isValidIso(body[key])) return { error: `${key} must be a valid date (YYYY-MM-DD).` };
    data[key] = body[key] || null;
  }
  return { data };
};

export const list = async (req, res) => {
  const users = await userModel.findAll();
  res.json(users.map(sanitizeUser));
};

export const create = async (req, res) => {
  const { name, email, password, role = 'USER', permissions, department, managerId } = req.body;

  if (!email || !name || !password) {
    return res.status(400).json({ message: 'Name, email, and password are required.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters.' });
  }
  if (!ALL_ROLES.includes(role)) return res.status(400).json({ message: 'Invalid role.' });
  if (!canAssignRole(req.user, role)) return forbidden(res, 'Only a Super Admin can create privileged accounts.');

  const extra = readProfileFields(req.body);
  if (extra.error) return res.status(400).json({ message: extra.error });
  const invalidToken = permissions !== undefined && findInvalidPermission(permissions);
  if (invalidToken) return res.status(400).json({ message: `Unknown permission "${invalidToken}".` });

  await assertSeatAvailable(req.company);
  const user = await userModel.create({
    ...extra.data,
    email: String(email).trim().toLowerCase(),
    name,
    password: hashPassword(password),
    department: department || 'Engineering',
    role,
    permissions: normalizePermissions(permissions) || (role === 'USER' ? 'read' : 'read,write'),
    managerId: managerId || null
  });
  await audit(req, { action: 'user.create', entity: 'user', entityId: user.id, summary: `Created ${role} account for ${user.email}` });
  res.status(201).json(sanitizeUser(user));
};

export const update = async (req, res) => {
  const target = await loadTarget(req, res);
  if (!target) return;
  const isSelf = target.id === req.user.id;
  if (!isSelf && !canManage(req.user, target)) return forbidden(res);

  const { name, email, role, department, managerId, permissions } = req.body;
  const extra = readProfileFields(req.body);
  if (extra.error) return res.status(400).json({ message: extra.error });
  const data = { ...extra.data };
  if (name !== undefined) data.name = name;
  if (email !== undefined) data.email = String(email).trim().toLowerCase();
  if (department !== undefined) data.department = department;
  if (managerId !== undefined) {
    if (managerId && String(managerId) === target.id) return res.status(400).json({ message: 'A person cannot report to themselves.' });
    data.managerId = managerId || null;
  }

  if (role !== undefined && role !== target.role) {
    if (!ALL_ROLES.includes(role)) return res.status(400).json({ message: 'Invalid role.' });
    if (isSelf) return forbidden(res, 'You cannot change your own role.');
    if (!canAssignRole(req.user, role)) return forbidden(res, 'Only a Super Admin can assign privileged roles.');
    data.role = role;
  }
  if (permissions !== undefined) {
    if (isSelf || !canManage(req.user, target)) return forbidden(res, 'You cannot change these permissions.');
    const invalid = findInvalidPermission(permissions);
    if (invalid) return res.status(400).json({ message: `Unknown permission "${invalid}".` });
    data.permissions = normalizePermissions(permissions);
  }

  const updated = await userModel.update(target.id, data);
  if (data.role && data.role !== target.role) {
    await audit(req, { action: 'user.role_change', entity: 'user', entityId: target.id, summary: `Changed role of ${target.email} from ${target.role} to ${data.role}` });
  }
  if (data.permissions !== undefined && data.permissions !== target.permissions) {
    await audit(req, { action: 'user.permissions', entity: 'user', entityId: target.id, summary: `Changed permissions of ${target.email} to "${data.permissions}"`, meta: { from: target.permissions, to: data.permissions } });
  }
  await audit(req, { action: 'user.update', entity: 'user', entityId: target.id, summary: `Updated profile of ${target.email}`, meta: Object.keys(data) });
  res.json(sanitizeUser(updated));
};

export const setLock = async (req, res) => {
  const target = await loadTarget(req, res);
  if (!target) return;
  if (target.id === req.user.id) return forbidden(res, 'You cannot lock your own account.');
  if (!canManage(req.user, target)) return forbidden(res);
  const locked = !!req.body.locked;
  const updated = await userModel.update(target.id, { locked });
  // A locked account is signed out everywhere straight away
  if (locked) await revokeAllSessions(target.id);
  await audit(req, { action: locked ? 'user.lock' : 'user.unlock', entity: 'user', entityId: target.id, summary: `${locked ? 'Locked' : 'Unlocked'} ${target.email}` });
  res.json(sanitizeUser(updated));
};

// Issues a temporary password the admin hands to the employee
export const resetPassword = async (req, res) => {
  const target = await loadTarget(req, res);
  if (!target) return;
  if (!canManage(req.user, target)) return forbidden(res);
  const tempPassword = crypto.randomBytes(6).toString('base64url');
  await userModel.update(target.id, { password: hashPassword(tempPassword) });
  await revokeAllSessions(target.id);
  await audit(req, { action: 'user.reset_password', entity: 'user', entityId: target.id, summary: `Reset password for ${target.email}` });
  res.json({ message: `Temporary password for ${target.email}: ${tempPassword}` });
};
