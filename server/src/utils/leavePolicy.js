// Leave entitlements. `monthly` accrual grants yearly/12 per calendar month (the current month counts);
// `upfront` grants the full year on 1 Jan. Unused days carry forward up to `carryForwardMax`.
export const LEAVE_POLICY = {
  'Annual Leave': { yearly: 15, accrual: 'monthly', carryForwardMax: 5 },
  'Sick Leave': { yearly: 10, accrual: 'upfront', carryForwardMax: 0 },
  'Casual Leave': { yearly: 7, accrual: 'upfront', carryForwardMax: 0 },
  'Unpaid Leave': { yearly: null, accrual: 'none', carryForwardMax: 0 } // unlimited, deducted from pay
};
export const LEAVE_TYPES = Object.keys(LEAVE_POLICY);
export const LEAVE_STATUSES = ['Pending', 'Approved', 'Rejected', 'Cancelled'];

const round2 = (n) => Math.round(n * 100) / 100;
const yearOf = (iso) => Number(iso.slice(0, 4));

// leaves: the user's leave requests. asOf: ISO date the balance is evaluated for.
// joinDate (optional): people who joined this year have nothing to carry forward.
export const leaveBalances = (leaves, asOf, { joinDate = null } = {}) => {
  const year = yearOf(asOf);
  const canCarry = !joinDate || yearOf(joinDate) < year;
  const month = Number(asOf.slice(5, 7));
  const sum = (type, y, statuses) =>
    leaves
      .filter((l) => l.type === type && yearOf(l.startDate) === y && statuses.includes(l.status))
      .reduce((total, l) => total + l.days, 0);

  return Object.entries(LEAVE_POLICY)
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
