import mongoose from 'mongoose';
import { Expense, EXPENSE_CATEGORIES } from '../models/expense.model.js';
import { transactionModel } from '../models/transaction.model.js';
import { isValidIso } from '../utils/dates.js';
import { todayLabel } from '../utils/format.js';
import { formatMoney } from '../utils/payroll.js';
import { notify, adminIdsFor } from '../utils/notify.js';
import { audit } from '../utils/audit.js';

const valid = (id) => mongoose.isValidObjectId(id);
const withUser = { path: 'user', select: 'name department' };

// ---------- Employee ----------
export const listMine = async (req, res) => {
  res.json(await Expense.find({ userId: req.user.id }).sort({ createdAt: -1 }));
};

export const submit = async (req, res) => {
  const { title, category, amount, currency, date, description, receiptRef } = req.body;
  const parsed = Number(amount);
  if (!String(title || '').trim() || !(parsed > 0) || !isValidIso(date)) {
    return res.status(400).json({ message: 'A title, a positive amount and the expense date are required.' });
  }
  if (category !== undefined && !EXPENSE_CATEGORIES.includes(category)) {
    return res.status(400).json({ message: `Category must be one of ${EXPENSE_CATEGORIES.join(', ')}.` });
  }
  if (date > new Date().toISOString().slice(0, 10)) return res.status(400).json({ message: 'The expense date cannot be in the future.' });
  if (currency !== undefined && !/^[A-Z]{3}$/.test(currency)) return res.status(400).json({ message: 'Currency must be a 3-letter code.' });

  const expense = await Expense.create({
    userId: req.user.id, title: title.trim(), category: category || 'Other', amount: Math.round(parsed * 100) / 100,
    currency: currency || 'USD', date, description: String(description || '').trim(), receiptRef: String(receiptRef || '').trim().slice(0, 300)
  });
  await notify(await adminIdsFor('expenses'), {
    type: 'expense', title: `${req.user.name} submitted an expense claim`, body: `${expense.title} - ${formatMoney(expense.amount, expense.currency)}`, link: '/expenses'
  });
  res.status(201).json(expense);
};

export const withdraw = async (req, res) => {
  const expense = valid(req.params.id) ? await Expense.findOne({ _id: req.params.id, userId: req.user.id }) : null;
  if (!expense) return res.status(404).json({ message: 'Expense not found.' });
  if (expense.status !== 'Pending') return res.status(409).json({ message: 'Only pending claims can be withdrawn.' });
  await expense.deleteOne();
  res.json({ message: 'Claim withdrawn.' });
};

// ---------- Admin ----------
export const listAll = async (req, res) => {
  const filter = ['Pending', 'Approved', 'Rejected', 'Reimbursed'].includes(req.query.status) ? { status: req.query.status } : {};
  res.json(await Expense.find(filter).sort({ createdAt: -1 }).populate(withUser));
};

export const review = async (req, res) => {
  const { status, note } = req.body;
  if (!['Approved', 'Rejected'].includes(status)) return res.status(400).json({ message: 'Status must be Approved or Rejected.' });
  const expense = valid(req.params.id) ? await Expense.findById(req.params.id) : null;
  if (!expense) return res.status(404).json({ message: 'Expense not found.' });
  if (String(expense.userId) === req.user.id) return res.status(403).json({ message: 'You cannot review your own expense claim.' });
  if (expense.status !== 'Pending') return res.status(409).json({ message: `This claim is already ${expense.status.toLowerCase()}.` });

  expense.status = status;
  expense.reviewedById = req.user.id;
  expense.reviewedAt = new Date();
  expense.reviewNote = String(note || '').trim().slice(0, 500);
  await expense.save();
  await notify(expense.userId, {
    type: 'expense', title: `Your expense "${expense.title}" was ${status.toLowerCase()}`, body: expense.reviewNote, link: '/expenses'
  });
  await audit(req, { action: `expense.${status.toLowerCase()}`, entity: 'expense', entityId: expense.id, summary: `${status} expense "${expense.title}" (${formatMoney(expense.amount, expense.currency)})` });
  res.json(await expense.populate(withUser));
};

// Pays an approved claim: recorded as a payment in the payroll ledger
export const reimburse = async (req, res) => {
  const expense = valid(req.params.id) ? await Expense.findById(req.params.id).populate(withUser) : null;
  if (!expense) return res.status(404).json({ message: 'Expense not found.' });
  if (expense.status !== 'Approved') return res.status(409).json({ message: 'Only approved claims can be reimbursed.' });

  expense.status = 'Reimbursed';
  expense.reimbursedAt = new Date();
  await expense.save();
  await transactionModel.create({
    recipient: expense.user?.name ?? 'Employee',
    date: todayLabel(),
    amount: formatMoney(expense.amount, expense.currency),
    status: 'Success',
    method: 'Expense Reimbursement'
  });
  await notify(expense.userId, { type: 'expense', title: `"${expense.title}" has been reimbursed`, link: '/expenses' });
  await audit(req, { action: 'expense.reimburse', entity: 'expense', entityId: expense.id, summary: `Reimbursed ${formatMoney(expense.amount, expense.currency)} to ${expense.user?.name}` });
  res.json(expense);
};
