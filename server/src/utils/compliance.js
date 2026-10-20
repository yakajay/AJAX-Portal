// Compliance: automatic checks on people data against rules the company sets, plus a calendar of the
// recurring filings and payments it owes (with who completed each one).
//
// No statutory rule is built in: labour law differs by country and changes, so the company enters the
// thresholds and the filings that apply to it (like the tax slabs in utils/payrollTax.js).

import { addDays, isoDate, isValidIso, parseIso } from './dates.js';

export const FREQUENCIES = ['monthly', 'quarterly', 'yearly'];
const MAX_FILINGS = 30;

const daysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate(); // month is 1-12
const pad = (n) => String(n).padStart(2, '0');
const clampDay = (year, month, day) => Math.min(day, daysInMonth(year, month));
const shiftMonth = (year, month, by) => {
  const index = year * 12 + (month - 1) + by;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
};

const text = (value, max) => String(value ?? '').trim().slice(0, max);
const num = (value) => (value === undefined || value === null || value === '' ? null : Number(value));

// Returns { settings } or { error } for an admin-submitted compliance configuration
export const validateComplianceSettings = (input, todayIso = isoDate(new Date())) => {
  const out = { requireGovernmentId: !!input?.requireGovernmentId, requireTaxId: !!input?.requireTaxId };

  const wage = input?.minimumWage;
  const amount = num(wage?.amount);
  if (amount !== null && (!Number.isFinite(amount) || amount < 0)) return { error: 'The minimum wage must be zero or more.' };
  const currency = text(wage?.currency, 3).toUpperCase() || 'INR';
  if (!/^[A-Z]{3}$/.test(currency)) return { error: 'Minimum wage currency must be a 3-letter code.' };
  out.minimumWage = { amount: amount || null, currency };

  for (const [field, label, max] of [['noticePeriodDays', 'The notice period', 365], ['settlementDays', 'The settlement deadline', 365], ['maxMonthlyOvertimeHours', 'The overtime limit', 744]]) {
    const value = num(input?.[field]);
    if (value !== null && (!Number.isInteger(value) || value < 0 || value > max)) return { error: `${label} must be a whole number from 0 to ${max}.` };
    out[field] = value || null;
  }

  const filingsIn = input?.filings ?? [];
  if (!Array.isArray(filingsIn) || filingsIn.length > MAX_FILINGS) return { error: `Provide up to ${MAX_FILINGS} filings.` };
  const seen = new Set();
  out.filings = [];
  for (const [i, f] of filingsIn.entries()) {
    const name = text(f?.name, 80);
    if (!name) return { error: `Filing ${i + 1}: a name is required.` };
    const frequency = f?.frequency;
    if (!FREQUENCIES.includes(frequency)) return { error: `Filing "${name}": choose monthly, quarterly or yearly.` };
    const dueDay = Number(f?.dueDay);
    if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) return { error: `Filing "${name}": the due day must be 1 to 31.` };
    let dueMonth = null;
    if (frequency === 'yearly') {
      dueMonth = Number(f?.dueMonth);
      if (!Number.isInteger(dueMonth) || dueMonth < 1 || dueMonth > 12) return { error: `Filing "${name}": the due month must be 1 to 12.` };
    }
    let key = text(f?.key, 40) || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || `filing-${i + 1}`;
    if (seen.has(key)) key = `${key}-${i + 1}`;
    seen.add(key);
    // Deadlines before `since` are not tracked, so adding a filing today doesn't list months of past ones as overdue
    const since = isValidIso(f?.since) ? f.since : todayIso;
    out.filings.push({ key, name, frequency, dueDay, dueMonth, since, authority: text(f?.authority, 80), note: text(f?.note, 300) });
  }
  return { settings: out };
};

// Periods whose deadline can be shown today. monthly: 2026-09 is due on dueDay of 2026-10; quarterly: 2026-Q3 is
// due on dueDay of the month after the quarter ends; yearly: the year 2025 is due on dueMonth/dueDay of 2026.
export const obligationsFor = (filing, todayIso, { lookBackDays = 180, lookAheadDays = 45 } = {}) => {
  const from = [addDays(todayIso, -lookBackDays), filing.since ?? ''].sort().pop();
  const to = addDays(todayIso, lookAheadDays);
  const today = parseIso(todayIso);
  const out = [];
  const push = (period, due) => {
    if (due < from || due > to) return;
    out.push({ key: filing.key, name: filing.name, authority: filing.authority, note: filing.note, frequency: filing.frequency, period, dueDate: due });
  };
  const y = today.getUTCFullYear();
  if (filing.frequency === 'monthly') {
    for (let back = -2; back <= 8; back++) {
      const p = shiftMonth(y, today.getUTCMonth() + 1, -back);
      const due = shiftMonth(p.year, p.month, 1);
      push(`${p.year}-${pad(p.month)}`, `${due.year}-${pad(due.month)}-${pad(clampDay(due.year, due.month, filing.dueDay))}`);
    }
  } else if (filing.frequency === 'quarterly') {
    for (let year = y - 1; year <= y; year++) {
      for (let q = 1; q <= 4; q++) {
        const due = shiftMonth(year, q * 3, 1);
        push(`${year}-Q${q}`, `${due.year}-${pad(due.month)}-${pad(clampDay(due.year, due.month, filing.dueDay))}`);
      }
    }
  } else {
    for (let year = y - 2; year <= y; year++) {
      push(String(year), `${year + 1}-${pad(filing.dueMonth)}-${pad(clampDay(year + 1, filing.dueMonth, filing.dueDay))}`);
    }
  }
  return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
};

// done: Map("key|period" -> { completedAt, completedByName, note })
export const filingCalendar = ({ filings, done, todayIso }) =>
  filings.flatMap((f) => obligationsFor(f, todayIso)).map((o) => {
    const record = done.get(`${o.key}|${o.period}`);
    const daysLeft = Math.round((parseIso(o.dueDate) - parseIso(todayIso)) / 86400000);
    const status = record ? 'done' : daysLeft < 0 ? 'overdue' : daysLeft <= 7 ? 'due_soon' : 'upcoming';
    return { ...o, status, daysLeft, completedAt: record?.completedAt ?? null, completedBy: record?.completedByName ?? null, doneNote: record?.note ?? '' };
  }).sort((a, b) => a.dueDate.localeCompare(b.dueDate));

// people: [{ id, name, locked, joinDate, hasBank, hasGovernmentId, hasTaxId }]
// structures: [{ userId, currency, gross }]; exits: [{ userId, status, createdAt, lastWorkingDay, settledAt }]
// overtime: Map(userId -> hours this month). Returns checks: [{ id, title, severity, items: [{ userId, name, detail }] }]
export const evaluateChecks = ({ people, structures, exits, overtime = new Map(), settings = {}, todayIso = isoDate(new Date()) }) => {
  const active = people.filter((p) => !p.locked);
  const byId = new Map(people.map((p) => [String(p.id), p]));
  const paid = new Set(structures.map((s) => String(s.userId)));
  const checks = [];
  const add = (id, title, severity, items) => checks.push({ id, title, severity, items });
  const item = (p, detail) => ({ userId: String(p.id), name: p.name, detail });

  add('no_salary_structure', 'Active employees with no salary structure', 'warning', active.filter((p) => !paid.has(String(p.id))).map((p) => item(p, 'Not included in payroll runs')));
  add('missing_bank', 'Paid employees with no bank details', 'warning', active.filter((p) => paid.has(String(p.id)) && !p.hasBank).map((p) => item(p, 'Cannot be paid by bank transfer file')));
  add('missing_join_date', 'Employees with no joining date', 'warning', active.filter((p) => !p.joinDate).map((p) => item(p, 'Tenure, anniversaries and leave accrual need a joining date')));
  if (settings.requireGovernmentId) add('missing_government_id', 'Employees with no government ID', 'error', active.filter((p) => !p.hasGovernmentId).map((p) => item(p, 'Required by your compliance settings')));
  if (settings.requireTaxId) add('missing_tax_id', 'Employees with no tax ID', 'error', active.filter((p) => !p.hasTaxId).map((p) => item(p, 'Required by your compliance settings')));

  const wage = settings.minimumWage;
  if (wage?.amount) {
    add('below_minimum_wage', `Gross pay below the minimum wage (${wage.currency} ${wage.amount})`, 'error',
      structures.filter((s) => s.currency === wage.currency && s.gross < wage.amount && byId.get(String(s.userId)) && !byId.get(String(s.userId)).locked)
        .map((s) => item(byId.get(String(s.userId)), `Gross ${s.gross} is ${Math.round((wage.amount - s.gross) * 100) / 100} below the minimum`)));
  }
  if (settings.maxMonthlyOvertimeHours) {
    add('overtime_limit', `Overtime above ${settings.maxMonthlyOvertimeHours} hours this month`, 'warning',
      [...overtime].filter(([id, hours]) => hours > settings.maxMonthlyOvertimeHours && byId.get(String(id))).map(([id, hours]) => item(byId.get(String(id)), `${hours} overtime hours`)));
  }
  if (settings.settlementDays) {
    add('settlement_overdue', `Exits not settled within ${settings.settlementDays} days of the last working day`, 'error',
      exits.filter((e) => e.status === 'Approved' && isValidIso(e.lastWorkingDay) && e.lastWorkingDay < addDays(todayIso, -settings.settlementDays) && byId.get(String(e.userId)))
        .map((e) => item(byId.get(String(e.userId)), `Left ${e.lastWorkingDay}; final settlement still open`)));
  }
  if (settings.noticePeriodDays) {
    add('short_notice', `Exits with less than ${settings.noticePeriodDays} days' notice`, 'warning',
      exits.filter((e) => ['Approved', 'Settled'].includes(e.status) && e.type !== 'Termination' && isValidIso(e.lastWorkingDay) && e.createdAt && byId.get(String(e.userId))
        && (parseIso(e.lastWorkingDay) - parseIso(isoDate(new Date(e.createdAt)))) / 86400000 < settings.noticePeriodDays)
        .map((e) => item(byId.get(String(e.userId)), `Requested ${isoDate(new Date(e.createdAt))}, last day ${e.lastWorkingDay}`)));
  }
  return checks;
};
