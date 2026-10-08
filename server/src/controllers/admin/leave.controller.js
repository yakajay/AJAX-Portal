import { leaveModel } from '../../models/leave.model.js';

export const listAll = async (req, res) => {
  res.json(await leaveModel.findAll());
};

export const setStatus = async (req, res) => {
  const { status } = req.body;
  if (!['Pending', 'Approved', 'Rejected'].includes(status)) {
    return res.status(400).json({ message: 'Status must be Pending, Approved or Rejected.' });
  }
  const target = await leaveModel.findById(req.params.id);
  if (!target) return res.status(404).json({ message: 'Leave request not found.' });
  if (String(target.userId) === req.user.id) {
    return res.status(403).json({ message: 'You cannot review your own leave request.' });
  }
  res.json(await leaveModel.setStatus(target.id, status));
};
