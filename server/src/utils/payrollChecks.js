// Sanity checks on a month's payslips, compared with the previous month's run, so odd changes in pay,
// tax or deductions are caught before the run is approved and paid.

import { addDays, monthBounds } from './dates.js';

export const DEFAULT_THRESHOLD_PERCENT = 20;

const round2 = (n) => Math.round(n * 100) / 100;

export const previousMonth = (month) => addDays(monthBounds(month).start, -1).slice(0, 7);

// Percentage change from `before` to `after`; a rise from nothing counts as 100%
export const percentChange = (before, after) => {
  if (before === after) return 0;
  if (!before) return 100;
  return round2(((after - before) / Math.abs(before)) * 100);
};

const money = (n) => round2(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// current / previous: plain payslip objects ({ userId, gross, net, totalDeductions, deductions: { tax }, currency }).
// users: Map(userId -> { name, locked, hasBank }). Returns { findings, summary }.
// severity: 'error' should be fixed before paying, 'warning' deserves a look, 'info' is context.
export const checkPayroll = ({ current, previous, users, structureUserIds = [], thresholdPercent = DEFAULT_THRESHOLD_PERCENT }) => {
  const findings = [];
  const prevByUser = new Map(previous.map((p) => [String(p.userId), p]));
  const currentIds = new Set(current.map((p) => String(p.userId)));
  const add = (severity, code, userId, message, detail = null) =>
    findings.push({ severity, code, userId: String(userId), name: users.get(String(userId))?.name ?? 'Unknown employee', message, ...(detail ? { detail } : {}) });

  for (const slip of current) {
    const uid = String(slip.userId);
    const cur = { gross: slip.gross, net: slip.net, deductions: slip.totalDeductions, tax: slip.deductions?.tax ?? 0 };
    if (!(cur.net > 0)) add('error', 'non_positive_net', uid, `Net pay is ${money(cur.net)}.`);
    if (cur.deductions > cur.gross) add('error', 'deductions_exceed_gross', uid, `Deductions (${money(cur.deductions)}) are more than gross pay (${money(cur.gross)}).`);
    if (users.get(uid) && !users.get(uid).hasBank) add('warning', 'missing_bank_details', uid, 'No bank account on file, so this person cannot be included in a bank payment file.');

    const prev = prevByUser.get(uid);
    if (!prev) {
      add('info', 'first_payslip', uid, 'First payslip: there is no earlier month to compare with.');
      continue;
    }
    if (prev.currency !== slip.currency) {
      add('warning', 'currency_changed', uid, `Currency changed from ${prev.currency} to ${slip.currency}.`);
      continue;
    }
    const before = { gross: prev.gross, net: prev.net, deductions: prev.totalDeductions, tax: prev.deductions?.tax ?? 0 };
    for (const [key, label] of [['net', 'Net pay'], ['gross', 'Gross pay'], ['tax', 'Tax'], ['deductions', 'Total deductions']]) {
      const change = percentChange(before[key], cur[key]);
      if (Math.abs(change) >= thresholdPercent) {
        add('warning', `${key}_changed`, uid, `${label} ${change > 0 ? 'rose' : 'fell'} ${Math.abs(change)}% (${money(before[key])} to ${money(cur[key])}).`, { before: before[key], after: cur[key], changePercent: change });
      }
    }
  }

  // People paid last month who have no payslip this month
  for (const prev of previous) {
    const uid = String(prev.userId);
    if (currentIds.has(uid)) continue;
    const user = users.get(uid);
    if (!user) add('info', 'removed_employee', uid, 'Was paid last month; the account no longer exists.');
    else if (user.locked) add('info', 'left_payroll', uid, 'Was paid last month; the account is now locked, so no payslip was made.');
    else add('warning', 'missing_payslip', uid, 'Was paid last month but has no payslip this month.');
  }
  // Active people with a salary structure who were left out of the run
  for (const uid of structureUserIds) {
    const user = users.get(String(uid));
    if (!user || user.locked || currentIds.has(String(uid)) || prevByUser.has(String(uid))) continue;
    add('warning', 'not_in_run', uid, 'Has a salary structure but no payslip this month.');
  }

  const rank = { error: 0, warning: 1, info: 2 };
  findings.sort((a, b) => rank[a.severity] - rank[b.severity] || a.name.localeCompare(b.name));
  const count = (s) => findings.filter((f) => f.severity === s).length;
  return {
    findings,
    summary: { errors: count('error'), warnings: count('warning'), info: count('info'), payslips: current.length, compared: current.filter((p) => prevByUser.has(String(p.userId))).length, thresholdPercent }
  };
};
