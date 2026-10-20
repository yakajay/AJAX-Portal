const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const fromMinutes = (n) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;

// Returns { data } or { error }. Overnight shifts (ending after midnight) aren't supported yet.
export const readShift = (body) => {
  const name = String(body.name ?? '').trim();
  if (!name || name.length > 60) return { error: 'A shift name (up to 60 characters) is required.' };
  const { startTime, endTime } = body;
  if (!HHMM.test(startTime ?? '') || !HHMM.test(endTime ?? '')) return { error: 'Start and end times must look like 09:00.' };
  if (toMinutes(endTime) <= toMinutes(startTime)) return { error: 'A shift must end after it starts, on the same day.' };
  const graceMinutes = body.graceMinutes === undefined || body.graceMinutes === '' ? 0 : Number(body.graceMinutes);
  if (!Number.isInteger(graceMinutes) || graceMinutes < 0 || graceMinutes > 240) return { error: 'Grace period must be a whole number of minutes (0-240).' };
  return { data: { name, startTime, endTime, graceMinutes } };
};

// The late / early-out thresholds a shift implies; undefined means "use the company defaults"
export const shiftThresholds = (shift) =>
  shift ? { lateAfter: fromMinutes(Math.min(toMinutes(shift.startTime) + (shift.graceMinutes || 0), 1439)), earlyBefore: shift.endTime, standardHours: (toMinutes(shift.endTime) - toMinutes(shift.startTime)) / 60 } : {};
