import { describe, expect, it, vi } from 'vitest';
import { errorMessage, formatDate, money, monthLabel, timeAgo } from './format';

describe('format helpers', () => {
  it('formats money and calendar dates without timezone drift', () => {
    expect(money(1234.5)).toBe('$1,234.50');
    expect(formatDate('2026-10-05')).toBe('Oct 5, 2026');
    expect(formatDate('2026-01-01T00:00:00.000Z')).toBe('Jan 1, 2026');
    expect(formatDate(null)).toBe('—');
    expect(monthLabel('2026-02')).toBe('February 2026');
  });

  it('describes elapsed time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-13T12:00:00Z'));
    expect(timeAgo('2026-10-13T11:59:50Z')).toBe('just now');
    expect(timeAgo('2026-10-13T11:30:00Z')).toBe('30 min ago');
    expect(timeAgo('2026-10-13T09:00:00Z')).toBe('3 h ago');
    expect(timeAgo('2026-10-10T12:00:00Z')).toBe('3 d ago');
    vi.useRealTimers();
  });

  it('extracts an error message', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage('weird', 'fallback')).toBe('fallback');
  });
});
