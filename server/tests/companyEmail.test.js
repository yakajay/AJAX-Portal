import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import * as db from './helpers/db.js';
import { platformApi, makeSuperAdmin, makeAdmin, makePlatformAdmin, makeCompany } from './helpers/fixtures.js';
import { Company } from '../src/models/company.model.js';
import { runAsTenant } from '../src/utils/tenantContext.js';
import { primeCompanyKey } from '../src/utils/crypto.js';

// What nodemailer would have sent, and whether the (pretend) mailbox accepts the password
const sent = [];
const smtp = { reject: false };
vi.mock('nodemailer', () => ({
  default: {
    createTransport: (options) => ({
      sendMail: async (mail) => {
        if (smtp.reject) throw new Error('535 Authentication failed');
        sent.push({ options, mail });
      },
      close: () => {}
    })
  }
}));
vi.mock('../src/utils/safeFetch.js', async (original) => ({ ...(await original()), resolvePublicHost: async () => '203.0.113.7' }));

beforeAll(db.connectTestDb);
afterAll(db.disconnectTestDb);
beforeEach(() => { sent.length = 0; smtp.reject = false; });

const setup = async (slug, features = { customEmail: true }) => {
  const co = await makeCompany(slug, { features });
  const admin = await makeSuperAdmin({}, co.company);
  return { co, admin };
};
const save = (co, admin, body) => co.api().put('/api/admin/company/email').set(admin.auth).send(body);

describe('company sender mailbox', () => {
  it('is only available once the platform enables it', async () => {
    const { co, admin } = await setup('mailoff', {});
    const res = await co.api().get('/api/admin/company/email').set(admin.auth).expect(403);
    expect(res.body.code).toBe('FEATURE_DISABLED');
    await save(co, admin, { email: 'noreply@gmail.com', password: 'x', enabled: true }).expect(403);

    const sa = await makePlatformAdmin();
    await platformApi().put(`/api/platform/companies/${co.company.id}`).set(sa.auth).send({ features: { customEmail: true } }).expect(200);
    await co.api().get('/api/admin/company/email').set(admin.auth).expect(200);
  });

  it('is for the company admin only', async () => {
    const { co } = await setup('mailroles');
    const plain = await makeAdmin({}, co.company);
    await co.api().get('/api/admin/company/email').set(plain.auth).expect(403);
    await save(co, plain, { email: 'a@gmail.com' }).expect(403);
  });

  it('tests the mailbox before turning it on, picks the server from the address and never shows the password', async () => {
    const { co, admin } = await setup('mailon');
    const res = await save(co, admin, { fromName: 'Mail Co', email: 'Noreply@Gmail.com', password: 'app-password', enabled: true }).expect(200);

    expect(res.body).toMatchObject({ enabled: true, email: 'noreply@gmail.com', passwordSet: true, resolved: { host: 'smtp.gmail.com', port: 587 } });
    expect(res.body.verifiedAt).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toContain('app-password');
    expect(JSON.stringify((await co.api().get('/api/admin/company').set(admin.auth)).body)).not.toContain('app-password');

    // The test message went to the admin, from the company's mailbox, over the vetted address
    expect(sent).toHaveLength(1);
    expect(sent[0].mail).toMatchObject({ to: admin.user.email, from: { name: 'Mail Co', address: 'noreply@gmail.com' } });
    expect(sent[0].options).toMatchObject({ host: '203.0.113.7', port: 587, secure: false, auth: { user: 'noreply@gmail.com', pass: 'app-password' }, tls: { servername: 'smtp.gmail.com' } });

    // Stored sealed, not as typed
    const stored = await Company.findById(co.company.id);
    expect(stored.emailConfig.password).toMatch(/^enc:v1:/);
    expect(stored.emailConfig.password).not.toContain('app-password');
  });

  it('changes nothing when the test email fails', async () => {
    const { co, admin } = await setup('mailbad');
    smtp.reject = true;
    const res = await save(co, admin, { email: 'noreply@gmail.com', password: 'wrong', enabled: true }).expect(400);
    expect(res.body.message).toMatch(/nothing was changed/);
    const stored = await Company.findById(co.company.id);
    expect(stored.emailConfig.enabled).toBe(false);
    expect(stored.emailConfig.verifiedAt).toBeNull();
  });

  it('asks for the host on a domain it does not know, and validates the entries', async () => {
    const { co, admin } = await setup('mailhost');
    expect((await save(co, admin, { email: 'noreply@acme-corp.com', password: 'pw', enabled: true }).expect(400)).body.message).toMatch(/SMTP host/);
    await save(co, admin, { email: 'not-an-email' }).expect(400);
    await save(co, admin, { email: 'noreply@acme-corp.com', password: 'pw', host: 'smtp.acme-corp.com', port: 99999, enabled: true }).expect(400);
    await save(co, admin, { email: 'noreply@acme-corp.com', password: 'pw', enabled: true, host: 'bad host!' }).expect(400);
    const ok = await save(co, admin, { email: 'noreply@acme-corp.com', password: 'pw', host: 'smtp.acme-corp.com', port: 465, enabled: true }).expect(200);
    expect(ok.body.resolved).toEqual({ host: 'smtp.acme-corp.com', port: 465 });
    expect(sent.at(-1).options.secure).toBe(true);
  });

  it('keeps the saved password when left blank, but needs one for a new address', async () => {
    const { co, admin } = await setup('mailkeep');
    await save(co, admin, { email: 'noreply@gmail.com', password: 'first', enabled: true }).expect(200);
    await save(co, admin, { fromName: 'Renamed' }).expect(200);
    expect(sent.at(-1).options.auth.pass).toBe('first');
    await save(co, admin, { email: 'other@gmail.com' }).expect(400);
    await save(co, admin, { email: 'other@gmail.com', password: 'second' }).expect(200);
    expect(sent.at(-1).options.auth).toEqual({ user: 'other@gmail.com', pass: 'second' });
  });

  it('can be turned off, tested on demand and is audited without secrets', async () => {
    const { co, admin } = await setup('mailaudit');
    await co.api().post('/api/admin/company/email/test').set(admin.auth).expect(400); // nothing saved yet
    await save(co, admin, { email: 'noreply@gmail.com', password: 'pw-secret', enabled: true }).expect(200);
    sent.length = 0;
    const tested = await co.api().post('/api/admin/company/email/test').set(admin.auth).expect(200);
    expect(tested.body.message).toMatch(admin.user.email);
    expect(sent).toHaveLength(1);

    smtp.reject = true;
    await co.api().post('/api/admin/company/email/test').set(admin.auth).expect(400);
    expect((await co.api().get('/api/admin/company/email').set(admin.auth)).body.lastError).toMatch(/Authentication failed/);
    smtp.reject = false;

    expect((await save(co, admin, { enabled: false }).expect(200)).body.enabled).toBe(false);
    const log = await co.api().get('/api/admin/audit?q=email').set(admin.auth).expect(200);
    expect(log.body.items.some((i) => i.action === 'email.enable')).toBe(true);
    expect(log.body.items.some((i) => i.action === 'email.disable')).toBe(true);
    expect(JSON.stringify(log.body)).not.toContain('pw-secret');
  });
});

describe('which sender the mailer uses', () => {
  // The suite replaces the mailer with an outbox; load the real one to see where mail would go
  const realMailer = () => vi.importActual('../src/utils/mailer.js');

  const configured = async (slug, patch = {}) => {
    const { co, admin } = await setup(slug);
    await save(co, admin, { email: 'noreply@gmail.com', password: 'pw', enabled: true }).expect(200);
    if (Object.keys(patch).length) await Company.updateOne({ _id: co.company._id }, patch);
    sent.length = 0;
    return co;
  };
  const mail = { to: 'someone@example.com', subject: 'Your sign-in code', text: 'code 123456' };
  const inCompany = (co, fn) => runAsTenant(co.company._id, fn);

  it('sends a company’s OTPs and notifications from its own mailbox', async () => {
    const co = await configured('routeown');
    const { sendMail } = await realMailer();
    await inCompany(co, () => sendMail(mail));
    expect(sent).toHaveLength(1);
    expect(sent[0].mail).toMatchObject({ to: 'someone@example.com', from: { address: 'noreply@gmail.com' } });
  });

  it('stops using it when the platform switches the feature off, or the company turns it off', async () => {
    const off = await configured('routeplat');
    const { sendMail } = await realMailer();
    await Company.updateOne({ _id: off.company._id }, { 'features.customEmail': false });
    await inCompany(off, () => sendMail(mail));
    expect(sent).toHaveLength(0); // fell through to the platform sender (dev console output, no SMTP here)

    const paused = await configured('routeoff', { 'emailConfig.enabled': false });
    await inCompany(paused, () => sendMail(mail));
    expect(sent).toHaveLength(0);
  });

  it('never uses another company’s mailbox, or any mailbox outside a company', async () => {
    await configured('routeone');
    const other = await makeCompany('routetwo');
    const { sendMail } = await realMailer();
    await inCompany(other, () => sendMail(mail));
    await sendMail(mail);
    expect(sent).toHaveLength(0);
  });

  it('still delivers (from the platform sender) when the company mailbox fails, and records why', async () => {
    const co = await configured('routefail');
    const { sendMail } = await realMailer();
    smtp.reject = true;
    await expect(inCompany(co, () => sendMail(mail))).resolves.toBeUndefined();
    const stored = await Company.findById(co.company.id);
    expect(stored.emailConfig.lastError).toMatch(/Authentication failed/);
    expect(stored.emailConfig.lastErrorAt).toBeTruthy();
  });

  it('can read the sealed password back in a fresh process', async () => {
    const co = await configured('routekey');
    // Simulates a job or restart: the data key must be loaded from the company before the password can be opened
    const withKey = await Company.findById(co.company.id).select('+dataKey');
    primeCompanyKey(withKey.id, withKey.dataKey);
    const { sendMail } = await realMailer();
    await inCompany(co, () => sendMail(mail));
    expect(sent[0].options.auth.pass).toBe('pw');
  });
});
