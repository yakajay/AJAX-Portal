import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { connectTestDb, disconnectTestDb } from './helpers/db.js';
import { makeUser, makeAdmin, makeSuperAdmin, makeCompany } from './helpers/fixtures.js';
import { checkPayroll, percentChange, previousMonth } from '../src/utils/payrollChecks.js';
import { buildBankRows, bankProblem } from '../src/utils/bankExport.js';
import { buildJournal, renderJournal, accountsFor } from '../src/utils/accountingExport.js';
import { validateComplianceSettings, obligationsFor, filingCalendar, evaluateChecks } from '../src/utils/compliance.js';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);

const slip = (userId, net, extra = {}) => ({ userId, gross: net + 200, net, totalDeductions: 200, deductions: { pf: 100, tax: 80, other: 20 }, currency: 'INR', ...extra });
const users = (...names) => new Map(names.map((n) => [n, { name: n, locked: false, hasBank: true }]));

describe('payroll checks against the previous run', () => {
  it('computes the previous month and percentage changes', () => {
    expect(previousMonth('2026-01')).toBe('2025-12');
    expect(previousMonth('2026-03')).toBe('2026-02');
    expect(percentChange(100, 130)).toBe(30);
    expect(percentChange(0, 5)).toBe(100);
    expect(percentChange(0, 0)).toBe(0);
  });

  it('flags big swings, missing people, new people and impossible payslips', () => {
    const map = users('a', 'b', 'c', 'd', 'e');
    map.get('d').locked = true;
    map.get('e').hasBank = false;
    const { findings, summary } = checkPayroll({
      current: [slip('a', 1500), slip('b', 1000), slip('e', 1000), { ...slip('c', 500), net: -5, totalDeductions: 900 }],
      previous: [slip('a', 1000), slip('b', 1000), slip('d', 1000), slip('x', 1000), slip('f', 1000)],
      users: map, structureUserIds: ['g']
    });
    const codes = (id) => findings.filter((f) => f.userId === id).map((f) => f.code);
    expect(codes('a')).toEqual(expect.arrayContaining(['net_changed', 'gross_changed']));
    expect(codes('b')).toEqual([]);
    expect(codes('c')).toEqual(expect.arrayContaining(['non_positive_net', 'deductions_exceed_gross', 'first_payslip']));
    expect(codes('d')).toEqual(['left_payroll']);
    expect(codes('e')).toEqual(expect.arrayContaining(['missing_bank_details', 'first_payslip']));
    expect(codes('x')).toEqual(['removed_employee']);
    expect(summary.errors).toBe(2);
    expect(findings[0].severity).toBe('error'); // errors sort first
  });

  it('flags someone paid last month who has no payslip now', () => {
    const { findings } = checkPayroll({ current: [], previous: [slip('a', 1000)], users: users('a') });
    expect(findings).toMatchObject([{ code: 'missing_payslip', severity: 'warning' }]);
  });
});

describe('bank payment file rows', () => {
  const sensitive = { bankName: 'HDFC', bankAccount: '50100123456789', bankIfsc: 'hdfc0001234' };
  const people = new Map([
    ['a', { name: 'Asha', employeeId: 'E1', sensitive }],
    ['b', { name: 'Bo', employeeId: 'E2', sensitive: { bankAccount: '', bankIfsc: '' } }],
    ['c', { name: 'Cy', employeeId: 'E3', sensitive: { ...sensitive, bankIfsc: 'BAD' } }]
  ]);

  it('validates bank details', () => {
    expect(bankProblem(sensitive, 'INR')).toBeNull();
    expect(bankProblem({ bankAccount: '12', bankIfsc: 'HDFC0001234' }, 'INR')).toMatch(/Account number/);
    expect(bankProblem({ bankAccount: '12345678', bankIfsc: 'BAD' }, 'INR')).toMatch(/IFSC/);
    expect(bankProblem({ bankAccount: '12345678', bankIfsc: 'ABCD1234' }, 'USD')).toBeNull(); // routing formats differ abroad
  });

  it('builds rows for payable people and lists the rest with a reason', () => {
    const out = buildBankRows({ payslips: [slip('a', 1234.5), slip('b', 10), slip('c', 10), slip('z', 10)], users: people, month: '2026-09' });
    expect(out.rows).toEqual([expect.objectContaining({ name: 'Asha', account: '50100123456789', routing: 'HDFC0001234', amount: '1234.50', reference: 'SAL-2026-09-E1', narration: 'Salary 2026-09' })]);
    expect(out.skipped.map((s) => [s.name, s.reason.split(' ')[0]])).toEqual([['Bo', 'No'], ['Cy', 'IFSC'], ['Unknown employee', 'Account']]);
    expect(out.total).toBe(1234.5);
  });

  it('refuses a file that mixes currencies', () => {
    expect(() => buildBankRows({ payslips: [slip('a', 5), { ...slip('a', 5), currency: 'USD' }], users: people, month: '2026-09' })).toThrow(/INR, USD/);
  });
});

describe('accounting journal', () => {
  const slips = [slip('a', 1000.1), slip('b', 2000.2)];
  const journal = buildJournal({ payslips: slips, accounts: accountsFor({ salaryExpense: '6000' }), month: '2026-09' });

  it('balances and posts gross, withholdings and net', () => {
    const debit = journal.lines.reduce((t, l) => t + Number(l.debit || 0), 0);
    const credit = journal.lines.reduce((t, l) => t + Number(l.credit || 0), 0);
    expect(debit.toFixed(2)).toBe(credit.toFixed(2));
    expect(journal.lines[0]).toMatchObject({ account: '6000', debit: '3400.30' });
    expect(journal.lines.at(-1)).toMatchObject({ account: 'Salaries Payable', credit: '3000.30' });
    expect(journal.date).toBe('2026-09-30');
  });

  it('renders each format', () => {
    const input = { ...journal, currency: 'INR', narration: 'Payroll September 2026', entity: 'Acme <Pvt> & Co' };
    expect(renderJournal('csv', input).split('\r\n')[0]).toBe('Date,Account,Debit,Credit,Description,Currency');
    const xero = renderJournal('xero', input).split('\r\n');
    expect(xero[1]).toContain('3400.30');
    expect(xero[2]).toContain('-200.00'); // credits are negative in Xero
    expect(renderJournal('quickbooks', input)).toContain('JournalNo,JournalDate,AccountName,Debits,Credits');
    const tally = renderJournal('tally', input);
    expect(tally).toContain('<DATE>20260930</DATE>');
    expect(tally).toContain('<AMOUNT>-3400.30</AMOUNT>'); // debit entry is negative in Tally
    expect(tally).toContain('Acme &lt;Pvt&gt; &amp; Co');
  });

  it('keeps blank or default account names on the defaults', () => {
    expect(accountsFor({ salaryExpense: '  ', pfPayable: 'PF-2100' })).toMatchObject({ salaryExpense: 'Salaries & Wages Expense', pfPayable: 'PF-2100' });
  });
});

describe('compliance rules and filing calendar', () => {
  it('validates settings', () => {
    expect(validateComplianceSettings({ minimumWage: { amount: -1 } }).error).toMatch(/minimum wage/);
    expect(validateComplianceSettings({ noticePeriodDays: 1.5 }).error).toMatch(/whole number/);
    expect(validateComplianceSettings({ filings: [{ name: 'X', frequency: 'weekly', dueDay: 1 }] }).error).toMatch(/monthly, quarterly or yearly/);
    expect(validateComplianceSettings({ filings: [{ name: 'X', frequency: 'yearly', dueDay: 1 }] }).error).toMatch(/due month/);
    const { settings } = validateComplianceSettings({ filings: [{ name: 'PF return', frequency: 'monthly', dueDay: 15 }, { name: 'PF return', frequency: 'monthly', dueDay: 20 }] }, '2026-10-20');
    expect(settings.filings.map((f) => f.key)).toEqual(['pf-return', 'pf-return-2']);
    expect(settings.filings[0].since).toBe('2026-10-20');
  });

  it('builds due dates and does not list deadlines before the tracking start as overdue', () => {
    const monthly = { key: 'pf', name: 'PF', frequency: 'monthly', dueDay: 31, since: '2026-08-01' };
    const periods = obligationsFor(monthly, '2026-10-20').map((o) => [o.period, o.dueDate]);
    expect(periods[0]).toEqual(['2026-07', '2026-08-31']); // dueDay clamps to month end where needed
    expect(periods).toContainEqual(['2026-09', '2026-10-31']);
    expect(periods.every(([, due]) => due >= '2026-08-01')).toBe(true);
    expect(obligationsFor({ key: 'q', name: 'Q', frequency: 'quarterly', dueDay: 30 }, '2026-10-20').map((o) => o.period)).toContain('2026-Q3');
    expect(obligationsFor({ key: 'y', name: 'Y', frequency: 'yearly', dueDay: 30, dueMonth: 6 }, '2026-10-20')).toEqual([expect.objectContaining({ period: '2025', dueDate: '2026-06-30' })]);

    const done = new Map([['pf|2026-07', { completedAt: new Date(), completedByName: 'Ann' }]]);
    const cal = filingCalendar({ filings: [monthly], done, todayIso: '2026-10-20' });
    expect(cal.find((o) => o.period === '2026-07')).toMatchObject({ status: 'done', completedBy: 'Ann' });
    expect(cal.find((o) => o.period === '2026-08')).toMatchObject({ status: 'overdue' });
    expect(cal.find((o) => o.period === '2026-09')).toMatchObject({ status: 'upcoming', daysLeft: 11 });
  });

  it('checks people data against the configured rules', () => {
    const people = [
      { id: 'a', name: 'A', locked: false, joinDate: '2024-01-01', hasBank: true, hasGovernmentId: true, hasTaxId: true },
      { id: 'b', name: 'B', locked: false, joinDate: null, hasBank: false, hasGovernmentId: false, hasTaxId: false },
      { id: 'c', name: 'C', locked: true, joinDate: null, hasBank: false, hasGovernmentId: false, hasTaxId: false }
    ];
    const checks = evaluateChecks({
      people, todayIso: '2026-10-20',
      structures: [{ userId: 'a', currency: 'INR', gross: 9000 }, { userId: 'b', currency: 'INR', gross: 30000 }, { userId: 'c', currency: 'INR', gross: 100 }],
      exits: [
        { userId: 'c', status: 'Approved', type: 'Resignation', createdAt: new Date('2026-08-01'), lastWorkingDay: '2026-08-10' },
        { userId: 'a', status: 'Approved', type: 'Resignation', createdAt: new Date('2026-10-18'), lastWorkingDay: '2026-10-25' }
      ],
      overtime: new Map([['a', 60]]),
      settings: { requireGovernmentId: true, minimumWage: { amount: 15000, currency: 'INR' }, noticePeriodDays: 30, settlementDays: 30, maxMonthlyOvertimeHours: 40 }
    });
    const items = (id) => checks.find((c) => c.id === id)?.items.map((i) => i.name);
    expect(items('no_salary_structure')).toEqual([]);
    expect(items('missing_bank')).toEqual(['B']);
    expect(items('missing_join_date')).toEqual(['B']); // locked accounts are ignored
    expect(items('missing_government_id')).toEqual(['B']);
    expect(checks.find((c) => c.id === 'missing_tax_id')).toBeUndefined(); // only checked when required
    expect(items('below_minimum_wage')).toEqual(['A']);
    expect(items('settlement_overdue')).toEqual(['C']);
    expect(items('short_notice')).toEqual(['C', 'A']);
    expect(items('overtime_limit')).toEqual(['A']);
  });
});

describe('payroll controls API', () => {
  const setup = async (slug) => {
    const co = await makeCompany(slug);
    const admin = await makeAdmin({}, co.company);
    const emp = await makeUser({ name: 'Asha', employeeId: 'E1' }, co.company);
    const nobank = await makeUser({ name: 'Bo' }, co.company);
    for (const [u, basic] of [[emp, 10000], [nobank, 8000]]) {
      await co.api().put(`/api/admin/payroll/structures/${u.user.id}`).set(admin.auth).send({ basic, hra: 0, allowances: 0, pfPercent: 10, taxPercent: 10 }).expect(200);
    }
    await co.api().put(`/api/admin/users/${emp.user.id}/sensitive`).set(admin.auth).send({ bankName: 'HDFC', bankAccount: '50100123456789', bankIfsc: 'HDFC0001234' }).expect(200);
    return { co, admin, emp, nobank };
  };

  it('compares a run with the previous month and flags changes', async () => {
    const { co, admin, emp } = await setup('chk');
    await co.api().post('/api/admin/payroll/run-monthly').set(admin.auth).send({ month: '2025-04' }).expect(201);
    await co.api().put(`/api/admin/payroll/structures/${emp.user.id}`).set(admin.auth).send({ basic: 20000 }).expect(200);
    await co.api().post('/api/admin/payroll/run-monthly').set(admin.auth).send({ month: '2025-05' }).expect(201);
    const res = await co.api().get('/api/admin/payroll/checks?month=2025-05').set(admin.auth).expect(200);
    expect(res.body).toMatchObject({ previousMonth: '2025-04', previousRunFound: true });
    expect(res.body.findings.filter((f) => f.userId === emp.user.id).map((f) => f.code)).toEqual(expect.arrayContaining(['net_changed', 'gross_changed']));
    expect(res.body.findings.some((f) => f.code === 'missing_bank_details')).toBe(true);
    await co.api().get('/api/admin/payroll/checks?month=bad').set(admin.auth).expect(400);
    await co.api().get('/api/admin/payroll/checks?month=2025-05').set((await makeUser({}, co.company)).auth).expect(403);
  });

  it('exports a bank file for people with valid details, skips the rest, and audits the download', async () => {
    const { co, admin, emp } = await setup('bank');
    await co.api().post('/api/admin/payroll/run-monthly').set(admin.auth).send({ month: '2025-04' }).expect(201);
    const preview = await co.api().get('/api/admin/payroll/bank-export/preview?month=2025-04').set(admin.auth).expect(200);
    expect(preview.body).toMatchObject({ ready: 1, currency: 'INR' });
    expect(preview.body.skipped).toEqual([expect.objectContaining({ name: 'Bo', reason: 'No account number' })]);
    expect(JSON.stringify(preview.body)).not.toContain('50100123456789'); // the preview never carries account numbers

    const file = await co.api().get('/api/admin/payroll/bank-export?month=2025-04&format=bulk').set(admin.auth).expect(200);
    expect(file.headers['content-type']).toMatch(/text\/csv/);
    expect(file.headers['x-skipped-count']).toBe('1');
    expect(file.text).toContain('Beneficiary Name,Beneficiary Account Number,IFSC,Amount');
    expect(file.text).toContain('Asha,50100123456789,HDFC0001234,8000.00,SAL-2025-04-E1'); // 10000 less 10% PF and 10% tax
    const log = await co.api().get('/api/admin/audit').set((await makeSuperAdmin({}, co.company)).auth).expect(200);
    const entry = JSON.stringify(log.body).includes('payroll.bank_export');
    expect(entry).toBe(true);
    expect(JSON.stringify(log.body)).not.toContain('50100123456789'); // counts are logged, never account numbers

    await co.api().get('/api/admin/payroll/bank-export?month=2025-04&format=nope').set(admin.auth).expect(400);
    await co.api().get('/api/admin/payroll/bank-export?month=2025-09').set(admin.auth).expect(409);
    await co.api().get('/api/admin/payroll/bank-export?month=2025-04').set(emp.auth).expect(403);

    // once marked paid it drops out unless asked for again
    await co.api().post('/api/admin/payroll/payslips/mark-paid').set(admin.auth).send({ month: '2025-04' }).expect(200);
    await co.api().get('/api/admin/payroll/bank-export?month=2025-04').set(admin.auth).expect(409);
    await co.api().get('/api/admin/payroll/bank-export?month=2025-04&includePaid=true').set(admin.auth).expect(200);
  });

  it('exports a balanced accounting journal using the saved account names', async () => {
    const { co, admin } = await setup('acct');
    await co.api().post('/api/admin/payroll/run-monthly').set(admin.auth).send({ month: '2025-04' }).expect(201);
    const saved = await co.api().put('/api/admin/payroll/accounting').set(admin.auth).send({ accounts: { salaryExpense: '6100', pfPayable: 'Provident Fund Payable' }, entityName: 'Acme Corp' }).expect(200);
    expect(saved.body.accounts).toMatchObject({ salaryExpense: '6100', pfPayable: 'Provident Fund Payable', taxPayable: 'Income Tax Withheld Payable' });
    const preview = await co.api().get('/api/admin/payroll/accounting-export/preview?month=2025-04').set(admin.auth).expect(200);
    expect(preview.body.lines[0]).toMatchObject({ account: '6100', debit: '18000.00' });
    const tally = await co.api().get('/api/admin/payroll/accounting-export?month=2025-04&format=tally').set(admin.auth).expect(200);
    expect(tally.headers['content-type']).toMatch(/xml/);
    expect(tally.text).toContain('<SVCURRENTCOMPANY>Acme Corp</SVCURRENTCOMPANY>');
    await co.api().get('/api/admin/payroll/accounting-export?month=2025-04&format=sage').set(admin.auth).expect(400);
    await co.api().get('/api/admin/payroll/accounting-export?month=2024-01').set(admin.auth).expect(409);
  });

  it('manages compliance rules, reports findings and tracks filings', async () => {
    const { co, admin } = await setup('comp');
    await co.api().put('/api/admin/compliance/settings').set(admin.auth).send({ minimumWage: { amount: -5 } }).expect(400);
    const saved = await co.api().put('/api/admin/compliance/settings').set(admin.auth).send({
      requireTaxId: true, minimumWage: { amount: 9000, currency: 'INR' },
      filings: [{ name: 'PF return', frequency: 'monthly', dueDay: 15, since: '2025-01-01' }]
    }).expect(200);
    expect(saved.body.filings[0]).toMatchObject({ key: 'pf-return', since: '2025-01-01' });
    const report = await co.api().get('/api/admin/compliance').set(admin.auth).expect(200);
    const ids = report.body.checks.filter((c) => c.items.length).map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(['missing_bank', 'missing_tax_id', 'below_minimum_wage']));
    expect(report.body.summary.errors).toBeGreaterThan(0);
    const due = report.body.filings.find((f) => f.status === 'overdue');
    expect(due).toBeTruthy();

    await co.api().post('/api/admin/compliance/filings').set(admin.auth).send({ key: 'nope', period: due.period }).expect(404);
    await co.api().post('/api/admin/compliance/filings').set(admin.auth).send({ key: due.key, period: 'junk' }).expect(400);
    await co.api().post('/api/admin/compliance/filings').set(admin.auth).send({ key: due.key, period: due.period, note: 'Challan 123' }).expect(200);
    const after = (await co.api().get('/api/admin/compliance').set(admin.auth).expect(200)).body.filings.find((f) => f.period === due.period);
    expect(after).toMatchObject({ status: 'done', doneNote: 'Challan 123', completedBy: admin.user.name });
    await co.api().post('/api/admin/compliance/filings').set(admin.auth).send({ key: due.key, period: due.period, done: false }).expect(200);
    expect((await co.api().get('/api/admin/compliance').set(admin.auth).expect(200)).body.filings.find((f) => f.period === due.period).status).toBe('overdue');
  });

  it('manages employer records and scopes the bank file to one', async () => {
    const { co, admin, emp, nobank } = await setup('ent');
    const user = await makeUser({}, co.company);
    await co.api().get('/api/admin/entities').set(user.auth).expect(403);
    await co.api().post('/api/admin/entities').set(admin.auth).send({}).expect(400);
    await co.api().post('/api/admin/entities').set(admin.auth).send({ name: 'X', country: 'India' }).expect(400);
    const india = (await co.api().post('/api/admin/entities').set(admin.auth).send({ name: 'Acme India Pvt Ltd', country: 'in', registrationNumber: 'U12345', payrollBank: { bankName: 'ICICI', account: '000123456789', routing: 'ICIC0000001' } }).expect(201)).body;
    expect(india).toMatchObject({ country: 'IN', isDefault: true, currency: 'INR', payrollBank: { accountLast4: '6789', accountSet: true } });
    expect(JSON.stringify(india)).not.toContain('000123456789');
    const us = (await co.api().post('/api/admin/entities').set(admin.auth).send({ name: 'Acme US Inc', country: 'US', currency: 'usd' }).expect(201)).body;
    expect(us.isDefault).toBe(false);
    await co.api().post('/api/admin/entities').set(admin.auth).send({ name: 'Acme US Inc' }).expect(409);

    await co.api().put('/api/admin/entities/assign').set(admin.auth).send({ entityId: india.id, userIds: [emp.user.id] }).expect(200);
    await co.api().put('/api/admin/entities/assign').set(admin.auth).send({ entityId: us.id, userIds: [nobank.user.id] }).expect(200);
    await co.api().put('/api/admin/entities/assign').set(admin.auth).send({ entityId: india.id, userIds: [] }).expect(400);
    const list = (await co.api().get('/api/admin/entities').set(admin.auth).expect(200)).body;
    expect(list.map((e) => [e.name, e.employeeCount])).toEqual([['Acme India Pvt Ltd', 1], ['Acme US Inc', 1]]);

    await co.api().put(`/api/admin/entities/${india.id}`).set(admin.auth).send({ active: false }).expect(409); // the default can't be deactivated
    await co.api().put(`/api/admin/entities/${us.id}`).set(admin.auth).send({ isDefault: true }).expect(200);
    await co.api().put(`/api/admin/entities/${india.id}`).set(admin.auth).send({ active: false }).expect(200);
    await co.api().put('/api/admin/entities/assign').set(admin.auth).send({ entityId: india.id, userIds: [emp.user.id] }).expect(409);

    await co.api().post('/api/admin/payroll/run-monthly').set(admin.auth).send({ month: '2025-04' }).expect(201);
    const forUs = await co.api().get(`/api/admin/payroll/bank-export/preview?month=2025-04&entityId=${us.id}`).set(admin.auth).expect(200);
    expect(forUs.body).toMatchObject({ ready: 0 });
    const forIndia = await co.api().get(`/api/admin/payroll/bank-export/preview?month=2025-04&entityId=${india.id}`).set(admin.auth).expect(200);
    expect(forIndia.body).toMatchObject({ ready: 1 });
  });
});
