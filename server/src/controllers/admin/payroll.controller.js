import { transactionModel, Transaction } from '../../models/transaction.model.js';
import { SalaryStructure, Payslip } from '../../models/salary.model.js';
import { userModel } from '../../models/user.model.js';
import { leaveModel } from '../../models/leave.model.js';
import { todayLabel } from '../../utils/format.js';
import { currentMonth, isValidMonth, monthBounds, workingDays, monthLabel } from '../../utils/dates.js';
import { computePayslip, formatMoney, buildPayslipPdf } from '../../utils/payroll.js';
import { holidaySet } from '../../services/leave.service.js';
import { notify } from '../../utils/notify.js';
import { audit } from '../../utils/audit.js';

export const listTransactions = async (req, res) => {
  res.json(await transactionModel.findAll());
};

export const run = async (req, res) => {
  const { company, amount, method } = req.body;
  const parsed = parseFloat(amount);
  if (!company || !(parsed > 0)) {
    return res.status(400).json({ message: 'Company and a positive amount are required.' });
  }
  const transaction = await transactionModel.create({
    recipient: company,
    date: todayLabel(),
    amount: `$${parsed.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
    status: 'Success',
    method: method || 'Bank Transfer'
  });
  await audit(req, { action: 'payroll.payment', entity: 'transaction', entityId: transaction.id, summary: `Paid ${transaction.amount} to ${company}` });
  res.status(201).json(transaction);
};

// --- Salary structures ---
export const listStructures = async (req, res) => {
  const [users, structures] = await Promise.all([userModel.findAll(), SalaryStructure.find()]);
  const byUser = new Map(structures.map((s) => [String(s.userId), s]));
  res.json(
    users.map((u) => ({
      user: { id: u.id, name: u.name, email: u.email, department: u.department, designation: u.designation },
      structure: byUser.get(u.id) ?? null
    }))
  );
};

const FIELDS = ['basic', 'hra', 'allowances', 'pfPercent', 'taxPercent', 'otherDeductions'];

export const setStructure = async (req, res) => {
  const user = await userModel.findById(req.params.userId);
  if (!user) return res.status(404).json({ message: 'Employee not found.' });

  const data = {};
  for (const field of FIELDS) {
    if (req.body[field] === undefined) continue;
    const value = Number(req.body[field]);
    if (!Number.isFinite(value) || value < 0 || (field.endsWith('Percent') && value > 100)) {
      return res.status(400).json({ message: `${field} must be a non-negative number${field.endsWith('Percent') ? ' up to 100' : ''}.` });
    }
    data[field] = value;
  }
  if (req.body.currency !== undefined) {
    if (!/^[A-Z]{3}$/.test(req.body.currency)) return res.status(400).json({ message: 'Currency must be a 3-letter code.' });
    data.currency = req.body.currency;
  }
  const structure = await SalaryStructure.findOneAndUpdate(
    { userId: user.id }, { $set: data }, { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true }
  );
  await audit(req, { action: 'payroll.structure', entity: 'salary', entityId: user.id, summary: `Updated salary structure for ${user.name}`, meta: data });
  res.json(structure);
};

// --- Monthly payroll run ---
const unpaidDaysIn = (leaves, start, end, holidays) =>
  leaves
    .filter((l) => l.type === 'Unpaid Leave' && l.status === 'Approved' && l.startDate <= end && l.endDate >= start)
    .reduce((sum, l) => {
      const days = workingDays(l.startDate > start ? l.startDate : start, l.endDate < end ? l.endDate : end, holidays);
      return sum + (l.halfDay ? days * 0.5 : days);
    }, 0);

export const runMonthly = async (req, res) => {
  const month = req.body.month || currentMonth();
  if (!isValidMonth(month) || month > currentMonth()) {
    return res.status(400).json({ message: 'month must be a past or current month like 2026-10.' });
  }
  const { start, end } = monthBounds(month);
  const holidays = await holidaySet();
  const monthWorkingDays = workingDays(start, end, holidays);

  const structures = await SalaryStructure.find();
  const existing = new Set((await Payslip.find({ month }).select('userId')).map((p) => String(p.userId)));
  const users = new Map((await userModel.findAll()).map((u) => [u.id, u]));

  let created = 0;
  let totalNet = 0;
  let currency = 'USD';
  const recipients = [];
  for (const structure of structures) {
    const uid = String(structure.userId);
    const user = users.get(uid);
    if (!user || user.locked || existing.has(uid)) continue;
    const leaves = await leaveModel.findByUser(uid);
    const slip = computePayslip(structure, {
      workingDays: monthWorkingDays,
      unpaidLeaveDays: unpaidDaysIn(leaves, start, end, holidays)
    });
    await Payslip.create({ userId: uid, month, currency: structure.currency, generatedById: req.user.id, ...slip });
    created++;
    totalNet += slip.net;
    currency = structure.currency;
    recipients.push(uid);
  }

  if (created > 0) {
    await transactionModel.create({
      recipient: `Payroll ${month}`,
      date: todayLabel(),
      amount: formatMoney(totalNet, currency),
      status: 'Processing',
      method: 'Bank Transfer'
    });
    await notify(recipients, { type: 'payroll', title: `Your ${monthLabel(month)} payslip is ready`, link: '/payslips' });
  }
  await audit(req, { action: 'payroll.run', entity: 'payroll', entityId: month, summary: `Generated ${created} payslip(s) for ${month}`, meta: { created, skipped: existing.size, totalNet } });
  res.status(created ? 201 : 200).json({ month, created, skipped: existing.size, totalNet: Math.round(totalNet * 100) / 100, currency });
};

export const listPayslips = async (req, res) => {
  const month = req.query.month;
  if (month !== undefined && !isValidMonth(month)) return res.status(400).json({ message: 'month must look like 2026-10.' });
  res.json(await Payslip.find(month ? { month } : {}).sort({ month: -1, createdAt: -1 }).populate({ path: 'user', select: 'name email department' }));
};

export const markPaid = async (req, res) => {
  const { month } = req.body;
  if (!isValidMonth(month)) return res.status(400).json({ message: 'month must look like 2026-10.' });
  const result = await Payslip.updateMany({ month, status: 'Generated' }, { status: 'Paid', paidAt: new Date() });
  await Transaction.updateMany({ recipient: `Payroll ${month}`, status: 'Processing' }, { status: 'Success' });
  const paid = await Payslip.find({ month, status: 'Paid' }).select('userId');
  await notify(paid.map((p) => p.userId), { type: 'payroll', title: `${monthLabel(month)} salary has been paid`, link: '/payslips', email: false, dedupeKey: `paid:${month}` });
  await audit(req, { action: 'payroll.paid', entity: 'payroll', entityId: month, summary: `Marked ${result.modifiedCount} payslip(s) paid for ${month}` });
  res.json({ month, paid: result.modifiedCount });
};

export const payslipPdf = async (req, res) => {
  const slip = await Payslip.findById(req.params.id).populate({ path: 'user', select: 'name email department designation' });
  if (!slip) return res.status(404).json({ message: 'Payslip not found.' });
  const pdf = await buildPayslipPdf(slip, slip.user);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="payslip-${slip.month}.pdf"`);
  res.send(pdf);
};
