import crypto from 'node:crypto';
import { SAML, ValidateInResponseTo } from '@node-saml/node-saml';
import { env } from '../config/env.js';
import { userModel } from '../models/user.model.js';
import { samlRequestCache } from '../models/samlRequest.model.js';
import { startSession } from '../utils/sessions.js';
import { decryptValue } from '../utils/crypto.js';
import { providerFetch } from '../utils/safeFetch.js';
import { assertSeatAvailable } from '../services/company.service.js';
import { audit } from '../utils/audit.js';

// Single sign-on for the company the request's subdomain belongs to. Each company brings its own
// identity provider (OpenID Connect or SAML 2.0), configured by its admins in Company settings.
const STATE_COOKIE = 'sso_state';
const STATE_TTL_SECONDS = 600;
const SAML_REQUEST_TTL_MS = STATE_TTL_SECONDS * 1000;

// What this server is reachable as for the current request (the company's own subdomain)
const originOf = (req) => `${env.isProduction ? 'https' : req.protocol}://${req.get('host')}`;
export const oidcRedirectUri = (origin) => `${origin}/api/auth/sso/callback`;
export const samlAcsUrl = (origin) => `${origin}/api/auth/sso/saml/acs`;
export const samlEntityId = (origin) => `${origin}/api/auth/sso/saml/metadata`;

// Is this company's SSO switched on and complete enough to use?
export const ssoReady = (company) => {
  const sso = company?.sso;
  if (!sso?.enabled || !sso.allowedDomains.length) return false;
  if (sso.protocol === 'saml') return !!(sso.saml.entryPoint && sso.saml.idpIssuer && sso.saml.idpCert);
  return !!(sso.oidc.issuer && sso.oidc.clientId && sso.oidc.clientSecret);
};

// --- signed login state (login-CSRF protection) ---
const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const sign = (payload) => crypto.createHmac('sha256', env.jwtSecret).update(payload).digest('base64url');
const safeEqual = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const readCookie = (req, name) =>
  String(req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).find(([k]) => k === name)?.[1];

// The state is signed, names the company and carries a nonce that must also match the httpOnly cookie
const makeState = (company) => {
  const nonce = crypto.randomBytes(16).toString('hex');
  const payload = b64({ nonce, cid: company.id, exp: Date.now() + STATE_TTL_SECONDS * 1000 });
  return { nonce, state: `${payload}.${sign(payload)}` };
};
const readState = (state, company) => {
  const [payload, sig] = String(state || '').split('.');
  if (!payload || !sig || !safeEqual(sig, sign(payload))) return null;
  let data;
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString());
  } catch {
    return null;
  }
  return data.exp > Date.now() && data.cid === company.id ? data : null;
};

// SAML responses arrive as a cross-site POST, which browsers only send cookies on with SameSite=None
const cookieFlags = (saml) => (saml && env.isProduction ? 'SameSite=None; Secure' : `SameSite=Lax${env.isProduction ? '; Secure' : ''}`);
const setStateCookie = (res, nonce, saml) =>
  res.setHeader('Set-Cookie', `${STATE_COOKIE}=${nonce}; HttpOnly; ${cookieFlags(saml)}; Path=/api/auth/sso; Max-Age=${STATE_TTL_SECONDS}`);
const clearStateCookie = (res, saml) =>
  res.setHeader('Set-Cookie', `${STATE_COOKIE}=; HttpOnly; ${cookieFlags(saml)}; Path=/api/auth/sso; Max-Age=0`);

const clientRedirect = (req, res, params) => {
  const url = new URL('/sso/callback', originOf(req));
  // Fragment, not query string: it never reaches server logs or Referer headers
  url.hash = new URLSearchParams(params).toString();
  res.redirect(url.toString());
};
const fail = (req, res, error) => clientRedirect(req, res, { error });

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normalizeEmail = (value) => {
  const email = String(value || '').trim().toLowerCase();
  return EMAIL_PATTERN.test(email) ? email : null;
};

// Signs the identified person in, creating their account on first login when the company allows it
const completeLogin = async (req, res, company, { email, name, emailVerified = true }) => {
  if (!email || emailVerified === false) return fail(req, res, 'Your account has no verified email address.');
  if (!company.sso.allowedDomains.includes(email.split('@')[1])) {
    return fail(req, res, 'That email domain is not allowed to sign in.');
  }

  let user = await userModel.findByEmail(email);
  if (user?.locked) return fail(req, res, 'Account is locked. Please contact support.');
  if (!user) {
    if (!company.sso.autoProvision) return fail(req, res, 'No account exists for your email. Ask an administrator to add you.');
    await assertSeatAvailable(company);
    user = await userModel.create({
      email,
      name: String(name || email.split('@')[0]).trim(),
      role: 'USER',
      permissions: 'read',
      emailVerified: true
    });
    await audit({ user: null, ip: req.ip }, { action: 'sso.provision', entity: 'user', entityId: user.id, summary: `Created account for ${email} on first single sign-on` });
  } else if (!user.emailVerified) {
    // The company IdP vouches for the mailbox; this also stops a squatted unverified signup
    // from keeping its password on an address the real owner now controls.
    user = await userModel.update(user.id, { emailVerified: true, password: null });
  }

  // The provider already enforced its own MFA, so no emailed code on top
  const tokens = await startSession(user, req);
  clientRedirect(req, res, { token: tokens.token, refreshToken: tokens.refreshToken });
};

// GET /auth/sso/config - lets the login page decide whether to show the SSO button
export const config = (req, res) => {
  const ready = ssoReady(req.company);
  res.json({ enabled: ready, providerName: ready ? req.company.sso.providerName : '', protocol: ready ? req.company.sso.protocol : null });
};

const requireSso = (req, res) => {
  if (ssoReady(req.company)) return true;
  res.status(404).json({ message: 'Single sign-on is not enabled.' });
  return false;
};

// ---------------------------------------------------------------- OpenID Connect
const discoveryCache = new Map(); // issuer -> { doc, expires }
const discover = async (issuer) => {
  const cached = discoveryCache.get(issuer);
  if (cached && cached.expires > Date.now()) return cached.doc;
  const res = await providerFetch(`${issuer}/.well-known/openid-configuration`);
  if (!res.ok) throw new Error('Could not load SSO provider configuration.');
  const doc = await res.json();
  // Mixed-up issuers would let a different provider's tokens through
  if (doc.issuer !== issuer) throw new Error('SSO issuer mismatch.');
  discoveryCache.set(issuer, { doc, expires: Date.now() + 3600 * 1000 });
  return doc;
};
export const resetSsoDiscovery = () => discoveryCache.clear();

const oidcSettings = (company) => ({
  issuer: company.sso.oidc.issuer.replace(/\/+$/, ''),
  clientId: company.sso.oidc.clientId,
  clientSecret: decryptValue(company.id, company.sso.oidc.clientSecret)
});

const oidcStart = async (req, res) => {
  const { company } = req;
  const oidc = oidcSettings(company);
  const { authorization_endpoint: authorizeUrl } = await discover(oidc.issuer);
  const { state, nonce } = makeState(company);
  const url = new URL(authorizeUrl);
  url.search = new URLSearchParams({
    client_id: oidc.clientId,
    response_type: 'code',
    scope: 'openid email profile',
    redirect_uri: oidcRedirectUri(originOf(req)),
    state,
    nonce
  }).toString();
  setStateCookie(res, nonce, false);
  res.redirect(url.toString());
};

const oidcCallback = async (req, res) => {
  const { company } = req;
  if (req.query.error) return fail(req, res, 'The provider declined the sign-in.');

  const state = readState(req.query.state, company);
  const cookieNonce = readCookie(req, STATE_COOKIE);
  clearStateCookie(res, false);
  if (!state || !cookieNonce || !safeEqual(state.nonce, cookieNonce) || typeof req.query.code !== 'string') {
    return fail(req, res, 'Sign-in session expired. Please try again.');
  }

  // The ID token comes straight from the provider's token endpoint over TLS (authenticated with our
  // client secret), so per the OIDC spec its claims are trusted once iss / aud / exp / nonce check out.
  const oidc = oidcSettings(company);
  const { token_endpoint: tokenUrl } = await discover(oidc.issuer);
  const tokenRes = await providerFetch(tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: req.query.code,
      redirect_uri: oidcRedirectUri(originOf(req)),
      client_id: oidc.clientId,
      client_secret: oidc.clientSecret
    })
  });
  if (!tokenRes.ok) return fail(req, res, 'Sign-in failed. Please try again.');
  const { id_token: idToken } = await tokenRes.json();
  const claims = JSON.parse(Buffer.from(String(idToken).split('.')[1] ?? '', 'base64url').toString());

  const audience = [].concat(claims.aud);
  if (
    claims.iss !== oidc.issuer ||
    !audience.includes(oidc.clientId) ||
    !(claims.exp * 1000 > Date.now()) ||
    claims.nonce !== state.nonce
  ) {
    return fail(req, res, 'Sign-in failed. Please try again.');
  }

  await completeLogin(req, res, company, {
    email: normalizeEmail(claims.email || claims.preferred_username),
    name: claims.name,
    emailVerified: claims.email_verified !== false
  });
};

// ---------------------------------------------------------------- SAML 2.0
const samlFor = (company, origin) =>
  new SAML({
    callbackUrl: samlAcsUrl(origin),
    entryPoint: company.sso.saml.entryPoint,
    issuer: samlEntityId(origin),
    audience: samlEntityId(origin),
    idpIssuer: company.sso.saml.idpIssuer,
    idpCert: company.sso.saml.idpCert,
    // Either the response or the assertion must carry a valid signature (the library enforces at least one)
    wantAuthnResponseSigned: false,
    wantAssertionsSigned: false,
    // Only accept responses to a login this server started, once each
    validateInResponseTo: ValidateInResponseTo.always,
    requestIdExpirationPeriodMs: SAML_REQUEST_TTL_MS,
    cacheProvider: samlRequestCache(SAML_REQUEST_TTL_MS),
    acceptedClockSkewMs: 60_000,
    disableRequestedAuthnContext: true
  });

const SAML_CLAIM = {
  email: ['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress', 'urn:oid:0.9.2342.19200300.100.1.3', 'email', 'mail'],
  name: ['http://schemas.microsoft.com/identity/claims/displayname', 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name', 'displayName', 'name']
};
const firstClaim = (profile, keys) => {
  for (const key of keys) {
    const value = [].concat(profile[key] ?? [])[0];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
};

const samlStart = async (req, res) => {
  const { company } = req;
  const { state, nonce } = makeState(company);
  const url = await samlFor(company, originOf(req)).getAuthorizeUrlAsync(state, req.get('host'), {});
  setStateCookie(res, nonce, true);
  res.redirect(url);
};

// POST /auth/sso/saml/acs - the assertion consumer service the identity provider posts the signed response to
const samlCallback = async (req, res) => {
  const { company } = req;
  const state = readState(req.body?.RelayState, company);
  const cookieNonce = readCookie(req, STATE_COOKIE);
  clearStateCookie(res, true);
  if (!state || !cookieNonce || !safeEqual(state.nonce, cookieNonce) || typeof req.body?.SAMLResponse !== 'string') {
    return fail(req, res, 'Sign-in session expired. Please try again.');
  }

  const { profile } = await samlFor(company, originOf(req)).validatePostResponseAsync({ SAMLResponse: req.body.SAMLResponse });
  if (!profile) return fail(req, res, 'Sign-in failed. Please try again.');

  const email = normalizeEmail(firstClaim(profile, SAML_CLAIM.email) || profile.nameID);
  await completeLogin(req, res, company, { email, name: firstClaim(profile, SAML_CLAIM.name) });
};

// GET /auth/sso/saml/metadata - what a company admin gives their identity provider
export const samlMetadata = (req, res) => {
  const origin = originOf(req);
  const esc = (v) => String(v).replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
  res.type('application/samlmetadata+xml').send(
    `<?xml version="1.0"?>\n<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${esc(samlEntityId(origin))}">` +
      '<SPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol" AuthnRequestsSigned="false" WantAssertionsSigned="true">' +
      '<NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</NameIDFormat>' +
      `<AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${esc(samlAcsUrl(origin))}" index="0" isDefault="true"/>` +
      '</SPSSODescriptor></EntityDescriptor>'
  );
};

// ---------------------------------------------------------------- shared entry points
const guarded = (oidc, saml) => async (req, res) => {
  if (!requireSso(req, res)) return;
  try {
    await (req.company.sso.protocol === 'saml' ? saml : oidc)(req, res);
  } catch (err) {
    req.log?.error?.({ err }, 'SSO request failed');
    if (res.headersSent) return;
    fail(req, res, err.name === 'ServiceError' ? err.message : 'Sign-in failed. Please try again.');
  }
};

// GET /auth/sso/start - sends the browser to the identity provider
export const start = guarded(oidcStart, samlStart);
// GET /auth/sso/callback - OpenID Connect return
export const callback = guarded(oidcCallback, () => { throw new Error('This workspace uses SAML.'); });
// POST /auth/sso/saml/acs - SAML return
export const samlAcs = guarded(() => { throw new Error('This workspace uses OpenID Connect.'); }, samlCallback);
