import { leaveModel } from '../../models/leave.model.js';

const LEAVE_ALLOWANCE = { 'Annual Leave': 15, 'Sick Leave': 10, 'Casual Leave': 7 };

export const listMine = async (req, res) => {
  res.json(await leaveModel.findByUser(req.user.id));
};

export const balance = async (req, res) => {
  const approved = await leaveModel.findApprovedByUser(req.user.id);
  res.json(
    Object.entries(LEAVE_ALLOWANCE).map(([type, total]) => {
      const taken = approved.filter(l => l.type === type).reduce((sum, l) => sum + l.days, 0);
      return { type, total, taken, remaining: Math.max(total - taken, 0) };
    })
  );
};

export const apply = async (req, res) => {
  const { type, startDate, endDate, days, reason } = req.body;
  if (!LEAVE_ALLOWANCE[type] || !startDate || !endDate || !(parseInt(days) > 0)) {
    return res.status(400).json({ message: 'A valid leave type, dates and duration are required.' });
  }
  // userId always comes from the token, never the request body; status always starts as Pending
  const leave = await leaveModel.create({
    userId: req.user.id, type, startDate, endDate, days: parseInt(days), reason
  });
  res.status(201).json(leave);
};
