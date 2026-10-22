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
    try { expect(classifyHost('crm.localhost')).toEqual({ kind: 'tenant', slug: 'acme' }); } finally { env.tenancy.defaultTenantSlug = ''; }
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
