import { userModel, User } from '../../models/user.model.js';
import { leaveModel, LeaveRequest } from '../../models/leave.model.js';
import { contractorModel } from '../../models/contractor.model.js';
import { transactionModel } from '../../models/transaction.model.js';
import { Attendance } from '../../models/attendance.model.js';
import { Expense } from '../../models/expense.model.js';
import { SupportTicket } from '../../models/ticket.model.js';
import { addDays, isoDate } from '../../utils/dates.js';
import { NOT_COUNTED } from '../../utils/attendanceReport.js';
import { env } from '../../config/env.js';

export const stats = async (req, res) => {
  const now = new Date();
  const month = now.toLocaleDateString('en-US', { month: 'short' });
  const year = String(now.getFullYear());
  const today = isoDate(now);

  const [workforce, pendingLeaves, activePartners, transactions, expiringContracts, pendingExpenses, openTickets] = await Promise.all([
    userModel.count(),
    leaveModel.countByStatus('Pending'),
    contractorModel.countActive(),
    transactionModel.findSuccessful(),
    contractorModel.findEndingBy(today, addDays(today, env.jobs.contractAlertDays)),
    Expense.countDocuments({ status: 'Pending' }),
    SupportTicket.countDocuments({ status: { $ne: 'Closed' } })
  ]);
  const monthlySpend = transactions
    .filter(t => t.date.startsWith(month) && t.date.endsWith(year))
    .reduce((sum, t) => sum + (parseFloat(t.amount.replace(/[^0-9.]/g, '')) || 0), 0);

  res.json({ workforce, pendingLeaves, activePartners, monthlySpend, expiringContracts: expiringContracts.length, pendingExpenses, openTickets });
};

// Charts: headcount by department, leave trend (last 6 months), attendance rate (last 7 days)
export const analytics = async (req, res) => {
  const now = new Date();
  const [byDepartment, totalPeople] = await Promise.all([
    User.aggregate([{ $group: { _id: '$department', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    User.countDocuments({ locked: false })
  ]);

  // Leave days per month for the last six months, by the month the leave starts in
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push(isoDate(d).slice(0, 7));
  }
  const leaves = await LeaveRequest.find({ status: 'Approved', startDate: { $gte: `${months[0]}-01` } }).select('startDate days');
  const leaveTrend = months.map((m) => ({
    month: m,
    days: leaves.filter((l) => l.startDate.startsWith(m)).reduce((s, l) => s + l.days, 0),
    requests: leaves.filter((l) => l.startDate.startsWith(m)).length
  }));

  // People who clocked in on each of the last seven days (UTC days; close enough for a trend line)
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 6));
  const entries = await Attendance.find({ checkInAt: { $gte: from }, status: { $nin: NOT_COUNTED } }).select('userId checkInAt');
  const attendanceRate = [];
  for (let i = 6; i >= 0; i--) {
    const day = isoDate(new Date(now.getTime() - i * 86400000));
    const present = new Set(entries.filter((e) => isoDate(e.checkInAt) === day).map((e) => String(e.userId))).size;
    attendanceRate.push({ date: day, present, rate: totalPeople ? Math.round((present / totalPeople) * 100) : 0 });
  }

  res.json({
    headcountByDepartment: byDepartment.map((d) => ({ department: d._id || 'Unassigned', count: d.count })),
    leaveTrend,
    attendanceRate,
    totalPeople
  });
};
