// Minimal CSV writer. Cells starting with = + - @ are prefixed with an apostrophe so spreadsheet
// apps don't evaluate them as formulas (CSV injection).
const cell = (value) => {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text) && Number.isNaN(Number(text))) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const toCsv = (rows, columns) =>
  [columns.map((c) => cell(c.header)).join(','), ...rows.map((row) => columns.map((c) => cell(c.value(row))).join(','))].join('\r\n') + '\r\n';

export const sendCsv = (res, filename, rows, columns) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('﻿' + toCsv(rows, columns));
};
