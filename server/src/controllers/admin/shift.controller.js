import { Shift, shiftModel } from '../../models/shift.model.js';
import { User, userModel } from '../../models/user.model.js';
import { readShift } from '../../utils/shifts.js';
import { audit } from '../../utils/audit.js';

const duplicate = (err) => err?.code === 11000;

export const list = async (req, res) => {
  const [shifts, counts] = await Promise.all([
    shiftModel.findAll(),
    User.aggregate([{ $match: { shiftId: { $ne: null } } }, { $group: { _id: '$shiftId', count: { $sum: 1 } } }])
  ]);
  const byShift = new Map(counts.map((c) => [String(c._id), c.count]));
  res.json(shifts.map((s) => ({ ...s.toJSON(), memberCount: byShift.get(s.id) || 0 })));
};

export const create = async (req, res) => {
  const { data, error } = readShift(req.body);
  if (error) return res.status(400).json({ message: error });
  try {
    const shift = await shiftModel.create(data);
    await audit(req, { action: 'shift.create', entity: 'shift', entityId: shift.id, summary: `Created shift ${shift.name} (${shift.startTime}-${shift.endTime})` });
    res.status(201).json(shift);
  } catch (err) {
    if (duplicate(err)) return res.status(409).json({ message: `A shift named "${data.name}" already exists.` });
    throw err;
  }
};

export const update = async (req, res) => {
  const shift = await shiftModel.findById(req.params.id);
  if (!shift) return res.status(404).json({ message: 'Shift not found.' });
  const { data, error } = readShift({ ...shift.toJSON(), ...req.body });
  if (error) return res.status(400).json({ message: error });
  try {
    Object.assign(shift, data);
    await shift.save();
  } catch (err) {
    if (duplicate(err)) return res.status(409).json({ message: `A shift named "${data.name}" already exists.` });
    throw err;
  }
  await audit(req, { action: 'shift.update', entity: 'shift', entityId: shift.id, summary: `Updated shift ${shift.name}`, meta: data });
  res.json(shift);
};

// Employees on a deleted shift fall back to the company-wide hours
export const remove = async (req, res) => {
  const shift = await shiftModel.findById(req.params.id);
  if (!shift) return res.status(404).json({ message: 'Shift not found.' });
  const { modifiedCount } = await User.updateMany({ shiftId: shift.id }, { shiftId: null });
  await Shift.deleteOne({ _id: shift.id });
  await audit(req, { action: 'shift.delete', entity: 'shift', entityId: shift.id, summary: `Deleted shift ${shift.name}`, meta: { unassigned: modifiedCount } });
  res.json({ message: 'Shift deleted.', unassigned: modifiedCount });
};

// Puts employees on a shift (or back on the company hours when shiftId is null)
export const assign = async (req, res) => {
  const { shiftId = null, userIds } = req.body;
  if (!Array.isArray(userIds) || !userIds.length || userIds.length > 500) {
    return res.status(400).json({ message: 'Choose between 1 and 500 employees.' });
  }
  let shift = null;
  if (shiftId) {
    shift = await shiftModel.findById(shiftId);
    if (!shift) return res.status(404).json({ message: 'Shift not found.' });
  }
  const ids = [...new Set(userIds.map(String))];
  const found = await userModel.findAll();
  const valid = ids.filter((id) => found.some((u) => u.id === id));
  if (valid.length !== ids.length) return res.status(404).json({ message: 'One or more employees were not found.' });
  await User.updateMany({ _id: { $in: valid } }, { shiftId: shift ? shift.id : null });
  await audit(req, {
    action: 'shift.assign', entity: 'shift', entityId: shift?.id ?? null,
    summary: `${shift ? `Assigned ${valid.length} employee(s) to ${shift.name}` : `Removed ${valid.length} employee(s) from their shift`}`, meta: { userIds: valid }
  });
  res.json({ updated: valid.length });
};
