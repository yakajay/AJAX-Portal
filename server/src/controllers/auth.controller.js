import { userModel } from '../models/user.model.js';
import { otpModel } from '../models/otp.model.js';
import { hashPassword, verifyPassword, isHashed } from '../utils/password.js';
import { signToken } from '../utils/token.js';
import { issueOtp, checkOtp, OTP_PURPOSE } from '../utils/otp.js';
import { sanitizeUser } from '../utils/format.js';

const normalizeEmail = (email) => String(email ?? '').trim().toLowerCase();
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6;
const BAD_CODE = { message: 'Invalid or expired code.' };

// POST /auth/register - self-signup; always creates a plain USER and emails a verification code
export const register = async (req, res) => {
  const { name, password } = req.body;
  const email = normalizeEmail(req.body.email);

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

  await issueOtp(email, OTP_PURPOSE.LOGIN);
  res.json({ otpRequired: true, email, message: 'Enter the code we emailed you to finish signing in.' });
};

// POST /auth/login/verify - step 2: exchange the one-time code for a JWT
export const verifyLogin = async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const user = await userModel.findByEmail(email);
  if (!user || user.locked || !(await checkOtp(email, OTP_PURPOSE.LOGIN, req.body.otp))) {
    return res.status(401).json(BAD_CODE);
  }
  res.json({ token: signToken(user), user: sanitizeUser(user) });
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
  if (purpose === OTP_PURPOSE.LOGIN) eligible &&= !!(await otpModel.latest(email, purpose));

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
  res.json({ message: 'Password reset. You can now sign in.' });
};

// GET /auth/me
export const me = (req, res) => res.json(sanitizeUser(req.user));
