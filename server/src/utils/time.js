// Falls back to UTC when the client sends a missing or unknown IANA timezone
export const safeTimeZone = (tz) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
};

// Calendar day (YYYY-MM-DD) of an instant in the given timezone
export const dayKey = (date, timeZone) =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
