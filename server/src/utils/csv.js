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

// Minimal CSV reader (RFC 4180: quoted cells, doubled quotes, newlines inside quotes). Returns an array of
// rows, each an array of strings; blank lines are skipped. A leading BOM is ignored.
export const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  const src = String(text).replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { value += '"'; i++; }
      else if (ch === '"') quoted = false;
      else value += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(value); value = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(value); value = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else value += ch;
  }
  row.push(value);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
};
