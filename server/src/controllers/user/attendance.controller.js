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
