import { userModel } from '../models/user.model.js';
import { otpModel } from '../models/otp.model.js';
import { hashPassword, verifyPassword, isHashed } from '../utils/password.js';
import { startSession, refreshSession, revokeSession, revokeAllSessions } from '../utils/sessions.js';
import { matchTotp } from '../utils/totp.js';
import { issueOtp, checkOtp, OTP_PURPOSE } from '../utils/otp.js';
import { sanitizeUser } from '../utils/format.js';
import { assertSeatAvailable } from '../services/company.service.js';
import { ssoReady } from './sso.controller.js';
import { Company, companyOrigin, hasDedicatedAddress } from '../models/company.model.js';
import { LoginHandoff } from '../models/loginHandoff.model.js';
import crypto from 'node:crypto';
import { runAsTenant } from '../utils/tenantContext.js';

const normalizeEmail = (email) => String(email ?? '').trim().toLowerCase();
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6;
const BAD_CODE = { message: 'Invalid or expired code.' };

// POST /auth/register - self-signup; always creates a plain USER and emails a verification code
export const register = async (req, res) => {
  const { name, password } = req.body;
  const email = normalizeEmail(req.body.email);

  if (!req.company?.settings.allowSelfSignup) {
    return res.status(403).json({ message: 'Self-signup is turned off for this workspace. Ask your administrator for an account.' });
  }
  if (!name?.trim() || !EMAIL_PATTERN.test(email) || !password) {
    return res.status(400).json({ message: 'Name, a valid email, and password are required.' });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
  }

  const existing = await userModel.findByEmail(email);
  if (existing?.emailVerified) {
    return res.status(409).json({ message: 'A user with that email already exists.' });
  }

  // An unverified signup can be retried: refresh its details instead of failing
  if (existing) {
    await userModel.update(existing.id, { name: name.trim(), password: hashPassword(password) });
  } else {
    await assertSeatAvailable(req.company);
    await userModel.create({
      email,
      name: name.trim(),
      password: hashPassword(password),
      role: 'USER',
      permissions: 'read',
      emailVerified: false
    });
  }

  await issueOtp(email, OTP_PURPOSE.VERIFY_EMAIL);
  res.status(201).json({ message: 'Account created. Enter the code we emailed you to verify your address.', email });
};

// POST /auth/verify-email
export const verifyEmail = async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const user = await userModel.findByEmail(email);
  if (!user || !(await checkOtp(email, OTP_PURPOSE.VERIFY_EMAIL, req.body.otp))) {
    return res.status(400).json(BAD_CODE);
  }
  await userModel.update(user.id, { emailVerified: true });
  res.json({ message: 'Email verified. You can now sign in.' });
};

// POST /auth/login - step 1: password check, then a one-time code is emailed
export const login = async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const user = email ? await userModel.findByEmail(email) : null;

  if (!user || !verifyPassword(req.body.password, user.password)) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }
  if (user.locked) {
    return res.status(403).json({ message: 'Account is locked. Please contact support.' });
  }
  if (!isHashed(user.password)) {
    await userModel.update(user.id, { password: hashPassword(req.body.password) });
  }

  if (!user.emailVerified) {
    await issueOtp(email, OTP_PURPOSE.VERIFY_EMAIL);
    return res.status(403).json({
      code: 'EMAIL_NOT_VERIFIED',
      email,
      message: 'Please verify your email. We sent you a new code.'
    });
  }

  // Users with an authenticator app skip the emailed code (they can still ask for one as a fallback)
  if (user.totp?.enabled) {
    return res.json({
      otpRequired: true,
      method: 'totp',
      methods: ['totp', 'email'],
      email,
      message: 'Enter the 6-digit code from your authenticator app.'
    });
  }

  await issueOtp(email, OTP_PURPOSE.LOGIN);
  res.json({ otpRequired: true, method: 'email', methods: ['email'], email, message: 'Enter the code we emailed you to finish signing in.' });
};

// POST /auth/login/verify - step 2: exchange the one-time code for a JWT
export const verifyLogin = async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const user = await userModel.findByEmail(email);
  if (!user || user.locked) return res.status(401).json(BAD_CODE);

  let valid = false;
  if (user.totp?.enabled) {
    const withSecret = await userModel.findWithTotpSecret(user.id);
    const step = matchTotp(withSecret.totp.secret, req.body.otp);
    // A code that was already used (even once, even by the real user) is refused
    valid = step !== null && (await userModel.consumeTotpStep(user.id, step));
  }
  // Emailed codes exist only if one was issued: automatically for users without an authenticator app,
  // or on request (resend-otp) for users with one
  if (!valid) valid = await checkOtp(email, OTP_PURPOSE.LOGIN, req.body.otp);
  if (!valid) {
    return res.status(401).json(
      user.totp?.enabled
        ? { message: 'Invalid or expired code. Authenticator codes work once - wait for the next code and try again.' }
        : BAD_CODE
    );
  }

  // Signed in on the shared address, but the company has its own: carry the sign-in over instead of opening a session here
  if (req.tenant?.shared && req.company && hasDedicatedAddress(req.company)) {
    const code = crypto.randomBytes(32).toString('base64url');
    await LoginHandoff.create({
      codeHash: hashHandoff(code), userId: user.id, companyId: req.company._id, expiresAt: new Date(Date.now() + HANDOFF_TTL_MS)
    });
    return res.json({ redirect: `${companyOrigin(req.company)}/handoff?code=${code}` });
  }

  const tokens = await startSession(user, req);
  res.json({ token: tokens.token, refreshToken: tokens.refreshToken, user: sanitizeUser(user) });
};

const HANDOFF_TTL_MS = 2 * 60 * 1000;
const hashHandoff = (code) => crypto.createHash('sha256').update(String(code)).digest('hex');

// POST /auth/handoff { code } - on the company's own address: trade the ticket for a session here
export const handoff = async (req, res) => {
  if (req.tenant?.kind !== 'tenant' || !req.company) return res.status(400).json(BAD_CODE);
  const ticket = await LoginHandoff.findOneAndUpdate(
    { codeHash: hashHandoff(req.body?.code), companyId: req.company._id, usedAt: null, expiresAt: { $gt: new Date() } },
    { usedAt: new Date() }
  );
  const user = ticket ? await runAsTenant(req.company._id, () => userModel.findById(ticket.userId)) : null;
  if (!user || user.locked) return res.status(400).json(BAD_CODE);
  const tokens = await startSession(user, req);
  res.json({ token: tokens.token, refreshToken: tokens.refreshToken, user: sanitizeUser(user) });
};

// POST /auth/resend-otp - same response whether or not the account exists
export const resendOtp = async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const { purpose } = req.body;
  const allowed = Object.values(OTP_PURPOSE);
  if (!allowed.includes(purpose)) return res.status(400).json({ message: 'Invalid purpose.' });

  const user = await userModel.findByEmail(email);
  let eligible = !!user && !user.locked;
  if (purpose === OTP_PURPOSE.VERIFY_EMAIL) eligible &&= !user.emailVerified;
  // Login codes can only be re-sent after the password step already issued one
  if (purpose === OTP_PURPOSE.LOGIN) {
    eligible &&= !!user?.totp?.enabled || !!(await otpModel.latest(email, purpose));
  }

  if (eligible) await issueOtp(email, purpose);
  res.json({ message: 'If the account is eligible, a new code has been sent.' });
};

// POST /auth/forgot-password
export const forgotPassword = async (req, res) => {
  const email = normalizeEmail(req.body.email);
  if (!EMAIL_PATTERN.test(email)) return res.status(400).json({ message: 'A valid email is required.' });

  const user = await userModel.findByEmail(email);
  if (user && !user.locked) await issueOtp(email, OTP_PURPOSE.RESET_PASSWORD);
  res.json({ message: 'If an account exists for that email, a reset code has been sent.' });
};

// POST /auth/reset-password
export const resetPassword = async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const { otp, newPassword } = req.body;
  if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
  }

  const user = await userModel.findByEmail(email);
  if (!user || user.locked || !(await checkOtp(email, OTP_PURPOSE.RESET_PASSWORD, otp))) {
    return res.status(400).json(BAD_CODE);
  }
  // Receiving the code also proves ownership of the mailbox
  await userModel.update(user.id, { password: hashPassword(newPassword), emailVerified: true });
  await revokeAllSessions(user.id);
  res.json({ message: 'Password reset. You can now sign in.' });
};

// Only a company whose plan includes custom logos shows one; the version makes browsers refetch after a change
const logoUrl = (company) =>
  company.features.customLogo && company.logoUpdatedAt ? `/api/auth/logo?v=${company.logoUpdatedAt.getTime()}` : null;

// GET /auth/logo - public (the login page needs it); the company comes from the address
export const logo = async (req, res) => {
  const company = req.company && (await Company.findById(req.company.id).select('+logoData'));
  if (!company?.features.customLogo || !company.logoData?.length) return res.status(404).json({ message: 'No logo.' });
  res.set({
    'Content-Type': company.logoContentType,
    'Cache-Control': 'public, max-age=86400',
    // Served as an image only: never sniffed, never run as a page
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox"
  });
  res.send(company.logoData);
};

// GET /auth/workspace - public: who this address belongs to, so the login page can brand itself and offer SSO.
// Works for a suspended company too, so its people are told why they cannot sign in.
export const workspace = (req, res) => {
  if (req.tenant.kind === 'platform') return res.json({ kind: 'platform', name: 'Platform console' });
  // Shared address, nobody identified yet: a neutral sign-in page; the portal is chosen from the email
  if (req.tenant.kind === 'portal') return res.json({ kind: 'portal', name: 'YakFlow', status: 'active' });
  const { company } = req;
  const sso = ssoReady(company);
  res.json({
    kind: 'tenant',
    name: company.name,
    slug: company.slug,
    status: company.status,
    statusMessage: company.status === 'active' ? '' : 'This workspace is not available right now. Please contact your administrator.',
    modules: company.modules,
    features: company.features,
    logoUrl: logoUrl(company),
    brand: company.features.customLogo ? { name: company.branding?.displayName || '', showPoweredBy: company.branding?.showPoweredBy !== false } : null,
    allowSelfSignup: company.settings.allowSelfSignup,
    sso: { enabled: sso, providerName: sso ? company.sso.providerName : '', protocol: sso ? company.sso.protocol : null }
  });
};

// GET /auth/me
export const me = (req, res) => res.json(sanitizeUser(req.user));

// POST /auth/refresh - exchange a refresh token for a new access token (the refresh token rotates)
export const refresh = async (req, res) => {
  const result = await refreshSession(req.body.refreshToken);
  if (!result) return res.status(401).json({ message: 'Session expired. Please sign in again.' });
  res.json({ token: result.token, refreshToken: result.refreshToken, user: sanitizeUser(result.user) });
};

// POST /auth/logout - ends the current session only
export const logout = async (req, res) => {
  await revokeSession(req.user.id, req.session.id);
  res.json({ message: 'Signed out.' });
};
