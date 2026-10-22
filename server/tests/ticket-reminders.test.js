import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as db from './helpers/db.js';
import { api, platformApi, makeUser, makeAdmin, makeSuperAdmin, makePlatformAdmin, inTenant } from './helpers/fixtures.js';
import { outbox } from './helpers/setup.js';
import { remindSupportTickets, remindAddressTickets, sendSupportReports, buildSupportReport } from '../src/utils/ticketReminders.js';
import { SupportTicket } from '../src/models/ticket.model.js';
import { AddressTicket } from '../src/models/addressTicket.model.js';
import { Company } from '../src/models/company.model.js';
import { testCompany } from './helpers/db.js';

beforeAll(db.connectTestDb);
afterAll(db.disconnectTestDb);
beforeEach(async () => {
  outbox.length = 0;
  await inTenant(() => SupportTicket.deleteMany({}));
});

const min = (n) => n * 60_000;
const raise = async (employee, priority, subject = `Printer ${priority}`) =>
  (await api().post('/api/user/support/tickets').set(employee.auth).send({ subject, message: 'It is broken', priority }).expect(201)).body;
const to = (email) => outbox.filter((m) => m.to === email);

describe('raising a ticket', () => {
  it('emails every admin and Super Admin straight away', async () => {
    const boss = await makeSuperAdmin();
    const admin = await makeAdmin();
    const employee = await makeUser();
    await raise(employee, 'Urgent');
    expect(to(boss.user.email).length).toBeGreaterThanOrEqual(1);
    expect(to(admin.user.email).length).toBeGreaterThanOrEqual(1);
    expect(outbox.find((m) => m.to === boss.user.email).subject).toContain('P1');
  });
});

describe('status reminders', () => {
  it('remind P1/P2 every 30 minutes and P3/P4 every hour, to the requester and the admins', async () => {
    const boss = await makeSuperAdmin();
    const employee = await makeUser();
    const urgent = await raise(employee, 'Urgent');
    const medium = await raise(employee, 'Medium');
    const t0 = new Date(urgent.createdAt).getTime();
    outbox.length = 0;

    expect(await inTenant(() => remindSupportTickets(new Date(t0 + min(20))))).toBe(0); // too early for anyone

    await inTenant(() => remindSupportTickets(new Date(t0 + min(31))));
    const first = outbox.map((m) => m.subject);
    expect(first.some((s) => s.includes('P1 reminder'))).toBe(true);
    expect(first.some((s) => s.includes('P3 reminder'))).toBe(false); // the hourly one is not due yet
    expect(to(employee.user.email)).toHaveLength(1);
    expect(to(boss.user.email).length).toBeGreaterThanOrEqual(1);

    outbox.length = 0;
    await inTenant(() => remindSupportTickets(new Date(t0 + min(40)))); // nothing new within the same window
    expect(outbox).toHaveLength(0);

    await inTenant(() => remindSupportTickets(new Date(t0 + min(62)))); // both are due now
    const second = outbox.map((m) => m.subject);
    expect(second.some((s) => s.includes('P1 reminder'))).toBe(true);
    expect(second.some((s) => s.includes('P3 reminder'))).toBe(true);
    expect(medium.id).toBeTruthy();
  });

  it('stop once the ticket is closed', async () => {
    const admin = await makeSuperAdmin();
    const employee = await makeUser();
    const t = await raise(employee, 'High');
    await api().put(`/api/admin/support/tickets/${t.id}`).set(admin.auth).send({ status: 'Closed' }).expect(200);
    outbox.length = 0;
    expect(await inTenant(() => remindSupportTickets(new Date(new Date(t.createdAt).getTime() + min(120))))).toBe(0);
    expect(outbox).toHaveLength(0);
  });

  it('respect an admin who turned email notifications off', async () => {
    const quiet = await makeSuperAdmin({ preferences: { emailNotifications: false } });
    const employee = await makeUser();
    const t = await raise(employee, 'Urgent');
    outbox.length = 0;
    await inTenant(() => remindSupportTickets(new Date(new Date(t.createdAt).getTime() + min(31))));
    expect(to(quiet.user.email)).toHaveLength(0);
    expect(to(employee.user.email)).toHaveLength(1);
  });
});

describe('the resolution report', () => {
  it('goes to the manager of whoever is resolving, and to Super Admins when there is no manager', async () => {
    const boss = await makeSuperAdmin();
    const manager = await makeAdmin();
    const resolver = await makeAdmin({ managerId: manager.user.id });
    const loner = await makeAdmin();
    const employee = await makeUser();
    const a = await raise(employee, 'Urgent', 'Server down');
    const b = await raise(employee, 'Low', 'New mouse');
    await api().put(`/api/admin/support/tickets/${a.id}`).set(boss.auth).send({ assigneeId: resolver.user.id }).expect(200);
    await api().put(`/api/admin/support/tickets/${b.id}`).set(boss.auth).send({ assigneeId: loner.user.id }).expect(200);
    outbox.length = 0;

    await inTenant(() => sendSupportReports(new Date()));
    const mgr = to(manager.user.email).find((m) => m.subject.includes('resolution report'));
    expect(mgr.text).toContain(resolver.user.name);
    expect(mgr.text).toContain('Server down');
    expect(mgr.text).not.toContain('New mouse');
    const sup = to(boss.user.email).find((m) => m.subject.includes('resolution report'));
    expect(sup.text).toContain('New mouse'); // loner has no manager
  });

  it('is available to admins as JSON and CSV', async () => {
    const boss = await makeSuperAdmin();
    const employee = await makeUser();
    await raise(employee, 'High', 'Badge not working');
    const json = (await api().get('/api/admin/support/report').set(boss.auth).expect(200)).body;
    expect(json.groups[0].tickets[0]).toMatchObject({ code: 'P2', subject: 'Badge not working' });
    const csv = (await api().get('/api/admin/support/report').query({ format: 'csv' }).set(boss.auth).expect(200)).text;
    expect(csv).toContain('Badge not working');
    await api().get('/api/admin/support/report').set(employee.auth).expect(403);
    expect((await inTenant(() => buildSupportReport())).groups.length).toBeGreaterThan(0);
  });
});

describe('address tickets', () => {
  it('tell the platform staff and the company on raise, and remind hourly until decided', async () => {
    const staff = await makePlatformAdmin({ platformRole: 'admin' });
    const viewer = await makePlatformAdmin({ platformRole: 'viewer' });
    const owner = await makeSuperAdmin();
    await Company.updateOne({ _id: testCompany._id }, { 'subscription.plan': 'business', dedicatedAddress: false });
    outbox.length = 0;
    const ticket = (await api().post('/api/admin/company/address-requests').set(owner.auth).send({ action: 'enable', reason: 'Own link please' }).expect(201)).body;
    expect(to(staff.user.email).length).toBeGreaterThanOrEqual(1);
    expect(to(viewer.user.email)).toHaveLength(0); // viewers cannot decide, so they are not nagged
    expect(to(owner.user.email).length).toBeGreaterThanOrEqual(1);

    outbox.length = 0;
    const t0 = new Date(ticket.createdAt).getTime();
    expect(await remindAddressTickets(new Date(t0 + min(30)))).toBe(0);
    expect(await remindAddressTickets(new Date(t0 + min(61)))).toBeGreaterThanOrEqual(2);
    expect(to(owner.user.email)).toHaveLength(1);
    expect(to(staff.user.email)).toHaveLength(1);

    await platformApi().patch(`/api/platform/address-requests/${ticket.id}`).set(staff.auth).send({ decision: 'reject', note: 'No' }).expect(200);
    outbox.length = 0;
    expect(await remindAddressTickets(new Date(t0 + min(200)))).toBe(0);
    await AddressTicket.deleteMany({});
    await Company.updateOne({ _id: testCompany._id }, { 'subscription.plan': 'enterprise', dedicatedAddress: true });
  });
});

describe('several server copies', () => {
  it('send each reminder once, however many run at the same moment', async () => {
    const employee = await makeUser();
    const t = await raise(employee, 'Urgent');
    outbox.length = 0;
    const at = new Date(new Date(t.createdAt).getTime() + min(31));
    await Promise.all([1, 2, 3].map(() => inTenant(() => remindSupportTickets(at))));
    expect(to(employee.user.email)).toHaveLength(1);
  });

  it('claim the daily report once per company per day', async () => {
    const { claimJob } = await import('../src/models/jobRun.model.js');
    const results = await Promise.all([1, 2, 3].map(() => claimJob('ticket-report', 'company-x', '2030-01-01')));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await claimJob('ticket-report', 'company-x', '2030-01-02')).toBe(true);
  });
});
