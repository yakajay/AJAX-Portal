import { describe, it, expect } from 'vitest';
import { hotp, totp, verifyTotp, base32Encode, base32Decode, generateSecret, otpauthUrl } from '../src/utils/totp.js';
import { hasPermission, findInvalidPermission } from '../src/utils/permissions.js';
import { toCsv } from '../src/utils/csv.js';
import { labelToIso, workingDays, monthBounds, isValidIso, isValidMonth, addDays, overlaps } from '../src/utils/dates.js';
import { leaveBalances } from '../src/utils/leavePolicy.js';
import { computePayslip, buildPayslipPdf } from '../src/utils/payroll.js';
import { summarizeAttendance, checkClockPolicy, localMinutes } from '../src/utils/attendanceReport.js';
import { daysUntilNext } from '../src/controllers/announcement.controller.js';
import { buildOpenApi, collectRoutes } from '../src/docs/openapi.js';
import { slaDueAt } from '../src/models/ticket.model.js';

describe('totp', () => {
  // RFC 4226 appendix D test vectors for the secret "12345678901234567890"
  const secret = base32Encode(Buffer.from('12345678901234567890'));
  it('matches the RFC 4226 HOTP vectors', () => {
    expect([0, 1, 2, 3, 4].map((c) => hotp(secret, c))).toEqual(['755224', '287082', '359152', '969429', '338314']);
  });
  it('matches the RFC 6238 TOTP vector at T=59s (last 6 digits)', () => {
    expect(totp(secret, 59_000)).toBe('287082');
  });
  it('round-trips base32', () => {
    const bytes = Buffer.from('hello world, this is totp');
    expect(base32Decode(base32Encode(bytes)).equals(bytes)).toBe(true);
  });
  it('accepts +-1 step of drift but not more, and rejects junk', () => {
    const now = 1_700_000_000_000;
    const code = totp(secret, now);
    expect(verifyTotp(secret, code, now)).toBe(true);
    expect(verifyTotp(secret, code, now + 30_000)).toBe(true);
    expect(verifyTotp(secret, code, now + 90_000)).toBe(false);
    expect(verifyTotp(secret, 'abcdef', now)).toBe(false);
    expect(verifyTotp(secret, undefined, now)).toBe(false);
  });
  it('builds an otpauth url', () => {
    const s = generateSecret();
    expect(s).toMatch(/^[A-Z2-7]{32}$/);
    expect(otpauthUrl({ secret: s, account: 'a@b.co', issuer: 'YakFlow' })).toContain(`secret=${s}`);
  });
});

describe('permissions', () => {
  const admin = (permissions) => ({ role: 'ADMIN', permissions });
  it('super admin can do everything', () => expect(hasPermission({ role: 'SUPER_ADMIN', permissions: '' }, 'payroll', 'delete')).toBe(true));
  it('global tokens apply to every module', () => {
    expect(hasPermission(admin('read,write'), 'payroll', 'write')).toBe(true);
    expect(hasPermission(admin('read,write'), 'payroll', 'delete')).toBe(false);
  });
  it('module tokens only apply to that module', () => {
    const a = admin('read,payroll:write');
    expect(hasPermission(a, 'payroll', 'write')).toBe(true);
    expect(hasPermission(a, 'users', 'write')).toBe(false);
    expect(hasPermission(a, 'users', 'read')).toBe(true);
  });
  it('write implies read for that module, wildcard covers all actions', () => {
    expect(hasPermission(admin('hr:write'), 'hr', 'read')).toBe(true);
    expect(hasPermission(admin('hr:write'), 'payroll', 'read')).toBe(false);
    expect(hasPermission(admin('hr:*'), 'hr', 'delete')).toBe(true);
    expect(hasPermission(admin('all'), 'anything', 'delete')).toBe(true);
  });
  it('validates tokens', () => {
    expect(findInvalidPermission('read,write,payroll:write,users:*')).toBeNull();
    expect(findInvalidPermission('read,payroll:fly')).toBe('payroll:fly');
    expect(findInvalidPermission('bogus:read')).toBe('bogus:read');
  });
});

describe('csv', () => {
  it('quotes and escapes, and neutralises spreadsheet formulas', () => {
    const csv = toCsv([{ a: 'x,y', b: '=SUM(A1)', c: 'say "hi"', d: -5 }], [
      { header: 'a', value: (r) => r.a }, { header: 'b', value: (r) => r.b }, { header: 'c', value: (r) => r.c }, { header: 'd', value: (r) => r.d }
    ]);
    expect(csv).toBe('a,b,c,d\r\n"x,y",\'=SUM(A1),"say ""hi""",-5\r\n');
  });
});

describe('dates', () => {
  it('parses holiday labels', () => expect(labelToIso('Oct 2, 2026')).toBe('2026-10-02'));
  it('counts working days, excluding weekends and holidays', () => {
    expect(workingDays('2026-10-05', '2026-10-11')).toBe(5);
    expect(workingDays('2026-10-05', '2026-10-11', new Set(['2026-10-07']))).toBe(4);
    expect(workingDays('2026-10-10', '2026-10-11')).toBe(0);
  });
  it('computes month bounds and validates', () => {
    expect(monthBounds('2026-02')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(monthBounds('2028-02').end).toBe('2028-02-29');
    expect(isValidIso('2026-02-30')).toBe(false);
    expect(isValidMonth('2026-13')).toBe(false);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(overlaps('2026-01-01', '2026-01-05', '2026-01-05', '2026-01-09')).toBe(true);
    expect(overlaps('2026-01-01', '2026-01-04', '2026-01-05', '2026-01-09')).toBe(false);
  });
});

describe('leave balances', () => {
  const leave = (type, startDate, days, status = 'Approved') => ({ type, startDate, endDate: startDate, days, status });
  it('accrues annual leave monthly and gives sick/casual upfront', () => {
    const b = Object.fromEntries(leaveBalances([], '2030-06-15').map((x) => [x.type, x]));
    expect(b['Annual Leave'].accrued).toBe(12.5); // 15 * 6/12 = 7.5, plus 5 carried forward from an unused year
    expect(b['Sick Leave'].accrued).toBe(10);
    expect(b['Casual Leave'].remaining).toBe(7);
  });
  it('gives no carry-forward to people who joined this year', () => {
    const b = leaveBalances([], '2030-06-15', { joinDate: '2030-02-01' }).find((x) => x.type === 'Annual Leave');
    expect(b.carriedForward).toBe(0);
    expect(b.accrued).toBe(7.5);
  });
  it('carries unused annual leave forward, capped at 5', () => {
    const b = leaveBalances([leave('Annual Leave', '2029-03-01', 4)], '2030-01-10').find((x) => x.type === 'Annual Leave');
    expect(b.carriedForward).toBe(5); // 15 - 4 = 11 unused, capped at 5
    const b2 = leaveBalances([leave('Annual Leave', '2029-03-01', 13)], '2030-01-10').find((x) => x.type === 'Annual Leave');
    expect(b2.carriedForward).toBe(2);
  });
  it('subtracts taken and pending, and ignores rejected/cancelled', () => {
    const leaves = [leave('Sick Leave', '2030-02-01', 2), leave('Sick Leave', '2030-03-01', 1, 'Pending'), leave('Sick Leave', '2030-04-01', 5, 'Rejected'), leave('Sick Leave', '2030-05-01', 3, 'Cancelled')];
    const b = leaveBalances(leaves, '2030-06-01').find((x) => x.type === 'Sick Leave');
    expect(b).toMatchObject({ total: 10, taken: 2, pending: 1, remaining: 7 });
  });
  it('supports half days', () => {
    const b = leaveBalances([leave('Casual Leave', '2030-02-01', 0.5)], '2030-06-01').find((x) => x.type === 'Casual Leave');
    expect(b.remaining).toBe(6.5);
  });
});

describe('payslip computation', () => {
  const structure = { basic: 4000, hra: 1000, allowances: 500, pfPercent: 12, taxPercent: 10, otherDeductions: 50 };
  it('computes gross, deductions and net', () => {
    const p = computePayslip(structure, { workingDays: 20 });
    expect(p.gross).toBe(5500);
    expect(p.deductions).toEqual({ pf: 480, tax: 550, other: 50 });
    expect(p.totalDeductions).toBe(1080);
    expect(p.net).toBe(4420);
  });
  it('prorates for unpaid leave', () => {
    const p = computePayslip(structure, { workingDays: 20, unpaidLeaveDays: 5 });
    expect(p.paidDays).toBe(15);
    expect(p.earnings.basic).toBe(3000);
    expect(p.gross).toBe(4125);
  });
  it('never goes negative', () => {
    expect(computePayslip({ ...structure, otherDeductions: 99999 }, { workingDays: 20 }).net).toBe(0);
  });
  it('renders a PDF', async () => {
    const slip = { month: '2030-02', currency: 'USD', ...computePayslip(structure, { workingDays: 20 }) };
    const pdf = await buildPayslipPdf(slip, { name: 'Ada', email: 'ada@x.co', department: 'Eng' });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
  });
});

describe('attendance report', () => {
  const at = (iso) => new Date(iso);
  const entry = (a, b, status = 'Present') => ({ checkInAt: at(a), checkOutAt: b ? at(b) : null, status });
  it('reads local wall-clock time in the given timezone', () => {
    expect(localMinutes(at('2030-03-04T04:00:00Z'), 'Asia/Kolkata')).toBe(9 * 60 + 30);
    expect(localMinutes(at('2030-03-04T04:00:00Z'), 'UTC')).toBe(4 * 60);
  });
  it('flags late and early-out days and totals hours', () => {
    const s = summarizeAttendance(
      [
        entry('2030-03-04T09:00:00Z', '2030-03-04T18:00:00Z'), // on time, 9h
        entry('2030-03-05T10:15:00Z', '2030-03-05T16:45:00Z'), // late + early out, 6.5h
        entry('2030-03-06T09:00:00Z', '2030-03-06T12:00:00Z', 'Rejected'), // ignored
        entry('2030-03-07T09:00:00Z', '2030-03-07T11:00:00Z', 'Regularization Pending') // ignored
      ],
      { timeZone: 'UTC', month: '2030-03' }
    );
    expect(s.daysPresent).toBe(2);
    expect(s.totalHours).toBe(15.5);
    expect(s.lateDays).toBe(1);
    expect(s.earlyOutDays).toBe(1);
    expect(s.avgHours).toBe(7.8);
  });
  it('groups split sessions into one day', () => {
    const s = summarizeAttendance([entry('2030-03-04T09:00:00Z', '2030-03-04T12:00:00Z'), entry('2030-03-04T13:00:00Z', '2030-03-04T18:00:00Z')], { timeZone: 'UTC', month: '2030-03' });
    expect(s.daysPresent).toBe(1);
    expect(s.totalHours).toBe(8);
    expect(s.days[0].lastOut.toISOString()).toBe('2030-03-04T18:00:00.000Z');
  });
  it('does not mark an open session as early out', () => {
    const s = summarizeAttendance([entry('2030-03-04T09:00:00Z', null)], { timeZone: 'UTC', month: '2030-03' });
    expect(s.days[0].earlyOut).toBe(false);
  });
});

describe('clock-in policy', () => {
  const none = { allowedIps: [], office: null };
  const office = { lat: 12.9716, lng: 77.5946, radiusMeters: 300 };
  it('is open when unconfigured', () => expect(checkClockPolicy({ ip: '1.2.3.4' }, none).ok).toBe(true));
  it('allows listed IPs (including IPv4-mapped IPv6 and prefixes)', () => {
    const policy = { allowedIps: ['203.0.113.'], office: null };
    expect(checkClockPolicy({ ip: '::ffff:203.0.113.9' }, policy).ok).toBe(true);
    expect(checkClockPolicy({ ip: '198.51.100.1' }, policy).ok).toBe(false);
  });
  it('enforces the geofence', () => {
    const policy = { allowedIps: [], office };
    expect(checkClockPolicy({ ip: '1.1.1.1' }, policy).ok).toBe(false); // no location
    expect(checkClockPolicy({ ip: '1.1.1.1', location: { lat: 12.9717, lng: 77.5947 } }, policy).ok).toBe(true);
    const far = checkClockPolicy({ ip: '1.1.1.1', location: { lat: 13.1, lng: 77.6 } }, policy);
    expect(far.ok).toBe(false);
    expect(far.message).toMatch(/from the office/);
  });
  it('accepts either the IP or the geofence when both are configured', () => {
    const policy = { allowedIps: ['10.0.0.'], office };
    expect(checkClockPolicy({ ip: '10.0.0.7' }, policy).ok).toBe(true);
    expect(checkClockPolicy({ ip: '8.8.8.8', location: office }, policy).ok).toBe(true);
  });
});

describe('misc', () => {
  it('computes days until the next birthday', () => {
    const today = new Date('2030-03-10T12:00:00Z');
    expect(daysUntilNext('1990-03-10', today)).toBe(0);
    expect(daysUntilNext('1990-03-13', today)).toBe(3);
    expect(daysUntilNext('1990-03-09', today)).toBe(364);
    expect(daysUntilNext(null, today)).toBeNull();
  });
  it('derives the SLA due time from priority', () => {
    const created = new Date('2030-01-01T00:00:00Z');
    expect(slaDueAt(created, 'Urgent').toISOString()).toBe('2030-01-01T04:00:00.000Z');
    expect(slaDueAt(created, 'Low').toISOString()).toBe('2030-01-06T00:00:00.000Z');
  });
});

describe('openapi', () => {
  it('documents every route exactly once', () => {
    const routes = collectRoutes();
    const doc = buildOpenApi();
    const documented = Object.values(doc.paths).reduce((n, p) => n + Object.keys(p).length, 0);
    expect(documented).toBe(routes.length + 3); // + health, ready, metrics
    expect(routes.length).toBeGreaterThan(100);
  });
  it('marks protected routes with bearer auth and public ones without', () => {
    const { paths } = buildOpenApi();
    expect(paths['/auth/login'].post.security).toBeUndefined();
    expect(paths['/auth/logout'].post.security).toBeDefined();
    expect(paths['/user/leaves'].get.security).toBeDefined();
    expect(paths['/admin/payroll/run-monthly'].post.description).toContain('payroll:write');
  });
});
