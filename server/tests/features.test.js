import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { connectTestDb, disconnectTestDb } from './helpers/db.js';
import { api, makeUser, makeAdmin, makeSuperAdmin } from './helpers/fixtures.js';
import { outbox } from './helpers/setup.js';
import { Notification } from '../src/models/notification.model.js';
import { SupportTicket } from '../src/models/ticket.model.js';
import { Transaction } from '../src/models/transaction.model.js';
import { contractAlerts, sendDigests } from '../src/jobs.js';
import { addDays, isoDate } from '../src/utils/dates.js';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(() => { outbox.length = 0; });

describe('support tickets', () => {
  it('has priority, SLA, assignment, a comment thread and notifications both ways', async () => {
    const admin = await makeAdmin();
    const agent = await makeAdmin();
    const me = await makeUser();
    const stranger = await makeUser();

    await api().post('/api/user/support/tickets').set(me.auth).send({ subject: 'x', message: 'y', priority: 'Critical' }).expect(400);
    const created = await api().post('/api/user/support/tickets').set(me.auth).send({ subject: 'Laptop broken', message: 'Screen is cracked', priority: 'Urgent', category: 'IT Support' }).expect(201);
    expect(created.body.priority).toBe('Urgent');
    expect(created.body.slaState).toBe('On Track');
    expect(new Date(created.body.dueAt) - new Date(created.body.createdAt)).toBe(4 * 3600 * 1000);
    expect((await api().get('/api/user/notifications').set(admin.auth)).body.items.some((n) => /Urgent ticket/.test(n.title))).toBe(true);

    const id = created.body.id;
    await api().get(`/api/user/support/tickets/${id}`).set(stranger.auth).expect(404);

    // admin assigns, changes priority (SLA recalculated) and replies
    await api().put(`/api/admin/support/tickets/${id}`).set(admin.auth).send({ assigneeId: me.user.id }).expect(400); // not an admin
    const upd = await api().put(`/api/admin/support/tickets/${id}`).set(admin.auth).send({ assigneeId: agent.user.id, priority: 'Low' }).expect(200);
    expect(upd.body.assignee.name).toBe(agent.user.name);
    expect(new Date(upd.body.dueAt) - new Date(upd.body.createdAt)).toBe(120 * 3600 * 1000);
    expect((await api().get('/api/user/notifications').set(agent.auth)).body.items.some((n) => /assigned to you/.test(n.title))).toBe(true);

    await api().post(`/api/admin/support/tickets/${id}/comments`).set(admin.auth).send({ message: '  ' }).expect(400);
    const reply = await api().post(`/api/admin/support/tickets/${id}/comments`).set(admin.auth).send({ message: 'We are on it.' }).expect(201);
    expect(reply.body.status).toBe('In Progress');
    expect(reply.body.comments).toHaveLength(1);
    expect((await api().get('/api/user/notifications').set(me.auth)).body.items.some((n) => /New reply/.test(n.title))).toBe(true);

    // the requester answers, then admin closes; closing notifies and records SLA outcome
    await api().post(`/api/user/support/tickets/${id}/comments`).set(me.auth).send({ message: 'Thanks!' }).expect(201);
    await api().post(`/api/user/support/tickets/${id}/comments`).set(stranger.auth).send({ message: 'hi' }).expect(404);
    const closed = await api().put(`/api/admin/support/tickets/${id}`).set(admin.auth).send({ status: 'Closed' }).expect(200);
    expect(closed.body.slaState).toBe('Met');
    expect(closed.body.comments.map((c) => c.authorRole)).toEqual(['ADMIN', 'USER']);

    // replying to a closed ticket re-opens it
    const reopened = await api().post(`/api/user/support/tickets/${id}/comments`).set(me.auth).send({ message: 'Still broken' }).expect(201);
    expect(reopened.body.status).toBe('Open');
  });

  it('reports breached SLAs and supports the original { status } update', async () => {
    const admin = await makeAdmin();
    const me = await makeUser();
    const t = await SupportTicket.create({ userId: me.user.id, subject: 'Old', message: 'm', priority: 'High', dueAt: new Date(Date.now() - 1000) });
    const list = await api().get('/api/admin/support/tickets?priority=High').set(admin.auth).expect(200);
    expect(list.body.find((x) => x.id === t.id).slaState).toBe('Breached');
    await api().put(`/api/admin/support/tickets/${t.id}`).set(admin.auth).send({ status: 'Bogus' }).expect(400);
    const done = await api().put(`/api/admin/support/tickets/${t.id}`).set(admin.auth).send({ status: 'Closed' }).expect(200);
    expect(done.body.slaState).toBe('Breached');
  });
});

describe('notifications', () => {
  it('lists, marks read, marks all read and deletes - only for the owner', async () => {
    const me = await makeUser();
    const other = await makeUser();
    await Notification.create([
      { userId: me.user.id, type: 't', title: 'one' }, { userId: me.user.id, type: 't', title: 'two' }, { userId: other.user.id, type: 't', title: 'theirs' }
    ]);
    const list = await api().get('/api/user/notifications').set(me.auth).expect(200);
    expect(list.body).toMatchObject({ unread: 2 });
    expect(list.body.items).toHaveLength(2);

    const first = list.body.items[0].id;
    await api().patch(`/api/user/notifications/${first}/read`).set(other.auth).expect(404);
    await api().patch(`/api/user/notifications/${first}/read`).set(me.auth).expect(200);
    expect((await api().get('/api/user/notifications?unread=1').set(me.auth)).body.items).toHaveLength(1);
    await api().patch('/api/user/notifications/read-all').set(me.auth).expect(200);
    expect((await api().get('/api/user/notifications').set(me.auth)).body.unread).toBe(0);
    await api().delete(`/api/user/notifications/${first}`).set(me.auth).expect(200);
    await api().delete(`/api/user/notifications/${first}`).set(me.auth).expect(404);
    await api().patch('/api/user/notifications/not-an-id/read').set(me.auth).expect(404);
  });

  it('sends a digest only to opted-in users, once', async () => {
    const optedIn = await makeUser();
    const optedOut = await makeUser();
    await api().put('/api/user/preferences').set(optedIn.auth).send({ emailDigest: true }).expect(200);
    await Notification.create([{ userId: optedIn.user.id, type: 't', title: 'Digest me' }, { userId: optedOut.user.id, type: 't', title: 'Not me' }]);
    const sent = await sendDigests();
    expect(sent).toBeGreaterThanOrEqual(1);
    const mails = outbox.filter((m) => m.to === optedIn.user.email);
    expect(mails).toHaveLength(1);
    expect(mails[0].text).toContain('Digest me');
    expect(outbox.some((m) => m.to === optedOut.user.email)).toBe(false);
    outbox.length = 0;
    await sendDigests();
    expect(outbox.filter((m) => m.to === optedIn.user.email)).toHaveLength(0);
  });

  it('validates preferences', async () => {
    const me = await makeUser();
    await api().put('/api/user/preferences').set(me.auth).send({ language: 'klingon' }).expect(400);
    const ok = await api().put('/api/user/preferences').set(me.auth).send({ language: 'hi' }).expect(200);
    expect(ok.body.preferences.language).toBe('hi');
  });
});

describe('org structure and announcements', () => {
  it('manages departments and builds the org chart', async () => {
    const admin = await makeAdmin();
    const ceo = await makeUser({ name: 'Chief', designation: 'CEO' });
    const vp = await makeUser({ name: 'VP', managerId: ceo.user.id });
    await makeUser({ name: 'Dev', managerId: vp.user.id });

    const dept = await api().post('/api/admin/departments').set(admin.auth).send({ name: 'Research', description: 'R&D', headId: ceo.user.id }).expect(201);
    expect(dept.body.head.name).toBe('Chief');
    await api().post('/api/admin/departments').set(admin.auth).send({ name: 'Research' }).expect(409);
    await api().post('/api/admin/departments').set(admin.auth).send({ name: '' }).expect(400);
    await api().post('/api/admin/departments').set(ceo.auth).send({ name: 'Nope' }).expect(403);

    await makeUser({ department: 'Research' });
    const list = await api().get('/api/user/departments').set(ceo.auth).expect(200);
    expect(list.body.find((d) => d.name === 'Research').memberCount).toBe(1);
    const sa = await makeSuperAdmin();
    await api().delete(`/api/admin/departments/${dept.body.id}`).set(admin.auth).expect(403); // admins lack delete
    await api().delete(`/api/admin/departments/${dept.body.id}`).set(sa.auth).expect(409); // still has members

    const renamed = await api().put(`/api/admin/departments/${dept.body.id}`).set(admin.auth).send({ name: 'R and D' }).expect(200);
    expect(renamed.body.name).toBe('R and D');
    expect((await api().get('/api/user/departments').set(ceo.auth)).body.find((d) => d.name === 'R and D').memberCount).toBe(1);

    const chart = await api().get('/api/user/org-chart').set(ceo.auth).expect(200);
    const root = chart.body.find((n) => n.id === ceo.user.id);
    expect(root.reports[0].name).toBe('VP');
    expect(root.reports[0].reports[0].name).toBe('Dev');
  });

  it('survives a reporting loop in the org chart', async () => {
    const a = await makeUser({ name: 'LoopA' });
    const b = await makeUser({ name: 'LoopB', managerId: a.user.id });
    const { User } = await import('../src/models/user.model.js');
    await User.updateOne({ _id: a.user.id }, { managerId: b.user.id }); // a <-> b
    const res = await api().get('/api/user/org-chart').set(a.auth).expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('refuses a user who reports to themselves', async () => {
    const sa = await makeSuperAdmin();
    const u = await makeUser();
    await api().put(`/api/admin/users/${u.user.id}`).set(sa.auth).send({ managerId: u.user.id }).expect(400);
  });

  it('posts announcements, notifies everyone, and hides expired ones', async () => {
    const admin = await makeAdmin();
    const me = await makeUser();
    await api().post('/api/admin/announcements').set(me.auth).send({ title: 'a', body: 'b' }).expect(403);
    await api().post('/api/admin/announcements').set(admin.auth).send({ title: '', body: 'b' }).expect(400);
    const post = await api().post('/api/admin/announcements').set(admin.auth).send({ title: 'Office closed Friday', body: 'Plumbing work', pinned: true }).expect(201);
    await api().post('/api/admin/announcements').set(admin.auth).send({ title: 'Old news', body: 'gone', expiresAt: new Date(Date.now() - 1000).toISOString() }).expect(201);

    const visible = await api().get('/api/user/announcements').set(me.auth).expect(200);
    expect(visible.body.map((a) => a.title)).toContain('Office closed Friday');
    expect(visible.body.map((a) => a.title)).not.toContain('Old news');
    expect((await api().get('/api/user/notifications').set(me.auth)).body.items.some((n) => n.title === 'Office closed Friday')).toBe(true);
    expect((await api().get('/api/admin/announcements').set(admin.auth)).body.map((a) => a.title)).toContain('Old news');

    await api().put(`/api/admin/announcements/${post.body.id}`).set(admin.auth).send({ pinned: false }).expect(200);
    await api().delete(`/api/admin/announcements/${post.body.id}`).set(admin.auth).expect(403); // needs delete permission
    const sa = await makeSuperAdmin();
    await api().delete(`/api/admin/announcements/${post.body.id}`).set(sa.auth).expect(200);
  });

  it('feeds upcoming birthdays and anniversaries without revealing birth years', async () => {
    const soon = isoDate(new Date(Date.now() + 2 * 86400000));
    const me = await makeUser();
    const bday = await makeUser({ name: 'Birthday Person', dateOfBirth: `1990${soon.slice(4)}` });
    await makeUser({ name: 'Anniversary Person', joinDate: `2021${soon.slice(4)}` });
    await makeUser({ name: 'Far Away', dateOfBirth: `1990${isoDate(new Date(Date.now() + 100 * 86400000)).slice(4)}` });
    const feed = await api().get('/api/user/feed').set(me.auth).expect(200);
    const b = feed.body.upcoming.find((u) => u.userId === bday.user.id);
    expect(b).toMatchObject({ kind: 'birthday', inDays: 2 });
    expect(b.date).toBe(soon.slice(5)); // month-day only
    expect(feed.body.upcoming.find((u) => u.name === 'Anniversary Person')).toMatchObject({ kind: 'anniversary', years: expect.any(Number) });
    expect(feed.body.upcoming.find((u) => u.name === 'Far Away')).toBeUndefined();
  });
});

describe('performance', () => {
  it('runs a review cycle: self assessment, manager review, closing', async () => {
    const admin = await makeAdmin();
    const manager = await makeUser();
    const me = await makeUser({ managerId: manager.user.id });

    await api().post('/api/admin/performance/cycles').set(admin.auth).send({ name: 'Bad', startDate: '2026-01-01', endDate: '2025-01-01' }).expect(400);
    const cycle = await api().post('/api/admin/performance/cycles').set(admin.auth).send({ name: 'H1', startDate: '2026-01-01', endDate: '2026-06-30' }).expect(201);

    const mine = await api().get('/api/user/performance/reviews').set(me.auth).expect(200);
    expect(mine.body).toHaveLength(1);
    const review = mine.body[0];
    expect(review).toMatchObject({ status: 'Pending Self', cycle: { name: 'H1' } });
    expect(review.reviewer.name).toBe(manager.user.name);

    await api().put(`/api/user/team/reviews/${review.id}`).set(manager.auth).send({ rating: 4 }).expect(409); // no self-assessment yet
    await api().put(`/api/user/performance/reviews/${review.id}/self`).set(me.auth).send({ rating: 9 }).expect(400);
    const self = await api().put(`/api/user/performance/reviews/${review.id}/self`).set(me.auth).send({ rating: 4, comment: 'Solid half' }).expect(200);
    expect(self.body.status).toBe('Pending Manager');
    expect((await api().get('/api/user/notifications').set(manager.auth)).body.items.some((n) => /self-assessment/.test(n.title))).toBe(true);

    expect((await api().get('/api/user/team/reviews').set(manager.auth)).body).toHaveLength(1);
    const stranger = await makeUser();
    await api().put(`/api/user/team/reviews/${review.id}`).set(stranger.auth).send({ rating: 1 }).expect(404);
    await api().put(`/api/user/team/reviews/${review.id}`).set(manager.auth).send({ rating: 0 }).expect(400);
    const done = await api().put(`/api/user/team/reviews/${review.id}`).set(manager.auth).send({ rating: 5, comment: 'Great' }).expect(200);
    expect(done.body).toMatchObject({ status: 'Completed', managerRating: 5, selfRating: 4 });
    await api().put(`/api/user/performance/reviews/${review.id}/self`).set(me.auth).send({ rating: 1 }).expect(409);

    const cycles = await api().get('/api/admin/performance/cycles').set(admin.auth).expect(200);
    expect(cycles.body.find((c) => c.id === cycle.body.id)).toMatchObject({ completed: 1 });
    await api().put(`/api/admin/performance/cycles/${cycle.body.id}/close`).set(admin.auth).expect(200);
  });

  it('manages goals with key results and exposes them to the manager', async () => {
    const manager = await makeUser();
    const me = await makeUser({ managerId: manager.user.id });
    await api().post('/api/user/goals').set(me.auth).send({ title: '' }).expect(400);
    await api().post('/api/user/goals').set(me.auth).send({ title: 'g', keyResults: [{ title: 'kr', target: -1 }] }).expect(400);
    const goal = await api().post('/api/user/goals').set(me.auth).send({
      title: 'Grow signups', dueDate: '2026-12-31', keyResults: [{ title: 'Signups', target: 100, current: 25, unit: 'users' }, { title: 'Blog posts', target: 4, current: 1 }]
    }).expect(201);
    expect(goal.body.progress).toBe(25); // mean of 25% and 25%

    const upd = await api().put(`/api/user/goals/${goal.body.id}`).set(me.auth).send({
      keyResults: goal.body.keyResults.map((kr) => ({ id: kr.id, title: kr.title, target: kr.target, current: kr.target }))
    }).expect(200);
    expect(upd.body.progress).toBe(100);
    expect(upd.body.status).toBe('Done');

    expect((await api().get('/api/user/team/goals').set(manager.auth)).body.map((g) => g.id)).toContain(goal.body.id);
    const other = await makeUser();
    await api().put(`/api/user/goals/${goal.body.id}`).set(other.auth).send({ title: 'hijack' }).expect(404);
    await api().delete(`/api/user/goals/${goal.body.id}`).set(other.auth).expect(404);
    await api().delete(`/api/user/goals/${goal.body.id}`).set(me.auth).expect(200);
  });
});

describe('expenses', () => {
  it('submits, reviews, reimburses into the ledger, and guards the flow', async () => {
    const admin = await makeAdmin();
    const me = await makeUser();
    const body = { title: 'Taxi to client', category: 'Travel', amount: 45.5, date: '2026-01-15', receiptRef: 'R-1' };

    await api().post('/api/user/expenses').set(me.auth).send({ ...body, amount: 0 }).expect(400);
    await api().post('/api/user/expenses').set(me.auth).send({ ...body, category: 'Yachts' }).expect(400);
    await api().post('/api/user/expenses').set(me.auth).send({ ...body, date: '2999-01-01' }).expect(400);
    const created = await api().post('/api/user/expenses').set(me.auth).send(body).expect(201);
    expect(created.body.status).toBe('Pending');
    expect((await api().get('/api/user/notifications').set(admin.auth)).body.items.some((n) => /expense claim/.test(n.title))).toBe(true);

    await api().post(`/api/admin/expenses/${created.body.id}/reimburse`).set(admin.auth).expect(409); // not approved yet
    await api().put(`/api/admin/expenses/${created.body.id}/review`).set(me.auth).send({ status: 'Approved' }).expect(403);
    await api().put(`/api/admin/expenses/${created.body.id}/review`).set(admin.auth).send({ status: 'Perhaps' }).expect(400);
    await api().put(`/api/admin/expenses/${created.body.id}/review`).set(admin.auth).send({ status: 'Approved', note: 'ok' }).expect(200);
    await api().put(`/api/admin/expenses/${created.body.id}/review`).set(admin.auth).send({ status: 'Rejected' }).expect(409);
    await api().delete(`/api/user/expenses/${created.body.id}`).set(me.auth).expect(409); // no longer pending

    const paid = await api().post(`/api/admin/expenses/${created.body.id}/reimburse`).set(admin.auth).expect(200);
    expect(paid.body.status).toBe('Reimbursed');
    const tx = await Transaction.findOne({ method: 'Expense Reimbursement', recipient: me.user.name });
    expect(tx.amount).toBe('₹45.50');
    expect((await api().get('/api/user/expenses').set(me.auth)).body[0].status).toBe('Reimbursed');
  });

  it("admins cannot approve their own claims; users can withdraw pending ones; others can't see them", async () => {
    const admin = await makeAdmin();
    const me = await makeUser();
    const own = await api().post('/api/user/expenses').set(admin.auth).send({ title: 'Mine', amount: 10, date: '2026-01-01' }).expect(201);
    await api().put(`/api/admin/expenses/${own.body.id}/review`).set(admin.auth).send({ status: 'Approved' }).expect(403);
    const pending = await api().post('/api/user/expenses').set(me.auth).send({ title: 'Oops', amount: 10, date: '2026-01-01' }).expect(201);
    expect((await api().get('/api/user/expenses').set(admin.auth)).body.map((e) => e.id)).not.toContain(pending.body.id);
    await api().delete(`/api/user/expenses/${pending.body.id}`).set(admin.auth).expect(404);
    await api().delete(`/api/user/expenses/${pending.body.id}`).set(me.auth).expect(200);
  });
});

describe('onboarding & offboarding checklists', () => {
  it('assigns a template; employees tick their own tasks, HR ticks theirs', async () => {
    const admin = await makeAdmin();
    const me = await makeUser();
    const other = await makeUser();

    await api().post('/api/admin/checklist-templates').set(admin.auth).send({ name: 'x', kind: 'SIDEWAYS', tasks: [{ title: 't' }] }).expect(400);
    await api().post('/api/admin/checklist-templates').set(admin.auth).send({ name: 'x', kind: 'ONBOARDING', tasks: [] }).expect(400);
    const tpl = await api().post('/api/admin/checklist-templates').set(admin.auth).send({
      name: 'Welcome', kind: 'ONBOARDING',
      tasks: [{ title: 'Sign the code of conduct', requiresAck: true }, { title: 'Set up profile' }, { title: 'Order laptop', owner: 'HR' }]
    }).expect(201);

    const assigned = await api().post('/api/admin/checklists').set(admin.auth).send({ userId: me.user.id, templateId: tpl.body.id }).expect(201);
    expect(assigned.body.tasks).toHaveLength(3);
    expect(assigned.body).toMatchObject({ status: 'In Progress', progress: 0 });
    expect((await api().get('/api/user/notifications').set(me.auth)).body.items.some((n) => /checklist assigned/.test(n.title))).toBe(true);

    const mine = (await api().get('/api/user/checklists').set(me.auth).expect(200)).body[0];
    const [ack, profile, hr] = mine.tasks;
    expect((await api().get('/api/user/checklists').set(other.auth)).body).toHaveLength(0);

    await api().put(`/api/user/checklists/${mine.id}/tasks/${ack.id}`).set(me.auth).send({ done: true }).expect(400); // needs acknowledgement
    await api().put(`/api/user/checklists/${mine.id}/tasks/${ack.id}`).set(me.auth).send({ done: true, acknowledged: true }).expect(200);
    await api().put(`/api/user/checklists/${mine.id}/tasks/${hr.id}`).set(me.auth).send({ done: true }).expect(403); // HR task
    await api().put(`/api/user/checklists/${mine.id}/tasks/${profile.id}`).set(other.auth).send({ done: true }).expect(404);
    await api().put(`/api/user/checklists/${mine.id}/tasks/${profile.id}`).set(me.auth).send({ done: true }).expect(200);

    const final = await api().put(`/api/admin/checklists/${mine.id}/tasks/${hr.id}`).set(admin.auth).send({ done: true }).expect(200);
    expect(final.body).toMatchObject({ status: 'Completed', progress: 100 });
    expect(final.body.completedAt).toBeTruthy();
    expect((await api().get('/api/user/notifications').set(admin.auth)).body.items.some((n) => /completed/.test(n.title))).toBe(true);

    // un-ticking re-opens it
    const reopened = await api().put(`/api/user/checklists/${mine.id}/tasks/${profile.id}`).set(me.auth).send({ done: false }).expect(200);
    expect(reopened.body.status).toBe('In Progress');
  });
});

describe('outsourcing: contracts, timesheets, invoices', () => {
  it('flags expiring and lapsed contracts, alerts admins once, tracks timesheets and invoices', async () => {
    const admin = await makeAdmin();
    const user = await makeUser();
    const today = isoDate(new Date());
    const soon = addDays(today, 10);

    await api().post('/api/admin/contractors').set(user.auth).send({ name: 'n', role: 'r', company: 'c' }).expect(403);
    await api().post('/api/admin/contractors').set(admin.auth).send({ name: 'n', role: 'r', company: 'c', contractStart: '2030-02-01', contractEnd: '2030-01-01' }).expect(400);
    const expiring = await api().post('/api/admin/contractors').set(admin.auth).send({ name: 'Ending Soon', role: 'Dev', company: 'Acme', contractStart: addDays(today, -90), contractEnd: soon, hourlyRate: 50 }).expect(201);
    const lapsed = await api().post('/api/admin/contractors').set(admin.auth).send({ name: 'Lapsed', role: 'Dev', company: 'Acme', contractEnd: addDays(today, -3) }).expect(201);
    await api().post('/api/admin/contractors').set(admin.auth).send({ name: 'Fine', role: 'Dev', company: 'Acme', contractEnd: addDays(today, 300) }).expect(201);

    const alerts = await api().get('/api/admin/contractors/alerts').set(admin.auth).expect(200);
    expect(alerts.body.expiring.map((c) => c.name)).toContain('Ending Soon');
    expect(alerts.body.expiring.find((c) => c.name === 'Ending Soon').daysLeft).toBe(10);
    expect(alerts.body.expired.map((c) => c.name)).toContain('Lapsed');
    expect(alerts.body.expiring.map((c) => c.name)).not.toContain('Fine');

    await contractAlerts();
    await contractAlerts(); // deduplicated
    const inbox = await api().get('/api/user/notifications').set(admin.auth).expect(200);
    expect(inbox.body.items.filter((n) => n.title === 'Contract ending soon: Ending Soon')).toHaveLength(1);

    await api().put(`/api/admin/contractors/${lapsed.body.id}`).set(admin.auth).send({ status: 'Ended' }).expect(200);
    expect((await api().get('/api/admin/contractors/alerts').set(admin.auth)).body.expired.map((c) => c.name)).not.toContain('Lapsed');

    // timesheets
    const cid = expiring.body.id;
    await api().post(`/api/admin/contractors/${cid}/timesheets`).set(admin.auth).send({ weekStart: '2030-03-05', hours: 40 }).expect(400); // not a Monday
    await api().post(`/api/admin/contractors/${cid}/timesheets`).set(admin.auth).send({ weekStart: '2030-03-04', hours: 400 }).expect(400);
    const ts = await api().post(`/api/admin/contractors/${cid}/timesheets`).set(admin.auth).send({ weekStart: '2030-03-04', hours: 38.5 }).expect(201);
    await api().post(`/api/admin/contractors/${cid}/timesheets`).set(admin.auth).send({ weekStart: '2030-03-04', hours: 10 }).expect(409);
    await api().put(`/api/admin/timesheets/${ts.body.id}`).set(admin.auth).send({ status: 'Approved' }).expect(200);
    expect((await api().get(`/api/admin/timesheets?contractorId=${cid}`).set(admin.auth)).body).toHaveLength(1);

    // invoices
    const bad = { contractorId: cid, number: 'INV-1', amount: 1000, issueDate: '2030-03-01', dueDate: '2030-02-01' };
    await api().post('/api/admin/invoices').set(admin.auth).send(bad).expect(400);
    const inv = await api().post('/api/admin/invoices').set(admin.auth).send({ ...bad, dueDate: addDays(today, -5), issueDate: addDays(today, -30) }).expect(201);
    expect(inv.body.status).toBe('Draft');
    await api().post('/api/admin/invoices').set(admin.auth).send({ ...bad, dueDate: addDays(today, -5), issueDate: addDays(today, -30) }).expect(409); // duplicate number
    const sent = await api().put(`/api/admin/invoices/${inv.body.id}`).set(admin.auth).send({ status: 'Sent' }).expect(200);
    expect(sent.body.displayStatus).toBe('Overdue');
    const paid = await api().put(`/api/admin/invoices/${inv.body.id}`).set(admin.auth).send({ status: 'Paid' }).expect(200);
    expect(paid.body.displayStatus).toBe('Paid');
  });
});

describe('audit log and analytics', () => {
  it('records sensitive changes and only the super admin can read them', async () => {
    const sa = await makeSuperAdmin({ name: 'Auditor' });
    const admin = await makeAdmin();
    const target = await makeUser();

    await api().put(`/api/admin/users/${target.user.id}`).set(sa.auth).send({ role: 'ADMIN', permissions: 'read,payroll:write', designation: 'Lead' }).expect(200);
    await api().patch(`/api/admin/users/${target.user.id}/lock`).set(sa.auth).send({ locked: true }).expect(200);

    await api().get('/api/admin/audit').set(admin.auth).expect(403);
    const log = await api().get(`/api/admin/audit?q=${encodeURIComponent(target.user.email)}`).set(sa.auth).expect(200);
    const actions = log.body.items.map((i) => i.action);
    expect(actions).toEqual(expect.arrayContaining(['user.role_change', 'user.permissions', 'user.lock']));
    expect(log.body.items[0]).toMatchObject({ actorName: 'Auditor', actorRole: 'SUPER_ADMIN', entity: 'user' });

    const filtered = await api().get('/api/admin/audit?action=user.lock&limit=1').set(sa.auth).expect(200);
    expect(filtered.body.items).toHaveLength(1);
    expect(filtered.body).toMatchObject({ page: 1 });
    // regex metacharacters in the search box are treated literally
    await api().get('/api/admin/audit?q=(').set(sa.auth).expect(200);
  });

  it('returns dashboard analytics for admins only', async () => {
    const admin = await makeAdmin();
    const user = await makeUser();
    const res = await api().get('/api/admin/dashboard/analytics').set(admin.auth).expect(200);
    expect(res.body.leaveTrend).toHaveLength(6);
    expect(res.body.attendanceRate).toHaveLength(7);
    expect(res.body.headcountByDepartment.length).toBeGreaterThan(0);
    await api().get('/api/admin/dashboard/analytics').set(user.auth).expect(403);
    const stats = await api().get('/api/admin/dashboard/stats').set(admin.auth).expect(200);
    expect(stats.body).toHaveProperty('expiringContracts');
  });

  it('validates the new profile fields on user create/update', async () => {
    const sa = await makeSuperAdmin();
    const res = await api().post('/api/admin/users').set(sa.auth).send({ name: 'New Hire', email: `nh${Date.now()}@test.local`, password: 'Secret@123', designation: 'Analyst', joinDate: '2026-05-01', dateOfBirth: '1995-02-03' }).expect(201);
    expect(res.body).toMatchObject({ designation: 'Analyst', joinDate: '2026-05-01', totpEnabled: false });
    await api().put(`/api/admin/users/${res.body.id}`).set(sa.auth).send({ joinDate: 'yesterday' }).expect(400);
    const me = await makeUser();
    await api().put('/api/user/profile').set(me.auth).send({ dateOfBirth: '1990-13-40' }).expect(400);
    const ok = await api().put('/api/user/profile').set(me.auth).send({ dateOfBirth: '1990-04-05' }).expect(200);
    expect(ok.body.dateOfBirth).toBe('1990-04-05');
  });
});
