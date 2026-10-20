import mongoose from 'mongoose';
import { Exit, EXIT_TYPES } from '../models/exit.model.js';
import { userModel } from '../models/user.model.js';
import { leaveModel } from '../models/leave.model.js';
import { SalaryStructure, Payslip } from '../models/salary.model.js';
import { Expense } from '../models/expense.model.js';
import { transactionModel } from '../models/transaction.model.js';
import { Company } from '../models/company.model.js';
import { isValidIso, isoDate, monthBounds, workingDays } from '../utils/dates.js';
import { todayLabel } from '../utils/format.js';
import { computePayslip, formatMoney } from '../utils/payroll.js';
import { policyFor, leaveBalances } from '../utils/leavePolicy.js';
import { holidaySet } from '../services/leave.service.js';
import { revokeAllSessions } from '../utils/sessions.js';
import { notify, adminIdsFor, reviewersFor } from '../utils/notify.js';
import { audit } from '../utils/audit.js';

const valid = (id) => mongoose.isValidObjectId(id);
const withUser = { path: 'user', select: 'name email department designation employeeId' };
const round2 = (n) => Math.round(n * 100) / 100;
const ANNUAL = 'Annual Leave';

// ---------- Employee ----------
export const listMine = async (req, res) => {
  res.json(await Exit.find({ userId: req.user.id }).sort({ createdAt: -1 }));
};

export const submit = async (req, res) => {
  const reason = String(req.body.reason || '').trim().slice(0, 1000);
  const { requestedLastDay } = req.body;
  if (!reason) return res.status(400).json({ message: 'Please tell us why you are leaving.' });
  if (!isValidIso(requestedLastDay) || requestedLastDay < isoDate(new Date())) {
    return res.status(400).json({ message: 'Your proposed last working day must be today or a later date.' });
  }
  if (await Exit.exists({ userId: req.user.id, status: { $in: ['Pending', 'Approved'] } })) {
    return res.status(409).json({ message: 'You already have an exit request in progress.' });
  }
  const exit = await Exit.create({ userId: req.user.id, type: 'Resignation', reason, requestedLastDay });
  await notify(await reviewersFor(req.user, 'onboarding'), {
    type: 'exit', title: `${req.user.name} submitted their resignation`, body: `Proposed last day ${requestedLastDay}`, link: '/offboarding'
  });
  await audit(req, { action: 'exit.submit', entity: 'exit', entityId: exit.id, summary: `${req.user.name} resigned (proposed last day ${requestedLastDay})` });
  res.status(201).json(exit);
};

export const withdraw = async (req, res) => {
  const exit = valid(req.params.id) ? await Exit.findOne({ _id: req.params.id, userId: req.user.id }) : null;
  if (!exit) return res.status(404).json({ message: 'Exit request not found.' });
  if (exit.type !== 'Resignation' || !['Pending', 'Approved'].includes(exit.status)) {
    return res.status(409).json({ message: 'This request can no longer be withdrawn.' });
  }
  exit.status = 'Withdrawn';
  await exit.save();
  await notify(await adminIdsFor('onboarding'), { type: 'exit', title: `${req.user.name} withdrew their resignation`, link: '/offboarding' });
  await audit(req, { action: 'exit.withdraw', entity: 'exit', entityId: exit.id, summary: `${req.user.name} withdrew their resignation` });
  res.json(exit);
};

// ---------- Admin ----------
export const listAll = async (req, res) => {
  const filter = req.query.status ? { status: req.query.status } : {};
  res.json(await Exit.find(filter).sort({ createdAt: -1 }).populate(withUser));
};

// HR starts an exit for someone (termination, retirement, end of contract), already approved
export const initiate = async (req, res) => {
  const { userId, type, reason, lastWorkingDay } = req.body;
  if (!EXIT_TYPES.includes(type) || type === 'Resignation') {
    return res.status(400).json({ message: `Type must be one of ${EXIT_TYPES.filter((t) => t !== 'Resignation').join(', ')}.` });
  }
  if (!isValidIso(lastWorkingDay)) return res.status(400).json({ message: 'A valid last working day is required.' });
  const employee = valid(userId) ? await userModel.findById(userId) : null;
  if (!employee) return res.status(404).json({ message: 'Employee not found.' });
  if (employee.id === req.user.id) return res.status(403).json({ message: 'You cannot start your own exit.' });
  if (await Exit.exists({ userId: employee.id, status: { $in: ['Pending', 'Approved'] } })) {
    return res.status(409).json({ message: 'This employee already has an exit in progress.' });
  }
  const exit = await Exit.create({
    userId: employee.id, type, reason: String(reason || '').trim().slice(0, 1000), status: 'Approved',
    lastWorkingDay, initiatedById: req.user.id, reviewedById: req.user.id, reviewedAt: new Date()
  });
  await notify(employee.id, { type: 'exit', title: `Your ${type.toLowerCase()} has been recorded`, body: `Last working day ${lastWorkingDay}`, link: '/offboarding' });
  await audit(req, { action: 'exit.initiate', entity: 'exit', entityId: exit.id, summary: `Started ${type.toLowerCase()} for ${employee.name} (last day ${lastWorkingDay})` });
  res.status(201).json(await exit.populate(withUser));
};

export const review = async (req, res) => {
  const { status, note } = req.body;
  if (!['Approved', 'Rejected'].includes(status)) return res.status(400).json({ message: 'Status must be Approved or Rejected.' });
  const exit = valid(req.params.id) ? await Exit.findById(req.params.id) : null;
  if (!exit) return res.status(404).json({ message: 'Exit request not found.' });
  if (String(exit.userId) === req.user.id) return res.status(403).json({ message: 'You cannot review your own exit request.' });
  if (exit.status !== 'Pending') return res.status(409).json({ message: `This request is already ${exit.status.toLowerCase()}.` });
  if (status === 'Approved') {
    const day = req.body.lastWorkingDay || exit.requestedLastDay;
    if (!isValidIso(day)) return res.status(400).json({ message: 'A valid last working day is required.' });
    exit.lastWorkingDay = day;
  }
  exit.status = status;
  exit.reviewedById = req.user.id;
  exit.reviewedAt = new Date();
  exit.reviewNote = String(note || '').trim().slice(0, 500);
  await exit.save();
  await notify(exit.userId, {
    type: 'exit', title: `Your resignation was ${status.toLowerCase()}`,
    body: status === 'Approved' ? `Your last working day is ${exit.lastWorkingDay}` : exit.reviewNote, link: '/offboarding'
  });
  await audit(req, { action: `exit.${status.toLowerCase()}`, entity: 'exit', entityId: exit.id, summary: `${status} exit request` });
  res.json(await exit.populate(withUser));
};

// What the company owes (or is owed) on the way out. Pure read, so the admin can preview before settling.
const computeSettlement = async (req, exit, { leaveEncashmentDays = 0, deductions = 0 }) => {
  const structure = await SalaryStructure.findOne({ userId: exit.userId });
  const currency = structure?.currency || 'INR';
  const lwd = exit.lastWorkingDay;
  const month = lwd.slice(0, 7);
  const { start, end } = monthBounds(month);
  const holidays = await holidaySet();
  const monthDays = workingDays(start, end, holidays);

  // Final month's pay, prorated to the last working day, unless payroll already issued that month's payslip
  let salaryDue = 0;
  if (structure && !(await Payslip.exists({ userId: exit.userId, month }))) {
    const company = await Company.findById(req.company.id);
    const t = company?.settings?.payrollTax;
    const taxPolicy = { slabs: t?.slabs ?? [], standardDeduction: t?.standardDeduction ?? 0, pfReducesTaxable: t?.pfReducesTaxable !== false };
    const worked = workingDays(start, lwd, holidays);
    salaryDue = computePayslip(structure.toJSON(), { workingDays: monthDays, unpaidLeaveDays: monthDays - worked }, taxPolicy).net;
  }

  const leaves = await leaveModel.findByUser(String(exit.userId));
  const user = await userModel.findById(exit.userId);
  const balance = leaveBalances(leaves, lwd, { joinDate: user?.joinDate, policy: policyFor(req.company) }).find((b) => b.type === ANNUAL);
  const available = balance?.remaining ?? 0;
  const gross = structure ? structure.basic + structure.hra + structure.allowances : 0;
  const encashment = monthDays > 0 ? round2((gross / monthDays) * leaveEncashmentDays) : 0;

  const claims = await Expense.find({ userId: exit.userId, status: 'Approved', currency });
  const expensesDue = round2(claims.reduce((sum, c) => sum + c.amount, 0));

  const result = {
    salaryDue: round2(salaryDue), leaveEncashmentDays, leaveEncashment: encashment, expensesDue, deductions: round2(deductions),
    total: round2(salaryDue + encashment + expensesDue - deductions), currency, annualLeaveAvailable: available
  };
  return { result, claims };
};

const readSettlementInput = (body) => {
  const leaveEncashmentDays = body.leaveEncashmentDays === undefined ? 0 : Number(body.leaveEncashmentDays);
  const deductions = body.deductions === undefined ? 0 : Number(body.deductions);
  if (!Number.isFinite(leaveEncashmentDays) || leaveEncashmentDays < 0 || !Number.isFinite(deductions) || deductions < 0) {
    return { error: 'Leave days and deductions must be zero or more.' };
  }
  return { input: { leaveEncashmentDays, deductions } };
};

const loadApproved = async (req, res) => {
  const exit = valid(req.params.id) ? await Exit.findById(req.params.id).populate(withUser) : null;
  if (!exit) { res.status(404).json({ message: 'Exit request not found.' }); return null; }
  if (exit.status !== 'Approved') { res.status(409).json({ message: 'Only approved exits can be settled.' }); return null; }
  return exit;
};

export const previewSettlement = async (req, res) => {
  const exit = await loadApproved(req, res);
  if (!exit) return;
  const { input, error } = readSettlementInput(req.query);
  if (error) return res.status(400).json({ message: error });
  res.json((await computeSettlement(req, exit, input)).result);
};

// Closes the exit: pays out the settlement, marks approved claims reimbursed, locks the account, ends sessions
export const settle = async (req, res) => {
  const exit = await loadApproved(req, res);
  if (!exit) return;
  if (exit.lastWorkingDay > isoDate(new Date())) {
    return res.status(409).json({ message: `The last working day (${exit.lastWorkingDay}) has not arrived yet.` });
  }
  const { input, error } = readSettlementInput(req.body);
  if (error) return res.status(400).json({ message: error });
  const { result, claims } = await computeSettlement(req, exit, input);
  if (input.leaveEncashmentDays > result.annualLeaveAvailable) {
    return res.status(400).json({ message: `Only ${result.annualLeaveAvailable} day(s) of annual leave are available to encash.` });
  }
  const { annualLeaveAvailable, ...figures } = result;

  exit.settlement = { ...figures, note: String(req.body.note || '').trim().slice(0, 500), settledAt: new Date(), settledById: req.user.id };
  exit.status = 'Settled';
  await exit.save();
  for (const claim of claims) { claim.status = 'Reimbursed'; claim.reimbursedAt = new Date(); await claim.save(); }
  if (result.total > 0) {
    await transactionModel.create({
      recipient: exit.user?.name ?? 'Employee', date: todayLabel(), amount: formatMoney(result.total, result.currency), status: 'Processing', method: 'Full & Final Settlement'
    });
  }
  await userModel.update(exit.userId, { locked: true });
  await revokeAllSessions(exit.userId);
  await audit(req, {
    action: 'exit.settle', entity: 'exit', entityId: exit.id,
    summary: `Settled ${exit.user?.name}'s exit: ${formatMoney(result.total, result.currency)}`, meta: figures
  });
  res.json(exit);
};
