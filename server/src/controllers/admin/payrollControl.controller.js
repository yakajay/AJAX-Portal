import { Payslip, SalaryStructure } from '../../models/salary.model.js';
import { User } from '../../models/user.model.js';
import { LegalEntity } from '../../models/legalEntity.model.js';
import { Company } from '../../models/company.model.js';
import { isValidMonth, monthLabel } from '../../utils/dates.js';
import { checkPayroll, previousMonth, DEFAULT_THRESHOLD_PERCENT } from '../../utils/payrollChecks.js';
import { buildBankRows, bankProblem, BANK_FORMATS } from '../../utils/bankExport.js';
import { buildJournal, renderJournal, accountsFor, ACCOUNT_KEYS, ACCOUNTING_FORMATS, DEFAULT_ACCOUNTS } from '../../utils/accountingExport.js';
import { toCsv } from '../../utils/csv.js';
import { audit } from '../../utils/audit.js';

const bad = (res, message) => res.status(400).json({ message });
const monthOf = (req, res) => {
  if (!isValidMonth(req.query.month)) { bad(res, 'month must look like 2026-10.'); return null; }
  return req.query.month;
};
const plain = (docs) => docs.map((d) => d.toJSON());

// ---------- Checks against the previous run ----------
// GET /admin/payroll/checks?month=2026-10&threshold=20
export const checks = async (req, res) => {
  const month = monthOf(req, res);
  if (!month) return;
  const threshold = req.query.threshold === undefined ? DEFAULT_THRESHOLD_PERCENT : Number(req.query.threshold);
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 1000) return bad(res, 'threshold must be a percentage above 0.');
  const prev = previousMonth(month);
  const [current, previous, users, structures] = await Promise.all([
    Payslip.find({ month }), Payslip.find({ month: prev }), User.find(), SalaryStructure.find().select('userId')
  ]);
  const userMap = new Map(users.map((u) => [u.id, { name: u.name, locked: u.locked, hasBank: !bankProblem(u.sensitive, 'XXX') }]));
  const result = checkPayroll({ current: plain(current), previous: plain(previous), users: userMap, structureUserIds: structures.map((s) => String(s.userId)), thresholdPercent: threshold });
  res.json({ month, previousMonth: prev, previousRunFound: previous.length > 0, ...result });
};

// ---------- Bank payment file ----------
const filterByEntity = async (req, res, payslips, users) => {
  const { entityId } = req.query;
  if (!entityId) return { payslips, entity: null };
  const entity = await LegalEntity.findById(entityId).catch(() => null);
  if (!entity) { bad(res, 'Employer record not found.'); return null; }
  return { payslips: payslips.filter((p) => String(users.get(String(p.userId))?.entityId ?? '') === entity.id), entity };
};

const bankContext = async (req, res) => {
  const month = monthOf(req, res);
  if (!month) return null;
  const format = req.query.format ?? 'standard';
  if (!BANK_FORMATS[format]) { bad(res, `format must be one of: ${Object.keys(BANK_FORMATS).join(', ')}.`); return null; }
  const includePaid = req.query.includePaid === 'true';
  const [slips, userDocs] = await Promise.all([Payslip.find(includePaid ? { month } : { month, status: 'Generated' }).sort({ createdAt: 1 }), User.find()]);
  const users = new Map(userDocs.map((u) => [u.id, { name: u.name, employeeId: u.employeeId, sensitive: u.sensitive, entityId: u.entityId }]));
  let payslips = plain(slips);
  if (req.query.currency) payslips = payslips.filter((p) => p.currency === req.query.currency);
  const scoped = await filterByEntity(req, res, payslips, users);
  if (!scoped) return null;
  try {
    return { month, format, ...buildBankRows({ payslips: scoped.payslips, users, month, label: 'Salary' }), entity: scoped.entity, scanned: scoped.payslips.length };
  } catch (error) {
    if (error.code === 'MIXED_CURRENCY') { bad(res, error.message); return null; }
    throw error;
  }
};

// GET /admin/payroll/bank-export/preview - who is ready and who is missing details (no account numbers returned)
export const bankPreview = async (req, res) => {
  const ctx = await bankContext(req, res);
  if (!ctx) return;
  res.json({ month: ctx.month, ready: ctx.rows.length, total: ctx.total, currency: ctx.currency, skipped: ctx.skipped, formats: Object.entries(BANK_FORMATS).map(([id, f]) => ({ id, label: f.label })) });
};

// GET /admin/payroll/bank-export?month=&format=standard|bulk&entityId=&includePaid=true
export const bankExport = async (req, res) => {
  const ctx = await bankContext(req, res);
  if (!ctx) return;
  if (!ctx.rows.length) return res.status(409).json({ message: ctx.scanned ? 'No one has valid bank details, so there is nothing to pay.' : 'There are no unpaid payslips for this month.', skipped: ctx.skipped });
  // The file holds account numbers, so every download is on the record (counts only, never the numbers)
  await audit(req, { action: 'payroll.bank_export', entity: 'payroll', entityId: ctx.month, summary: `Downloaded bank payment file for ${ctx.month} (${ctx.rows.length} people, ${ctx.currency} ${ctx.total})`, meta: { format: ctx.format, rows: ctx.rows.length, skipped: ctx.skipped.length, total: ctx.total, entity: ctx.entity?.name } });
  res.setHeader('X-Skipped-Count', String(ctx.skipped.length));
  res.setHeader('Access-Control-Expose-Headers', 'X-Skipped-Count, Content-Disposition');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="bank-file-${ctx.month}${ctx.entity ? `-${ctx.entity.name.replace(/[^A-Za-z0-9]+/g, '-')}` : ''}.csv"`);
  res.send('﻿' + toCsv(ctx.rows, BANK_FORMATS[ctx.format].columns));
};

// ---------- Accounting export ----------
const accountingView = (company) => {
  const a = company?.settings?.accounting ?? {};
  return { accounts: accountsFor(a), defaults: DEFAULT_ACCOUNTS, entityName: a.entityName ?? '', formats: Object.entries(ACCOUNTING_FORMATS).map(([id, f]) => ({ id, label: f.label })) };
};

export const getAccounting = async (req, res) => res.json(accountingView(await Company.findById(req.company.id)));

export const setAccounting = async (req, res) => {
  const company = await Company.findById(req.company.id);
  const next = {};
  for (const key of ACCOUNT_KEYS) {
    const value = String(req.body?.accounts?.[key] ?? '').trim();
    if (value.length > 120) return bad(res, 'Account names must be 120 characters or fewer.');
    // Saving the default text back means "use the default", so it keeps following any future change to it
    next[key] = value === DEFAULT_ACCOUNTS[key] ? '' : value;
  }
  next.entityName = String(req.body?.entityName ?? '').trim().slice(0, 120);
  company.settings.accounting = next;
  await company.save();
  await audit(req, { action: 'payroll.accounting_settings', entity: 'company', entityId: company.id, summary: 'Updated payroll ledger account mapping', meta: next });
  res.json(accountingView(company));
};

// GET /admin/payroll/accounting-export?month=&format=csv|xero|quickbooks|tally
export const accountingExport = async (req, res) => {
  const month = monthOf(req, res);
  if (!month) return;
  const format = req.query.format ?? 'csv';
  if (!ACCOUNTING_FORMATS[format]) return bad(res, `format must be one of: ${Object.keys(ACCOUNTING_FORMATS).join(', ')}.`);
  const slips = plain(await Payslip.find({ month }));
  if (!slips.length) return res.status(409).json({ message: 'There are no payslips for this month. Run payroll first.' });
  const currencies = [...new Set(slips.map((s) => s.currency))];
  if (currencies.length > 1) return bad(res, `This month has payslips in ${currencies.join(', ')}. Accounting entries need one currency.`);
  const company = await Company.findById(req.company.id);
  const settings = accountingView(company);
  const journal = buildJournal({ payslips: slips, accounts: settings.accounts, month });
  const narration = `Payroll ${monthLabel(month)}`;
  await audit(req, { action: 'payroll.accounting_export', entity: 'payroll', entityId: month, summary: `Exported payroll journal for ${month} as ${format}`, meta: { format, ...journal.totals } });
  const meta = ACCOUNTING_FORMATS[format];
  res.setHeader('Content-Type', meta.type);
  res.setHeader('Content-Disposition', `attachment; filename="payroll-journal-${month}-${format}.${meta.ext}"`);
  res.send((meta.ext === 'csv' ? '﻿' : '') + renderJournal(format, { ...journal, currency: currencies[0], narration, entity: settings.entityName }));
};

// GET /admin/payroll/accounting-export/preview - the journal lines as JSON for review before importing
export const accountingPreview = async (req, res) => {
  const month = monthOf(req, res);
  if (!month) return;
  const slips = plain(await Payslip.find({ month }));
  const company = await Company.findById(req.company.id);
  const journal = buildJournal({ payslips: slips, accounts: accountingView(company).accounts, month });
  res.json({ month, payslips: slips.length, currency: slips[0]?.currency ?? null, ...journal });
};
