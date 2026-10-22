import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as db from './helpers/db.js';
import { api, platformApi, makeAdmin, makeSuperAdmin, makePlatformAdmin } from './helpers/fixtures.js';
import { outbox } from './helpers/setup.js';
import { classifyHost } from '../src/middleware/tenant.js';
import { env } from '../src/config/env.js';
import { Company } from '../src/models/company.model.js';
import { testCompany } from './helpers/db.js';

beforeAll(db.connectTestDb);
afterAll(db.disconnectTestDb);
beforeEach(() => { outbox.length = 0; });

const request = (over = {}) => ({
  name: 'Karthik Reddy', email: `k${Math.random().toString(36).slice(2, 7)}@ajaxhrms.com`, phone: '9999999999', employeeId: 'AJX-1',
  title: 'CSM', team: 'Support', manager: 'Meera', wantedRole: 'admin', reason: 'Handle onboarding', agree: true, ...over
});

describe('the shared CRM address', () => {
  it('names no company, so the company follows the sign-in', () => {
    expect(classifyHost('crm.localhost')).toEqual({ kind: 'unknown' });
    expect(classifyHost('acme.localhost')).toEqual({ kind: 'tenant', slug: 'acme' });
  });

  it('serves the default company on single-company installs', () => {
    env.tenancy.defaultTenantSlug = 'acme';
    try { expect(classifyHost('crm.localhost')).toEqual({ kind: 'tenant', slug: 'acme', shared: true }); } finally { env.tenancy.defaultTenantSlug = ''; }
  });

  it('does not hand out the crm subdomain to a company', async () => {
    const res = await platformApi().post('/api/platform/companies').set((await makePlatformAdmin()).auth).send({ name: 'Crm Ltd', slug: 'crm' });
    expect(res.status).toBe(400);
  });
});

describe('asking for portal access', () => {
  it('is only possible on the platform address', async () => {
    await api().post('/api/auth/portal-access').send(request()).expect(403);
  });

  it('validates the form and the staff email domain', async () => {
    env.tenancy.platformStaffDomain = 'ajaxhrms.com';
    try {
      await platformApi().post('/api/auth/portal-access').send(request({ email: 'x@gmail.com' })).expect(400);
      await platformApi().post('/api/auth/portal-access').send(request({ reason: '' })).expect(400);
      await platformApi().post('/api/auth/portal-access').send(request({ agree: false })).expect(400);
      await platformApi().post('/api/auth/portal-access').send(request()).expect(201);
    } finally {
      env.tenancy.platformStaffDomain = '';
    }
  });

  it('refuses a second pending request for the same email and reports status', async () => {
    const body = request();
    await platformApi().post('/api/auth/portal-access').send(body).expect(201);
    await platformApi().post('/api/auth/portal-access').send(body).expect(409);
    const res = await platformApi().get('/api/auth/portal-access/status').query({ email: body.email }).expect(200);
    expect(res.body.status).toBe('Pending');
    await platformApi().get('/api/auth/portal-access/status').query({ email: 'nobody@ajaxhrms.com' }).expect(404);
  });
});

describe('the platform team', () => {
  it('lets a Portal Super Admin approve a request with a chosen role, and mails the person', async () => {
    const boss = await makePlatformAdmin();
    const body = request();
    const created = (await platformApi().post('/api/auth/portal-access').send(body).expect(201)).body;

    const listed = (await platformApi().get('/api/platform/team').set(boss.auth).expect(200)).body;
    expect(listed.requests.some((r) => r.id === created.id)).toBe(true);

    await platformApi().patch(`/api/platform/team/requests/${created.id}`).set(boss.auth).send({ decision: 'approve', role: 'viewer' }).expect(200);
    expect(outbox.some((m) => m.to === body.email)).toBe(true);
    const status = (await platformApi().get('/api/auth/portal-access/status').query({ email: body.email })).body;
    expect(status).toMatchObject({ status: 'Approved', role: 'Portal Viewer' });
    const team = (await platformApi().get('/api/platform/team').set(boss.auth)).body;
    expect(team.members.find((m) => m.email === body.email).role).toBe('viewer');
    await platformApi().patch(`/api/platform/team/requests/${created.id}`).set(boss.auth).send({ decision: 'approve' }).expect(409);
  });

  it('needs a reason to reject', async () => {
    const boss = await makePlatformAdmin();
    const created = (await platformApi().post('/api/auth/portal-access').send(request()).expect(201)).body;
    await platformApi().patch(`/api/platform/team/requests/${created.id}`).set(boss.auth).send({ decision: 'reject' }).expect(400);
    await platformApi().patch(`/api/platform/team/requests/${created.id}`).set(boss.auth).send({ decision: 'reject', note: 'Not on the team' }).expect(200);
  });

  it('keeps the team to Portal Super Admins and never locks the last one out', async () => {
    const boss = await makePlatformAdmin({ platformRole: 'super' });
    const viewer = await makePlatformAdmin({ platformRole: 'viewer' });
    const admin = await makePlatformAdmin({ platformRole: 'admin' });
    await platformApi().get('/api/platform/team').set(viewer.auth).expect(403);
    await platformApi().get('/api/platform/team').set(admin.auth).expect(403);
    await platformApi().patch(`/api/platform/team/${boss.user.id}`).set(boss.auth).send({ role: 'viewer' }).expect(400); // own access
    await platformApi().patch(`/api/platform/team/${viewer.user.id}`).set(boss.auth).send({ role: 'admin' }).expect(200);
  });
});

describe('what each portal role may do', () => {
  it('lets a viewer read but not change anything', async () => {
    const viewer = await makePlatformAdmin({ platformRole: 'viewer' });
    await platformApi().get('/api/platform/companies').set(viewer.auth).expect(200);
    await platformApi().post('/api/platform/companies').set(viewer.auth).send({ name: 'Nope Ltd' }).expect(403);
  });

  it('lets an admin manage clients but not decide deletions', async () => {
    const admin = await makePlatformAdmin({ platformRole: 'admin' });
    await platformApi().post('/api/platform/companies').set(admin.auth).send({ name: 'Fresh Ltd' }).expect(201);
    await platformApi().patch('/api/platform/delete-requests/507f1f77bcf86cd799439011').set(admin.auth).send({ decision: 'approve' }).expect(403);
  });

  it('treats older platform accounts without a role as Portal Super Admins', async () => {
    const legacy = await makePlatformAdmin();
    const res = await platformApi().get('/api/auth/me').set(legacy.auth).expect(200);
    expect(res.body.platformRole).toBe('super');
    await platformApi().get('/api/platform/team').set(legacy.auth).expect(200);
  });
});

describe('company branding', () => {
  it('is part of the custom-branding feature and reaches the login page', async () => {
    const owner = await makeSuperAdmin();
    await api().put('/api/admin/company/branding').set(owner.auth).send({ displayName: 'Acme HR' }).expect(403);
    await Company.updateOne({ _id: testCompany._id }, { 'features.customLogo': true });
    try {
      await api().put('/api/admin/company/branding').set(owner.auth).send({ displayName: '' }).expect(400);
      await api().put('/api/admin/company/branding').set(owner.auth).send({ displayName: 'Acme HR', showPoweredBy: false }).expect(200);
      const ws = (await api().get('/api/auth/workspace').expect(200)).body;
      expect(ws.brand).toEqual({ name: 'Acme HR', showPoweredBy: false });
      const plain = await makeAdmin();
      await api().put('/api/admin/company/branding').set(plain.auth).send({ displayName: 'x' }).expect(403);
    } finally {
      await Company.updateOne({ _id: testCompany._id }, { 'features.customLogo': false });
    }
  });
});

describe('own address for paid clients', () => {
  const create = (body) => platformApi().post('/api/platform/companies').set(boss.auth).send(body);
  let boss;
  beforeAll(async () => { boss = await makePlatformAdmin(); });

  it('gives business and enterprise clients their own address and everyone else the shared one', async () => {
    const paid = (await create({ name: 'Angel One', slug: 'angelone', plan: 'business' }).expect(201)).body;
    expect(paid.dedicatedAddress).toBe(true);
    expect(paid.domain).toBe('angelone.localhost');
    const basic = (await create({ name: 'Small Co', slug: 'smallco', plan: 'starter' }).expect(201)).body;
    expect(basic.dedicatedAddress).toBe(false);
    expect(basic.domain).toBe('crm.localhost');
    const trial = (await create({ name: 'Trial Co', slug: 'trialco' }).expect(201)).body;
    expect(trial.dedicatedAddress).toBe(false);
  });

  it('refuses an own address on a trial, and takes it away when a client drops to trial', async () => {
    await create({ name: 'Bad Trial', slug: 'badtrial', plan: 'trial', dedicatedAddress: true }).expect(400);
    const co = (await create({ name: 'Moves Co', slug: 'movesco', plan: 'starter', dedicatedAddress: true }).expect(201)).body;
    expect(co.dedicatedAddress).toBe(true);
    const down = (await platformApi().put(`/api/platform/companies/${co.id}`).set(boss.auth).send({ plan: 'trial' }).expect(200)).body;
    expect(down.dedicatedAddress).toBe(false);
    await platformApi().put(`/api/platform/companies/${co.id}`).set(boss.auth).send({ dedicatedAddress: true, addressReason: 'x' }).expect(400);
  });

  it('sends a paid client\'s people to their own address after sign-in, and lets basic clients stay', async () => {
    const paid = (await create({ name: 'Wealth Ltd', slug: 'wealth', plan: 'enterprise', firstAdmin: { name: 'Wanda', email: 'wanda@wealth.test' } }).expect(201)).body;
    const basic = (await create({ name: 'Plain Ltd', slug: 'plain', plan: 'starter', firstAdmin: { name: 'Pat', email: 'pat@plain.test' } }).expect(201)).body;
    const { hashPassword } = await import('../src/utils/password.js');
    const { runAsTenant } = await import('../src/utils/tenantContext.js');
    const { User } = await import('../src/models/user.model.js');
    for (const [co, email] of [[paid, 'wanda@wealth.test'], [basic, 'pat@plain.test']]) {
      await runAsTenant(co.id, () => User.updateOne({ email }, { password: hashPassword('Password@1') }));
    }
    const code = () => outbox.at(-1).text.match(/code is (\d{6})/)[1];

    // Paid: signing in on the shared address hands over to their own address
    await api('crm.localhost').post('/api/auth/login').send({ email: 'wanda@wealth.test', password: 'Password@1' }).expect(200);
    const verified = (await api('crm.localhost').post('/api/auth/login/verify').send({ email: 'wanda@wealth.test', otp: code() }).expect(200)).body;
    expect(verified.token).toBeUndefined();
    expect(verified.redirect).toMatch(/^http:\/\/wealth\.localhost.*\/handoff\?code=/);
    const ticket = new URL(verified.redirect).searchParams.get('code');

    // The ticket works once, only on that company's address
    await api('plain.localhost').post('/api/auth/handoff').send({ code: ticket }).expect(400);
    const session = (await api('wealth.localhost').post('/api/auth/handoff').send({ code: ticket }).expect(200)).body;
    expect(session.token).toBeTruthy();
    expect(session.user.email).toBe('wanda@wealth.test');
    await api('wealth.localhost').post('/api/auth/handoff').send({ code: ticket }).expect(400);

    // Basic: stays on the shared address with a normal session
    await api('crm.localhost').post('/api/auth/login').send({ email: 'pat@plain.test', password: 'Password@1' }).expect(200);
    const stay = (await api('crm.localhost').post('/api/auth/login/verify').send({ email: 'pat@plain.test', otp: code() }).expect(200)).body;
    expect(stay.token).toBeTruthy();
    expect(stay.redirect).toBeUndefined();

    // Signing in directly on their own address needs no hand-over
    await api('wealth.localhost').post('/api/auth/login').send({ email: 'wanda@wealth.test', password: 'Password@1' }).expect(200);
    const direct = (await api('wealth.localhost').post('/api/auth/login/verify').send({ email: 'wanda@wealth.test', otp: code() }).expect(200)).body;
    expect(direct.token).toBeTruthy();
  });
});

describe('address tickets', () => {
  let boss;
  beforeAll(async () => { boss = await makePlatformAdmin(); });
  const company = async (slug, plan) => (await platformApi().post('/api/platform/companies').set(boss.auth).send({ name: `${slug} Ltd`, slug, plan, dedicatedAddress: false }).expect(201)).body;
  const adminOf = async (co) => {
    const { makeUser } = await import('./helpers/fixtures.js');
    const { Company: C } = await import('../src/models/company.model.js');
    return makeUser({ role: 'ADMIN', permissions: 'read,write' }, await C.findById(co.id));
  };

  it('records a ticket and an audit entry when the platform changes an address, and needs a reason', async () => {
    const co = await company('tkt-direct', 'business');
    await platformApi().put(`/api/platform/companies/${co.id}`).set(boss.auth).send({ dedicatedAddress: true }).expect(400);
    const done = await platformApi().put(`/api/platform/companies/${co.id}`).set(boss.auth).send({ dedicatedAddress: true, addressReason: 'Contract clause 4' }).expect(200);
    expect(done.body.dedicatedAddress).toBe(true);
    const tickets = (await platformApi().get('/api/platform/address-requests').query({ companyId: co.id }).set(boss.auth).expect(200)).body;
    expect(tickets).toHaveLength(1);
    expect(tickets[0]).toMatchObject({ ticketNo: expect.stringMatching(/^ADR-\d{4}$/), action: 'enable', source: 'platform', status: 'Approved', reason: 'Contract clause 4' });
    expect(tickets[0].before.dedicated).toBe(false);
    expect(tickets[0].after.dedicated).toBe(true);
    const log = (await platformApi().get('/api/platform/audit').query({ q: tickets[0].ticketNo }).set(boss.auth).expect(200)).body;
    expect(log.items.some((e) => e.action === 'company.address.enable')).toBe(true);
  });

  it('lets a company admin ask, and applies the change only when the platform approves', async () => {
    const co = await company('tkt-ask', 'business');
    const admin = await adminOf(co);
    const host = 'tkt-ask.localhost';
    await api(host).post('/api/admin/company/address-requests').set(admin.auth).send({ action: 'enable' }).expect(400); // reason required
    const ticket = (await api(host).post('/api/admin/company/address-requests').set(admin.auth).send({ action: 'enable', reason: 'We want our own link' }).expect(201)).body;
    expect(ticket.status).toBe('Pending');
    await api(host).post('/api/admin/company/address-requests').set(admin.auth).send({ action: 'enable', reason: 'again' }).expect(409); // one at a time
    expect((await platformApi().get(`/api/platform/companies/${co.id}`).set(boss.auth)).body.dedicatedAddress).toBe(false);

    const queue = (await platformApi().get('/api/platform/stats').set(boss.auth)).body;
    expect(queue.pendingAddressRequests).toBeGreaterThanOrEqual(1);
    await platformApi().patch(`/api/platform/address-requests/${ticket.id}`).set(boss.auth).send({ decision: 'approve' }).expect(200);
    expect((await platformApi().get(`/api/platform/companies/${co.id}`).set(boss.auth)).body.dedicatedAddress).toBe(true);
    await platformApi().patch(`/api/platform/address-requests/${ticket.id}`).set(boss.auth).send({ decision: 'approve' }).expect(409); // decided once
    const mine = (await api(host).get('/api/admin/company/address-requests').set(admin.auth).expect(200)).body;
    expect(mine.current.dedicated).toBe(true);
    expect(mine.tickets[0]).toMatchObject({ ticketNo: ticket.ticketNo, status: 'Approved' });
  });

  it('needs a reason to reject, leaves the address alone, and keeps trial companies on the shared address', async () => {
    const co = await company('tkt-no', 'business');
    const admin = await adminOf(co);
    const ticket = (await api('tkt-no.localhost').post('/api/admin/company/address-requests').set(admin.auth).send({ action: 'enable', reason: 'please' }).expect(201)).body;
    await platformApi().patch(`/api/platform/address-requests/${ticket.id}`).set(boss.auth).send({ decision: 'reject' }).expect(400);
    await platformApi().patch(`/api/platform/address-requests/${ticket.id}`).set(boss.auth).send({ decision: 'reject', note: 'Not on this plan' }).expect(200);
    expect((await platformApi().get(`/api/platform/companies/${co.id}`).set(boss.auth)).body.dedicatedAddress).toBe(false);

    const trial = await company('tkt-trial', 'trial');
    const trialAdmin = await adminOf(trial);
    await api('tkt-trial.localhost').post('/api/admin/company/address-requests').set(trialAdmin.auth).send({ action: 'enable', reason: 'x' }).expect(400);
  });

  it('keeps a Portal Viewer from deciding tickets and employees from asking', async () => {
    const co = await company('tkt-roles', 'business');
    const { makeUser } = await import('./helpers/fixtures.js');
    const { Company: C } = await import('../src/models/company.model.js');
    const employee = await makeUser({}, await C.findById(co.id));
    await api('tkt-roles.localhost').post('/api/admin/company/address-requests').set(employee.auth).send({ action: 'enable', reason: 'x' }).expect(403);
    const viewer = await makePlatformAdmin({ platformRole: 'viewer' });
    await platformApi().patch('/api/platform/address-requests/507f1f77bcf86cd799439011').set(viewer.auth).send({ decision: 'approve' }).expect(403);
  });
});
