import { attendanceModel } from '../../models/attendance.model.js';
import { userModel } from '../../models/user.model.js';
import { summarizeAttendance } from '../../utils/attendanceReport.js';
import { reviewRegularization, loadPendingRegularization } from '../../services/attendance.service.js';
import { safeTimeZone, dayKey } from '../../utils/time.js';
import { isValidMonth } from '../../utils/dates.js';
import { sendCsv } from '../../utils/csv.js';

// Month report for everyone: JSON, or CSV with ?format=csv
export const report = async (req, res) => {
  const timeZone = safeTimeZone(req.query.tz);
  const month = req.query.month || dayKey(new Date(), timeZone).slice(0, 7);
  if (!isValidMonth(month)) return res.status(400).json({ message: 'month must look like 2026-10.' });

  const [y, m] = month.split('-').map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1) - 86400000);
  const to = new Date(Date.UTC(y, m, 1) + 86400000);

  const users = await userModel.findAll();
  const entries = await attendanceModel.findInRange(users.map((u) => u.id), from, to);
  const byUser = new Map();
  for (const e of entries) {
    const key = String(e.userId);
    if (!byUser.has(key)) byUser.set(key, []);
    byUser.get(key).push(e);
  }

  const rows = users.map((u) => {
    const { days, ...totals } = summarizeAttendance(byUser.get(u.id) || [], { timeZone, month });
    return { userId: u.id, name: u.name, department: u.department, ...totals };
  });

  if (req.query.format === 'csv') {
    return sendCsv(res, `attendance-report-${month}.csv`, rows, [
      { header: 'Employee', value: (r) => r.name },
      { header: 'Department', value: (r) => r.department },
      { header: 'Days present', value: (r) => r.daysPresent },
      { header: 'Total hours', value: (r) => r.totalHours },
      { header: 'Average hours/day', value: (r) => r.avgHours },
      { header: 'Late days', value: (r) => r.lateDays },
      { header: 'Early-out days', value: (r) => r.earlyOutDays }
    ]);
  }
  res.json({ month, rows });
};

export const listRegularizations = async (req, res) => {
  const allowed = ['Regularization Pending', 'Present', 'Rejected'];
  const status = allowed.includes(req.query.status) ? req.query.status : 'Regularization Pending';
  res.json(await attendanceModel.findByStatus(status));
};

export const reviewRequest = async (req, res) => {
  const { status, note } = req.body;
  if (!['Approved', 'Rejected'].includes(status)) {
    return res.status(400).json({ message: 'Status must be Approved or Rejected.' });
  }
  const entry = await loadPendingRegularization(req.params.id);
  if (!entry) return res.status(404).json({ message: 'Pending request not found.' });
  if (String(entry.userId) === req.user.id) {
    return res.status(403).json({ message: 'You cannot review your own attendance correction.' });
  }
  res.json(await reviewRegularization(req, entry, status, note));
};
