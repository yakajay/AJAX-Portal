import { dayKey } from './time.js';
import { env } from '../config/env.js';

// Entries that don't count as time worked
export const NOT_COUNTED = ['Rejected', 'Regularization Pending'];

const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

// Minutes since local midnight of an instant in the given timezone
export const localMinutes = (date, timeZone) => {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return get('hour') * 60 + get('minute');
};

const round1 = (n) => Math.round(n * 10) / 10;

// One employee's month: per-day first in / last out / hours, plus late and early-out flags
export const summarizeAttendance = (entries, { timeZone, month, lateAfter = env.attendance.lateAfter, earlyBefore = env.attendance.earlyBefore, standardHours = env.attendance.standardHours }) => {
  const byDay = new Map();
  for (const entry of entries) {
    if (NOT_COUNTED.includes(entry.status)) continue;
    const day = dayKey(entry.checkInAt, timeZone);
    if (!day.startsWith(month)) continue;
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(entry);
  }

  const days = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, list]) => {
      const firstIn = list.reduce((min, e) => (e.checkInAt < min ? e.checkInAt : min), list[0].checkInAt);
      const closed = list.filter((e) => e.checkOutAt);
      const lastOut = closed.length ? closed.reduce((max, e) => (e.checkOutAt > max ? e.checkOutAt : max), closed[0].checkOutAt) : null;
      const hours = closed.reduce((sum, e) => sum + (e.checkOutAt - e.checkInAt) / 3600000, 0);
      return {
        date,
        firstIn,
        lastOut,
        hours: round1(hours),
        overtime: round1(Math.max(0, hours - standardHours)),
        late: localMinutes(firstIn, timeZone) > toMinutes(lateAfter),
        // Only judged once the day is closed out; a still-open session isn't "early"
        earlyOut: !!lastOut && closed.length === list.length && localMinutes(lastOut, timeZone) < toMinutes(earlyBefore)
      };
    });

  const totalHours = round1(days.reduce((sum, d) => sum + d.hours, 0));
  return {
    month,
    daysPresent: days.length,
    totalHours,
    overtimeHours: round1(days.reduce((sum, d) => sum + d.overtime, 0)),
    avgHours: days.length ? round1(totalHours / days.length) : 0,
    lateDays: days.filter((d) => d.late).length,
    earlyOutDays: days.filter((d) => d.earlyOut).length,
    days
  };
};

// --- Clock-in restrictions (office IP and/or geofence). Unrestricted unless configured. ---
const normalizeIp = (ip = '') => ip.replace(/^::ffff:/, '');

const distanceMeters = (a, b) => {
  const rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
};

export const validLocation = (loc) =>
  loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng) && Math.abs(loc.lat) <= 90 && Math.abs(loc.lng) <= 180;

// Returns { ok } or { ok: false, message }. Either an allowed IP or being inside the geofence is enough.
export const checkClockPolicy = ({ ip, location }, policy = env.attendance) => {
  const hasIpRule = policy.allowedIps.length > 0;
  const hasGeoRule = !!policy.office;
  if (!hasIpRule && !hasGeoRule) return { ok: true };

  const clean = normalizeIp(ip);
  if (hasIpRule && policy.allowedIps.some((allowed) => clean === allowed || clean.startsWith(allowed))) return { ok: true };

  if (hasGeoRule) {
    if (!validLocation(location)) {
      return { ok: false, message: 'Location access is required to clock in. Allow location in your browser and try again.' };
    }
    const metres = distanceMeters(location, policy.office);
    if (metres <= policy.office.radiusMeters) return { ok: true };
    return { ok: false, message: `You are ${Math.round(metres)} m from the office. Clock-in is limited to ${policy.office.radiusMeters} m.` };
  }
  return { ok: false, message: 'Clock-in is only allowed from the office network.' };
};
