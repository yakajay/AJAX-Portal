import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { connectTestDb, disconnectTestDb } from './helpers/db.js';
import { api, makeUser, inTenant } from './helpers/fixtures.js';
import { outbox } from './helpers/setup.js';
import { User } from '../src/models/user.model.js';
import { Session } from '../src/models/session.model.js';
import { hashPassword } from '../src/utils/password.js';
import { totp } from '../src/utils/totp.js';
import { vi } from 'vitest';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(() => { outbox.length = 0; });

const lastCode = () => outbox.at(-1).text.match(/code is (\d{6})/)[1];

const makeLoginUser = async (extra = {}) => {
  const email = `login${Math.random().toString(36).slice(2, 8)}@test.local`;
  await inTenant(() => User.create({ email, name: 'Login User', password: hashPassword('Password@1'), role: 'USER', ...extra }));
  return email;
};

describe('login with emailed code', () => {
  it('rejects a wrong password and requires the code before issuing tokens', async () => {
    const email = await makeLoginUser();
    await api().post('/api/auth/login').send({ email, password: 'nope' }).expect(401);

    const step1 = await api().post('/api/auth/login').send({ email, password: 'Password@1' }).expect(200);
    expect(step1.body).toMatchObject({ otpRequired: true, method: 'email' });
    expect(step1.body.token).toBeUndefined();

    await api().post('/api/auth/login/verify').send({ email, otp: '000000' }).expect(401);
    const done = await api().post('/api/auth/login/verify').send({ email, otp: lastCode() }).expect(200);
    expect(done.body.token).toBeTruthy();
    expect(done.body.refreshToken).toBeTruthy();
    expect(done.body.user.password).toBeUndefined();
    expect(done.body.user.totp).toBeUndefined();

    await api().get('/api/auth/me').set('Authorization', `Bearer ${done.body.token}`).expect(200);
  });

  it('refuses locked accounts', async () => {
    const email = await makeLoginUser({ locked: true });
    await api().post('/api/auth/login').send({ email, password: 'Password@1' }).expect(403);
  });
});

describe('refresh tokens and sessions', () => {
  it('rotates the refresh token and rejects reuse of the old one', async () => {
    const { refreshToken } = await makeUser();
    const first = await api().post('/api/auth/refresh').send({ refreshToken }).expect(200);
    expect(first.body.refreshToken).not.toBe(refreshToken);
    await api().get('/api/auth/me').set('Authorization', `Bearer ${first.body.token}`).expect(200);
    await api().post('/api/auth/refresh').send({ refreshToken }).expect(401);
    await api().post('/api/auth/refresh').send({ refreshToken: first.body.refreshToken }).expect(200);
  });

  it('logout ends only the current session', async () => {
    const a = await makeUser();
    // second device for the same user
    const second = await api().post('/api/auth/refresh').send({ refreshToken: a.refreshToken });
    await api().post('/api/auth/logout').set(a.auth).expect(200);
    await api().get('/api/auth/me').set(a.auth).expect(401);
    await api().post('/api/auth/refresh').send({ refreshToken: second.body.refreshToken }).expect(401); // same session, rotated
  });

  it('lists devices and signs out of one or all', async () => {
    const me = await makeUser();
    const other = await (async () => {
      const { startSession } = await import('../src/utils/sessions.js');
      return inTenant(() => startSession(me.user, { headers: { 'user-agent': 'phone' }, ip: '10.0.0.2' }));
    })();
    const list = await api().get('/api/user/sessions').set(me.auth).expect(200);
    expect(list.body).toHaveLength(2);
    expect(list.body.filter((s) => s.current)).toHaveLength(1);
    expect(list.body[0].refreshHash).toBeUndefined();

    const target = list.body.find((s) => !s.current);
    await api().delete(`/api/user/sessions/${target.id}`).set(me.auth).expect(200);
    await api().get('/api/auth/me').set({ Authorization: `Bearer ${other.token}` }).expect(401);

    await api().post('/api/user/sessions/logout-all').set(me.auth).expect(200);
    await api().get('/api/auth/me').set(me.auth).expect(401);
  });

  it("does not let one user end another user's session", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const bSession = await inTenant(() => Session.findOne({ userId: b.user.id }));
    await api().delete(`/api/user/sessions/${bSession.id}`).set(a.auth).expect(404);
    await api().get('/api/auth/me').set(b.auth).expect(200);
  });

  it('changing password signs out other devices but not this one', async () => {
    const me = await makeUser();
    // a wrong current password is a validation error (400), never a 401 that would end the session
    await api().put('/api/user/password').set(me.auth).send({ currentPassword: 'nope', newPassword: 'NewPass@123' }).expect(400);
    const { startSession } = await import('../src/utils/sessions.js');
    const other = await startSession(me.user, { headers: {}, ip: '' });
    await api().put('/api/user/password').set(me.auth).send({ currentPassword: 'Password@1', newPassword: 'NewPass@123' }).expect(200);
    await api().get('/api/auth/me').set(me.auth).expect(200);
    await api().get('/api/auth/me').set({ Authorization: `Bearer ${other.token}` }).expect(401);
  });

  it('locking an account ends its sessions', async () => {
    const { makeSuperAdmin } = await import('./helpers/fixtures.js');
    const admin = await makeSuperAdmin();
    const victim = await makeUser();
    await api().patch(`/api/admin/users/${victim.user.id}/lock`).set(admin.auth).send({ locked: true }).expect(200);
    await api().get('/api/auth/me').set(victim.auth).expect(401);
  });
});

describe('authenticator-app 2FA', () => {
  afterEach(() => vi.useRealTimers());

  it('can be set up, used to sign in, and disabled', async () => {
    // Each code works once, so move the clock forward 30 s between uses (only Date is faked)
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2030-01-01T10:00:00Z'));
    const me = await makeUser();
    const setup = await api().post('/api/user/2fa/setup').set(me.auth).expect(200);
    expect(setup.body.otpauthUrl).toContain('otpauth://totp/');

    await api().post('/api/user/2fa/enable').set(me.auth).send({ code: '123456' }).expect(400);
    const enabled = await api().post('/api/user/2fa/enable').set(me.auth).send({ code: totp(setup.body.secret) }).expect(200);
    expect(enabled.body.totpEnabled).toBe(true);
    expect(enabled.body.totp).toBeUndefined();
    await api().post('/api/user/2fa/setup').set(me.auth).expect(409);

    // Profile responses never reveal the secret
    const profile = await api().get('/api/user/profile').set(me.auth).expect(200);
    expect(JSON.stringify(profile.body)).not.toContain(setup.body.secret);

    // Sign in: no email is sent, the authenticator code works
    vi.setSystemTime(new Date('2030-01-01T10:00:31Z'));
    outbox.length = 0;
    const step1 = await api().post('/api/auth/login').send({ email: me.user.email, password: 'Password@1' }).expect(200);
    expect(step1.body.method).toBe('totp');
    expect(step1.body.methods).toEqual(['totp', 'email']);
    expect(outbox).toHaveLength(0);
    // No email code was requested, so an email-style code cannot sign in
    await api().post('/api/auth/login/verify').send({ email: me.user.email, otp: '123456' }).expect(401);
    await api().post('/api/auth/login/verify').send({ email: me.user.email, otp: '000000' }).expect(401);
    const done = await api().post('/api/auth/login/verify').send({ email: me.user.email, otp: totp(setup.body.secret) }).expect(200);
    expect(done.body.token).toBeTruthy();

    // Email fallback still works on request
    await api().post('/api/auth/resend-otp').send({ email: me.user.email, purpose: 'LOGIN' }).expect(200);
    expect(outbox).toHaveLength(1);
    await api().post('/api/auth/login/verify').send({ email: me.user.email, otp: lastCode() }).expect(200);

    // Disabling needs the password and a current (unused) code
    vi.setSystemTime(new Date('2030-01-01T10:01:02Z'));
    await api().post('/api/user/2fa/disable').set(me.auth).send({ password: 'wrong', code: totp(setup.body.secret) }).expect(400);
    const off = await api().post('/api/user/2fa/disable').set(me.auth).send({ password: 'Password@1', code: totp(setup.body.secret) }).expect(200);
    expect(off.body.totpEnabled).toBe(false);
  });
});

describe('authenticator codes cannot be replayed', () => {
  afterEach(() => vi.useRealTimers());

  it('refuses the same code twice, and accepts the next step', async () => {
    const me = await makeUser();
    const setup = await api().post('/api/user/2fa/setup').set(me.auth).expect(200);
    const start = Date.now();
    await api().post('/api/user/2fa/enable').set(me.auth).send({ code: totp(setup.body.secret, start) }).expect(200);

    // The code that confirmed setup is burned
    await api().post('/api/auth/login').send({ email: me.user.email, password: 'Password@1' }).expect(200);
    await api().post('/api/auth/login/verify').send({ email: me.user.email, otp: totp(setup.body.secret, start) }).expect(401);

    // A code from the following step works once, then never again
    const next = totp(setup.body.secret, start + 30_000);
    await api().post('/api/auth/login/verify').send({ email: me.user.email, otp: next }).expect(200);
    await api().post('/api/auth/login/verify').send({ email: me.user.email, otp: next }).expect(401);
  });
});

describe('operations endpoints', () => {
  it('reports health, readiness, metrics and the OpenAPI document', async () => {
    const health = await api().get('/api/health').expect(200);
    expect(health.body).toMatchObject({ status: 'ok', db: 'up' });
    await api().get('/api/health/ready').expect(200);

    const metrics = await api().get('/api/metrics').expect(200);
    expect(metrics.text).toContain('http_requests_total');
    expect(metrics.text).toContain('mongodb_connected 1');
    expect(metrics.text).toMatch(/route="\/api\/health"/);

    const spec = await api().get('/api/openapi.json').expect(200);
    expect(spec.body.openapi).toBe('3.0.3');
    expect(Object.keys(spec.body.paths).length).toBeGreaterThan(80);
    const docs = await api().get('/api/docs').expect(200);
    expect(docs.text).toContain('swagger-ui');
  });

  it('adds a request id to every response', async () => {
    const res = await api().get('/api/health').set('X-Request-Id', 'abc-123').expect(200);
    expect(res.headers['x-request-id']).toBe('abc-123');
  });
});
