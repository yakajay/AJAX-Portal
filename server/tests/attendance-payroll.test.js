import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { connectTestDb, disconnectTestDb } from './helpers/db.js';
import { api, makeUser, makeAdmin, makeSuperAdmin, addHoliday } from './helpers/fixtures.js';
import { Attendance } from '../src/models/attendance.model.js';
import { Payslip } from '../src/models/salary.model.js';
import { Transaction } from '../src/models/transaction.model.js';
import { env } from '../src/config/env.js';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);

describe('attendance', () => {
  const original = { allowedIps: env.attendance.allowedIps, office: env.attendance.office };
  afterEach(() => Object.assign(env.attendance, original));

  it('clocks in and out, and refuses a double check-in', async () => {
    const me = await makeUser();
    const inRes = await api().post('/api/user/attendance/check-in').set(me.auth).send({ location: { lat: 12.97, lng: 77.59, accuracy: 20 } }).expect(201);
    expect(inRes.body.location).toMatchObject({ lat: 12.97, lng: 77.59 });
    await api().post('/api/user/attendance/check-in').set(me.auth).expect(409);
    await api().post('/api/user/attendance/check-out').set(me.auth).expect(200);
  });

  it('enforces the geofence and IP allow-list when configured', async () => {
    const me = await makeUser();
    env.attendance.office = { lat: 12.9716, lng: 77.5946, radiusMeters: 300 };
    await api().post('/api/user/attendance/check-in').set(me.auth).expect(403);
    const far = await api().post('/api/user/attendance/check-in').set(me.auth).send({ location: { lat: 28.6, lng: 77.2 } }).expect(403);
    expect(far.body.message).toMatch(/from the office/);
    await api().post('/api/user/attendance/check-in').set(me.auth).send({ location: { lat: 12.9717, lng: 77.5947 } }).expect(201);
    await api().post('/api/user/attendance/check-out').set(me.auth).expect(200);

    env.attendance.office = null;
    env.attendance.allowedIps = ['203.0.113.'];
    await api().post('/api/user/attendance/check-in').set(me.auth).expect(403); // supertest connects from loopback
    env.attendance.allowedIps = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
    await api().post('/api/user/attendance/check-in').set(me.auth).expect(201);
  });

  it('summarizes a month and exports it as CSV', async () => {
    const me = await makeUser();
    const base = '2031-02';
    await Attendance.create([
      { userId: me.user.id, checkInAt: new Date(`${base}-03T09:00:00Z`), checkOutAt: new Date(`${base}-03T18:00:00Z`) },
      { userId: me.user.id, checkInAt: new Date(`${base}-04T10:30:00Z`), checkOutAt: new Date(`${base}-04T16:00:00Z`) },
      { userId: me.user.id, checkInAt: new Date(`${base}-05T09:00:00Z`), checkOutAt: new Date(`${base}-05T18:00:00Z`), status: 'Rejected' }
    ]);
    const summary = await api().get(`/api/user/attendance/summary?month=${base}&tz=UTC`).set(me.auth).expect(200);
    expect(summary.body).toMatchObject({ daysPresent: 2, totalHours: 14.5, lateDays: 1, earlyOutDays: 1 });

    const csv = await api().get(`/api/user/attendance/export?month=${base}&tz=UTC`).set(me.auth).expect(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.headers['content-disposition']).toContain('attendance-2031-02.csv');
    expect(csv.text.split('\r\n').filter(Boolean)).toHaveLength(3); // header + 2 days
    await api().get('/api/user/attendance/summary?month=2031-99').set(me.auth).expect(400);
  });

  it('regularization: employee requests, manager or admin decides, notifications flow', async () => {
    const manager = await makeUser();
    const admin = await makeAdmin();
    const me = await makeUser({ managerId: manager.user.id });
    const stranger = await makeUser();
    const body = { kind: 'regularize', checkInAt: '2025-01-07T09:00:00Z', checkOutAt: '2025-01-07T18:00:00Z', reason: 'Forgot to clock in' };

    await api().post('/api/user/attendance/manual').set(me.auth).send({ ...body, reason: '' }).expect(400);
    const created = await api().post('/api/user/attendance/manual').set(me.auth).send(body).expect(201);
    expect(created.body.status).toBe('Regularization Pending');

    const inbox = await api().get('/api/user/notifications').set(manager.auth).expect(200);
    expect(inbox.body.items.some((n) => /correction/.test(n.title))).toBe(true);

    // pending entries do not count as present
    const before = await api().get('/api/user/attendance/summary?month=2025-01&tz=UTC').set(me.auth).expect(200);
    expect(before.body.daysPresent).toBe(0);

    expect((await api().get('/api/user/team/regularizations').set(manager.auth).expect(200)).body).toHaveLength(1);
    expect((await api().get('/api/user/team/regularizations').set(stranger.auth).expect(200)).body).toHaveLength(0);
    await api().put(`/api/user/team/regularizations/${created.body.id}`).set(stranger.auth).send({ status: 'Approved' }).expect(404);

    // admins see it too, but not for their own entries
    const all = await api().get('/api/admin/attendance/regularizations').set(admin.auth).expect(200);
    expect(all.body.some((e) => e.id === created.body.id)).toBe(true);

    await api().put(`/api/user/team/regularizations/${created.body.id}`).set(manager.auth).send({ status: 'Approved', note: 'ok' }).expect(200);
    await api().put(`/api/admin/attendance/${created.body.id}/review`).set(admin.auth).send({ status: 'Rejected' }).expect(404); // no longer pending

    const after = await api().get('/api/user/attendance/summary?month=2025-01&tz=UTC').set(me.auth).expect(200);
    expect(after.body.daysPresent).toBe(1);
    const mine = await api().get('/api/user/notifications').set(me.auth).expect(200);
    expect(mine.body.items.some((n) => /approved/.test(n.title))).toBe(true);
  });

  it('admin month report (JSON and CSV) is permission-gated', async () => {
    const admin = await makeAdmin();
    const user = await makeUser();
    await Attendance.create({ userId: user.user.id, checkInAt: new Date('2031-04-01T09:00:00Z'), checkOutAt: new Date('2031-04-01T17:00:00Z') });
    const json = await api().get('/api/admin/attendance/report?month=2031-04&tz=UTC').set(admin.auth).expect(200);
    expect(json.body.rows.find((r) => r.userId === user.user.id)).toMatchObject({ daysPresent: 1, totalHours: 8 });
    const csv = await api().get('/api/admin/attendance/report?month=2031-04&tz=UTC&format=csv').set(admin.auth).expect(200);
    expect(csv.text).toContain('Employee,Department,Days present');
    await api().get('/api/admin/attendance/report').set(user.auth).expect(403);
  });
});

describe('payroll and payslips', () => {
  it('stores salary structures and validates them', async () => {
    const admin = await makeAdmin();
    const emp = await makeUser();
    await api().put(`/api/admin/payroll/structures/${emp.user.id}`).set(admin.auth).send({ basic: -1 }).expect(400);
    await api().put(`/api/admin/payroll/structures/${emp.user.id}`).set(admin.auth).send({ taxPercent: 120 }).expect(400);
    const ok = await api().put(`/api/admin/payroll/structures/${emp.user.id}`).set(admin.auth).send({ basic: 4000, hra: 1000, allowances: 500, pfPercent: 12, taxPercent: 10 }).expect(200);
    expect(ok.body).toMatchObject({ basic: 4000, currency: 'INR' });
    const list = await api().get('/api/admin/payroll/structures').set(admin.auth).expect(200);
    expect(list.body.find((r) => r.user.id === emp.user.id).structure.basic).toBe(4000);
  });

  it('runs a month once, prorates unpaid leave, and lets employees download their PDF', async () => {
    await addHoliday('Mar 19, 2025', 'Payroll holiday'); // Wednesday
    const admin = await makeAdmin();
    const emp = await makeUser();
    const other = await makeUser();
    await api().put(`/api/admin/payroll/structures/${emp.user.id}`).set(admin.auth).send({ basic: 4000, hra: 1000, allowances: 500, pfPercent: 12, taxPercent: 10, otherDeductions: 0 }).expect(200);

    // Mar 2025: 21 weekdays - 1 holiday = 20 working days. Two approved unpaid days.
    const leave = await api().post('/api/user/leaves').set(emp.auth).send({ type: 'Unpaid Leave', startDate: '2025-03-03', endDate: '2025-03-04' }).expect(201);
    await api().put(`/api/admin/leaves/${leave.body.id}`).set(admin.auth).send({ status: 'Approved' }).expect(200);

    await api().post('/api/admin/payroll/run-monthly').set(emp.auth).send({ month: '2025-03' }).expect(403);
    await api().post('/api/admin/payroll/run-monthly').set(admin.auth).send({ month: '2999-01' }).expect(400);
    const run = await api().post('/api/admin/payroll/run-monthly').set(admin.auth).send({ month: '2025-03' }).expect(201);
    expect(run.body.created).toBeGreaterThanOrEqual(1);

    const mine = await api().get('/api/user/payslips').set(emp.auth).expect(200);
    expect(mine.body).toHaveLength(1);
    expect(mine.body[0]).toMatchObject({ month: '2025-03', workingDays: 20, unpaidLeaveDays: 2, paidDays: 18, gross: 4950, status: 'Generated' });
    expect((await api().get('/api/user/payslips').set(other.auth).expect(200)).body).toHaveLength(0);

    // Re-running is idempotent
    const again = await api().post('/api/admin/payroll/run-monthly').set(admin.auth).send({ month: '2025-03' }).expect(200);
    expect(again.body.created).toBe(0);
    expect(await Payslip.countDocuments({ userId: emp.user.id })).toBe(1);

    const pdf = await api().get(`/api/user/payslips/${mine.body[0].id}/pdf`).set(emp.auth).buffer(true).parse((res, cb) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    }).expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.body.subarray(0, 5).toString()).toBe('%PDF-');
    await api().get(`/api/user/payslips/${mine.body[0].id}/pdf`).set(other.auth).expect(404);
    await api().get(`/api/admin/payroll/payslips/${mine.body[0].id}/pdf`).set(admin.auth).expect(200);

    // Mark paid: payslip + ledger entry update, employee notified
    const tx = await Transaction.findOne({ recipient: 'Payroll 2025-03' });
    expect(tx.status).toBe('Processing');
    await api().post('/api/admin/payroll/payslips/mark-paid').set(admin.auth).send({ month: '2025-03' }).expect(200);
    expect((await Transaction.findById(tx.id)).status).toBe('Success');
    expect((await api().get('/api/user/payslips').set(emp.auth)).body[0].status).toBe('Paid');
    const inbox = await api().get('/api/user/notifications').set(emp.auth).expect(200);
    expect(inbox.body.items.some((n) => /payslip is ready/.test(n.title))).toBe(true);
  });

  it('per-module permissions: a payroll-only admin cannot touch users', async () => {
    const payrollOnly = await makeAdmin({ permissions: 'read,payroll:write' });
    const readOnly = await makeAdmin({ permissions: 'read' });
    const superAdmin = await makeSuperAdmin();
    const emp = await makeUser();
    await api().put(`/api/admin/payroll/structures/${emp.user.id}`).set(payrollOnly.auth).send({ basic: 1000 }).expect(200);
    await api().put(`/api/admin/users/${emp.user.id}`).set(payrollOnly.auth).send({ name: 'Nope' }).expect(403);
    await api().put(`/api/admin/payroll/structures/${emp.user.id}`).set(readOnly.auth).send({ basic: 1 }).expect(403);
    await api().get('/api/admin/users').set(readOnly.auth).expect(200);
    await api().put(`/api/admin/users/${emp.user.id}`).set(superAdmin.auth).send({ permissions: 'read,bogus:write' }).expect(400);
    await api().put(`/api/admin/users/${emp.user.id}`).set(superAdmin.auth).send({ permissions: 'read,hr:write' }).expect(200);
  });
});
