// INR uses Indian digit grouping (₹1,23,456.00); other currencies use US formatting
export const money = (amount: number, currency = 'INR') =>
  new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency }).format(amount);

/** "2026-10-05" -> "Oct 5, 2026" (calendar dates carry no timezone, so parse them as UTC). */
export const formatDate = (iso?: string | null, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }) =>
  iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', ...opts }) : '—';

export const formatDateTime = (value?: string | Date | null) =>
  value ? new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

export const monthLabel = (month: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export const currentMonth = () => new Date().toISOString().slice(0, 7);

export const timeAgo = (value: string | Date) => {
  const seconds = Math.max(Math.round((Date.now() - new Date(value).getTime()) / 1000), 0);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  return `${Math.floor(seconds / 86400)} d ago`;
};

export const errorMessage = (error: unknown, fallback = 'Something went wrong') =>
  error instanceof Error ? error.message : fallback;
