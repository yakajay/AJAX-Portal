import { attendanceModel } from '../../models/attendance.model.js';

export const listMine = async (req, res) => {
  res.json(await attendanceModel.findByUser(req.user.id));
};

export const checkIn = async (req, res) => {
  if (await attendanceModel.findOpen(req.user.id)) {
    return res.status(409).json({ message: 'Already checked in.' });
  }
  const entry = await attendanceModel.create({
    userId: req.user.id,
    checkInAt: new Date(),
    status: 'Present'
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
// request (stored as pending until HR reviews it). Times arrive as ISO instants.
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
  if (regularize && !String(reason || '').trim()) {
    return res.status(400).json({ message: 'A reason is required to regularize attendance.' });
  }
  const entry = await attendanceModel.create({
    userId: req.user.id,
    checkInAt: start,
    checkOutAt: end,
    status: regularize ? 'Regularization Pending' : 'Present',
    source: regularize ? 'regularization' : 'manual',
    reason: reason ? String(reason).trim() : null
  });
  res.status(201).json(entry);
};
