import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { connectTestDb, disconnectTestDb } from './helpers/db.js';
import { api, makeUser, makeAdmin, makeSuperAdmin, inTenant } from './helpers/fixtures.js';
import { SalaryStructure } from '../src/models/salary.model.js';
import { Expense } from '../src/models/expense.model.js';
import { Session } from '../src/models/session.model.js';
import { summarizeAttendance } from '../src/utils/attendanceReport.js';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);

const iso = (offsetDays) => new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);

describe('overtime', () => {
  it('counts hours beyond the standard day as overtime', () => {
    const entries = [
      { status: 'Present', checkInAt: new Date('2026-03-02T09:00:00Z'), checkOutAt: new Date('2026-03-02T19:30:00Z') },
      { status: 'Present', checkInAt: new Date('2026-03-03T09:00:00Z'), checkOutAt: new Date('2026-03-03T16:00:00Z') }
    ];
    const s = summarizeAttendance(entries, { timeZone: 'UTC', month: '2026-03', standardHours: 8 });
    expect(s.days.map((d) => d.overtime)).toEqual([2.5, 0]);
    expect(s.overtimeHours).toBe(2.5);
    expect(summarizeAttendance(entries, { timeZone: 'UTC', month: '2026-03', standardHours: 10 }).overtimeHours).toBe(0.5);
  });
});

describe('exports and reports', () => {
  it('exports employees as CSV for permitted admins only', async () => {
    const admin = await makeAdmin();
    const user = await makeUser();
    await makeUser({ name: '=cmd()', employeeId: 'E-9' });
    await api().get('/api/admin/users/export').set(user.auth).expect(403);
    const res = await api().get('/api/admin/users/export').set(admin.auth).expect(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.text).toContain('Employee ID,Name,Email');
    expect(res.text).toContain("'=cmd()"); // spreadsheet formulas are neutralised
  });

  it('builds workforce, payroll and leave reports', async () => {
    const admin = await makeAdmin();
    const w = await api().get('/api/admin/reports/workforce').set(admin.auth).expect(200);
    expect(w.body.headcount).toBeGreaterThan(0);
    expect(w.body.trend).toHaveLength(12);
    const csv = await api().get('/api/admin/reports/workforce?format=csv').set(admin.auth).expect(200);
    expect(csv.text).toContain('Month,Joiners,Leavers');
    await api().get('/api/admin/reports/payroll?from=2026-05&to=2026-01').set(admin.auth).expect(400);
    const p = await api().get('/api/admin/reports/payroll').set(admin.auth).expect(200);
    expect(p.body.months).toEqual([]);
    await api().get('/api/admin/payroll/payslips/export?month=nope').set(admin.auth).expect(400);
    await api().get('/api/admin/payroll/payslips/export?month=2026-01').set(admin.auth).expect(200);
    const l = await api().get('/api/admin/reports/leave?year=2026').set(admin.auth).expect(200);
    expect(l.body).toMatchObject({ year: '2026', totalDays: 0 });
  });
});

describe('offboarding', () => {
  it('takes a resignation, approves it, and settles full and final pay', async () => {
    const hr = await makeSuperAdmin();
    const emp = await makeUser({ joinDate: '2024-01-01' });
    const post = (body) => api().post('/api/user/exits').set(emp.auth).send(body);

    await post({ reason: '', requestedLastDay: iso(10) }).expect(400);
    await post({ reason: 'Moving', requestedLastDay: '2020-01-01' }).expect(400);
    const exit = (await post({ reason: 'Moving abroad', requestedLastDay: iso(10) }).expect(201)).body;
    await post({ reason: 'Again', requestedLastDay: iso(10) }).expect(409);

    // employees cannot reach the admin side; nobody reviews their own request
    await api().get('/api/admin/exits').set(emp.auth).expect(403);
    await api().put(`/api/admin/exits/${exit.id}/review`).set(emp.auth).send({ status: 'Approved' }).expect(403);

    await api().put(`/api/admin/exits/${exit.id}/review`).set(hr.auth).send({ status: 'Maybe' }).expect(400);
    // approved with a last day in the past so it can be settled
    const approved = await api().put(`/api/admin/exits/${exit.id}/review`).set(hr.auth).send({ status: 'Approved', lastWorkingDay: iso(-1) }).expect(200);
    expect(approved.body).toMatchObject({ status: 'Approved', lastWorkingDay: iso(-1) });
    await api().put(`/api/admin/exits/${exit.id}/review`).set(hr.auth).send({ status: 'Rejected' }).expect(409);

    await inTenant(async () => {
      await SalaryStructure.create({ userId: emp.user.id, basic: 30000, hra: 10000, allowances: 5000, pfPercent: 12, taxPercent: 10 });
      await Expense.create({ userId: emp.user.id, title: 'Cab', amount: 500, date: iso(-5), status: 'Approved' });
    });

    const preview = await api().get(`/api/admin/exits/${exit.id}/settlement?leaveEncashmentDays=2&deductions=100`).set(hr.auth).expect(200);
    expect(preview.body.expensesDue).toBe(500);
    expect(preview.body.leaveEncashment).toBeGreaterThan(0);
    expect(preview.body.total).toBeCloseTo(preview.body.salaryDue + preview.body.leaveEncashment + 500 - 100, 2);
    await api().get(`/api/admin/exits/${exit.id}/settlement?deductions=-5`).set(hr.auth).expect(400);
    await api().post(`/api/admin/exits/${exit.id}/settle`).set(hr.auth).send({ leaveEncashmentDays: 999 }).expect(400);

    const done = await api().post(`/api/admin/exits/${exit.id}/settle`).set(hr.auth).send({ leaveEncashmentDays: 2, deductions: 100, note: 'Laptop returned' }).expect(200);
    expect(done.body.status).toBe('Settled');
    expect(done.body.settlement.total).toBeCloseTo(preview.body.total, 2);
    await api().post(`/api/admin/exits/${exit.id}/settle`).set(hr.auth).send({}).expect(409);

    // the account is locked, sessions are gone and approved claims are paid out
    await api().get('/api/user/profile').set(emp.auth).expect(401);
    await inTenant(async () => {
      expect(await Session.countDocuments({ userId: emp.user.id, revokedAt: null })).toBe(0);
      expect((await Expense.findOne({ userId: emp.user.id })).status).toBe('Reimbursed');
    });
  });

  it('refuses to settle before the last working day, and lets a resignation be withdrawn', async () => {
    const hr = await makeSuperAdmin();
    const emp = await makeUser();
    const exit = (await api().post('/api/user/exits').set(emp.auth).send({ reason: 'x', requestedLastDay: iso(5) }).expect(201)).body;
    await api().put(`/api/admin/exits/${exit.id}/review`).set(hr.auth).send({ status: 'Approved' }).expect(200);
    await api().post(`/api/admin/exits/${exit.id}/settle`).set(hr.auth).send({}).expect(409);
    await api().delete(`/api/user/exits/${exit.id}`).set(emp.auth).expect(200);
    await api().delete(`/api/user/exits/${exit.id}`).set(emp.auth).expect(409);
    expect((await api().get('/api/user/exits').set(emp.auth).expect(200)).body[0].status).toBe('Withdrawn');
  });

  it('lets HR start a termination directly', async () => {
    const hr = await makeSuperAdmin();
    const emp = await makeUser();
    await api().post('/api/admin/exits').set(hr.auth).send({ userId: emp.user.id, type: 'Resignation', lastWorkingDay: iso(3) }).expect(400);
    await api().post('/api/admin/exits').set(hr.auth).send({ userId: hr.user.id, type: 'Termination', lastWorkingDay: iso(3) }).expect(403);
    const res = await api().post('/api/admin/exits').set(hr.auth).send({ userId: emp.user.id, type: 'Termination', reason: 'Policy', lastWorkingDay: iso(3) }).expect(201);
    expect(res.body).toMatchObject({ status: 'Approved', type: 'Termination' });
  });
});
