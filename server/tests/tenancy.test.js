import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import * as db from './helpers/db.js';
import { api, platformApi, makeUser, makeAdmin, makeSuperAdmin, makePlatformAdmin, makeCompany, inTenant } from './helpers/fixtures.js';
import { outbox } from './helpers/setup.js';
import { User } from '../src/models/user.model.js';
import { Department } from '../src/models/department.model.js';
import { Company } from '../src/models/company.model.js';
import { SalaryStructure } from '../src/models/salary.model.js';
import { AuditLog } from '../src/models/auditLog.model.js';
import { runAsTenant, runAsPlatform, runAcrossTenants } from '../src/utils/tenantContext.js';
import { classifyHost } from '../src/middleware/tenant.js';
import { hashPassword } from '../src/utils/password.js';

beforeAll(db.connectTestDb);
afterAll(db.disconnectTestDb);
beforeEach(() => { outbox.length = 0; });

describe('which workspace a request is for', () => {
  it('maps hosts to the platform, a company, or nothing', () => {
    expect(classifyHost('admin.localhost')).toEqual({ kind: 'platform' });
    expect(classifyHost('localhost')).toEqual({ kind: 'platform' });
    expect(classifyHost('acme.localhost')).toEqual({ kind: 'tenant', slug: 'acme' });
    expect(classifyHost('ACME.LOCALHOST')).toEqual({ kind: 'tenant', slug: 'acme' });
    expect(classifyHost('a.b.localhost')).toEqual({ kind: 'unknown' });
    expect(classifyHost('evil.example.com')).toEqual({ kind: 'unknown' });
    expect(classifyHost('')).toEqual({ kind: 'unknown' });
  });

  it('describes the workspace to the login page', async () => {
    const res = await api().get('/api/auth/workspace').expect(200);
    expect(res.body).toMatchObject({ kind: 'tenant', name: 'Acme Corp', slug: 'acme', status: 'active', sso: { enabled: false } });
    expect(res.body.modules).toContain('payroll');
    expect((await platformApi().get('/api/auth/workspace').expect(200)).body.kind).toBe('platform');
  });

  it('404s for a workspace that does not exist or a host that is not ours', async () => {
    const missing = await api('nothere.localhost').get('/api/auth/workspace').expect(404);
    expect(missing.body.code).toBe('WORKSPACE_NOT_FOUND');
    await api('evil.example.com').get('/api/auth/workspace').expect(404);
  });
});

describe('tenants cannot see each other', () => {
  it('keeps users, tokens and data inside their own company', async () => {
    const other = await makeCompany('globex');
    const mine = await makeAdmin();
    const theirs = await makeAdmin({}, other.company);

    // A token is only good on its own company's address
    await api().get('/api/auth/me').set(mine.auth).expect(200);
    await other.api().get('/api/auth/me').set(mine.auth).expect(401);
    await api().get('/api/auth/me').set(theirs.auth).expect(401);

    // Data created in one company is invisible in the other
    await api().post('/api/admin/departments').set(mine.auth).send({ name: 'Secret R&D' }).expect(201);
    const theirDepts = await other.api().get('/api/user/departments').set(theirs.auth).expect(200);
    expect(theirDepts.body.map((d) => d.name)).not.toContain('Secret R&D');
    const theirUsers = await other.api().get('/api/admin/users').set(theirs.auth).expect(200);
    expect(theirUsers.body.every((u) => u.email !== mine.user.email)).toBe(true);
  });

  it('lets the same department name and email exist in two companies, but not twice in one', async () => {
    const other = await makeCompany('initech');
    const a = await makeAdmin();
    const b = await makeAdmin({}, other.company);
    await api().post('/api/admin/departments').set(a.auth).send({ name: 'Ops' }).expect(201);
    await other.api().post('/api/admin/departments').set(b.auth).send({ name: 'Ops' }).expect(201);
    await api().post('/api/admin/departments').set(a.auth).send({ name: 'Ops' }).expect(409);

    await makeUser({ email: 'shared@test.local' });
    await makeUser({ email: 'shared@test.local' }, other.company); // different company: fine
    await expect(makeUser({ email: 'shared@test.local' })).rejects.toThrow(/duplicate/i);
  });

  it('scopes every query at the data layer, even ones that forget to filter', async () => {
    const other = await makeCompany('hooli');
    await makeUser({ name: 'Hooli Person' }, other.company);
    await makeUser({ name: 'Acme Person' });

    const seenByAcme = await inTenant(() => User.find().select('name'));
    expect(seenByAcme.map((u) => u.name)).toContain('Acme Person');
    expect(seenByAcme.map((u) => u.name)).not.toContain('Hooli Person');
    // The tenant filter wins over a filter that asks for another company
    const sneaky = await inTenant(() => User.find({ companyId: other.company._id }));
    expect(sneaky.length).toBeGreaterThan(0);
    expect(sneaky.every((u) => String(u.companyId) === String(db.testCompany._id))).toBe(true);
    // Counts, updates and aggregates are confined too
    const hooliCount = await runAsTenant(other.company._id, () => User.countDocuments());
    const aggregated = await inTenant(() => User.aggregate([{ $group: { _id: null, n: { $sum: 1 } } }]));
    expect(hooliCount).toBe(1);
    expect(aggregated[0].n).toBe(seenByAcme.length);
    const touched = await inTenant(() => User.updateMany({}, { designation: 'tenant-test' }));
    const hooliAfter = await runAsTenant(other.company._id, () => User.find({ designation: 'tenant-test' }));
    expect(touched.modifiedCount).toBeGreaterThan(0);
    expect(hooliAfter).toHaveLength(0);
  });

  it('stamps new documents with the current company and refuses writes for another', async () => {
    const other = await makeCompany('umbrella');
    const dept = await inTenant(() => Department.create({ name: 'Stamped' }));
    expect(String(dept.companyId)).toBe(String(db.testCompany._id));
    await expect(inTenant(() => Department.create({ name: 'Forged', companyId: other.company._id }))).rejects.toThrow(/Cross-tenant/);
    await inTenant(() => Department.insertMany([{ name: 'Bulk1' }, { name: 'Bulk2' }]));
    const bulk = await inTenant(() => Department.find({ name: /^Bulk/ }));
    expect(bulk).toHaveLength(2);
    expect(bulk.every((d) => String(d.companyId) === String(db.testCompany._id))).toBe(true);
  });

  it('does not let platform accounts live inside a company, or company accounts outside', async () => {
    await expect(inTenant(() => User.create({ email: 'p@x.test', name: 'P', role: 'PLATFORM_ADMIN' }))).rejects.toThrow(/platform role/);
    await expect(runAsPlatform(() => User.create({ email: 'u@x.test', name: 'U', role: 'USER' }))).rejects.toThrow(/outside a company/);
    const sa = await makeSuperAdmin();
    await api().put(`/api/admin/users/${(await makeUser()).user.id}`).set(sa.auth).send({ role: 'PLATFORM_ADMIN' }).expect(400);
  });
});

describe('company status', () => {
  it('suspending a company blocks it and signs everyone out; activating restores it', async () => {
    const co = await makeCompany('wayne');
    const admin = await makeAdmin({}, co.company);
    const sa = await makePlatformAdmin();
    await co.api().get('/api/auth/me').set(admin.auth).expect(200);

    await platformApi().patch(`/api/platform/companies/${co.company.id}/status`).set(sa.auth).send({ status: 'suspended' }).expect(400); // reason required
    await platformApi().patch(`/api/platform/companies/${co.company.id}/status`).set(sa.auth).send({ status: 'suspended', reason: 'Unpaid invoice' }).expect(200);

    const blocked = await co.api().get('/api/auth/me').set(admin.auth).expect(403);
    expect(blocked.body.code).toBe('WORKSPACE_SUSPENDED');
    await co.api().post('/api/auth/login').send({ email: admin.user.email, password: 'Password@1' }).expect(403);
    // Its login page can still say why
    expect((await co.api().get('/api/auth/workspace').expect(200)).body).toMatchObject({ status: 'suspended' });

    await platformApi().patch(`/api/platform/companies/${co.company.id}/status`).set(sa.auth).send({ status: 'active' }).expect(200);
    // Sessions were ended while suspended
    await co.api().get('/api/auth/me').set(admin.auth).expect(401);
    await co.api().post('/api/auth/login').send({ email: admin.user.email, password: 'Password@1' }).expect(200);
  });

  it('deactivates a company and records each change in the audit log the company can see', async () => {
    const co = await makeCompany('stark');
    const sa = await makePlatformAdmin();
    const admin = await makeSuperAdmin({}, co.company);
    await platformApi().patch(`/api/platform/companies/${co.company.id}/status`).set(sa.auth).send({ status: 'inactive', reason: 'Contract ended' }).expect(200);
    await co.api().get('/api/auth/me').set(admin.auth).expect(403);
    await platformApi().patch(`/api/platform/companies/${co.company.id}/status`).set(sa.auth).send({ status: 'active' }).expect(200);

    const fresh = await makeSuperAdmin({}, co.company);
    const log = await co.api().get('/api/admin/audit').set(fresh.auth).expect(200);
    const actions = log.body.items.map((i) => i.action);
    expect(actions).toEqual(expect.arrayContaining(['company.deactivate', 'company.activate']));
    expect(log.body.items.find((i) => i.action === 'company.deactivate')).toMatchObject({ actorRole: 'PLATFORM_ADMIN' });
    await platformApi().patch(`/api/platform/companies/${co.company.id}/status`).set(sa.auth).send({ status: 'bogus' }).expect(400);
  });

  it('only lets the platform Super Admin use the console', async () => {
    const admin = await makeSuperAdmin();
    await platformApi().get('/api/platform/companies').expect(401);
    await api().get('/api/platform/companies').set(admin.auth).expect(403); // wrong host
    await platformApi().get('/api/platform/companies').set(admin.auth).expect(401); // company account on the platform host
    const sa = await makePlatformAdmin();
    await platformApi().get('/api/platform/companies').set(sa.auth).expect(200);
    await api().get('/api/admin/users').set(sa.auth).expect(401);
    // Company admin routes do not exist on the platform host at all
    await platformApi().get('/api/admin/users').set(sa.auth).expect(403);
  });
});

describe('onboarding a company', () => {
  it('creates a company with a subdomain, plan, modules and an invited first admin', async () => {
    const sa = await makePlatformAdmin();
    const res = await platformApi().post('/api/platform/companies').set(sa.auth).send({
      name: 'Pied Piper Inc.', primaryContact: { name: 'Richard', email: 'richard@piedpiper.test', phone: '123' },
      plan: 'business', modules: ['leave', 'attendance', 'users'], firstAdmin: { name: 'Richard Hendricks', email: 'richard@piedpiper.test' }
    }).expect(201);

    expect(res.body).toMatchObject({
      name: 'Pied Piper Inc.', slug: 'pied-piper-inc', domain: 'pied-piper-inc.localhost', status: 'active',
      subscription: { plan: 'business', seatLimit: 250 }, modules: ['leave', 'attendance', 'users'],
      primaryContact: { email: 'richard@piedpiper.test' }, firstAdmin: { email: 'richard@piedpiper.test' }
    });
    expect(res.body.dataKey).toBeUndefined();

    // The invitation names the workspace and has no password in it
    const mail = outbox.at(-1);
    expect(mail.to).toBe('richard@piedpiper.test');
    expect(mail.text).toContain('pied-piper-inc.localhost');
    expect(mail.text).not.toMatch(/password:/i);

    // The new admin can set a password via the usual reset flow, then sign in and manage their company
    const ws = api('pied-piper-inc.localhost');
    await ws.post('/api/auth/login').send({ email: 'richard@piedpiper.test', password: 'anything' }).expect(401);
    await ws.post('/api/auth/forgot-password').send({ email: 'richard@piedpiper.test' }).expect(200);
    const code = outbox.at(-1).text.match(/(\d{6})/)[1];
    await ws.post('/api/auth/reset-password').send({ email: 'richard@piedpiper.test', otp: code, newPassword: 'Brand-new-1' }).expect(200);
    await ws.post('/api/auth/login').send({ email: 'richard@piedpiper.test', password: 'Brand-new-1' }).expect(200);
  });

  it('refuses bad, reserved and duplicate subdomains and bad input', async () => {
    const sa = await makePlatformAdmin();
    const post = (body) => platformApi().post('/api/platform/companies').set(sa.auth).send(body);
    await post({ name: '' }).expect(400);
    await post({ name: 'Reserved', slug: 'admin' }).expect(400);
    await post({ name: 'Bad', slug: 'Has Spaces' }).expect(400);
    await post({ name: 'Short', slug: 'ab' }).expect(400);
    await post({ name: 'Dup', slug: 'acme' }).expect(409);
    await post({ name: 'Plan', plan: 'platinum' }).expect(400);
    await post({ name: 'Mods', modules: ['nonsense'] }).expect(400);
    await post({ name: 'Mail', firstAdmin: { email: 'nope' } }).expect(400);
    expect(await runAcrossTenants(() => Company.countDocuments({ name: 'Mail' }))).toBe(0); // nothing half-created
  });

  it('picks a free subdomain automatically when two companies share a name', async () => {
    const sa = await makePlatformAdmin();
    const one = await platformApi().post('/api/platform/companies').set(sa.auth).send({ name: 'Twin Co' }).expect(201);
    const two = await platformApi().post('/api/platform/companies').set(sa.auth).send({ name: 'Twin Co' }).expect(201);
    expect(one.body.slug).toBe('twin-co');
    expect(two.body.slug).toBe('twin-co-2');
  });

  it('lists companies with usage, edits plan/modules/contact, and re-invites admins', async () => {
    const sa = await makePlatformAdmin();
    const co = await makeCompany('dunder');
    await makeUser({}, co.company);
    await makeAdmin({}, co.company);

    const list = await platformApi().get('/api/platform/companies?q=dunder').set(sa.auth).expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ slug: 'dunder', usage: { employees: 2, admins: 1 } });

    const upd = await platformApi().put(`/api/platform/companies/${co.company.id}`).set(sa.auth)
      .send({ plan: 'starter', modules: ['leave'], primaryContact: { name: 'Michael', email: 'm@dunder.test' } }).expect(200);
    expect(upd.body).toMatchObject({ subscription: { plan: 'starter', seatLimit: 50 }, modules: ['leave'] });

    const detail = await platformApi().get(`/api/platform/companies/${co.company.id}`).set(sa.auth).expect(200);
    expect(detail.body).toMatchObject({ pendingDeleteRequests: 0, supportAccess: { active: false } });

    const invited = await platformApi().post(`/api/platform/companies/${co.company.id}/admins`).set(sa.auth).send({ name: 'Dwight', email: 'dwight@dunder.test' }).expect(201);
    expect(invited.body.created).toBe(true);
    const again = await platformApi().post(`/api/platform/companies/${co.company.id}/admins`).set(sa.auth).send({ email: 'dwight@dunder.test' }).expect(200);
    expect(again.body.created).toBe(false);
    const stats = await platformApi().get('/api/platform/stats').set(sa.auth).expect(200);
    expect(stats.body.companies.active).toBeGreaterThan(0);
  });

  it("platform status changes by someone who isn't the platform admin are refused", async () => {
    const co = await makeCompany('nonplat');
    const admin = await makeSuperAdmin({}, co.company);
    await co.api().patch(`/api/platform/companies/${co.company.id}/status`).set(admin.auth).send({ status: 'inactive', reason: 'x' }).expect(403);
  });
});

describe('plans: modules and seats', () => {
  it('hides modules the company has not bought', async () => {
    const co = await makeCompany('limited', { modules: ['leave', 'users'] });
    const admin = await makeSuperAdmin({}, co.company);
    await co.api().get('/api/admin/users').set(admin.auth).expect(200);
    const blocked = await co.api().get('/api/admin/payroll/structures').set(admin.auth).expect(403);
    expect(blocked.body.code).toBe('MODULE_DISABLED');
    await co.api().get('/api/user/payslips').set(admin.auth).expect(403);
    await co.api().get('/api/user/leaves').set(admin.auth).expect(200);
    expect((await co.api().get('/api/auth/workspace')).body.modules).toEqual(['leave', 'users']);
  });

  it('stops adding employees once the seat limit is reached', async () => {
    const co = await makeCompany('tiny', { seatLimit: 2 });
    const admin = await makeSuperAdmin({}, co.company);
    await makeUser({}, co.company); // 2 of 2
    const res = await co.api().post('/api/admin/users').set(admin.auth).send({ name: 'Third', email: 'third@tiny.test', password: 'Password@1' }).expect(402);
    expect(res.body.message).toMatch(/seats/);
  });

  it('self-signup is off unless the company turns it on', async () => {
    const co = await makeCompany('closed');
    await co.api().post('/api/auth/register').send({ name: 'Rando', email: 'rando@x.test', password: 'Password@1' }).expect(403);
    await api().post('/api/auth/register').send({ name: 'Rando', email: 'rando@x.test', password: 'Password@1' }).expect(201); // acme allows it
    await platformApi().post('/api/auth/register').send({ name: 'Rando', email: 'rando@x.test', password: 'Password@1' }).expect(403);
  });
});

describe('company admin permissions', () => {
  it('lets the company admin edit company details but not plan, modules or subdomain', async () => {
    const admin = await makeSuperAdmin();
    const res = await api().put('/api/admin/company').set(admin.auth).send({
      name: 'Acme Corporation', primaryContact: { name: 'Pat', email: 'pat@acme.test' }, profile: { timezone: 'Asia/Kolkata', industry: 'Software' },
      settings: { allowSelfSignup: true },
      slug: 'hijack', subscription: { plan: 'free' }, modules: [], status: 'suspended'
    }).expect(200);
    expect(res.body).toMatchObject({ name: 'Acme Corporation', slug: 'acme', status: 'active', primaryContact: { email: 'pat@acme.test' }, profile: { timezone: 'Asia/Kolkata' } });
    expect(res.body.modules.length).toBeGreaterThan(3);
    expect(res.body.subscription.plan).toBe('enterprise');
    await api().put('/api/admin/company').set(admin.auth).send({ primaryContact: { email: 'broken' } }).expect(400);
    await api().put('/api/admin/company').set(admin.auth).send({ name: '  ' }).expect(400);
    await api().put('/api/admin/company').set(admin.auth).send({ name: 'Acme Corp' }).expect(200);
  });

  it('keeps company settings away from ordinary admins and employees', async () => {
    const plain = await makeAdmin();
    const employee = await makeUser();
    for (const path of ['/api/admin/company', '/api/admin/company/sso', '/api/admin/support-access']) {
      await api().get(path).set(plain.auth).expect(403);
      await api().get(path).set(employee.auth).expect(403);
    }
  });
});

describe('delete requests', () => {
  it('turns a delete into a pending request that the platform approves', async () => {
    const sa = await makePlatformAdmin();
    const admin = await makeSuperAdmin();
    const deleter = await makeAdmin({ permissions: 'read,users:delete' }); // a company super admin deletes directly instead
    const victim = await makeUser({ name: 'Leaving Larry' });

    const asked = await api().delete(`/api/admin/users/${victim.user.id}`).set(deleter.auth).send({ reason: 'Resigned' }).expect(202);
    expect(asked.body).toMatchObject({ status: 'Pending', targetType: 'user', targetLabel: victim.user.email, reason: 'Resigned', requestedByName: deleter.user.name });
    // Nothing was deleted yet
    await api().get('/api/auth/me').set(victim.auth).expect(200);
    // One open request per target
    await api().delete(`/api/admin/users/${victim.user.id}`).set(deleter.auth).expect(409);

    const mine = await api().get('/api/admin/delete-requests?status=Pending').set(admin.auth).expect(200);
    expect(mine.body.map((r) => r.id)).toContain(asked.body.id);

    const queue = await platformApi().get('/api/platform/delete-requests?status=Pending').set(sa.auth).expect(200);
    const entry = queue.body.find((r) => r.id === asked.body.id);
    expect(entry.company).toMatchObject({ slug: 'acme' });

    const decided = await platformApi().patch(`/api/platform/delete-requests/${asked.body.id}`).set(sa.auth).send({ decision: 'approve' }).expect(200);
    expect(decided.body).toMatchObject({ status: 'Approved', decidedByName: sa.user.name });
    expect(decided.body.executedAt).toBeTruthy();

    // The employee is gone, the company sees the status, and both sides logged it
    await api().get('/api/auth/me').set(victim.auth).expect(401);
    const after = await api().get('/api/admin/delete-requests').set(admin.auth).expect(200);
    expect(after.body.find((r) => r.id === asked.body.id)).toMatchObject({ status: 'Approved' });
    const log = await api().get('/api/admin/audit?q=deletion').set(admin.auth).expect(200);
    expect(log.body.items.map((i) => i.action)).toEqual(expect.arrayContaining(['delete_request.create', 'delete_request.approve']));
    // A decided request can't be decided again
    await platformApi().patch(`/api/platform/delete-requests/${asked.body.id}`).set(sa.auth).send({ decision: 'reject', note: 'oops' }).expect(409);
  });

  it('rejecting leaves the record alone, needs a reason, and tells the requester', async () => {
    const sa = await makePlatformAdmin();
    await makeSuperAdmin();
    const deleter = await makeAdmin({ permissions: 'read,users:delete' });
    const keep = await makeUser({ name: 'Keeper' });
    const asked = await api().post('/api/admin/delete-requests').set(deleter.auth).send({ targetType: 'user', targetId: keep.user.id, reason: 'Cleanup' }).expect(201);

    await platformApi().patch(`/api/platform/delete-requests/${asked.body.id}`).set(sa.auth).send({ decision: 'reject' }).expect(400);
    const done = await platformApi().patch(`/api/platform/delete-requests/${asked.body.id}`).set(sa.auth).send({ decision: 'reject', note: 'Still employed' }).expect(200);
    expect(done.body).toMatchObject({ status: 'Rejected', decisionNote: 'Still employed' });
    await api().get('/api/auth/me').set(keep.auth).expect(200);

    const inbox = await api().get('/api/user/notifications').set(deleter.auth).expect(200);
    expect(inbox.body.items.some((n) => /rejected/.test(n.title))).toBe(true);
    // After a rejection a new request can be raised
    await api().post('/api/admin/delete-requests').set(deleter.auth).send({ targetType: 'user', targetId: keep.user.id }).expect(201);
  });

  it('lets the company super admin delete an employee directly', async () => {
    const admin = await makeSuperAdmin();
    const victim = await makeUser({ name: 'Direct Dan' });
    const res = await api().delete(`/api/admin/users/${victim.user.id}`).set(admin.auth).expect(200);
    expect(res.body).toMatchObject({ deleted: true });
    await api().get('/api/auth/me').set(victim.auth).expect(401);
    const log = await api().get('/api/admin/audit?q=Direct').set(admin.auth).expect(200);
    expect(log.body.items.map((i) => i.action)).toContain('user.delete');
    await api().delete(`/api/admin/users/${victim.user.id}`).set(admin.auth).expect(404);
  });

  it('checks who may raise which request', async () => {
    const admin = await makeAdmin(); // read,write - no delete
    const sa = await makeSuperAdmin();
    const deleter = await makeAdmin({ permissions: 'read,users:delete' });
    const target = await makeUser();
    const boss = await makeAdmin();

    await api().delete(`/api/admin/users/${target.user.id}`).set(admin.auth).expect(403);
    await api().post('/api/admin/delete-requests').set(admin.auth).send({ targetType: 'user', targetId: target.user.id }).expect(403);
    await api().post('/api/admin/delete-requests').set(deleter.auth).send({ targetType: 'user', targetId: target.user.id }).expect(201);
    // Not your own account, not a privileged account unless you are the company admin, not the whole company unless you are
    await api().post('/api/admin/delete-requests').set(sa.auth).send({ targetType: 'user', targetId: sa.user.id }).expect(403);
    await api().post('/api/admin/delete-requests').set(deleter.auth).send({ targetType: 'user', targetId: boss.user.id }).expect(403);
    await api().post('/api/admin/delete-requests').set(deleter.auth).send({ targetType: 'company' }).expect(403);
    await api().post('/api/admin/delete-requests').set(sa.auth).send({ targetType: 'user', targetId: new mongoose.Types.ObjectId().toString() }).expect(404);
    await api().post('/api/admin/delete-requests').set(sa.auth).send({ targetType: 'nonsense', targetId: '1' }).expect(400);
    // Employees can't raise them at all
    await api().post('/api/admin/delete-requests').set((await makeUser()).auth).send({ targetType: 'user', targetId: target.user.id }).expect(403);
  });

  it('runs the same safety checks when approved (a department with members stays)', async () => {
    const sa = await makePlatformAdmin();
    const admin = await makeSuperAdmin();
    const dept = await api().post('/api/admin/departments').set(admin.auth).send({ name: 'Busy Dept' }).expect(201);
    await makeUser({ department: 'Busy Dept' });
    const asked = await api().delete(`/api/admin/departments/${dept.body.id}`).set(admin.auth).expect(202);
    const blocked = await platformApi().patch(`/api/platform/delete-requests/${asked.body.id}`).set(sa.auth).send({ decision: 'approve' }).expect(409);
    expect(blocked.body.message).toMatch(/still belong/);
    // The failed attempt leaves the request open for another go
    const still = await api().get('/api/admin/delete-requests?status=Pending').set(admin.auth);
    expect(still.body.map((r) => r.id)).toContain(asked.body.id);
  });

  it('closes the whole company when its deletion request is approved', async () => {
    const sa = await makePlatformAdmin();
    const co = await makeCompany('doomed');
    const admin = await makeSuperAdmin({}, co.company);
    const asked = await co.api().post('/api/admin/delete-requests').set(admin.auth).send({ targetType: 'company', reason: 'Closing down' }).expect(201);
    expect(asked.body).toMatchObject({ targetType: 'company', targetLabel: 'doomed Ltd', status: 'Pending' });
    await co.api().get('/api/auth/me').set(admin.auth).expect(200); // still open while pending

    await platformApi().patch(`/api/platform/delete-requests/${asked.body.id}`).set(sa.auth).send({ decision: 'approve' }).expect(200);
    await co.api().get('/api/auth/workspace').expect(404);
    await co.api().get('/api/auth/me').set(admin.auth).expect(404);
    const list = await platformApi().get('/api/platform/companies').set(sa.auth).expect(200);
    expect(list.body.map((c) => c.slug)).not.toContain('doomed');
    const log = await platformApi().get(`/api/platform/audit?companyId=${co.company.id}`).set(sa.auth).expect(200);
    expect(log.body.items.map((i) => i.action)).toEqual(expect.arrayContaining(['delete_request.create', 'delete_request.approve']));
  });

  it('only lets the company admin ask to delete the company', async () => {
    const admin = await makeAdmin({ permissions: 'all' });
    await api().post('/api/admin/delete-requests').set(admin.auth).send({ targetType: 'company' }).expect(403);
  });

  it('keeps one company from approving or even seeing another company\'s requests', async () => {
    const co = await makeCompany('rival');
    const admin = await makeSuperAdmin();
    const rival = await makeSuperAdmin({}, co.company);
    const target = await makeUser();
    const asked = await api().post('/api/admin/delete-requests').set(admin.auth).send({ targetType: 'user', targetId: target.user.id }).expect(201);
    const theirs = await co.api().get('/api/admin/delete-requests').set(rival.auth).expect(200);
    expect(theirs.body.map((r) => r.id)).not.toContain(asked.body.id);
    await co.api().patch(`/api/platform/delete-requests/${asked.body.id}`).set(rival.auth).send({ decision: 'approve' }).expect(403);
    // A request can't name a record in another company either
    await co.api().post('/api/admin/delete-requests').set(rival.auth).send({ targetType: 'user', targetId: target.user.id }).expect(404);
  });
});

describe('sensitive data: encryption and masking', () => {
  const pay = { basic: 50000, hra: 20000, allowances: 5000, currency: 'INR' };

  it('stores pay figures as ciphertext and reads them back as numbers', async () => {
    const admin = await makeSuperAdmin();
    const emp = await makeUser();
    await api().put(`/api/admin/payroll/structures/${emp.user.id}`).set(admin.auth).send(pay).expect(200);

    const raw = await mongoose.connection.collection('salarystructures').findOne({ userId: emp.user._id });
    for (const field of ['basic', 'hra', 'allowances', 'pfPercent', 'taxPercent']) {
      expect(raw[field], field).toMatch(/^enc:v1:/);
    }
    expect(JSON.stringify(raw)).not.toContain('50000');

    const list = await api().get('/api/admin/payroll/structures').set(admin.auth).expect(200);
    expect(list.body.find((r) => r.user.id === emp.user.id).structure).toMatchObject({ basic: 50000, hra: 20000, allowances: 5000, pfPercent: 12 });

    // Payslips are sealed as well and still render
    await api().post('/api/admin/payroll/run-monthly').set(admin.auth).send({ month: '2025-03' }).expect(201);
    const slips = await mongoose.connection.collection('payslips').find({ userId: emp.user._id }).toArray();
    expect(slips[0].net).toMatch(/^enc:v1:/);
    const mine = await api().get('/api/user/payslips').set(emp.auth).expect(200);
    expect(mine.body[0].net).toBeGreaterThan(0);
    await api().get(`/api/user/payslips/${mine.body[0].id}/pdf`).set(emp.auth).expect(200);
  });

  it("uses a separate key per company: one company's ciphertext is useless in another", async () => {
    const co = await makeCompany('keyed');
    const a = await makeUser();
    const b = await makeUser({}, co.company);
    const saA = await makeSuperAdmin();
    const saB = await makeSuperAdmin({}, co.company);
    await api().put(`/api/admin/users/${a.user.id}/sensitive`).set(saA.auth).send({ bankAccount: '111122223333' }).expect(200);
    await co.api().put(`/api/admin/users/${b.user.id}/sensitive`).set(saB.auth).send({ bankAccount: '111122223333' }).expect(200);

    const rawA = await mongoose.connection.collection('users').findOne({ _id: a.user._id });
    const rawB = await mongoose.connection.collection('users').findOne({ _id: b.user._id });
    expect(rawA.sensitive.bankAccount).toMatch(/^enc:v1:/);
    expect(rawA.sensitive.bankAccount).not.toBe(rawB.sensitive.bankAccount); // same value, different key and IV

    // Moving company A's ciphertext into company B's record makes it unreadable (authenticated per company)
    await mongoose.connection.collection('users').updateOne({ _id: b.user._id }, { $set: { 'sensitive.bankAccount': rawA.sensitive.bankAccount } });
    await co.api().get(`/api/admin/users/${b.user.id}/sensitive`).set(saB.auth).expect(500);
  });

  it('keeps bank and ID details out of normal user responses and lets people manage their own', async () => {
    const emp = await makeUser();
    const admin = await makeSuperAdmin();
    await api().put('/api/user/profile/sensitive').set(emp.auth).send({ bankName: 'HDFC', bankAccount: '9876543210', governmentId: 'ABCDE1234F' }).expect(200);
    expect((await api().get('/api/user/profile/sensitive').set(emp.auth)).body).toMatchObject({ bankAccount: '9876543210', governmentId: 'ABCDE1234F' });
    for (const path of ['/api/user/profile', '/api/auth/me']) {
      const res = await api().get(path).set(emp.auth).expect(200);
      expect(JSON.stringify(res.body)).not.toContain('9876543210');
    }
    const list = await api().get('/api/admin/users').set(admin.auth).expect(200);
    expect(JSON.stringify(list.body)).not.toContain('ABCDE1234F');
    // The company admin can read it (and that is logged); other employees cannot
    expect((await api().get(`/api/admin/users/${emp.user.id}/sensitive`).set(admin.auth).expect(200)).body.bankName).toBe('HDFC');
    await api().get(`/api/admin/users/${emp.user.id}/sensitive`).set((await makeUser()).auth).expect(403);
    await api().put('/api/user/profile/sensitive').set(emp.auth).send({}).expect(400);
    // The audit log records which fields changed, never the values
    const log = await api().get('/api/admin/audit?q=bank').set(admin.auth).expect(200);
    expect(JSON.stringify(log.body)).not.toContain('9876543210');
    expect(log.body.items.some((i) => i.action === 'sensitive.view')).toBe(true);
  });

  it('stores passwords only as salted hashes', async () => {
    const u = await makeUser();
    const raw = await mongoose.connection.collection('users').findOne({ _id: u.user._id });
    expect(raw.password).not.toContain('Password@1');
    expect(raw.password.split('$').length).toBeGreaterThan(1);
    expect(hashPassword('Password@1')).not.toBe(hashPassword('Password@1')); // salted
    expect(JSON.stringify((await api().get('/api/auth/me').set(u.auth)).body)).not.toContain('password');
  });
});

describe('Super Admin access to company data', () => {
  const setup = async (slug) => {
    const co = await makeCompany(slug);
    const admin = await makeSuperAdmin({}, co.company);
    const emp = await makeUser({ name: 'Eve Employee' }, co.company);
    await co.api().put(`/api/admin/users/${emp.user.id}/sensitive`).set(admin.auth).send({ bankAccount: '5555666677778888', governmentId: 'GOV-12345' }).expect(200);
    await co.api().put(`/api/admin/payroll/structures/${emp.user.id}`).set(admin.auth).send({ basic: 70000, hra: 10000, allowances: 0 }).expect(200);
    return { co, admin, emp, sa: await makePlatformAdmin() };
  };

  it('shows platform-level details and masks sensitive data by default', async () => {
    const { co, sa, emp } = await setup('maskco');
    const detail = await platformApi().get(`/api/platform/companies/${co.company.id}`).set(sa.auth).expect(200);
    expect(detail.body.usage.employees).toBeGreaterThanOrEqual(2);

    const res = await platformApi().get(`/api/platform/companies/${co.company.id}/employees`).set(sa.auth).expect(200);
    expect(res.body.unmasked).toBe(false);
    const row = res.body.employees.find((e) => e.id === emp.user.id);
    expect(row).toMatchObject({ name: 'Eve Employee', sensitive: { bankAccount: '••••••••', governmentId: '••••••••', monthlyGross: '••••••••' } });
    expect(JSON.stringify(res.body)).not.toMatch(/5555666677778888|GOV-12345|80000/);
    // And no other route hands employee content to the platform
    await platformApi().get('/api/admin/users').set(sa.auth).expect(403);
    const directory = await platformApi().get('/api/user/directory').set(sa.auth).expect(200);
    expect(directory.body.every((u) => u.role === 'PLATFORM_ADMIN')).toBe(true); // platform staff only, no company people
  });

  it('shows unmasked data only under a temporary grant, logs every view, and honours revoke and expiry', async () => {
    const { co, admin, sa, emp } = await setup('grantco');

    await co.api().post('/api/admin/support-access').set(admin.auth).send({ hours: 2 }).expect(400); // needs a reason
    await co.api().post('/api/admin/support-access').set(admin.auth).send({ hours: 9999, reason: 'x' }).expect(400);
    const grant = await co.api().post('/api/admin/support-access').set(admin.auth).send({ hours: 2, reason: 'Payroll bug #42' }).expect(201);
    expect(new Date(grant.body.expiresAt).getTime()).toBeGreaterThan(Date.now() + 3600 * 1000);

    expect((await platformApi().get(`/api/platform/companies/${co.company.id}`).set(sa.auth)).body.supportAccess).toMatchObject({ active: true, reason: 'Payroll bug #42' });
    const open = await platformApi().get(`/api/platform/companies/${co.company.id}/employees`).set(sa.auth).expect(200);
    expect(open.body.unmasked).toBe(true);
    expect(open.body.employees.find((e) => e.id === emp.user.id).sensitive).toMatchObject({ bankAccount: '5555666677778888', governmentId: 'GOV-12345', monthlyGross: 80000 });
    await platformApi().get(`/api/platform/companies/${co.company.id}/employees`).set(sa.auth).expect(200);

    // Each view is in the log the company can see, with the view count on the grant
    const log = await co.api().get('/api/admin/audit?q=support').set(admin.auth).expect(200);
    const views = log.body.items.filter((i) => i.action === 'support.view');
    expect(views).toHaveLength(2);
    expect(views[0]).toMatchObject({ actorRole: 'PLATFORM_ADMIN' });
    expect(log.body.items.some((i) => i.action === 'support.grant')).toBe(true);
    const grants = await co.api().get('/api/admin/support-access').set(admin.auth).expect(200);
    expect(grants.body[0]).toMatchObject({ active: true, views: 2 });

    // The company can pull access at any moment
    await co.api().post(`/api/admin/support-access/${grant.body.id}/revoke`).set(admin.auth).expect(200);
    expect((await platformApi().get(`/api/platform/companies/${co.company.id}/employees`).set(sa.auth)).body.unmasked).toBe(false);
    await co.api().post(`/api/admin/support-access/${grant.body.id}/revoke`).set(admin.auth).expect(404);

    // ...and access expires on its own
    const second = await co.api().post('/api/admin/support-access').set(admin.auth).send({ hours: 1, reason: 'Again' }).expect(201);
    expect((await platformApi().get(`/api/platform/companies/${co.company.id}/employees`).set(sa.auth)).body.unmasked).toBe(true);
    await runAcrossTenants(() => mongoose.connection.collection('supportaccesses').updateOne({ _id: new mongoose.Types.ObjectId(second.body.id) }, { $set: { expiresAt: new Date(Date.now() - 1000) } }));
    expect((await platformApi().get(`/api/platform/companies/${co.company.id}/employees`).set(sa.auth)).body.unmasked).toBe(false);
  });

  it("a grant from one company gives no access to another's data", async () => {
    const { co, admin, sa } = await setup('grantone');
    const other = await setup('granttwo');
    await co.api().post('/api/admin/support-access').set(admin.auth).send({ hours: 2, reason: 'Help' }).expect(201);
    const res = await platformApi().get(`/api/platform/companies/${other.co.company.id}/employees`).set(sa.auth).expect(200);
    expect(res.body.unmasked).toBe(false);
  });
});

describe('data-layer details', () => {
  it('writes platform audit entries without a company and company entries with one', async () => {
    const sa = await makePlatformAdmin();
    const co = await makeCompany('auditco');
    await platformApi().put(`/api/platform/companies/${co.company.id}`).set(sa.auth).send({ name: 'Audit Co' }).expect(200);
    const entry = await runAcrossTenants(() => AuditLog.findOne({ action: 'company.update', entityId: co.company.id }));
    expect(String(entry.companyId)).toBe(co.company.id);
    // Company staff see it in their own log; another company does not
    const admin = await makeSuperAdmin({}, co.company);
    const mine = await co.api().get('/api/admin/audit?q=Updated').set(admin.auth).expect(200);
    expect(mine.body.items.some((i) => i.action === 'company.update')).toBe(true);
    const outsider = await makeSuperAdmin();
    const theirs = await api().get('/api/admin/audit?q=Updated').set(outsider.auth).expect(200);
    expect(theirs.body.items.some((i) => i.entityId === co.company.id)).toBe(false);
  });

  it('platform scope only sees platform-owned documents', async () => {
    await makePlatformAdmin();
    const visible = await runAsPlatform(() => User.find());
    expect(visible.every((u) => u.role === 'PLATFORM_ADMIN')).toBe(true);
    expect(await runAsPlatform(() => SalaryStructure.countDocuments())).toBe(0);
  });
});

describe('custom company logo (a feature the platform enables)', () => {
  // Smallest valid-looking headers; the server only checks the leading bytes
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
  const upload = (co, admin, body, type = 'image/png') =>
    co.api().put('/api/admin/company/logo').set(admin.auth).set('Content-Type', type).send(body);

  it('is off until the platform enables it, then the company admin can upload, see and remove one', async () => {
    const sa = await makePlatformAdmin();
    const co = await makeCompany('brandco');
    const admin = await makeSuperAdmin({}, co.company);

    expect((await co.api().get('/api/auth/workspace')).body).toMatchObject({ features: { customLogo: false }, logoUrl: null });
    const blocked = await upload(co, admin, png).expect(403);
    expect(blocked.body.code).toBe('FEATURE_DISABLED');
    await co.api().get('/api/auth/logo').expect(404);

    await platformApi().put(`/api/platform/companies/${co.company.id}`).set(sa.auth).send({ features: { customLogo: true } }).expect(200);
    await platformApi().put(`/api/platform/companies/${co.company.id}`).set(sa.auth).send({ features: { nonsense: true } }).expect(400);
    await upload(co, admin, png).expect(200);

    const ws = (await co.api().get('/api/auth/workspace')).body;
    expect(ws.logoUrl).toMatch(/^\/api\/auth\/logo\?v=\d+$/);
    const img = await co.api().get('/api/auth/logo').buffer(true).parse((res, cb) => { const c = []; res.on('data', (d) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); }).expect(200);
    expect(img.headers['content-type']).toBe('image/png');
    expect(img.headers['x-content-type-options']).toBe('nosniff');
    expect(img.body.equals(png)).toBe(true);
    // The image bytes never appear in JSON responses
    expect(JSON.stringify((await co.api().get('/api/admin/company').set(admin.auth)).body)).not.toContain('logoData');

    // Another company still shows the platform's logo
    await api().get('/api/auth/logo').expect(404);

    // Switching the feature off hides it without deleting it
    await platformApi().put(`/api/platform/companies/${co.company.id}`).set(sa.auth).send({ features: { customLogo: false } }).expect(200);
    await co.api().get('/api/auth/logo').expect(404);
    expect((await co.api().get('/api/auth/workspace')).body.logoUrl).toBeNull();
    await platformApi().put(`/api/platform/companies/${co.company.id}`).set(sa.auth).send({ features: { customLogo: true } }).expect(200);
    await co.api().delete('/api/admin/company/logo').set(admin.auth).expect(200);
    await co.api().get('/api/auth/logo').expect(404);
  });

  it('only accepts real PNG, JPEG and WebP images of a sensible size, from the company admin', async () => {
    const co = await makeCompany('logorules', { features: { customLogo: true } });
    const admin = await makeSuperAdmin({}, co.company);
    const plain = await makeAdmin({}, co.company);

    await upload(co, admin, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'image/png').expect(400); // not an image
    await upload(co, admin, png, 'image/svg+xml').expect(400); // type not accepted, body not parsed
    await upload(co, admin, Buffer.concat([png, Buffer.alloc(300 * 1024)])).expect(413);
    await upload(co, admin, Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(32)]), 'image/jpeg').expect(200);
    await upload(co, plain, png).expect(403);
    await co.api().delete('/api/admin/company/logo').set(plain.auth).expect(403);
    // Logo changes are audited
    const log = await co.api().get('/api/admin/audit?q=logo').set(admin.auth).expect(200);
    expect(log.body.items.some((i) => i.action === 'company.logo')).toBe(true);
  });

  it('lets the platform grant the feature when onboarding', async () => {
    const sa = await makePlatformAdmin();
    const res = await platformApi().post('/api/platform/companies').set(sa.auth).send({ name: 'Logo Onboard', features: { customLogo: true } }).expect(201);
    expect(res.body.features.customLogo).toBe(true);
  });
});
