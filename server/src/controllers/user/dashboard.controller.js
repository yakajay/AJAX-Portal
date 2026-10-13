import { leaveModel } from '../../models/leave.model.js';
import { documentModel } from '../../models/document.model.js';
import { attendanceModel } from '../../models/attendance.model.js';
import { safeTimeZone, dayKey } from '../../utils/time.js';
import { NOT_COUNTED } from '../../utils/attendanceReport.js';

export const stats = async (req, res) => {
  const timeZone = safeTimeZone(req.query.tz);
  const [pendingLeaves, documents, attendance] = await Promise.all([
    leaveModel.countByStatus('Pending', req.user.id),
    documentModel.countByUser(req.user.id),
    attendanceModel.findByUser(req.user.id)
  ]);

  // Distinct days checked in during the current month, as seen in the viewer's timezone
  const month = dayKey(new Date(), timeZone).slice(0, 7);
  const days = new Set(attendance.filter(a => !NOT_COUNTED.includes(a.status)).map(a => dayKey(a.checkInAt, timeZone)).filter(d => d.startsWith(month)));
  res.json({ pendingLeaves, documents, daysPresent: days.size });
};
