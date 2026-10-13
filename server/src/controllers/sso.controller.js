import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { userModel } from '../models/user.model.js';
import { startSession } from '../utils/sessions.js';

const { sso } = env;
const STATE_COOKIE = 'sso_state';
const STATE_TTL_SECONDS = 600;

export const ssoEnabled = () => !!(sso.issuer && sso.clientId && sso.clientSecret && sso.allowedDomains.length);

let discovery = null; // cached provider metadata
const discover = async () => {
  if (discovery && discovery.expires > Date.now()) return discovery.doc;
  const res = await fetch(`${sso.issuer}/.well-known/openid-configuration`);
  if (!res.ok) throw new Error('Could not load SSO provider configuration.');
  const doc = await res.json();
  // Mixed-up issuers would let a different tenant's tokens through
  if (doc.issuer !== sso.issuer) throw new Error('SSO issuer mismatch.');
  discovery = { doc, expires: Date.now() + 3600 * 1000 };
  return doc;
};
export const resetSsoDiscovery = () => { discovery = null; };

const readCookie = (req, name) =>
  String(req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).find(([k]) => k === name)?.[1];

const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const sign = (payload) => crypto.createHmac('sha256', env.jwtSecret).update(payload).digest('base64url');
const safeEqual = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

// The state ties the callback to the browser that started the login (login-CSRF protection):
// it is signed, carries the nonce, and must also match the httpOnly cookie.
const makeState = () => {
  const nonce = crypto.randomBytes(16).toString('hex');
  const payload = b64({ nonce, exp: Date.now() + STATE_TTL_SECONDS * 1000 });
  return { nonce, state: `${payload}.${sign(payload)}` };
};
const readState = (state) => {
  const [payload, sig] = String(state || '').split('.');
  if (!payload || !sig || !safeEqual(sig, sign(payload))) return null;
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
  return data.exp > Date.now() ? data : null;
};

const clientRedirect = (res, params) => {
  const url = new URL('/sso/callback', env.clientOrigin);
  // Fragment, not query string: it never reaches server logs or Referer headers
  url.hash = new URLSearchParams(params).toString();
  res.redirect(url.toString());
};
const fail = (res, error) => clientRedirect(res, { error });

// GET /auth/sso/config - lets the login page decide whether to show the SSO button
export const config = (req, res) =>
  res.json({ enabled: ssoEnabled(), providerName: sso.providerName });

// GET /auth/sso/start - sends the browser to the identity provider
export const start = async (req, res) => {
  if (!ssoEnabled()) return res.status(404).json({ message: 'Single sign-on is not enabled.' });
  const { authorization_endpoint: authorizeUrl } = await discover();
  const { state, nonce } = makeState();
  const url = new URL(authorizeUrl);
  url.search = new URLSearchParams({
    client_id: sso.clientId,
    response_type: 'code',
    scope: 'openid email profile',
    redirect_uri: sso.redirectUri,
    state,
    nonce
  }).toString();
  res.setHeader(
    'Set-Cookie',
    `${STATE_COOKIE}=${nonce}; HttpOnly; SameSite=Lax; Path=/api/auth/sso; Max-Age=${STATE_TTL_SECONDS}${env.isProduction ? '; Secure' : ''}`
  );
  res.redirect(url.toString());
};

const emailFromClaims = (claims) => {
  const email = String(claims.email || claims.preferred_username || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
};

// GET /auth/sso/callback - the provider returns here with ?code; we sign the user in and bounce to the SPA
export const callback = async (req, res) => {
  if (!ssoEnabled()) return res.status(404).json({ message: 'Single sign-on is not enabled.' });
  try {
    if (req.query.error) return fail(res, 'The provider declined the sign-in.');

    const state = readState(req.query.state);
    const cookieNonce = readCookie(req, STATE_COOKIE);
    res.setHeader('Set-Cookie', `${STATE_COOKIE}=; HttpOnly; SameSite=Lax; Path=/api/auth/sso; Max-Age=0`);
    if (!state || !cookieNonce || !safeEqual(state.nonce, cookieNonce) || typeof req.query.code !== 'string') {
      return fail(res, 'Sign-in session expired. Please try again.');
    }

    // The ID token comes straight from the provider's token endpoint over TLS (authenticated with our
    // client secret), so per the OIDC spec its claims are trusted once iss / aud / exp / nonce check out.
    const { token_endpoint: tokenUrl } = await discover();
    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: req.query.code,
        redirect_uri: sso.redirectUri,
        client_id: sso.clientId,
        client_secret: sso.clientSecret
      })
    });
    if (!tokenRes.ok) return fail(res, 'Sign-in failed. Please try again.');
    const { id_token: idToken } = await tokenRes.json();
    const claims = JSON.parse(Buffer.from(String(idToken).split('.')[1] ?? '', 'base64url').toString());

    const audience = [].concat(claims.aud);
    if (
      claims.iss !== sso.issuer ||
      !audience.includes(sso.clientId) ||
      !(claims.exp * 1000 > Date.now()) ||
      claims.nonce !== state.nonce
    ) {
      return fail(res, 'Sign-in failed. Please try again.');
    }

    const email = emailFromClaims(claims);
    if (!email || claims.email_verified === false) return fail(res, 'Your account has no verified email address.');
    if (!sso.allowedDomains.includes(email.split('@')[1])) {
      return fail(res, 'That email domain is not allowed to sign in.');
    }

    let user = await userModel.findByEmail(email);
    if (user?.locked) return fail(res, 'Account is locked. Please contact support.');
    if (!user) {
      if (!sso.autoProvision) return fail(res, 'No account exists for your email. Ask an administrator to add you.');
      user = await userModel.create({
        email,
        name: String(claims.name || email.split('@')[0]).trim(),
        role: 'USER',
        permissions: 'read',
        emailVerified: true
      });
    } else if (!user.emailVerified) {
      // The company IdP vouches for the mailbox; this also stops a squatted unverified signup
      // from keeping its password on an address the real owner now controls.
      user = await userModel.update(user.id, { emailVerified: true, password: null });
    }

    // The provider already enforced its own MFA, so no emailed code on top
    const tokens = await startSession(user, req);
    clientRedirect(res, { token: tokens.token, refreshToken: tokens.refreshToken });
  } catch (err) {
    req.log?.error?.({ err }, 'SSO callback failed');
    fail(res, 'Sign-in failed. Please try again.');
  }
};
