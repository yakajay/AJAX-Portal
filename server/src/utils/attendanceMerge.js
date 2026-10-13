import { dayKey } from './time.js';

// Entries that are real attendance. Pending/rejected corrections are requests, not records, so they are left alone.
const MERGEABLE = (e) => e.status === 'Present';

/**
 * Plans how to collapse several same-day entries per person into one (earliest clock-in to latest
 * clock-out, in `timeZone`). Pure: returns what to do, changes nothing.
 * Returns [{ userId, day, keepId, removeIds, checkInAt, checkOutAt }] for days with 2+ entries.
 */
export const planMerges = (entries, timeZone) => {
  const groups = new Map();
  for (const e of entries.filter(MERGEABLE)) {
    const key = `${e.userId}|${dayKey(e.checkInAt, timeZone)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }

  const plans = [];
  for (const [key, list] of groups) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => a.checkInAt - b.checkInAt);
    const keep = sorted[0];
    // A still-open session means the day isn't finished: keep it open rather than invent a clock-out
    const open = sorted.some((e) => !e.checkOutAt);
    const checkOutAt = open ? null : sorted.reduce((max, e) => (e.checkOutAt > max ? e.checkOutAt : max), sorted[0].checkOutAt);
    const [userId, day] = key.split('|');
    plans.push({ userId, day, keepId: keep.id, removeIds: sorted.slice(1).map((e) => e.id), checkInAt: keep.checkInAt, checkOutAt });
  }
  return plans;
};
