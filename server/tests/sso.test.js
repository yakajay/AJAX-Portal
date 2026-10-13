import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';

// SSO config is read from the environment at import time
process.env.SSO_ISSUER = 'https://idp.test';
process.env.SSO_CLIENT_ID = 'client-1';
process.env.SSO_CLIENT_SECRET = 'secret';
process.env.SSO_ALLOWED_DOMAINS = 'corp.test';

const { connectTestDb, disconnectTestDb } = await import('./helpers/db.js');
const { api } = await import('./helpers/fixtures.js');
const { User } = await import('../src/models/user.model.js');
const { resetSsoDiscovery } = await import('../src/controllers/sso.controller.js');

beforeAll(connectTestDb);
afterAll(disconnectTestDb);

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; resetSsoDiscovery(); });

const idToken = (claims) =>
  `x.${Buffer.from(JSON.stringify({ iss: 'https://idp.test', aud: 'client-1', exp: Date.now() / 1000 + 600, ...claims })).toString('base64url')}.y`;

// Mocks the IdP; the nonce is filled in per login
const mockIdp = (claims) => {
  globalThis.fetch = vi.fn(async (url, init) => {
    if (String(url).endsWith('/.well-known/openid-configuration')) {
      return Response.json({
        issuer: 'https://idp.test',
        authorization_endpoint: 'https://idp.test/authorize',
        token_endpoint: 'https://idp.test/token'
      });
    }
    if (String(url) === 'https://idp.test/token') {
      return Response.json({ id_token: idToken({ ...claims, nonce: mockIdp.nonce }) });
    }
    return realFetch(url, init);
  });
};

// Runs /start then /callback the way a browser would
const login = async (claims, { tamperCookie = false } = {}) => {
  mockIdp(claims);
  const start = await api().get('/api/auth/sso/start').expect(302);
  const authUrl = new URL(start.headers.location);
  const nonce = authUrl.searchParams.get('nonce');
  mockIdp.nonce = nonce;
  const cookie = tamperCookie ? 'sso_state=other' : start.headers['set-cookie'][0].split(';')[0];
  const cb = await api()
    .get('/api/auth/sso/callback')
    .query({ code: 'abc', state: authUrl.searchParams.get('state') })
    .set('Cookie', cookie)
    .expect(302);
  return new URLSearchParams(new URL(cb.headers.location).hash.slice(1));
};

describe('single sign-on', () => {
  it('reports itself as enabled', async () => {
    const res = await api().get('/api/auth/sso/config').expect(200);
    expect(res.body.enabled).toBe(true);
  });

  it('signs in and provisions a company user, issuing working tokens', async () => {
    const params = await login({ email: 'New.Hire@corp.test', name: 'New Hire' });
    expect(params.get('error')).toBeNull();
    const me = await api().get('/api/auth/me').set('Authorization', `Bearer ${params.get('token')}`).expect(200);
    expect(me.body).toMatchObject({ email: 'new.hire@corp.test', name: 'New Hire', role: 'USER' });
  });

  it('signs in an existing user without changing their role', async () => {
    await User.create({ email: 'boss@corp.test', name: 'Boss', role: 'ADMIN' });
    const params = await login({ email: 'boss@corp.test' });
    const me = await api().get('/api/auth/me').set('Authorization', `Bearer ${params.get('token')}`).expect(200);
    expect(me.body.role).toBe('ADMIN');
  });

  it('rejects other email domains', async () => {
    const params = await login({ email: 'someone@gmail.com' });
    expect(params.get('token')).toBeNull();
    expect(params.get('error')).toMatch(/domain/);
  });

  it('rejects locked accounts and unverified provider emails', async () => {
    await User.create({ email: 'locked@corp.test', name: 'L', locked: true });
    expect((await login({ email: 'locked@corp.test' })).get('token')).toBeNull();
    expect((await login({ email: 'x@corp.test', email_verified: false })).get('token')).toBeNull();
  });

  it('rejects a callback whose cookie does not match the state', async () => {
    const params = await login({ email: 'csrf@corp.test' }, { tamperCookie: true });
    expect(params.get('token')).toBeNull();
  });

  it('rejects tokens for another audience', async () => {
    const params = await login({ email: 'aud@corp.test', aud: 'someone-else' });
    expect(params.get('token')).toBeNull();
  });
});
