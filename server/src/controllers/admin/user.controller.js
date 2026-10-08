import crypto from 'node:crypto';
import { userModel } from '../../models/user.model.js';
import { hashPassword } from '../../utils/password.js';
import { sanitizeUser, normalizePermissions, ALL_ROLES } from '../../utils/format.js';

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

  const user = await userModel.create({
    email: String(email).trim().toLowerCase(),
    name,
    password: hashPassword(password),
    department: department || 'Engineering',
    role,
    permissions: normalizePermissions(permissions) || (role === 'USER' ? 'read' : 'read,write'),
    managerId: managerId || null
  });
  res.status(201).json(sanitizeUser(user));
};

export const update = async (req, res) => {
  const target = await loadTarget(req, res);
  if (!target) return;
  const isSelf = target.id === req.user.id;
  if (!isSelf && !canManage(req.user, target)) return forbidden(res);

  const { name, email, role, department, managerId, permissions } = req.body;
  const data = {};
  if (name !== undefined) data.name = name;
  if (email !== undefined) data.email = String(email).trim().toLowerCase();
  if (department !== undefined) data.department = department;
  if (managerId !== undefined) data.managerId = managerId || null;

  if (role !== undefined && role !== target.role) {
    if (!ALL_ROLES.includes(role)) return res.status(400).json({ message: 'Invalid role.' });
    if (isSelf) return forbidden(res, 'You cannot change your own role.');
    if (!canAssignRole(req.user, role)) return forbidden(res, 'Only a Super Admin can assign privileged roles.');
    data.role = role;
  }
  if (permissions !== undefined) {
    if (isSelf || !canManage(req.user, target)) return forbidden(res, 'You cannot change these permissions.');
    data.permissions = normalizePermissions(permissions);
  }

  res.json(sanitizeUser(await userModel.update(target.id, data)));
};

export const setLock = async (req, res) => {
  const target = await loadTarget(req, res);
  if (!target) return;
  if (target.id === req.user.id) return forbidden(res, 'You cannot lock your own account.');
  if (!canManage(req.user, target)) return forbidden(res);
  res.json(sanitizeUser(await userModel.update(target.id, { locked: !!req.body.locked })));
};

export const remove = async (req, res) => {
  const target = await loadTarget(req, res);
  if (!target) return;
  if (target.id === req.user.id) return forbidden(res, 'You cannot delete your own account.');
  if (!canManage(req.user, target)) return forbidden(res);
  res.json(sanitizeUser(await userModel.remove(target.id)));
};

// Issues a temporary password the admin hands to the employee
export const resetPassword = async (req, res) => {
  const target = await loadTarget(req, res);
  if (!target) return;
  if (!canManage(req.user, target)) return forbidden(res);
  const tempPassword = crypto.randomBytes(6).toString('base64url');
  await userModel.update(target.id, { password: hashPassword(tempPassword) });
  res.json({ message: `Temporary password for ${target.email}: ${tempPassword}` });
};
