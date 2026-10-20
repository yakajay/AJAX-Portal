// Salary payment file for bank portals: one row per employee with the account to pay and the net amount.
// Banks each publish their own bulk-upload template, so two common layouts are offered; check the
// column order against your bank's current template before uploading.

export const BANK_FORMATS = {
  standard: {
    label: 'Standard (all details)',
    columns: [
      { header: 'Employee ID', value: (r) => r.employeeId },
      { header: 'Beneficiary name', value: (r) => r.name },
      { header: 'Bank name', value: (r) => r.bankName },
      { header: 'Account number', value: (r) => r.account },
      { header: 'IFSC / routing code', value: (r) => r.routing },
      { header: 'Amount', value: (r) => r.amount },
      { header: 'Currency', value: (r) => r.currency },
      { header: 'Payment reference', value: (r) => r.reference },
      { header: 'Narration', value: (r) => r.narration }
    ]
  },
  bulk: {
    label: 'Bulk transfer (account, IFSC, amount)',
    columns: [
      { header: 'Beneficiary Name', value: (r) => r.name },
      { header: 'Beneficiary Account Number', value: (r) => r.account },
      { header: 'IFSC', value: (r) => r.routing },
      { header: 'Amount', value: (r) => r.amount },
      { header: 'Payment Reference', value: (r) => r.reference },
      { header: 'Remarks', value: (r) => r.narration }
    ]
  }
};

const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT = /^[A-Za-z0-9-]{4,34}$/;

// The reason an employee's bank details can't be used for a transfer, or null when they can
export const bankProblem = (sensitive, currency) => {
  const account = String(sensitive?.bankAccount ?? '').trim();
  const routing = String(sensitive?.bankIfsc ?? '').trim().toUpperCase();
  if (!account) return 'No account number';
  if (!ACCOUNT.test(account)) return 'Account number has invalid characters or length';
  if (!routing) return 'No IFSC / routing code';
  if (currency === 'INR' && !IFSC.test(routing)) return 'IFSC code is not valid (expected 4 letters, 0, then 6 letters or digits)';
  return null;
};

// payslips: plain objects ({ userId, net, currency }); users: Map(userId -> { name, employeeId, sensitive }).
// Returns { rows, skipped: [{ userId, name, reason }], total, currency }. Throws when currencies are mixed.
export const buildBankRows = ({ payslips, users, month, label }) => {
  const rows = [];
  const skipped = [];
  for (const slip of payslips) {
    const user = users.get(String(slip.userId));
    const name = user?.name ?? 'Unknown employee';
    if (!user) { skipped.push({ userId: String(slip.userId), name, reason: 'Account no longer exists' }); continue; }
    if (!(slip.net > 0)) { skipped.push({ userId: String(slip.userId), name, reason: 'Net pay is not positive' }); continue; }
    const problem = bankProblem(user.sensitive, slip.currency);
    if (problem) { skipped.push({ userId: String(slip.userId), name, reason: problem }); continue; }
    rows.push({
      userId: String(slip.userId),
      employeeId: user.employeeId ?? '',
      name,
      bankName: user.sensitive.bankName ?? '',
      account: String(user.sensitive.bankAccount).trim(),
      routing: String(user.sensitive.bankIfsc).trim().toUpperCase(),
      amount: (Math.round(slip.net * 100) / 100).toFixed(2),
      currency: slip.currency,
      reference: `SAL-${month}-${user.employeeId || String(slip.userId).slice(-6)}`,
      narration: `${label ?? 'Salary'} ${month}`
    });
  }
  const currencies = [...new Set(rows.map((r) => r.currency))];
  if (currencies.length > 1) throw Object.assign(new Error(`This month has payslips in ${currencies.join(', ')}. A bank file holds one currency: choose one.`), { code: 'MIXED_CURRENCY', currencies });
  const total = Math.round(rows.reduce((sum, r) => sum + Number(r.amount) * 100, 0)) / 100;
  return { rows, skipped, total, currency: currencies[0] ?? null };
};
