import mongoose from 'mongoose';
import { contractorModel } from '../../models/contractor.model.js';
import { Timesheet, Invoice } from '../../models/timesheet.model.js';
import { isValidIso, isoDate, addDays, parseIso } from '../../utils/dates.js';
import { audit } from '../../utils/audit.js';
import { env } from '../../config/env.js';

const valid = (id) => mongoose.isValidObjectId(id);
const STATUSES = ['Active', 'On Bench', 'Pending', 'Ended'];

export const list = async (req, res) => {
  res.json(await contractorModel.findAll());
};

const readFields = (body, { partial }) => {
  const data = {};
  const { name, role, company, status, country, rating, email, contractStart, contractEnd, hourlyRate, currency } = body;
  if (!partial && (!name || !role || !company)) return { error: 'Name, role and company are required.' };
  if (name !== undefined) data.name = name;
  if (role !== undefined) data.role = role;
  if (company !== undefined) data.company = company;
  if (status !== undefined) {
    if (!STATUSES.includes(status)) return { error: `Status must be one of ${STATUSES.join(', ')}.` };
    data.status = status;
  }
  if (country !== undefined) data.country = country;
  if (rating !== undefined) data.rating = parseFloat(rating) || 0;
  if (email !== undefined) data.email = String(email).trim();
  for (const [key, value] of Object.entries({ contractStart, contractEnd })) {
    if (value === undefined) continue;
    if (value && !isValidIso(value)) return { error: `${key} must be a valid date.` };
    data[key] = value || null;
  }
  if (hourlyRate !== undefined) {
    const rate = Number(hourlyRate);
    if (!Number.isFinite(rate) || rate < 0) return { error: 'hourlyRate must be 0 or more.' };
    data.hourlyRate = rate;
  }
  if (currency !== undefined) {
    if (!/^[A-Z]{3}$/.test(currency)) return { error: 'Currency must be a 3-letter code.' };
    data.currency = currency;
  }
  const start = data.contractStart, end = data.contractEnd;
  if (start && end && end < start) return { error: 'The contract cannot end before it starts.' };
  return { data };
};

export const create = async (req, res) => {
  const { data, error } = readFields(req.body, { partial: false });
  if (error) return res.status(400).json({ message: error });
  const contractor = await contractorModel.create({ status: 'Active', country: '', ...data });
  await audit(req, { action: 'contractor.create', entity: 'contractor', entityId: contractor.id, summary: `Added contractor ${contractor.name} (${contractor.company})` });
  res.status(201).json(contractor);
};

export const update = async (req, res) => {
  const contractor = await contractorModel.findById(req.params.id);
  if (!contractor) return res.status(404).json({ message: 'Contractor not found.' });
  const { data, error } = readFields(req.body, { partial: true });
  if (error) return res.status(400).json({ message: error });
  contractor.set(data);
  await contractor.save();
  await audit(req, { action: 'contractor.update', entity: 'contractor', entityId: contractor.id, summary: `Updated contractor ${contractor.name}`, meta: data });
  res.json(contractor);
};

// Contracts ending within `days` (default from config) and ones that already lapsed
export const alerts = async (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days) || env.jobs.contractAlertDays, 1), 365);
  const today = isoDate(new Date());
  const [expiring, expired] = await Promise.all([
    contractorModel.findEndingBy(today, addDays(today, days)),
    contractorModel.findExpired(today)
  ]);
  const withDays = (c) => ({
    ...c.toJSON(),
    daysLeft: Math.round((parseIso(c.contractEnd) - parseIso(today)) / 86400000)
  });
  res.json({ days, expiring: expiring.map(withDays), expired: expired.map(withDays) });
};

// ---------- Timesheets ----------
const isMonday = (iso) => parseIso(iso).getUTCDay() === 1;

export const listTimesheets = async (req, res) => {
  const filter = valid(req.query.contractorId) ? { contractorId: req.query.contractorId } : {};
  res.json(await Timesheet.find(filter).sort({ weekStart: -1 }).limit(200));
};

export const createTimesheet = async (req, res) => {
  const contractor = await contractorModel.findById(req.params.id);
  if (!contractor) return res.status(404).json({ message: 'Contractor not found.' });
  const { weekStart, hours, notes } = req.body;
  const parsed = Number(hours);
  if (!isValidIso(weekStart) || !isMonday(weekStart)) return res.status(400).json({ message: 'weekStart must be a Monday (YYYY-MM-DD).' });
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 168) return res.status(400).json({ message: 'Hours must be between 0 and 168.' });
  const timesheet = await Timesheet.create({ contractorId: contractor.id, weekStart, hours: parsed, notes: String(notes || '') });
  res.status(201).json(timesheet);
};

export const reviewTimesheet = async (req, res) => {
  const { status } = req.body;
  if (!['Approved', 'Rejected'].includes(status)) return res.status(400).json({ message: 'Status must be Approved or Rejected.' });
  const timesheet = valid(req.params.id) ? await Timesheet.findById(req.params.id) : null;
  if (!timesheet) return res.status(404).json({ message: 'Timesheet not found.' });
  timesheet.status = status;
  await timesheet.save();
  await audit(req, { action: `timesheet.${status.toLowerCase()}`, entity: 'timesheet', entityId: timesheet.id, summary: `${status} timesheet for week ${timesheet.weekStart}` });
  res.json(timesheet);
};

// ---------- Invoices ----------
export const listInvoices = async (req, res) => {
  const filter = valid(req.query.contractorId) ? { contractorId: req.query.contractorId } : {};
  res.json(await Invoice.find(filter).sort({ issueDate: -1 }).populate({ path: 'contractor', select: 'name company' }));
};

export const createInvoice = async (req, res) => {
  const { contractorId, number, amount, issueDate, dueDate, currency, notes } = req.body;
  const contractor = valid(contractorId) ? await contractorModel.findById(contractorId) : null;
  if (!contractor) return res.status(404).json({ message: 'Contractor not found.' });
  const parsed = Number(amount);
  if (!String(number || '').trim() || !(parsed > 0) || !isValidIso(issueDate) || !isValidIso(dueDate) || dueDate < issueDate) {
    return res.status(400).json({ message: 'Invoice number, a positive amount, and valid issue/due dates are required.' });
  }
  const invoice = await Invoice.create({
    contractorId: contractor.id, number: number.trim(), amount: Math.round(parsed * 100) / 100, issueDate, dueDate,
    currency: currency || contractor.currency, notes: String(notes || '')
  });
  await audit(req, { action: 'invoice.create', entity: 'invoice', entityId: invoice.id, summary: `Recorded invoice ${invoice.number} for ${contractor.name}` });
  res.status(201).json(await invoice.populate({ path: 'contractor', select: 'name company' }));
};

export const updateInvoice = async (req, res) => {
  const { status } = req.body;
  if (!['Draft', 'Sent', 'Paid'].includes(status)) return res.status(400).json({ message: 'Status must be Draft, Sent or Paid.' });
  const invoice = valid(req.params.id) ? await Invoice.findById(req.params.id) : null;
  if (!invoice) return res.status(404).json({ message: 'Invoice not found.' });
  invoice.status = status;
  invoice.paidAt = status === 'Paid' ? new Date() : null;
  await invoice.save();
  await audit(req, { action: 'invoice.update', entity: 'invoice', entityId: invoice.id, summary: `Invoice ${invoice.number} marked ${status}` });
  res.json(await invoice.populate({ path: 'contractor', select: 'name company' }));
};
