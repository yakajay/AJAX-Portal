import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { connectTestDb, disconnectTestDb } from './helpers/db.js';
import { api, makeUser, makeAdmin, makeSuperAdmin, addHoliday, weekdays } from './helpers/fixtures.js';
import { Notification } from './../src/models/notification.model.js';
import { AuditLog } from './../src/models/auditLog.model.js';
import { outbox } from './helpers/setup.js';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);

const [mon, tue, wed, thu, fri] = weekdays('2030-03-04');

describe('applying for leave', () => {
  it('computes days on the server: weekdays only, public holidays excluded', async () => {
    await addHoliday('May 8, 2030', 'Mid-week holiday'); // a Wednesday
    const me = await makeUser();
    const res = await api().post('/api/user/leaves').set(me.auth).send({ type: 'Casual Leave', startDate: '2030-05-06', endDate: '2030-05-12', days: 99, reason: 'trip' }).expect(201);
    expect(res.body.days).toBe(4); // Mon-Fri minus the Wednesday holiday; client-supplied days ignored
    expect(res.body.status).toBe('Pending');
  });

  it('supports half days', async () => {
    const me = await makeUser();
    const res = await api().post('/api/user/leaves').set(me.auth).send({ type: 'Casual Leave', startDate: thu, endDate: thu, halfDay: true, halfDayPart: 'First Half' }).expect(201);
    expect(res.body).toMatchObject({ days: 0.5, halfDay: true, halfDayPart: 'First Half' });
    await api().post('/api/user/leaves').set(me.auth).send({ type: 'Casual Leave', startDate: mon, endDate: tue, halfDay: true, halfDayPart: 'First Half' }).expect(400);
    await api().post('/api/user/leaves').set(me.auth).send({ type: 'Casual Leave', startDate: fri, endDate: fri, halfDay: true }).expect(400);
  });

  it('rejects weekends-only ranges, bad dates, unknown types and overlaps', async () => {
    const me = await makeUser();
    await api().post('/api/user/leaves').set(me.auth).send({ type: 'Casual Leave', startDate: '2030-03-09', endDate: '2030-03-10' }).expect(400);
    await api().post('/api/user/leaves').set(me.auth).send({ type: 'Casual Leave', startDate: 'soon', endDate: 'later' }).expect(400);
    await api().post('/api/user/leaves').set(me.auth).send({ type: 'Casual Leave', startDate: tue, endDate: mon }).expect(400);
    await api().post('/api/user/leaves').set(me.auth).send({ type: 'Sabbatical', startDate: mon, endDate: mon }).expect(400);
    await api().post('/api/user/leaves').set(me.auth).send({ type: 'Casual Leave', startDate: mon, endDate: tue }).expect(201);
    const clash = await api().post('/api/user/leaves').set(me.auth).send({ type: 'Sick Leave', startDate: tue, endDate: wed }).expect(409);
    expect(clash.body.message).toMatch(/overlaps/);
  });

  it('enforces the balance, including monthly accrual of annual leave', async () => {
    const me = await makeUser({ joinDate: '2020-01-01' });
    // Casual Leave: 7 days a year. Ask for 8 consecutive weekdays.
    const over = await api().post('/api/user/leaves').set(me.auth).send({ type: 'Casual Leave', startDate: '2030-04-01', endDate: '2030-04-10' }).expect(400);
    expect(over.body.message).toMatch(/Not enough Casual Leave balance/);
    // Annual leave accrues monthly: in January only 15/12 (+5 carried) is available
    await api().post('/api/user/leaves').set(me.auth).send({ type: 'Annual Leave', startDate: '2030-01-07', endDate: '2030-01-18' }).expect(400);
    await api().post('/api/user/leaves').set(me.auth).send({ type: 'Annual Leave', startDate: '2030-01-07', endDate: '2030-01-11' }).expect(201);
    // Unpaid leave is unlimited
    await api().post('/api/user/leaves').set(me.auth).send({ type: 'Unpaid Leave', startDate: '2030-05-06', endDate: '2030-05-31' }).expect(201);
  });

  it('shows balances with pending days reserved, and lets the employee cancel', async () => {
    const me = await makeUser({ joinDate: '2020-01-01' });
    const created = await api().post('/api/user/leaves').set(me.auth).send({ type: 'Sick Leave', startDate: mon, endDate: tue }).expect(201);
    const bal = await api().get('/api/user/leaves/balance').set(me.auth).expect(200);
    expect(bal.body.map((b) => b.type)).toEqual(['Annual Leave', 'Sick Leave', 'Casual Leave']);
    await api().patch(`/api/user/leaves/${created.body.id}/cancel`).set(me.auth).expect(200);
    await api().patch(`/api/user/leaves/${created.body.id}/cancel`).set(me.auth).expect(409);
    // Cancelled requests no longer block the dates
    await api().post('/api/user/leaves').set(me.auth).send({ type: 'Sick Leave', startDate: mon, endDate: tue }).expect(201);
  });

  it("cannot cancel somebody else's request", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const leave = await api().post('/api/user/leaves').set(a.auth).send({ type: 'Casual Leave', startDate: mon, endDate: mon }).expect(201);
    await api().patch(`/api/user/leaves/${leave.body.id}/cancel`).set(b.auth).expect(404);
  });
});

describe('approvals', () => {
  it('an admin approves: the employee is notified (in-app + email) and it is audited', async () => {
    const admin = await makeAdmin();
    const me = await makeUser();
    const leave = await api().post('/api/user/leaves').set(me.auth).send({ type: 'Casual Leave', startDate: wed, endDate: wed }).expect(201);
    outbox.length = 0;

    await api().put(`/api/admin/leaves/${leave.body.id}`).set(admin.auth).send({ status: 'Approved', note: 'Enjoy' }).expect(200);

    const inbox = await api().get('/api/user/notifications').set(me.auth).expect(200);
    expect(inbox.body.unread).toBeGreaterThan(0);
    expect(inbox.body.items[0].title).toMatch(/approved/);
    expect(outbox.some((m) => m.to === me.user.email && /approved/.test(m.text))).toBe(true);
    expect(await AuditLog.countDocuments({ action: 'leave.approved', entityId: leave.body.id })).toBe(1);
  });

  it('respects the employee opting out of email', async () => {
    const admin = await makeAdmin();
    const me = await makeUser();
    await api().put('/api/user/preferences').set(me.auth).send({ emailNotifications: false }).expect(200);
    const leave = await api().post('/api/user/leaves').set(me.auth).send({ type: 'Casual Leave', startDate: thu, endDate: thu }).expect(201);
    outbox.length = 0;
    await api().put(`/api/admin/leaves/${leave.body.id}`).set(admin.auth).send({ status: 'Rejected' }).expect(200);
    expect(outbox.filter((m) => m.to === me.user.email)).toHaveLength(0);
    expect(await Notification.countDocuments({ userId: me.user.id, title: /rejected/ })).toBe(1);
  });

  it('a manager reviews their direct reports; others cannot', async () => {
    const manager = await makeUser({ department: 'Engineering' });
    const report = await makeUser({ managerId: manager.user.id });
    const stranger = await makeUser();
    const leave = await api().post('/api/user/leaves').set(report.auth).send({ type: 'Casual Leave', startDate: fri, endDate: fri }).expect(201);
    expect(leave.body.approverId).toBe(manager.user.id);

    // the manager is notified
    const inbox = await api().get('/api/user/notifications').set(manager.auth).expect(200);
    expect(inbox.body.items.some((n) => /requested/.test(n.title))).toBe(true);

    const team = await api().get('/api/user/team/leaves').set(manager.auth).expect(200);
    expect(team.body.map((l) => l.id)).toContain(leave.body.id);
    expect((await api().get('/api/user/team/leaves').set(stranger.auth).expect(200)).body).toEqual([]);

    await api().put(`/api/user/team/leaves/${leave.body.id}`).set(stranger.auth).send({ status: 'Approved' }).expect(404);
    await api().put(`/api/user/team/leaves/${leave.body.id}`).set(manager.auth).send({ status: 'Maybe' }).expect(400);
    const done = await api().put(`/api/user/team/leaves/${leave.body.id}`).set(manager.auth).send({ status: 'Approved' }).expect(200);
    expect(done.body.status).toBe('Approved');
    await api().put(`/api/user/team/leaves/${leave.body.id}`).set(manager.auth).send({ status: 'Rejected' }).expect(409);
  });

  it('admins cannot review their own leave or a cancelled one; plain users cannot use admin routes', async () => {
    const admin = await makeAdmin();
    const user = await makeUser();
    const mine = await api().post('/api/user/leaves').set(admin.auth).send({ type: 'Casual Leave', startDate: mon, endDate: mon }).expect(201);
    await api().put(`/api/admin/leaves/${mine.body.id}`).set(admin.auth).send({ status: 'Approved' }).expect(403);

    const theirs = await api().post('/api/user/leaves').set(user.auth).send({ type: 'Casual Leave', startDate: tue, endDate: tue }).expect(201);
    await api().patch(`/api/user/leaves/${theirs.body.id}/cancel`).set(user.auth).expect(200);
    await api().put(`/api/admin/leaves/${theirs.body.id}`).set(admin.auth).send({ status: 'Approved' }).expect(409);
    await api().put(`/api/admin/leaves/${theirs.body.id}`).set(user.auth).send({ status: 'Approved' }).expect(403);
  });
});

describe('holidays endpoint', () => {
  it('adds an ISO date next to the display label', async () => {
    await addHoliday('Dec 25, 2031', 'Xmas');
    const me = await makeUser();
    const res = await api().get('/api/user/holidays').set(me.auth).expect(200);
    expect(res.body.find((h) => h.name === 'Xmas')).toMatchObject({ date: 'Dec 25, 2031', iso: '2031-12-25' });
  });
});

describe('team calendar', () => {
  it('shows who is out and public holidays for a month, without reasons', async () => {
    await addHoliday('Jun 3, 2031', 'Calendar holiday');
    const me = await makeUser();
    const other = await makeUser();
    await api().post('/api/user/leaves').set(me.auth).send({ type: 'Casual Leave', startDate: '2031-06-04', endDate: '2031-06-05', reason: 'secret' }).expect(201);

    const cal = await api().get('/api/user/leaves/calendar?month=2031-06').set(other.auth).expect(200);
    expect(cal.body.leaves.find((l) => l.userId === me.user.id)).toMatchObject({ startDate: '2031-06-04', days: 2, status: 'Pending' });
    expect(JSON.stringify(cal.body)).not.toContain('secret');
    expect(cal.body.holidays).toContainEqual({ date: '2031-06-03', name: 'Calendar holiday' });

    const empty = await api().get('/api/user/leaves/calendar?month=2031-07').set(other.auth).expect(200);
    expect(empty.body.leaves.find((l) => l.userId === me.user.id)).toBeUndefined();
    await api().get('/api/user/leaves/calendar?month=nope').set(other.auth).expect(400);
  });
});

describe('holidays and leave policy (admin)', () => {
  it('lets an admin add and edit holidays, rejects duplicates, and routes deletes through a request', async () => {
    const admin = await makeAdmin();
    const created = await api().post('/api/admin/holidays').set(admin.auth).send({ date: '2031-01-01', name: 'New Year' }).expect(201);
    expect(created.body).toMatchObject({ date: 'Jan 1, 2031', iso: '2031-01-01', name: 'New Year' });
    await api().post('/api/admin/holidays').set(admin.auth).send({ date: '2031-01-01', name: 'Again' }).expect(409);
    await api().post('/api/admin/holidays').set(admin.auth).send({ date: 'nope', name: 'Bad' }).expect(400);
    const edited = await api().put(`/api/admin/holidays/${created.body.id}`).set(admin.auth).send({ date: '2031-01-02', name: 'Day after' }).expect(200);
    expect(edited.body.iso).toBe('2031-01-02');
    await api().delete(`/api/admin/holidays/${created.body.id}`).set(admin.auth).expect(403); // read,write is not enough
    const boss = await makeSuperAdmin();
    const del = await api().delete(`/api/admin/holidays/${created.body.id}`).set(boss.auth).expect(202);
    expect(del.body.status).toBe('Pending');
    const me = await makeUser();
    await api().post('/api/admin/holidays').set(me.auth).send({ date: '2031-02-01', name: 'x' }).expect(403);
  });

  it('applies a custom leave policy to applications', async () => {
    const admin = await makeAdmin();
    const me = await makeUser({ joinDate: '2020-01-01' });
    const policy = [
      { type: 'Study Leave', yearly: 2, accrual: 'upfront', carryForwardMax: 0 },
      { type: 'Unpaid Leave', yearly: null, accrual: 'none' }
    ];
    await api().put('/api/admin/leave-policy').set(admin.auth).send({ policy: [policy[0]] }).expect(400); // Unpaid Leave missing
    await api().put('/api/admin/leave-policy').set(admin.auth).send({ policy }).expect(200);
    const types = await api().get('/api/user/leaves/types').set(me.auth).expect(200);
    expect(types.body.map((t) => t.type)).toEqual(['Study Leave', 'Unpaid Leave']);
    await api().post('/api/user/leaves').set(me.auth).send({ type: 'Casual Leave', startDate: '2030-06-03', endDate: '2030-06-03' }).expect(400);
    await api().post('/api/user/leaves').set(me.auth).send({ type: 'Study Leave', startDate: '2030-06-03', endDate: '2030-06-05' }).expect(400); // 3 > 2
    await api().post('/api/user/leaves').set(me.auth).send({ type: 'Study Leave', startDate: '2030-06-03', endDate: '2030-06-04' }).expect(201);
  });
});

describe('leave balances (admin)', () => {
  it('lists every active employee with their balances and leaves out locked accounts', async () => {
    const admin = await makeAdmin();
    const me = await makeUser({ joinDate: '2020-01-01' });
    const gone = await makeUser({ locked: true });
    await api().get('/api/admin/leave-balances').set(me.auth).expect(403);
    const res = await api().get('/api/admin/leave-balances').set(admin.auth).expect(200);
    const mine = res.body.find((r) => r.userId === me.user.id);
    // Whatever policy the company currently has (earlier tests may have changed it)
    const policy = await api().get('/api/admin/leave-policy').set(admin.auth).expect(200);
    expect(mine.balances.map((b) => b.type)).toEqual(policy.body.filter((p) => p.yearly !== null).map((p) => p.type));
    expect(mine.balances[0]).toMatchObject({ taken: 0, pending: 0 });
    expect(res.body.some((r) => r.userId === gone.user.id)).toBe(false);
  });
});
