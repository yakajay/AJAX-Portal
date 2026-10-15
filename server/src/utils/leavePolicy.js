// Leave entitlements. `monthly` accrual grants yearly/12 per calendar month (the current month counts);
// `upfront` grants the full year on 1 Jan. Unused days carry forward up to `carryForwardMax`.
export const LEAVE_POLICY = {
  'Annual Leave': { yearly: 15, accrual: 'monthly', carryForwardMax: 5 },
  'Sick Leave': { yearly: 10, accrual: 'upfront', carryForwardMax: 0 },
  'Casual Leave': { yearly: 7, accrual: 'upfront', carryForwardMax: 0 },
  'Unpaid Leave': { yearly: null, accrual: 'none', carryForwardMax: 0 } // unlimited, deducted from pay
};
export const LEAVE_TYPES = Object.keys(LEAVE_POLICY);
export const UNPAID_LEAVE = 'Unpaid Leave'; // payroll deducts it, so every policy must keep it
export const ACCRUALS = ['monthly', 'upfront', 'none'];

// The policy a company runs: its own settings when it has configured any, otherwise the defaults
export const policyFor = (company) => {
  const custom = company?.settings?.leavePolicy;
  if (!custom?.length) return LEAVE_POLICY;
  return Object.fromEntries(
    custom.map((p) => [p.type, { yearly: p.yearly ?? null, accrual: p.accrual, carryForwardMax: p.carryForwardMax ?? 0 }])
  );
};

// Checks an admin-submitted policy; returns { error } or { policy: [...] }
export const validatePolicy = (input) => {
  if (!Array.isArray(input) || input.length === 0 || input.length > 20) return { error: 'Provide between 1 and 20 leave types.' };
  const seen = new Set();
  const policy = [];
  for (const row of input) {
    const type = String(row?.type ?? '').trim();
    if (!type || type.length > 40) return { error: 'Each leave type needs a name of up to 40 characters.' };
    if (seen.has(type.toLowerCase())) return { error: `"${type}" is listed twice.` };
    seen.add(type.toLowerCase());
    if (!ACCRUALS.includes(row.accrual)) return { error: `Choose how "${type}" accrues.` };
    const unlimited = row.yearly === null || row.yearly === undefined || row.yearly === '';
    if (unlimited) {
      if (row.accrual !== 'none') return { error: `"${type}" needs a yearly allowance unless it is unlimited (accrual "none").` };
      policy.push({ type, yearly: null, accrual: 'none', carryForwardMax: 0 });
      continue;
    }
    const yearly = Number(row.yearly);
    const carry = Number(row.carryForwardMax ?? 0);
    if (!Number.isFinite(yearly) || yearly < 0 || yearly > 365) return { error: `Yearly days for "${type}" must be between 0 and 365.` };
    if (row.accrual === 'none') return { error: `"${type}" has a limit, so it must accrue monthly or upfront.` };
    if (!Number.isFinite(carry) || carry < 0 || carry > yearly) return { error: `Carry-forward for "${type}" must be between 0 and its yearly days.` };
    policy.push({ type, yearly, accrual: row.accrual, carryForwardMax: carry });
  }
  if (!seen.has(UNPAID_LEAVE.toLowerCase())) return { error: `"${UNPAID_LEAVE}" must stay in the list because payroll deducts it.` };
  const unpaid = policy.find((p) => p.type.toLowerCase() === UNPAID_LEAVE.toLowerCase());
  if (unpaid.yearly !== null) return { error: `"${UNPAID_LEAVE}" must be unlimited.` };
  unpaid.type = UNPAID_LEAVE;
  return { policy };
};
export const LEAVE_STATUSES = ['Pending', 'Approved', 'Rejected', 'Cancelled'];

const round2 = (n) => Math.round(n * 100) / 100;
const yearOf = (iso) => Number(iso.slice(0, 4));

// leaves: the user's leave requests. asOf: ISO date the balance is evaluated for.
// joinDate (optional): people who joined this year have nothing to carry forward.
export const leaveBalances = (leaves, asOf, { joinDate = null, policy = LEAVE_POLICY } = {}) => {
  const year = yearOf(asOf);
  const canCarry = !joinDate || yearOf(joinDate) < year;
  const month = Number(asOf.slice(5, 7));
  const sum = (type, y, statuses) =>
    leaves
      .filter((l) => l.type === type && yearOf(l.startDate) === y && statuses.includes(l.status))
      .reduce((total, l) => total + l.days, 0);

  return Object.entries(policy)
    .filter(([, policy]) => policy.yearly !== null)
    .map(([type, policy]) => {
      const carried = policy.carryForwardMax > 0 && canCarry
        ? round2(Math.min(policy.carryForwardMax, Math.max(0, policy.yearly - sum(type, year - 1, ['Approved']))))
        : 0;
      const accrued = (policy.accrual === 'monthly' ? round2((policy.yearly * month) / 12) : policy.yearly) + carried;
      const taken = sum(type, year, ['Approved']);
      const pending = sum(type, year, ['Pending']);
      return {
        type,
        total: policy.yearly + carried,
        carriedForward: carried,
        accrued,
        taken,
        pending,
        remaining: round2(Math.max(accrued - taken - pending, 0))
      };
    });
};
