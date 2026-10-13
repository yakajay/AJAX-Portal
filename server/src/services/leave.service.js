import { leaveModel } from '../models/leave.model.js';
import { holidayModel } from '../models/holiday.model.js';
import { labelToIso } from '../utils/dates.js';
import { notify } from '../utils/notify.js';
import { audit } from '../utils/audit.js';

// Holiday dates as a Set of ISO strings
export const holidaySet = async () => {
  const holidays = await holidayModel.findAll();
  return new Set(holidays.map((h) => labelToIso(h.date)).filter(Boolean));
};

// Applies an Approved / Rejected decision, notifies the employee and writes the audit trail.
// The caller has already checked the reviewer is allowed to decide this request.
export const decideLeave = async (req, leave, status, note = '') => {
  const updated = await leaveModel.setStatus(leave.id, status, {
    reviewedById: req.user.id,
    reviewedAt: new Date(),
    reviewNote: String(note || '').trim().slice(0, 500)
  });
  const verb = status === 'Approved' ? 'approved' : status === 'Rejected' ? 'rejected' : 'moved back to pending';
  await notify(leave.userId, {
    type: 'leave',
    title: `Your ${leave.type} request was ${verb}`,
    body: `${leave.startDate} to ${leave.endDate} (${leave.days} day${leave.days === 1 ? '' : 's'})${note ? ` - ${note}` : ''}`,
    link: '/leave'
  });
  await audit(req, {
    action: `leave.${status.toLowerCase()}`,
    entity: 'leave',
    entityId: leave.id,
    summary: `${status} ${leave.type} for user ${leave.userId} (${leave.startDate} to ${leave.endDate})`
  });
  return updated;
};
