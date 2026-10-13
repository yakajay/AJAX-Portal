import { notify } from '../utils/notify.js';
import { audit } from '../utils/audit.js';
import { attendanceModel } from '../models/attendance.model.js';

// Approves or rejects a regularization request and tells the employee
export const reviewRegularization = async (req, entry, status, note = '') => {
  entry.status = status === 'Approved' ? 'Present' : 'Rejected';
  entry.reviewedById = req.user.id;
  entry.reviewedAt = new Date();
  entry.reviewNote = String(note || '').trim().slice(0, 500);
  await entry.save();

  await notify(entry.userId, {
    type: 'attendance',
    title: `Your attendance correction was ${status.toLowerCase()}`,
    body: `${entry.checkInAt.toISOString().slice(0, 10)}${entry.reviewNote ? ` - ${entry.reviewNote}` : ''}`,
    link: '/attendance'
  });
  await audit(req, {
    action: `attendance.${status.toLowerCase()}`,
    entity: 'attendance',
    entityId: entry.id,
    summary: `${status} attendance regularization for user ${entry.userId}`
  });
  return entry;
};

export const loadPendingRegularization = async (id) => {
  const entry = await attendanceModel.findById(id);
  if (!entry || entry.status !== 'Regularization Pending') return null;
  return entry;
};
