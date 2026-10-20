import { attendanceModel } from '../../models/attendance.model.js';
import { shiftModel } from '../../models/shift.model.js';
import { shiftThresholds } from '../../utils/shifts.js';
import { userModel } from '../../models/user.model.js';
import { summarizeAttendance, checkClockPolicy, validLocation } from '../../utils/attendanceReport.js';
import { reviewRegularization, loadPendingRegularization } from '../../services/attendance.service.js';
import { safeTimeZone, dayKey } from '../../utils/time.js';
import { isValidMonth } from '../../utils/dates.js';
import { sendCsv } from '../../utils/csv.js';
import { notify, reviewersFor } from '../../utils/notify.js';

// Does the user already have a (non-rejected) entry on today's date in this timezone?
const hasEntryOnDay = async (userId, timeZone) => {
  const today = dayKey(new Date(), timeZone);
  const now = Date.now();
  const nearby = await attendanceModel.findInRange([userId], new Date(now - 48 * 3600 * 1000), new Date(now + 24 * 3600 * 1000));
  return nearby.some((e) => e.status !== 'Rejected' && dayKey(e.checkInAt, timeZone) === today);
};

export const listMine = async (req, res) => {
  res.json(await attendanceModel.findByUser(req.user.id));
};

export const checkIn = async (req, res) => {
  const location = validLocation(req.body?.location) ? req.body.location : null;
  const policy = checkClockPolicy({ ip: req.ip, location });
  if (!policy.ok) return res.status(403).json({ message: policy.message });

  if (await attendanceModel.findOpen(req.user.id)) {
    return res.status(409).json({ message: 'Already checked in.' });
  }
  // One attendance entry per day: after clocking out, that day is done
  if (await hasEntryOnDay(req.user.id, safeTimeZone(req.body?.tz))) {
    return res.status(409).json({ message: "You have already clocked in today. Attendance is one entry per day; use a correction request if a time is wrong." });
  }
  const entry = await attendanceModel.create({
    userId: req.user.id,
    checkInAt: new Date(),
    status: 'Present',
    ip: req.ip,
    location: location ? { lat: location.lat, lng: location.lng, accuracy: Number.isFinite(location.accuracy) ? location.accuracy : null } : undefined
  });
  res.status(201).json(entry);
};

export const checkOut = async (req, res) => {
  const open = await attendanceModel.findOpen(req.user.id);
  if (!open) return res.status(404).json({ message: 'Active session not found' });
  res.json(await attendanceModel.setCheckOut(open.id, new Date()));
};

const MAX_SPAN_MS = 24 * 60 * 60 * 1000;

// Back-filled entries for a past day: either the user's own manual punch, or a regularization
// request (stored as pending until the manager / HR reviews it). Times arrive as ISO instants.
export const addManual = async (req, res) => {
  const { checkInAt, checkOutAt, kind, reason } = req.body;
  const start = new Date(checkInAt);
  const end = new Date(checkOutAt);
  if (isNaN(start) || isNaN(end) || end <= start || end - start > MAX_SPAN_MS) {
    return res.status(400).json({ message: 'A valid login and logout time are required.' });
  }
  if (end > new Date()) {
    return res.status(400).json({ message: 'Times cannot be in the future.' });
  }
  const regularize = kind === 'regularize';
  if (!regularize) {
    const timeZone = safeTimeZone(req.body.tz);
    const day = dayKey(start, timeZone);
    const around = await attendanceModel.findInRange([req.user.id], new Date(start.getTime() - 48 * 3600 * 1000), new Date(start.getTime() + 48 * 3600 * 1000));
    if (around.some((e) => e.status !== 'Rejected' && dayKey(e.checkInAt, timeZone) === day)) {
      return res.status(409).json({ message: 'That day already has an attendance entry. Request a correction instead.' });
    }
  }
  if (regularize && !String(reason || '').trim()) {
    return res.status(400).json({ message: 'A reason is required to regularize attendance.' });
  }
  const entry = await attendanceModel.create({
    userId: req.user.id,
    checkInAt: start,
    checkOutAt: end,
    status: regularize ? 'Regularization Pending' : 'Present',
    source: regularize ? 'regularization' : 'manual',
    reason: reason ? String(reason).trim() : null,
    ip: req.ip
  });

  if (regularize) {
    await notify(await reviewersFor(req.user, 'attendance'), {
      type: 'attendance',
      title: `${req.user.name} requested an attendance correction`,
      body: String(reason).trim().slice(0, 200),
      link: '/attendance'
    });
  }
  res.status(201).json(entry);
};

const monthParams = (req, res) => {
  const timeZone = safeTimeZone(req.query.tz);
  const month = req.query.month || dayKey(new Date(), timeZone).slice(0, 7);
  if (!isValidMonth(month)) {
    res.status(400).json({ message: 'month must look like 2026-10.' });
    return null;
  }
  return { timeZone, month };
};

// The signed-in employee's shift (if any) and the thresholds it implies
const myShift = async (req) => {
  const me = await userModel.findById(req.user.id);
  return me?.shiftId ? shiftModel.findById(me.shiftId) : null;
};

// Entries whose local day might fall in the month (a day either side covers any timezone)
const monthWindow = (month) => {
  const [y, m] = month.split('-').map(Number);
  return { from: new Date(Date.UTC(y, m - 1, 1) - 86400000), to: new Date(Date.UTC(y, m, 1) + 86400000) };
};

export const summary = async (req, res) => {
  const params = monthParams(req, res);
  if (!params) return;
  const { from, to } = monthWindow(params.month);
  const entries = await attendanceModel.findInRange([req.user.id], from, to);
  const shift = await myShift(req);
  res.json({ ...summarizeAttendance(entries, { ...params, ...shiftThresholds(shift) }), shift: shift ? { name: shift.name, startTime: shift.startTime, endTime: shift.endTime } : null });
};

export const exportMine = async (req, res) => {
  const params = monthParams(req, res);
  if (!params) return;
  const { from, to } = monthWindow(params.month);
  const entries = await attendanceModel.findInRange([req.user.id], from, to);
  const { days } = summarizeAttendance(entries, { ...params, ...shiftThresholds(await myShift(req)) });
  const fmt = (d) => (d ? d.toISOString() : '');
  sendCsv(res, `attendance-${params.month}.csv`, days, [
    { header: 'Date', value: (d) => d.date },
    { header: 'First in (UTC)', value: (d) => fmt(d.firstIn) },
    { header: 'Last out (UTC)', value: (d) => fmt(d.lastOut) },
    { header: 'Hours', value: (d) => d.hours },
    { header: 'Overtime hours', value: (d) => d.overtime },
    { header: 'Late', value: (d) => (d.late ? 'Yes' : 'No') },
    { header: 'Early out', value: (d) => (d.earlyOut ? 'Yes' : 'No') }
  ]);
};

// --- Manager view: regularization requests from direct reports ---
export const teamRegularizations = async (req, res) => {
  const pending = await attendanceModel.findByStatus('Regularization Pending');
  res.json(pending.filter((e) => String(e.user?.managerId) === req.user.id));
};

export const teamReview = async (req, res) => {
  const { status, note } = req.body;
  if (!['Approved', 'Rejected'].includes(status)) {
    return res.status(400).json({ message: 'Status must be Approved or Rejected.' });
  }
  const entry = await loadPendingRegularization(req.params.id);
  if (!entry) return res.status(404).json({ message: 'Pending request not found.' });
  await entry.populate({ path: 'user', select: 'managerId' });
  if (String(entry.user?.managerId) !== req.user.id) return res.status(404).json({ message: 'Pending request not found.' });
  res.json(await reviewRegularization(req, entry, status, note));
};
