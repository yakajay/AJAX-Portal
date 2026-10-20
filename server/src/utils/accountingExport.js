// Turns a month's payslips into one balanced payroll journal entry that an accounting package can import.
//   Dr Salaries expense            (gross pay)
//     Cr Provident fund payable    (PF withheld)
//     Cr Income tax payable        (tax withheld)
//     Cr Other deductions payable  (other deductions)
//     Cr Salaries payable          (net pay owed to employees)
// Live two-way sync with a provider needs that provider's OAuth app and API keys, so this produces the
// import files those packages accept instead.

import { toCsv } from './csv.js';
import { monthBounds } from './dates.js';

export const ACCOUNT_KEYS = ['salaryExpense', 'pfPayable', 'taxPayable', 'otherPayable', 'salariesPayable'];
export const DEFAULT_ACCOUNTS = {
  salaryExpense: 'Salaries & Wages Expense',
  pfPayable: 'Provident Fund Payable',
  taxPayable: 'Income Tax Withheld Payable',
  otherPayable: 'Other Deductions Payable',
  salariesPayable: 'Salaries Payable'
};

export const ACCOUNTING_FORMATS = {
  csv: { label: 'Generic journal (CSV)', ext: 'csv', type: 'text/csv; charset=utf-8' },
  xero: { label: 'Xero manual journal (CSV)', ext: 'csv', type: 'text/csv; charset=utf-8' },
  quickbooks: { label: 'QuickBooks Online journal (CSV)', ext: 'csv', type: 'text/csv; charset=utf-8' },
  tally: { label: 'Tally Prime vouchers (XML)', ext: 'xml', type: 'application/xml; charset=utf-8' }
};

const cents = (n) => Math.round(Number(n || 0) * 100);
const fromCents = (c) => (c / 100).toFixed(2);

export const accountsFor = (settings) => ({ ...DEFAULT_ACCOUNTS, ...Object.fromEntries(Object.entries(settings ?? {}).filter(([k, v]) => ACCOUNT_KEYS.includes(k) && String(v ?? '').trim())) });

// Returns { lines: [{ account, debit, credit, memo }], totals, date }. Amounts are strings with 2 decimals.
// Any cent-level rounding difference is absorbed by the "Salaries payable" line so the entry always balances.
export const buildJournal = ({ payslips, accounts, month }) => {
  const sum = (pick) => payslips.reduce((t, p) => t + cents(pick(p)), 0);
  const gross = sum((p) => p.gross);
  const pf = sum((p) => p.deductions?.pf);
  const tax = sum((p) => p.deductions?.tax);
  const other = sum((p) => p.deductions?.other);
  const net = gross - pf - tax - other;
  const memo = `Payroll ${month}`;
  const lines = [
    { account: accounts.salaryExpense, debit: fromCents(gross), credit: '', memo },
    { account: accounts.pfPayable, debit: '', credit: fromCents(pf), memo },
    { account: accounts.taxPayable, debit: '', credit: fromCents(tax), memo },
    { account: accounts.otherPayable, debit: '', credit: fromCents(other), memo },
    { account: accounts.salariesPayable, debit: '', credit: fromCents(net), memo }
  ].filter((l) => cents(l.debit) || cents(l.credit));
  return { lines, date: monthBounds(month).end, totals: { gross: fromCents(gross), pf: fromCents(pf), tax: fromCents(tax), other: fromCents(other), net: fromCents(net), reportedNet: fromCents(sum((p) => p.net)) } };
};

const xml = (s) => String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);

export const renderJournal = (format, { lines, date, currency, narration, entity }) => {
  const signed = (l) => (l.debit ? Number(l.debit) : -Number(l.credit)).toFixed(2);
  if (format === 'xero') {
    return toCsv(lines, [
      { header: '*Narration', value: () => narration },
      { header: '*Date', value: () => date },
      { header: 'Description', value: (l) => l.memo },
      { header: '*AccountCode', value: (l) => l.account },
      { header: '*TaxRate', value: () => 'Tax Exempt' },
      { header: '*Amount', value: signed },
      { header: 'TaxAmount', value: () => '0.00' }
    ]);
  }
  if (format === 'quickbooks') {
    return toCsv(lines, [
      { header: 'JournalNo', value: () => narration },
      { header: 'JournalDate', value: () => date },
      { header: 'AccountName', value: (l) => l.account },
      { header: 'Debits', value: (l) => l.debit },
      { header: 'Credits', value: (l) => l.credit },
      { header: 'Description', value: (l) => l.memo },
      { header: 'Currency', value: () => currency }
    ]);
  }
  if (format === 'tally') {
    // Tally: debit entries are "deemed positive" with a negative amount; credits are positive
    const entries = lines.map((l) => `        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>${xml(l.account)}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>${l.debit ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>
          <AMOUNT>${l.debit ? `-${l.debit}` : l.credit}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>`).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME>${entity ? `<STATICVARIABLES><SVCURRENTCOMPANY>${xml(entity)}</SVCURRENTCOMPANY></STATICVARIABLES>` : ''}</REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Journal" ACTION="Create">
            <DATE>${date.replace(/-/g, '')}</DATE>
            <VOUCHERTYPENAME>Journal</VOUCHERTYPENAME>
            <NARRATION>${xml(narration)}</NARRATION>
${entries}
          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>
`;
  }
  return toCsv(lines, [
    { header: 'Date', value: () => date },
    { header: 'Account', value: (l) => l.account },
    { header: 'Debit', value: (l) => l.debit },
    { header: 'Credit', value: (l) => l.credit },
    { header: 'Description', value: (l) => l.memo },
    { header: 'Currency', value: () => currency }
  ]);
};
