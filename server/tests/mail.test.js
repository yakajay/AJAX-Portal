import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

process.env.SSO_ALLOW_PRIVATE_HOSTS = 'true'; // the mail server is checked like an IdP; tests use a fake host

const sent = [];
const failure = { error: null };
vi.mock('nodemailer', () => ({
  default: {
    createTransport: (options) => ({
      options,
      sendMail: async (mail) => {
        if (failure.error) throw new Error(failure.error);
        sent.push({ ...mail, via: options.host });
      }
    })
  }
}));

const db = await import('./helpers/db.js');
const { api, platformApi, makeSuperAdmin, makeAdmin, makePlatformAdmin, makeCompany, inTenant } = await import('./helpers/fixtures.js');
const { Company } = await import('../src/models/company.model.js');
const { assertPublicHost } = await import('../src/utils/safeFetch.js');

beforeAll(async () => {
  await db.connectTestDb();
  // The platform has to switch the feature on for a company before its admin can use it
  await Company.updateOne({ slug: 'acme' }, { 'features.customEmail': true });
});
afterAll(db.disconnectTestDb);

const SETTINGS = { host: 'smtp.acme.test', port: 587, username: 'hr@acme.test', password: 'app-pass', fromName: 'Acme HR', fromEmail: 'hr@acme.test' };

describe('company mail settings', () => {
  it('is for the company admin only, and never returns the password', async () => {
    const admin = await makeSuperAdmin();
    const plain = await makeAdmin();
    await api().put('/api/admin/company/mail').set(plain.auth).send(SETTINGS).expect(403);

    const saved = await api().put('/api/admin/company/mail').set(admin.auth).send(SETTINGS).expect(200);
    expect(saved.body).toMatchObject({ host: 'smtp.acme.test', fromEmail: 'hr@acme.test', enabled: false, passwordSet: true });
    expect(saved.body.password).toBeUndefined();
    expect(JSON.stringify((await api().get('/api/admin/company/mail').set(admin.auth).expect(200)).body)).not.toContain('app-pass');

    const raw = await Company.findOne({ slug: 'acme' });
    expect(raw.mail.password).toMatch(/^enc:v1:/); // sealed at rest
  });

  it('validates input and refuses to enable before a successful test', async () => {
    const admin = await makeSuperAdmin();
    await api().put('/api/admin/company/mail').set(admin.auth).send({ ...SETTINGS, fromEmail: 'nope' }).expect(400);
    await api().put('/api/admin/company/mail').set(admin.auth).send({ ...SETTINGS, port: 99999 }).expect(400);
    await api().put('/api/admin/company/mail').set(admin.auth).send(SETTINGS).expect(200);
    const res = await api().put('/api/admin/company/mail').set(admin.auth).send({ enabled: true }).expect(400);
    expect(res.body.message).toMatch(/test email/i);
  });

  it('tests the saved settings, then enables; editing the connection switches it off again', async () => {
    const admin = await makeSuperAdmin();
    await api().put('/api/admin/company/mail').set(admin.auth).send(SETTINGS).expect(200);

    failure.error = 'Invalid login';
    const bad = await api().post('/api/admin/company/mail/test').set(admin.auth).expect(422);
    expect(bad.body.message).toContain('Invalid login');
    failure.error = null;

    sent.length = 0;
    const ok = await api().post('/api/admin/company/mail/test').set(admin.auth).expect(200);
    expect(ok.body.lastTestOk).toBe(true);
    expect(sent[0]).toMatchObject({ to: admin.user.email, via: 'smtp.acme.test', from: { name: 'Acme HR', address: 'hr@acme.test' } });

    // Resending unchanged values keeps the passed test
    const on = await api().put('/api/admin/company/mail').set(admin.auth).send({ ...SETTINGS, password: '', enabled: true }).expect(200);
    expect(on.body.enabled).toBe(true);

    const edited = await api().put('/api/admin/company/mail').set(admin.auth).send({ host: 'smtp2.acme.test' }).expect(200);
    expect(edited.body).toMatchObject({ enabled: false, lastTestOk: null });
  });
});

describe('platform control of the company mailbox', () => {
  it('is unavailable until the platform enables it, and the platform can switch it off again', async () => {
    const sa = await makePlatformAdmin();
    const co = await makeCompany('mailgate');
    const admin = await makeSuperAdmin({}, co.company);

    for (const call of [co.api().get('/api/admin/company/mail'), co.api().put('/api/admin/company/mail').send(SETTINGS), co.api().post('/api/admin/company/mail/test')]) {
      const res = await call.set(admin.auth).expect(403);
      expect(res.body.code).toBe('FEATURE_DISABLED');
    }

    await platformApi().put(`/api/platform/companies/${co.company.id}`).set(sa.auth).send({ features: { customEmail: true } }).expect(200);
    await co.api().put('/api/admin/company/mail').set(admin.auth).send(SETTINGS).expect(200);
    await co.api().post('/api/admin/company/mail/test').set(admin.auth).expect(200);
    await co.api().put('/api/admin/company/mail').set(admin.auth).send({ enabled: true }).expect(200);

    const { sendMail } = await vi.importActual('../src/utils/mailer.js');
    sent.length = 0;
    await inTenant(() => sendMail({ to: 'a@b.test', subject: 's', text: 't' }), co.company);
    expect(sent[0]).toMatchObject({ via: 'smtp.acme.test' });

    // Switching the feature off sends the company back to the platform sender straight away
    await platformApi().put(`/api/platform/companies/${co.company.id}`).set(sa.auth).send({ features: { customEmail: false } }).expect(200);
    sent.length = 0;
    await inTenant(() => sendMail({ to: 'a@b.test', subject: 's', text: 't' }), co.company);
    expect(sent).toHaveLength(0);
    await co.api().get('/api/admin/company/mail').set(admin.auth).expect(403);
  });

  it('can be granted when onboarding a company', async () => {
    const sa = await makePlatformAdmin();
    const res = await platformApi().post('/api/platform/companies').set(sa.auth).send({ name: 'Mail Onboard', features: { customEmail: true } }).expect(201);
    expect(res.body.features).toMatchObject({ customEmail: true, customLogo: false });
  });
});

describe('mail routing', () => {
  it('sends a company\'s mail from its own mailbox, and falls back to the platform otherwise', async () => {
    const { sendMail } = await vi.importActual('../src/utils/mailer.js');
    const company = await Company.findOne({ slug: 'acme' });
    await Company.updateOne({ _id: company._id }, { 'mail.enabled': true });

    sent.length = 0;
    await inTenant(() => sendMail({ to: 'a@b.test', subject: 's', text: 't' }), company);
    expect(sent[0]).toMatchObject({ via: 'smtp2.acme.test', to: 'a@b.test' });

    await Company.updateOne({ _id: company._id }, { 'mail.enabled': false });
    sent.length = 0;
    await inTenant(() => sendMail({ to: 'a@b.test', subject: 's', text: 't' }), company);
    expect(sent).toHaveLength(0); // no platform SMTP in tests: printed, not sent
  });
});

describe('mail server guard', () => {
  it('refuses private addresses when private hosts are not allowed', async () => {
    const { env } = await import('../src/config/env.js');
    env.sso.allowPrivateHosts = false;
    try {
      await expect(assertPublicHost('127.0.0.1')).rejects.toThrow(/public/);
      await expect(assertPublicHost('10.0.0.5')).rejects.toThrow(/public/);
      await expect(assertPublicHost('bad host')).rejects.toThrow();
    } finally {
      env.sso.allowPrivateHosts = true;
    }
  });
});
