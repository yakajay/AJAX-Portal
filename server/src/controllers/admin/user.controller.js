import crypto from 'node:crypto';
import { userModel } from '../../models/user.model.js';
import { hashPassword, passwordPolicyError } from '../../utils/password.js';
import { sanitizeUser, normalizePermissions, ALL_ROLES } from '../../utils/format.js';
import { findInvalidPermission } from '../../utils/permissions.js';
import { isValidIso } from '../../utils/dates.js';
import { revokeAllSessions } from '../../utils/sessions.js';
import { audit } from '../../utils/audit.js';
import { parseCsv, toCsv } from '../../utils/csv.js';
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

const PHONE_RE = /^\+?[\d\s\-().]{7,20}$/;
export const isValidPhone = (v) => PHONE_RE.test(v) && v.replace(/\D/g, '').length >= 7 && v.replace(/\D/g, '').length <= 15;
export const EMPLOYEE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._\-/]{0,31}$/;

// Validates the optional HR fields shared by create and update
const readProfileFields = (body) => {
  const data = {};
  if (body.designation !== undefined) data.designation = String(body.designation).trim();
  if (body.phone !== undefined) {
    const phone = String(body.phone ?? '').trim();
    if (phone && !isValidPhone(phone)) return { error: 'Phone number must be 7-15 digits (a leading + and spaces, dashes or brackets are fine).' };
    data.phone = phone;
  }
  if (body.employeeId !== undefined) {
    const employeeId = String(body.employeeId ?? '').trim().toUpperCase();
    if (employeeId && !EMPLOYEE_ID_RE.test(employeeId)) return { error: 'Employee ID may use letters, numbers and . _ - / (up to 32 characters).' };
    data.employeeId = employeeId || null;
  }
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
  if (passwordPolicyError(password)) {
    return res.status(400).json({ message: passwordPolicyError(password) });
  }
  if (!ALL_ROLES.includes(role)) return res.status(400).json({ message: 'Invalid role.' });
  if (!canAssignRole(req.user, role)) return forbidden(res, 'Only a Super Admin can create privileged accounts.');

  const extra = readProfileFields(req.body);
  if (extra.error) return res.status(400).json({ message: extra.error });
  const invalidToken = permissions !== undefined && findInvalidPermission(permissions);
  if (invalidToken) return res.status(400).json({ message: `Unknown permission "${invalidToken}".` });

  if (extra.data.employeeId && (await userModel.findByEmployeeId(extra.data.employeeId))) {
    return res.status(409).json({ message: `Employee ID ${extra.data.employeeId} is already in use.` });
  }
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
  if (data.employeeId) {
    const holder = await userModel.findByEmployeeId(data.employeeId);
    if (holder && holder.id !== target.id) return res.status(409).json({ message: `Employee ID ${data.employeeId} is already in use.` });
  }
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

// Lets an admin remove an inappropriate profile photo (people upload their own)
export const removeAvatar = async (req, res) => {
  const target = await loadTarget(req, res);
  if (!target) return;
  if (!canManage(req.user, target)) return forbidden(res);
  const updated = await userModel.update(target.id, { avatarData: null, avatarType: '', avatarUpdatedAt: null });
  await audit(req, { action: 'user.avatar_remove', entity: 'user', entityId: target.id, summary: `Removed the profile photo of ${target.email}` });
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

// --- Bulk import from a CSV upload (raw text/csv body) ---
export const MAX_IMPORT_BYTES = 512 * 1024;
const MAX_IMPORT_ROWS = 500;
const IMPORT_REQUIRED = ['name', 'email', 'phone', 'employee_id'];
const IMPORT_COLUMNS = [...IMPORT_REQUIRED, 'department', 'designation', 'manager_email', 'join_date', 'date_of_birth'];
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const importTemplate = (req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="employee-import-template.csv"');
  res.send(toCsv([{ name: 'Asha Rao', email: 'asha@example.com', phone: '+91 98765 43210', employee_id: 'EMP-001', department: 'Engineering', designation: 'Developer', manager_email: '', join_date: '2026-01-15', date_of_birth: '1994-06-30' }],
    IMPORT_COLUMNS.map((c) => ({ header: c, value: (r) => r[c] }))));
};

// Creates every employee in the file as a plain USER with a temporary password, or none at all:
// any invalid row stops the import and is reported with its line number. `?dryRun=1` only validates.
export const importUsers = async (req, res) => {
  if (typeof req.body !== 'string' || !req.body.trim()) {
    return res.status(400).json({ message: 'Upload a CSV file (Content-Type: text/csv).' });
  }
  const [header, ...lines] = parseCsv(req.body);
  const cols = header.map((h) => h.trim().toLowerCase());
  const missing = IMPORT_REQUIRED.filter((c) => !cols.includes(c));
  if (missing.length) return res.status(400).json({ message: `Missing required column: ${missing.join(', ')}.` });
  const unknown = cols.filter((c) => !IMPORT_COLUMNS.includes(c));
  if (unknown.length) return res.status(400).json({ message: `Unknown column: ${unknown.join(', ')}.` });
  if (!lines.length) return res.status(400).json({ message: 'The file has no employee rows.' });
  if (lines.length > MAX_IMPORT_ROWS) return res.status(400).json({ message: `At most ${MAX_IMPORT_ROWS} employees per import.` });

  const everyone = await userModel.findAll();
  const existing = new Map(everyone.map((u) => [u.email, u.id]));
  const takenIds = new Set(everyone.map((u) => u.employeeId).filter(Boolean));
  const seenIds = new Set();
  const seen = new Set();
  const errors = [];
  const rows = lines.map((cells, i) => {
    const line = i + 2;
    const r = Object.fromEntries(cols.map((c, j) => [c, (cells[j] ?? '').trim()]));
    const fail = (message) => errors.push({ line, message });
    r.email = r.email.toLowerCase();
    r.employee_id = r.employee_id.toUpperCase();
    if (!r.name) fail('Name is required.');
    if (!EMAIL_RE.test(r.email)) fail(`"${r.email}" is not a valid email.`);
    else if (existing.has(r.email)) fail(`${r.email} already has an account.`);
    else if (seen.has(r.email)) fail(`${r.email} appears more than once in the file.`);
    seen.add(r.email);
    if (!r.phone) fail('Phone number is required.');
    else if (!isValidPhone(r.phone)) fail(`"${r.phone}" is not a valid phone number.`);
    const idKey = r.employee_id;
    if (!r.employee_id) fail('Employee ID is required.');
    else if (!EMPLOYEE_ID_RE.test(r.employee_id)) fail(`"${r.employee_id}" is not a valid Employee ID.`);
    else if (takenIds.has(idKey)) fail(`Employee ID ${r.employee_id} is already in use.`);
    else if (seenIds.has(idKey)) fail(`Employee ID ${r.employee_id} appears more than once in the file.`);
    seenIds.add(idKey);
    for (const key of ['join_date', 'date_of_birth']) if (r[key] && !isValidIso(r[key])) fail(`${key} must be YYYY-MM-DD.`);
    return { line, ...r };
  });
  for (const r of rows) {
    const mgr = (r.manager_email || '').toLowerCase();
    if (mgr && mgr === r.email) errors.push({ line: r.line, message: 'A person cannot report to themselves.' });
    else if (mgr && !existing.has(mgr) && !seen.has(mgr)) errors.push({ line: r.line, message: `Manager ${mgr} was not found.` });
  }
  if (errors.length) return res.status(422).json({ message: `${errors.length} problem(s) found. Nothing was imported.`, errors });

  if (req.company) {
    const free = req.company.subscription.seatLimit - existing.size;
    if (rows.length > free) return res.status(402).json({ message: `Your plan has ${Math.max(free, 0)} free seat(s) but the file has ${rows.length} employees.` });
  }
  if (req.query.dryRun === '1') return res.json({ dryRun: true, count: rows.length });

  const created = [];
  const byEmail = new Map(existing);
  for (const r of rows) {
    const tempPassword = crypto.randomBytes(6).toString('base64url');
    const user = await userModel.create({
      email: r.email, name: r.name, password: hashPassword(tempPassword), role: 'USER', permissions: 'read',
      phone: r.phone, employeeId: r.employee_id,
      department: r.department || 'Engineering', designation: r.designation || '',
      joinDate: r.join_date || null, dateOfBirth: r.date_of_birth || null,
      managerId: r.manager_email ? byEmail.get(r.manager_email.toLowerCase()) ?? null : null
    });
    byEmail.set(r.email, user.id);
    created.push({ id: user.id, name: user.name, email: user.email, tempPassword });
  }
  // Managers listed later in the file than their reports
  for (const r of rows) {
    const mgr = r.manager_email && byEmail.get(r.manager_email.toLowerCase());
    const me = created.find((c) => c.email === r.email);
    if (mgr && me) await userModel.update(me.id, { managerId: mgr });
  }
  await audit(req, { action: 'user.import', entity: 'user', summary: `Imported ${created.length} employees from CSV`, meta: { emails: created.map((c) => c.email) } });
  res.status(201).json({ count: created.length, created });
};
