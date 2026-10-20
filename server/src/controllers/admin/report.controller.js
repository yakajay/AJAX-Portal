import { User, userModel } from '../../models/user.model.js';
import { Exit } from '../../models/exit.model.js';
import { Payslip } from '../../models/salary.model.js';
import { LeaveRequest } from '../../models/leave.model.js';
import { isValidMonth, isoDate } from '../../utils/dates.js';
import { sendCsv } from '../../utils/csv.js';

const round2 = (n) => Math.round(n * 100) / 100;

// The last `count` months ending at (and including) the current one, oldest first
const lastMonths = (count, now = new Date()) =>
  Array.from({ length: count }, (_, i) => isoDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (count - 1 - i), 1))).slice(0, 7));

const respond = (req, res, name, data, rows, columns) =>
  req.query.format === 'csv' ? sendCsv(res, `${name}.csv`, rows, columns) : res.json(data);

// ---------- Employee list ----------
export const exportEmployees = async (req, res) => {
  const users = await userModel.findAll();
  sendCsv(res, 'employees.csv', users, [
    { header: 'Employee ID', value: (u) => u.employeeId },
    { header: 'Name', value: (u) => u.name },
    { header: 'Email', value: (u) => u.email },
    { header: 'Phone', value: (u) => u.phone },
    { header: 'Department', value: (u) => u.department },
    { header: 'Designation', value: (u) => u.designation },
    { header: 'Role', value: (u) => u.role },
    { header: 'Manager', value: (u) => u.manager?.name },
    { header: 'Join date', value: (u) => u.joinDate },
    { header: 'Date of birth', value: (u) => u.dateOfBirth },
    { header: 'Status', value: (u) => (u.locked ? 'Locked' : 'Active') }
  ]);
};

// ---------- Payslip export (one month, for the bank / accountant) ----------
export const exportPayslips = async (req, res) => {
  const { month } = req.query;
  if (!isValidMonth(month)) return res.status(400).json({ message: 'month must look like 2026-10.' });
  const slips = await Payslip.find({ month }).sort({ createdAt: 1 }).populate({ path: 'user', select: 'name email department employeeId' });
  sendCsv(res, `payslips-${month}.csv`, slips, [
    { header: 'Employee ID', value: (s) => s.user?.employeeId },
    { header: 'Name', value: (s) => s.user?.name },
    { header: 'Department', value: (s) => s.user?.department },
    { header: 'Month', value: (s) => s.month },
    { header: 'Currency', value: (s) => s.currency },
    { header: 'Basic', value: (s) => s.earnings.basic },
    { header: 'HRA', value: (s) => s.earnings.hra },
    { header: 'Allowances', value: (s) => s.earnings.allowances },
    { header: 'Gross', value: (s) => s.gross },
    { header: 'PF', value: (s) => s.deductions.pf },
    { header: 'Tax', value: (s) => s.deductions.tax },
    { header: 'Other deductions', value: (s) => s.deductions.other },
    { header: 'Net pay', value: (s) => s.net },
    { header: 'Paid days', value: (s) => s.paidDays },
    { header: 'Status', value: (s) => s.status }
  ]);
};

// ---------- Workforce: headcount, joiners, leavers, attrition ----------
export const workforce = async (req, res) => {
  const now = new Date();
  const months = lastMonths(12, now);
  const [users, exits] = await Promise.all([User.find().select('department role locked joinDate'), Exit.find({ status: 'Settled' }).select('lastWorkingDay')]);
  const active = users.filter((u) => !u.locked);

  const tally = (list, key) => {
    const map = new Map();
    for (const item of list) map.set(key(item) || 'Unassigned', (map.get(key(item) || 'Unassigned') || 0) + 1);
    return [...map.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  };
  const trend = months.map((month) => ({
    month,
    joiners: users.filter((u) => u.joinDate?.startsWith(month)).length,
    leavers: exits.filter((e) => e.lastWorkingDay?.startsWith(month)).length
  }));
  const leavers = trend.reduce((s, t) => s + t.leavers, 0);
  const today = isoDate(now);
  const tenures = active.filter((u) => u.joinDate && u.joinDate <= today).map((u) => (Date.parse(today) - Date.parse(u.joinDate)) / (365.25 * 86400000));

  const data = {
    headcount: active.length,
    locked: users.length - active.length,
    byDepartment: tally(active, (u) => u.department),
    byRole: tally(active, (u) => u.role),
    trend,
    leaversLast12Months: leavers,
    // Leavers over the average of today's headcount and the headcount a year ago (approximated by adding leavers back)
    attritionPercent: active.length + leavers ? round2((leavers / (active.length + leavers / 2)) * 100) : 0,
    averageTenureYears: tenures.length ? round2(tenures.reduce((s, t) => s + t, 0) / tenures.length) : 0
  };
  respond(req, res, 'workforce-report', data, data.trend, [
    { header: 'Month', value: (r) => r.month },
    { header: 'Joiners', value: (r) => r.joiners },
    { header: 'Leavers', value: (r) => r.leavers }
  ]);
};

// ---------- Payroll cost per month ----------
export const payrollCost = async (req, res) => {
  const to = req.query.to || isoDate(new Date()).slice(0, 7);
  const from = req.query.from || lastMonths(6, new Date(`${to}-01T00:00:00Z`))[0];
  if (!isValidMonth(from) || !isValidMonth(to) || from > to) return res.status(400).json({ message: 'from and to must be months like 2026-10, from first.' });

  const slips = await Payslip.find({ month: { $gte: from, $lte: to } }).populate({ path: 'user', select: 'department' });
  const byMonth = new Map();
  const byDepartment = new Map();
  for (const s of slips) {
    const m = byMonth.get(s.month) || { month: s.month, employees: 0, gross: 0, deductions: 0, net: 0, paid: 0 };
    m.employees++; m.gross += s.gross; m.deductions += s.totalDeductions; m.net += s.net; if (s.status === 'Paid') m.paid++;
    byMonth.set(s.month, m);
    const dept = s.user?.department || 'Unassigned';
    const d = byDepartment.get(dept) || { department: dept, gross: 0, net: 0 };
    d.gross += s.gross; d.net += s.net;
    byDepartment.set(dept, d);
  }
  const fix = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'number' ? round2(v) : v]));
  const months = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)).map(fix);
  const data = { from, to, months, byDepartment: [...byDepartment.values()].map(fix).sort((a, b) => b.gross - a.gross), totalNet: round2(months.reduce((s, m) => s + m.net, 0)) };
  respond(req, res, `payroll-cost-${from}-${to}`, data, months, [
    { header: 'Month', value: (r) => r.month },
    { header: 'Employees', value: (r) => r.employees },
    { header: 'Gross', value: (r) => r.gross },
    { header: 'Deductions', value: (r) => r.deductions },
    { header: 'Net', value: (r) => r.net },
    { header: 'Paid payslips', value: (r) => r.paid }
  ]);
};

// ---------- Leave taken in a year, by type and by department ----------
export const leaveUsage = async (req, res) => {
  const year = req.query.year || String(new Date().getUTCFullYear());
  if (!/^\d{4}$/.test(year)) return res.status(400).json({ message: 'year must look like 2026.' });
  const leaves = await LeaveRequest.find({ status: 'Approved', startDate: { $gte: `${year}-01-01`, $lte: `${year}-12-31` } }).populate({ path: 'user', select: 'department' });
  const sum = (key) => {
    const map = new Map();
    for (const l of leaves) { const k = key(l) || 'Unassigned'; map.set(k, (map.get(k) || 0) + l.days); }
    return [...map.entries()].map(([name, days]) => ({ name, days: round2(days) })).sort((a, b) => b.days - a.days);
  };
  const data = { year, totalDays: round2(leaves.reduce((s, l) => s + l.days, 0)), byType: sum((l) => l.type), byDepartment: sum((l) => l.user?.department) };
  respond(req, res, `leave-usage-${year}`, data, data.byType, [
    { header: 'Leave type', value: (r) => r.name },
    { header: 'Days taken', value: (r) => r.days }
  ]);
};
