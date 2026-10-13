// Calendar-date helpers. Leave/holiday dates are plain `YYYY-MM-DD` strings (no timezone).
export const isoDate = (date) => date.toISOString().slice(0, 10);
export const parseIso = (iso) => new Date(`${iso}T00:00:00Z`);
export const isValidIso = (iso) =>
  typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso) && !Number.isNaN(parseIso(iso).getTime()) && isoDate(parseIso(iso)) === iso;
export const isValidMonth = (month) => typeof month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(month);

// "Oct 2, 2026" (the label format holidays are stored in) -> "2026-10-02"
export const labelToIso = (label) => {
  const t = Date.parse(`${label} UTC`);
  return Number.isNaN(t) ? null : isoDate(new Date(t));
};

export const addDays = (iso, n) => isoDate(new Date(parseIso(iso).getTime() + n * 86400000));

export function* eachDay(startIso, endIso) {
  for (let d = startIso; d <= endIso; d = addDays(d, 1)) yield d;
}

export const isWeekend = (iso) => [0, 6].includes(parseIso(iso).getUTCDay());

export const workingDays = (startIso, endIso, holidays = new Set()) => {
  let count = 0;
  for (const d of eachDay(startIso, endIso)) if (!isWeekend(d) && !holidays.has(d)) count++;
  return count;
};

export const monthBounds = (month) => {
  const start = `${month}-01`;
  const next = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1));
  return { start, end: addDays(isoDate(next), -1) };
};

export const currentMonth = (now = new Date()) => isoDate(now).slice(0, 7);

export const monthLabel = (month) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export const overlaps = (aStart, aEnd, bStart, bEnd) => aStart <= bEnd && bStart <= aEnd;
