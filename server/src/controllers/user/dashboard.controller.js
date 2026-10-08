import { leaveModel } from '../../models/leave.model.js';
import { documentModel } from '../../models/document.model.js';
import { attendanceModel } from '../../models/attendance.model.js';

export const stats = async (req, res) => {
  const [pendingLeaves, documents, attendance] = await Promise.all([
    leaveModel.countByStatus('Pending', req.user.id),
    documentModel.countByUser(req.user.id),
    attendanceModel.findByUser(req.user.id)
  ]);
  const month = new Date().toLocaleDateString('en-US', { month: 'short' });
  const year = String(new Date().getFullYear());
  const daysPresent = attendance.filter(a => a.date.startsWith(month) && a.date.endsWith(year)).length;
  res.json({ pendingLeaves, documents, daysPresent });
};
