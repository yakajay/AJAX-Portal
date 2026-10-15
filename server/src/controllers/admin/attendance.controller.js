import { attendanceModel } from '../../models/attendance.model.js';
import { userModel } from '../../models/user.model.js';
import { summarizeAttendance } from '../../utils/attendanceReport.js';
import { reviewRegularization, loadPendingRegularization } from '../../services/attendance.service.js';
import { safeTimeZone, dayKey } from '../../utils/time.js';
import { isValidMonth } from '../../utils/dates.js';
import { sendCsv } from '../../utils/csv.js';
import { shiftModel } from '../../models/shift.model.js';
import { shiftThresholds } from '../../utils/shifts.js';
import { notify } from '../../utils/notify.js';
import { audit } from '../../utils/audit.js';

// Month report for everyone: JSON, or CSV with ?format=csv
export const report = async (req, res) => {
  const timeZone = safeTimeZone(req.query.tz);
  const month = req.query.month || dayKey(new Date(), timeZone).slice(0, 7);
  if (!isValidMonth(month)) return res.status(400).json({ message: 'month must look like 2026-10.' });

  const [y, m] = month.split('-').map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1) - 86400000);
  const to = new Date(Date.UTC(y, m, 1) + 86400000);

  const users = await userModel.findAll();
  const entries = await attendanceModel.findInRange(users.map((u) => u.id), from, to);
  const byUser = new Map();
  for (const e of entries) {
    const key = String(e.userId);
    if (!byUser.has(key)) byUser.set(key, []);
    byUser.get(key).push(e);
  }

  const shifts = new Map((await shiftModel.findAll()).map((s) => [s.id, s]));
  const rows = users.map((u) => {
    const shift = u.shiftId ? shifts.get(String(u.shiftId)) : undefined;
    const { days, ...totals } = summarizeAttendance(byUser.get(u.id) || [], { timeZone, month, ...shiftThresholds(shift) });
    return { userId: u.id, name: u.name, department: u.department, shiftId: shift?.id ?? null, shift: shift?.name ?? null, ...totals };
  });

  if (req.query.format === 'csv') {
    return sendCsv(res, `attendance-report-${month}.csv`, rows, [
      { header: 'Employee', value: (r) => r.name },
      { header: 'Department', value: (r) => r.department },
      { header: 'Shift', value: (r) => r.shift || '' },
      { header: 'Days present', value: (r) => r.daysPresent },
      { header: 'Total hours', value: (r) => r.totalHours },
      { header: 'Average hours/day', value: (r) => r.avgHours },
      { header: 'Late days', value: (r) => r.lateDays },
      { header: 'Early-out days', value: (r) => r.earlyOutDays }
    ]);
  }
  res.json({ month, rows });
};

export const listRegularizations = async (req, res) => {
  const allowed = ['Regularization Pending', 'Present', 'Rejected'];
  const status = allowed.includes(req.query.status) ? req.query.status : 'Regularization Pending';
  res.json(await attendanceModel.findByStatus(status));
};

export const reviewRequest = async (req, res) => {
  const { status, note } = req.body;
  if (!['Approved', 'Rejected'].includes(status)) {
    return res.status(400).json({ message: 'Status must be Approved or Rejected.' });
  }
  const entry = await loadPendingRegularization(req.params.id);
  if (!entry) return res.status(404).json({ message: 'Pending request not found.' });
  if (String(entry.userId) === req.user.id) {
    return res.status(403).json({ message: 'You cannot review your own attendance correction.' });
  }
  res.json(await reviewRegularization(req, entry, status, note));
};

// --- Direct edits by an admin (no approval step; always reasoned, audited and visible to the employee) ---
const MAX_SPAN_MS = 24 * 60 * 60 * 1000;
const EDITABLE_STATUSES = ['Present', 'Rejected'];
const cleanReason = (v) => String(v || '').trim().slice(0, 500);

// Another counted entry on the same local day? (`exceptId` skips the entry being edited)
const dayTaken = async (userId, checkInAt, timeZone, exceptId = null) => {
  const day = dayKey(checkInAt, timeZone);
  const around = await attendanceModel.findInRange([userId], new Date(checkInAt.getTime() - 48 * 3600 * 1000), new Date(checkInAt.getTime() + 48 * 3600 * 1000));
  return around.some((e) => e.id !== exceptId && e.status !== 'Rejected' && dayKey(e.checkInAt, timeZone) === day);
};

const timesError = (start, end) => {
  if (isNaN(start) || isNaN(end) || end <= start || end - start > MAX_SPAN_MS) return 'A valid login and logout time are required (at most 24 hours apart).';
  if (end > new Date()) return 'Times cannot be in the future.';
  return null;
};

const tellEmployee = (entry, title, reason) =>
  notify(entry.userId, { type: 'attendance', title, body: `${entry.checkInAt.toISOString().slice(0, 10)} - ${reason}`, link: '/attendance' });

// One employee's entries for a month, newest first
export const listRecords = async (req, res) => {
  const { userId } = req.query;
  const employee = await userModel.findById(userId);
  if (!employee) return res.status(404).json({ message: 'Employee not found.' });
  const timeZone = safeTimeZone(req.query.tz);
  const month = req.query.month || dayKey(new Date(), timeZone).slice(0, 7);
  if (!isValidMonth(month)) return res.status(400).json({ message: 'month must look like 2026-10.' });
  const [y, m] = month.split('-').map(Number);
  const entries = await attendanceModel.findInRange([employee.id], new Date(Date.UTC(y, m - 1, 1) - 86400000), new Date(Date.UTC(y, m, 1) + 86400000));
  res.json(entries.filter((e) => dayKey(e.checkInAt, timeZone).startsWith(month)).reverse());
};

export const createRecord = async (req, res) => {
  const { userId, checkInAt, checkOutAt, tz } = req.body;
  const reason = cleanReason(req.body.reason);
  const employee = await userModel.findById(userId);
  if (!employee) return res.status(404).json({ message: 'Employee not found.' });
  if (employee.id === req.user.id) return res.status(403).json({ message: 'You cannot edit your own attendance.' });
  if (!reason) return res.status(400).json({ message: 'A reason is required.' });
  const start = new Date(checkInAt);
  const end = new Date(checkOutAt);
  const bad = timesError(start, end);
  if (bad) return res.status(400).json({ message: bad });
  if (await dayTaken(employee.id, start, safeTimeZone(tz))) {
    return res.status(409).json({ message: 'That day already has an attendance entry. Edit it instead.' });
  }
  const entry = await attendanceModel.create({
    userId: employee.id, checkInAt: start, checkOutAt: end, status: 'Present', source: 'admin',
    reason, ip: req.ip, editedById: req.user.id, editedAt: new Date()
  });
  await tellEmployee(entry, 'An admin added an attendance entry for you', reason);
  await audit(req, {
    action: 'attendance.admin_create', entity: 'attendance', entityId: entry.id,
    summary: `Added attendance for ${employee.name}`, meta: { reason, checkInAt: start, checkOutAt: end }
  });
  res.status(201).json(entry);
};

export const updateRecord = async (req, res) => {
  const entry = await attendanceModel.findById(req.params.id);
  if (!entry) return res.status(404).json({ message: 'Attendance entry not found.' });
  if (String(entry.userId) === req.user.id) return res.status(403).json({ message: 'You cannot edit your own attendance.' });
  const reason = cleanReason(req.body.reason);
  if (!reason) return res.status(400).json({ message: 'A reason is required.' });

  const start = req.body.checkInAt !== undefined ? new Date(req.body.checkInAt) : entry.checkInAt;
  const end = req.body.checkOutAt !== undefined ? new Date(req.body.checkOutAt) : entry.checkOutAt;
  if (!end) return res.status(400).json({ message: 'Clock the employee out before editing this entry.' });
  const bad = timesError(start, end);
  if (bad) return res.status(400).json({ message: bad });
  if (req.body.status !== undefined && !EDITABLE_STATUSES.includes(req.body.status)) {
    return res.status(400).json({ message: `Status must be one of: ${EDITABLE_STATUSES.join(', ')}.` });
  }
  const status = req.body.status ?? (entry.status === 'Regularization Pending' ? 'Present' : entry.status);
  if (status !== 'Rejected' && (await dayTaken(entry.userId, start, safeTimeZone(req.body.tz), entry.id))) {
    return res.status(409).json({ message: 'That day already has another attendance entry.' });
  }

  const before = { checkInAt: entry.checkInAt, checkOutAt: entry.checkOutAt, status: entry.status };
  Object.assign(entry, { checkInAt: start, checkOutAt: end, status, source: 'admin', reviewNote: reason, editedById: req.user.id, editedAt: new Date() });
  await entry.save();
  await tellEmployee(entry, 'An admin corrected your attendance', reason);
  await audit(req, {
    action: 'attendance.admin_update', entity: 'attendance', entityId: entry.id,
    summary: `Edited attendance for user ${entry.userId}`, meta: { reason, before, after: { checkInAt: start, checkOutAt: end, status } }
  });
  res.json(entry);
};

export const deleteRecord = async (req, res) => {
  const entry = await attendanceModel.findById(req.params.id);
  if (!entry) return res.status(404).json({ message: 'Attendance entry not found.' });
  if (String(entry.userId) === req.user.id) return res.status(403).json({ message: 'You cannot edit your own attendance.' });
  const reason = cleanReason(req.body?.reason);
  if (!reason) return res.status(400).json({ message: 'A reason is required.' });
  await attendanceModel.remove(entry.id);
  await tellEmployee(entry, 'An admin removed an attendance entry', reason);
  await audit(req, {
    action: 'attendance.admin_delete', entity: 'attendance', entityId: entry.id,
    summary: `Removed attendance for user ${entry.userId}`, meta: { reason, checkInAt: entry.checkInAt, checkOutAt: entry.checkOutAt }
  });
  res.json({ message: 'Attendance entry removed.' });
};
