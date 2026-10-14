import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';

// The identity providers in these tests are fake hosts, so skip the "public address" DNS check
process.env.SSO_ALLOW_PRIVATE_HOSTS = 'true';

// SAML signature checking is the library's job (and needs a real IdP key pair); here it is replaced so the
// tests can cover how the portal handles a validated assertion.
const samlState = vi.hoisted(() => ({ profile: null, error: null, lastOptions: null }));
vi.mock('@node-saml/node-saml', async (importOriginal) => {
  const real = await importOriginal();
  class FakeSAML {
    constructor(options) { samlState.lastOptions = options; }
    async getAuthorizeUrlAsync(relayState) {
      return `https://saml.idp.test/sso?RelayState=${encodeURIComponent(relayState)}`;
    }
    async validatePostResponseAsync() {
      if (samlState.error) throw new Error(samlState.error);
      return { profile: samlState.profile, loggedOut: false };
    }
  }
  return { ...real, SAML: FakeSAML };
});

const db = await import('./helpers/db.js');
const { connectTestDb, disconnectTestDb } = db;
const { api, makeSuperAdmin, makeAdmin, makeCompany, inTenant } = await import('./helpers/fixtures.js');
const { User } = await import('../src/models/user.model.js');
const { Company } = await import('../src/models/company.model.js');
const { resetSsoDiscovery } = await import('../src/controllers/sso.controller.js');
const { isPrivateAddress, assertPublicUrl } = await import('../src/utils/safeFetch.js');
const { env } = await import('../src/config/env.js');

beforeAll(connectTestDb);
afterAll(disconnectTestDb);

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; resetSsoDiscovery(); samlState.profile = null; samlState.error = null; });

const OIDC = { issuer: 'https://idp.test', clientId: 'client-1', clientSecret: 'secret' };

// Configures and enables OIDC for a company through the same API its admin would use
const enableOidc = (admin, host, overrides = {}) =>
  api(host).put('/api/admin/company/sso').set(admin.auth).send({
    protocol: 'oidc', providerName: 'Contoso', allowedDomains: ['corp.test'], autoProvision: true, oidc: OIDC, enabled: true, ...overrides
  });

const idToken = (claims) =>
  `x.${Buffer.from(JSON.stringify({ iss: 'https://idp.test', aud: 'client-1', exp: Date.now() / 1000 + 600, ...claims })).toString('base64url')}.y`;

// Mocks the IdP; the nonce is filled in per login
const mockIdp = (claims) => {
  globalThis.fetch = vi.fn(async (url, init) => {
    if (String(url).endsWith('/.well-known/openid-configuration')) {
      return Response.json({ issuer: 'https://idp.test', authorization_endpoint: 'https://idp.test/authorize', token_endpoint: 'https://idp.test/token' });
    }
    if (String(url) === 'https://idp.test/token') return Response.json({ id_token: idToken({ ...claims, nonce: mockIdp.nonce }) });
    return realFetch(url, init);
  });
};

// Runs /start then /callback the way a browser would
const login = async (claims, { host = 'acme.localhost', tamperCookie = false } = {}) => {
  mockIdp(claims);
  const start = await api(host).get('/api/auth/sso/start').expect(302);
  const authUrl = new URL(start.headers.location);
  mockIdp.nonce = authUrl.searchParams.get('nonce');
  const cookie = tamperCookie ? 'sso_state=other' : start.headers['set-cookie'][0].split(';')[0];
  const cb = await api(host)
    .get('/api/auth/sso/callback')
    .query({ code: 'abc', state: authUrl.searchParams.get('state') })
    .set('Cookie', cookie)
    .expect(302);
  return { params: new URLSearchParams(new URL(cb.headers.location).hash.slice(1)), location: cb.headers.location };
};

describe('SSO configuration by the company admin', () => {
  it('is off until configured, and only the company admin can configure it', async () => {
    const admin = await makeSuperAdmin();
    const plain = await makeAdmin();
    expect((await api().get('/api/auth/sso/config').expect(200)).body.enabled).toBe(false);
    await api().get('/api/auth/sso/start').expect(404);
    await api().put('/api/admin/company/sso').set(plain.auth).send({ enabled: true }).expect(403);

    // Cannot enable half-finished settings
    await api().put('/api/admin/company/sso').set(admin.auth).send({ enabled: true }).expect(400);
    await api().put('/api/admin/company/sso').set(admin.auth).send({ allowedDomains: ['corp.test'], oidc: { issuer: 'https://idp.test', clientId: 'c' } }).expect(200);
    await api().put('/api/admin/company/sso').set(admin.auth).send({ enabled: true }).expect(400); // no client secret yet
  });

  it('never returns the client secret, stores it sealed, and keeps it when left blank', async () => {
    const admin = await makeSuperAdmin();
    const res = await enableOidc(admin, 'acme.localhost').expect(200);
    expect(res.body.enabled).toBe(true);
    expect(res.body.oidc.clientSecret).toBeUndefined();
    expect(res.body.oidc.clientSecretSet).toBe(true);
    expect(res.body.registration.oidcRedirectUri).toMatch(/^http:\/\/acme\.localhost.*\/api\/auth\/sso\/callback$/);
    expect(res.body.registration.samlAcsUrl).toMatch(/\/api\/auth\/sso\/saml\/acs$/);

    const raw = await Company.collection.findOne({ _id: db.testCompany._id });
    expect(raw.sso.oidc.clientSecret).toMatch(/^enc:v1:/);
    expect(raw.sso.oidc.clientSecret).not.toContain('secret');

    const again = await api().put('/api/admin/company/sso').set(admin.auth).send({ providerName: 'Renamed', oidc: { clientSecret: '' } }).expect(200);
    expect(again.body.oidc.clientSecretSet).toBe(true);
    expect((await api().get('/api/auth/sso/config').expect(200)).body).toMatchObject({ enabled: true, providerName: 'Renamed', protocol: 'oidc' });

    // Changes are audited by field name, never by value
    const log = await api().get('/api/admin/audit?q=single').set(admin.auth).expect(200);
    const entry = log.body.items.find((i) => i.action === 'sso.update');
    expect(entry).toBeTruthy();
    expect(JSON.stringify(entry)).not.toContain('secret"');
  });

  it('can be disabled again, leaving password sign-in untouched', async () => {
    const admin = await makeSuperAdmin();
    await enableOidc(admin, 'acme.localhost').expect(200);
    await api().put('/api/admin/company/sso').set(admin.auth).send({ enabled: false }).expect(200);
    expect((await api().get('/api/auth/sso/config')).body.enabled).toBe(false);
    await api().get('/api/auth/sso/start').expect(404);
  });

  it('rejects bad domains and non-https provider URLs', async () => {
    const admin = await makeSuperAdmin();
    await api().put('/api/admin/company/sso').set(admin.auth).send({ allowedDomains: ['not a domain'] }).expect(400);
    const prior = env.sso.allowPrivateHosts;
    env.sso.allowPrivateHosts = false;
    try {
      await api().put('/api/admin/company/sso').set(admin.auth).send({ oidc: { issuer: 'http://idp.example.com' } }).expect(400);
      await api().put('/api/admin/company/sso').set(admin.auth).send({ oidc: { issuer: 'https://169.254.169.254' } }).expect(400);
      await api().put('/api/admin/company/sso').set(admin.auth).send({ saml: { entryPoint: 'https://localhost/sso' } }).expect(400);
    } finally {
      env.sso.allowPrivateHosts = prior;
    }
  });
});

describe('OpenID Connect sign-in', () => {
  it('signs in and provisions a company user, issuing working tokens', async () => {
    await enableOidc(await makeSuperAdmin(), 'acme.localhost').expect(200);
    const { params } = await login({ email: 'New.Hire@corp.test', name: 'New Hire' });
    expect(params.get('error')).toBeNull();
    const me = await api().get('/api/auth/me').set('Authorization', `Bearer ${params.get('token')}`).expect(200);
    expect(me.body).toMatchObject({ email: 'new.hire@corp.test', name: 'New Hire', role: 'USER' });
  });

  it('sends the browser back to the company\'s own subdomain', async () => {
    await enableOidc(await makeSuperAdmin(), 'acme.localhost').expect(200);
    const { location } = await login({ email: 'where@corp.test' });
    expect(new URL(location).host).toBe('acme.localhost');
  });

  it('signs in an existing user without changing their role', async () => {
    await enableOidc(await makeSuperAdmin(), 'acme.localhost').expect(200);
    await inTenant(() => User.create({ email: 'boss@corp.test', name: 'Boss', role: 'ADMIN' }));
    const { params } = await login({ email: 'boss@corp.test' });
    const me = await api().get('/api/auth/me').set('Authorization', `Bearer ${params.get('token')}`).expect(200);
    expect(me.body.role).toBe('ADMIN');
  });

  it('rejects other email domains, locked accounts and unverified provider emails', async () => {
    await enableOidc(await makeSuperAdmin(), 'acme.localhost').expect(200);
    const outsider = (await login({ email: 'someone@gmail.com' })).params;
    expect(outsider.get('token')).toBeNull();
    expect(outsider.get('error')).toMatch(/domain/);

    await inTenant(() => User.create({ email: 'locked@corp.test', name: 'L', locked: true }));
    expect((await login({ email: 'locked@corp.test' })).params.get('token')).toBeNull();
    expect((await login({ email: 'x@corp.test', email_verified: false })).params.get('token')).toBeNull();
  });

  it('does not create accounts when auto-provisioning is off', async () => {
    const admin = await makeSuperAdmin();
    await enableOidc(admin, 'acme.localhost', { autoProvision: false }).expect(200);
    const { params } = await login({ email: 'nobody@corp.test' });
    expect(params.get('token')).toBeNull();
    expect(params.get('error')).toMatch(/administrator/);
  });

  it('stops provisioning when the plan has no free seat', async () => {
    const { company, api: tenantApi } = await makeCompany('seatsso', { seatLimit: 1 });
    const admin = await makeSuperAdmin({}, company); // takes the only seat
    await tenantApi().put('/api/admin/company/sso').set(admin.auth).send({
      protocol: 'oidc', allowedDomains: ['corp.test'], oidc: OIDC, enabled: true
    }).expect(200);
    const { params } = await login({ email: 'overflow@corp.test' }, { host: 'seatsso.localhost' });
    expect(params.get('token')).toBeNull();
    expect(params.get('error')).toMatch(/seats/);
  });

  it('rejects a callback whose cookie does not match the state, and tokens for another audience', async () => {
    await enableOidc(await makeSuperAdmin(), 'acme.localhost').expect(200);
    expect((await login({ email: 'csrf@corp.test' }, { tamperCookie: true })).params.get('token')).toBeNull();
    expect((await login({ email: 'aud@corp.test', aud: 'someone-else' })).params.get('token')).toBeNull();
  });

  it("keeps companies' identity providers separate", async () => {
    await enableOidc(await makeSuperAdmin(), 'acme.localhost').expect(200);
    const other = await makeCompany('othersso');
    // The other company never configured SSO, so the first company's setup does not leak into it
    expect((await other.api().get('/api/auth/sso/config').expect(200)).body.enabled).toBe(false);
    await other.api().get('/api/auth/sso/start').expect(404);

    // A state issued for one company is useless on another company's callback
    mockIdp({ email: 'x@corp.test' });
    const start = await api().get('/api/auth/sso/start').expect(302);
    const state = new URL(start.headers.location).searchParams.get('state');
    const admin2 = await makeSuperAdmin({}, other.company);
    await other.api().put('/api/admin/company/sso').set(admin2.auth).send({ protocol: 'oidc', allowedDomains: ['corp.test'], oidc: OIDC, enabled: true }).expect(200);
    const cb = await other.api().get('/api/auth/sso/callback').query({ code: 'abc', state }).set('Cookie', start.headers['set-cookie'][0].split(';')[0]).expect(302);
    expect(new URLSearchParams(new URL(cb.headers.location).hash.slice(1)).get('token')).toBeNull();
  });
});

describe('SAML 2.0 sign-in', () => {
  const SAML = { entryPoint: 'https://saml.idp.test/sso', idpIssuer: 'https://saml.idp.test/entity', idpCert: 'MIIBfakecertificatebody==' };
  const enableSaml = (admin, host = 'acme.localhost', extra = {}) =>
    api(host).put('/api/admin/company/sso').set(admin.auth).send({ protocol: 'saml', providerName: 'Okta', allowedDomains: ['corp.test'], autoProvision: true, saml: SAML, enabled: true, ...extra });

  const samlLogin = async (host = 'acme.localhost', { tamperCookie = false } = {}) => {
    const start = await api(host).get('/api/auth/sso/start').expect(302);
    const url = new URL(start.headers.location);
    expect(url.origin).toBe('https://saml.idp.test');
    const cookie = tamperCookie ? 'sso_state=other' : start.headers['set-cookie'][0].split(';')[0];
    const acs = await api(host).post('/api/auth/sso/saml/acs').type('form')
      .set('Cookie', cookie)
      .send({ SAMLResponse: 'ZmFrZQ==', RelayState: url.searchParams.get('RelayState') })
      .expect(302);
    return new URLSearchParams(new URL(acs.headers.location).hash.slice(1));
  };

  it('is configured per company and reports its protocol', async () => {
    const admin = await makeSuperAdmin();
    const res = await enableSaml(admin).expect(200);
    expect(res.body).toMatchObject({ enabled: true, protocol: 'saml' });
    expect(res.body.registration.samlEntityId).toMatch(/\/api\/auth\/sso\/saml\/metadata$/);
    expect((await api().get('/api/auth/sso/config')).body).toMatchObject({ enabled: true, protocol: 'saml', providerName: 'Okta' });
    const meta = await api().get('/api/auth/sso/saml/metadata').expect(200);
    expect(meta.text).toContain('AssertionConsumerService');
    expect(meta.text).toContain('/api/auth/sso/saml/acs');
  });

  it('refuses an incomplete SAML setup', async () => {
    const fresh = await makeCompany('incompletesaml');
    const admin = await makeSuperAdmin({}, fresh.company);
    await fresh.api().put('/api/admin/company/sso').set(admin.auth).send({ protocol: 'saml', allowedDomains: ['corp.test'], saml: { entryPoint: SAML.entryPoint }, enabled: true }).expect(400);
    await fresh.api().put('/api/admin/company/sso').set(admin.auth).send({ saml: { idpCert: '<script>' } }).expect(400);
  });

  it('signs in with a validated assertion and provisions the user', async () => {
    await enableSaml(await makeSuperAdmin()).expect(200);
    samlState.profile = { nameID: 'saml.user@corp.test', email: 'Saml.User@corp.test', displayName: 'Saml User' };
    const params = await samlLogin();
    expect(params.get('error')).toBeNull();
    const me = await api().get('/api/auth/me').set('Authorization', `Bearer ${params.get('token')}`).expect(200);
    expect(me.body).toMatchObject({ email: 'saml.user@corp.test', role: 'USER' });
    // Requires a response to a request this server started, and signed assertions
    expect(samlState.lastOptions).toMatchObject({ validateInResponseTo: 'always', audience: expect.stringContaining('/api/auth/sso/saml/metadata') });
  });

  it('falls back to the NameID when no email attribute is sent', async () => {
    await enableSaml(await makeSuperAdmin()).expect(200);
    samlState.profile = { nameID: 'nameid.user@corp.test' };
    expect((await samlLogin()).get('token')).toBeTruthy();
  });

  it('rejects invalid assertions, foreign domains and a mismatched browser', async () => {
    await enableSaml(await makeSuperAdmin()).expect(200);
    samlState.error = 'Invalid document signature';
    expect((await samlLogin()).get('token')).toBeNull();
    samlState.error = null;
    samlState.profile = { nameID: 'x@evil.test', email: 'x@evil.test' };
    expect((await samlLogin()).get('error')).toMatch(/domain/);
    samlState.profile = { nameID: 'x@corp.test', email: 'x@corp.test' };
    expect((await samlLogin('acme.localhost', { tamperCookie: true })).get('token')).toBeNull();
  });

  it('does not accept a SAML post when the company uses OpenID Connect', async () => {
    await enableOidc(await makeSuperAdmin(), 'acme.localhost').expect(200);
    const res = await api().post('/api/auth/sso/saml/acs').type('form').send({ SAMLResponse: 'x', RelayState: 'y' }).expect(302);
    expect(new URLSearchParams(new URL(res.headers.location).hash.slice(1)).get('token')).toBeNull();
  });
});

describe('guarding against server-side request forgery', () => {
  it('recognises private and special-purpose addresses', () => {
    for (const a of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1']) {
      expect(isPrivateAddress(a), a).toBe(true);
    }
    for (const a of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700:4700::1111']) expect(isPrivateAddress(a), a).toBe(false);
  });

  it('only allows https URLs to public hosts', async () => {
    const prior = env.sso.allowPrivateHosts;
    env.sso.allowPrivateHosts = false;
    try {
      await expect(assertPublicUrl('http://example.com')).rejects.toThrow(/https/);
      await expect(assertPublicUrl('https://user:pw@example.com')).rejects.toThrow(/credentials/);
      await expect(assertPublicUrl('https://127.0.0.1/x')).rejects.toThrow(/public/);
      await expect(assertPublicUrl('https://[::1]/x')).rejects.toThrow(/public/);
      await expect(assertPublicUrl('not a url')).rejects.toThrow();
      await expect(assertPublicUrl('https://8.8.8.8/x')).resolves.toBeInstanceOf(URL);
    } finally {
      env.sso.allowPrivateHosts = prior;
    }
  });
});
