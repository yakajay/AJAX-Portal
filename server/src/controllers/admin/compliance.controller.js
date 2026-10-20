import { User } from '../../models/user.model.js';
import { SalaryStructure } from '../../models/salary.model.js';
import { Exit } from '../../models/exit.model.js';
import { attendanceModel } from '../../models/attendance.model.js';
import { shiftModel } from '../../models/shift.model.js';
import { Company } from '../../models/company.model.js';
import { ComplianceFiling } from '../../models/complianceFiling.model.js';
import { evaluateChecks, filingCalendar, validateComplianceSettings } from '../../utils/compliance.js';
import { currentMonth, isoDate } from '../../utils/dates.js';
import { summarizeAttendance } from '../../utils/attendanceReport.js';
import { shiftThresholds } from '../../utils/shifts.js';
import { audit } from '../../utils/audit.js';

const settingsView = (company) => {
  const c = company?.settings?.compliance?.toObject?.() ?? company?.settings?.compliance ?? {};
  return {
    requireGovernmentId: !!c.requireGovernmentId,
    requireTaxId: !!c.requireTaxId,
    minimumWage: { amount: c.minimumWage?.amount ?? null, currency: c.minimumWage?.currency ?? 'INR' },
    noticePeriodDays: c.noticePeriodDays ?? null,
    settlementDays: c.settlementDays ?? null,
    maxMonthlyOvertimeHours: c.maxMonthlyOvertimeHours ?? null,
    filings: (c.filings ?? []).map((f) => ({ key: f.key, name: f.name, frequency: f.frequency, dueDay: f.dueDay, dueMonth: f.dueMonth ?? null, since: f.since ?? null, authority: f.authority ?? '', note: f.note ?? '' }))
  };
};

export const getSettings = async (req, res) => res.json(settingsView(await Company.findById(req.company.id)));

export const setSettings = async (req, res) => {
  const { settings, error } = validateComplianceSettings(req.body);
  if (error) return res.status(400).json({ message: error });
  const company = await Company.findById(req.company.id);
  company.settings.compliance = settings;
  await company.save();
  await audit(req, { action: 'compliance.settings', entity: 'company', entityId: company.id, summary: `Updated compliance rules (${settings.filings.length} filing(s))`, meta: { ...settings, filings: settings.filings.map((f) => f.name) } });
  res.json(settingsView(company));
};

// GET /admin/compliance - rule checks on current data plus the filing calendar
export const report = async (req, res) => {
  const company = await Company.findById(req.company.id);
  const settings = settingsView(company);
  const todayIso = isoDate(new Date());
  const [users, structures, exits, filingsDone] = await Promise.all([User.find(), SalaryStructure.find(), Exit.find({ status: { $in: ['Approved', 'Settled'] } }), ComplianceFiling.find()]);

  const people = users.map((u) => ({
    id: u.id, name: u.name, locked: u.locked, joinDate: u.joinDate,
    hasBank: !!(u.sensitive?.bankAccount && u.sensitive?.bankIfsc),
    hasGovernmentId: !!u.sensitive?.governmentId,
    hasTaxId: !!u.sensitive?.taxId
  }));

  // Overtime this month (UTC calendar month; entries a day either side are read so edge days aren't cut off)
  const overtime = new Map();
  if (settings.maxMonthlyOvertimeHours) {
    const month = currentMonth();
    const [y, m] = month.split('-').map(Number);
    const entries = await attendanceModel.findInRange(users.map((u) => u.id), new Date(Date.UTC(y, m - 1, 1) - 86400000), new Date(Date.UTC(y, m, 1) + 86400000));
    const shifts = new Map((await shiftModel.findAll()).map((s) => [s.id, s]));
    for (const u of users) {
      const mine = entries.filter((e) => String(e.userId) === u.id);
      if (!mine.length) continue;
      const shift = u.shiftId ? shifts.get(String(u.shiftId)) : undefined;
      overtime.set(u.id, summarizeAttendance(mine, { timeZone: 'UTC', month, ...shiftThresholds(shift) }).overtimeHours);
    }
  }

  const checks = evaluateChecks({
    people,
    structures: structures.map((s) => ({ userId: String(s.userId), currency: s.currency, gross: s.basic + s.hra + s.allowances })),
    exits: exits.map((e) => ({ userId: String(e.userId), status: e.status, type: e.type, createdAt: e.createdAt, lastWorkingDay: e.lastWorkingDay })),
    overtime, settings, todayIso
  });
  const done = new Map(filingsDone.map((f) => [`${f.key}|${f.period}`, { completedAt: f.completedAt, completedByName: f.completedByName, note: f.note }]));
  const filings = filingCalendar({ filings: settings.filings, done, todayIso });

  const flagged = checks.filter((c) => c.items.length);
  res.json({
    checks,
    filings,
    summary: {
      errors: flagged.filter((c) => c.severity === 'error').reduce((n, c) => n + c.items.length, 0),
      warnings: flagged.filter((c) => c.severity === 'warning').reduce((n, c) => n + c.items.length, 0),
      overdueFilings: filings.filter((f) => f.status === 'overdue').length,
      dueSoon: filings.filter((f) => f.status === 'due_soon').length
    }
  });
};

// POST /admin/compliance/filings { key, period, done, note }
export const markFiling = async (req, res) => {
  const { key, period, note } = req.body ?? {};
  const settings = settingsView(await Company.findById(req.company.id));
  const filing = settings.filings.find((f) => f.key === key);
  if (!filing) return res.status(404).json({ message: 'That filing is not in your compliance settings.' });
  if (!/^(\d{4}-(0[1-9]|1[0-2])|\d{4}-Q[1-4]|\d{4})$/.test(String(period))) return res.status(400).json({ message: 'period must look like 2026-09, 2026-Q3 or 2025.' });
  if (req.body.done === false) {
    await ComplianceFiling.deleteOne({ key, period });
    await audit(req, { action: 'compliance.reopen', entity: 'filing', entityId: `${key}:${period}`, summary: `Reopened "${filing.name}" for ${period}` });
    return res.json({ key, period, done: false });
  }
  await ComplianceFiling.findOneAndUpdate(
    { key, period },
    { $set: { completedById: req.user.id, completedByName: req.user.name, completedAt: new Date(), note: String(note ?? '').trim().slice(0, 300) } },
    { upsert: true, setDefaultsOnInsert: true }
  );
  await audit(req, { action: 'compliance.complete', entity: 'filing', entityId: `${key}:${period}`, summary: `Marked "${filing.name}" done for ${period}` });
  res.json({ key, period, done: true });
};
