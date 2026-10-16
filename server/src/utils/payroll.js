import PDFDocument from 'pdfkit';
import { monthLabel } from './dates.js';
import { itemAmount, monthlyTax } from './payrollTax.js';
import { drawLetterhead } from './letterhead.js';

const round2 = (n) => Math.round(n * 100) / 100;

// Pays for `paidDays` of `workingDays`: unpaid leave reduces every earning proportionally.
// PF is a % of (prorated) basic. Income tax follows the company's slabs when it has set any
// (`taxPolicy`), otherwise the employee's flat % of (prorated) gross. `structure.deductionItems` are
// extra named deductions; they are summed into `deductions.other` and itemised in `deductionItems`.
export const computePayslip = (structure, { workingDays, unpaidLeaveDays = 0 }, taxPolicy = null) => {
  const paidDays = Math.max(workingDays - unpaidLeaveDays, 0);
  const ratio = workingDays > 0 ? paidDays / workingDays : 0;
  const earnings = {
    basic: round2(structure.basic * ratio),
    hra: round2(structure.hra * ratio),
    allowances: round2(structure.allowances * ratio)
  };
  const gross = round2(earnings.basic + earnings.hra + earnings.allowances);

  const items = structure.deductionItems || [];
  const itemLines = items.map((item) => ({ name: item.name, amount: itemAmount(item, { basic: earnings.basic, gross }) }));
  const otherFixed = round2(structure.otherDeductions || 0);
  const itemsTotal = round2(itemLines.reduce((sum, l) => sum + l.amount, 0));

  const useSlabs = taxPolicy?.slabs?.length > 0;
  const tax = useSlabs
    ? monthlyTax(
        taxPolicy,
        { fullBasic: structure.basic, fullGross: structure.basic + structure.hra + structure.allowances, pfPercent: structure.pfPercent, items },
        ratio
      )
    : round2((gross * structure.taxPercent) / 100);

  const deductions = {
    pf: round2((earnings.basic * structure.pfPercent) / 100),
    tax,
    other: round2(otherFixed + itemsTotal)
  };
  const totalDeductions = round2(deductions.pf + deductions.tax + deductions.other);
  return {
    earnings,
    deductions,
    deductionItems: [...itemLines, ...(otherFixed > 0 ? [{ name: 'Other deductions', amount: otherFixed }] : [])],
    taxMethod: useSlabs ? 'slabs' : 'flat',
    gross,
    totalDeductions,
    net: round2(Math.max(gross - totalDeductions, 0)),
    workingDays,
    paidDays,
    unpaidLeaveDays
  };
};

// INR uses Indian digit grouping (₹1,23,456.00); other currencies use US formatting
export const formatMoney = (amount, currency = 'INR') =>
  new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency }).format(amount);

// Renders a one-page payslip and resolves with the PDF bytes. A company letterhead replaces the text header.
export const buildPayslipPdf = (payslip, employee, company = 'YakFlow', letterhead = null) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `Payslip ${payslip.month}`, Author: company } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const money = (n) => formatMoney(n, payslip.currency);
    const left = 50;
    const right = 545;

    const bannerBottom = drawLetterhead(doc, letterhead);
    // With a letterhead the banner carries the company's identity; the payslip title sits just below it
    const top = bannerBottom === null ? 50 : Math.round(bannerBottom) + 20;
    if (bannerBottom === null) doc.fontSize(20).font('Helvetica-Bold').text(company, left, top);
    doc.fontSize(10).font('Helvetica').fillColor('#555').text('Payslip', left, top + 25);
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#000').text(monthLabel(payslip.month), left, top, { align: 'right', width: right - left });
    doc.moveTo(left, top + 50).lineTo(right, top + 50).strokeColor('#ccc').stroke();

    doc.fontSize(10).font('Helvetica').fillColor('#000');
    const info = [
      ['Employee', employee.name],
      ['Email', employee.email],
      ['Department', employee.department || '-'],
      ['Designation', employee.designation || '-'],
      ['Working days', String(payslip.workingDays)],
      ['Paid days', String(payslip.paidDays)]
    ];
    let y = top + 65;
    info.forEach(([label, value], i) => {
      const x = i % 2 === 0 ? left : 310;
      if (i % 2 === 0 && i > 0) y += 18;
      doc.font('Helvetica-Bold').text(`${label}:`, x, y, { continued: true }).font('Helvetica').text(` ${value}`);
    });
    y += 40;

    const table = (title, rows, startY) => {
      doc.font('Helvetica-Bold').fontSize(11).text(title, left, startY);
      doc.moveTo(left, startY + 16).lineTo(right, startY + 16).strokeColor('#ccc').stroke();
      let rowY = startY + 24;
      doc.font('Helvetica').fontSize(10);
      for (const [label, value] of rows) {
        doc.text(label, left, rowY);
        doc.text(money(value), left, rowY, { align: 'right', width: right - left });
        rowY += 18;
      }
      return rowY;
    };

    y = table('Earnings', [['Basic', payslip.earnings.basic], ['House rent allowance', payslip.earnings.hra], ['Other allowances', payslip.earnings.allowances], ['Gross earnings', payslip.gross]], y);
    const lines = payslip.deductionItems?.length
      ? payslip.deductionItems.map((l) => [l.name, l.amount])
      : [['Other deductions', payslip.deductions.other]];
    y = table('Deductions', [['Provident fund', payslip.deductions.pf], ['Income tax', payslip.deductions.tax], ...lines, ['Total deductions', payslip.totalDeductions]], y + 12);

    doc.rect(left, y + 14, right - left, 36).fillColor('#eef4ff').fill();
    doc.fillColor('#000').font('Helvetica-Bold').fontSize(13).text('Net pay', left + 10, y + 25);
    doc.text(money(payslip.net), left, y + 25, { align: 'right', width: right - left - 10 });

    doc.font('Helvetica').fontSize(8).fillColor('#777').text('This is a system-generated payslip and does not require a signature.', left, 760, { align: 'center', width: right - left });
    doc.end();
  });

