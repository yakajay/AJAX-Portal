import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { otpModel } from '../models/otp.model.js';
import { sendMail } from './mailer.js';

export const OTP_PURPOSE = {
  VERIFY_EMAIL: 'VERIFY_EMAIL',
  LOGIN: 'LOGIN',
  RESET_PASSWORD: 'RESET_PASSWORD'
};

const SUBJECTS = {
  VERIFY_EMAIL: 'Verify your email',
  LOGIN: 'Your sign-in code',
  RESET_PASSWORD: 'Your password reset code'
};

const hashCode = (email, purpose, code) =>
  crypto.createHmac('sha256', env.jwtSecret).update(`${email}:${purpose}:${code}`).digest('hex');

const safeEqual = (a, b) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// Returns false when throttled (a code was sent less than otpResendSeconds ago)
export const issueOtp = async (email, purpose) => {
  const latest = await otpModel.latest(email, purpose);
  if (latest && Date.now() - latest.createdAt.getTime() < env.otpResendSeconds * 1000) {
    return false;
  }

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const record = await otpModel.replace(email, purpose, {
    codeHash: hashCode(email, purpose, code),
    expiresAt: new Date(Date.now() + env.otpTtlMinutes * 60 * 1000)
  });

  const mail = {
    to: email,
    subject: `YakFlow - ${SUBJECTS[purpose]}`,
    text: `Your verification code is ${code}. It expires in ${env.otpTtlMinutes} minutes. If you did not request it, ignore this email.`
  };
  try {
    try {
      await sendMail(mail);
    } catch (err) {
      // SMTP servers drop connections now and then; one quick retry hides most of those
      console.warn(`[otp] send failed, retrying once: ${err.message}`);
      await sendMail(mail);
    }
  } catch (err) {
    // The code never left, so drop it: otherwise the resend throttle above would swallow the user's
    // next attempt (200 response, no email)
    await otpModel.remove(record.id);
    throw err;
  }
  return true;
};

// Single use: the code is consumed on success and burned after too many failures
export const checkOtp = async (email, purpose, code) => {
  const record = await otpModel.latest(email, purpose);
  if (!record || record.expiresAt < new Date() || record.attempts >= env.otpMaxAttempts) {
    return false;
  }
  if (!safeEqual(record.codeHash, hashCode(email, purpose, String(code ?? '')))) {
    await otpModel.bumpAttempts(record.id);
    return false;
  }
  await otpModel.remove(record.id);
  return true;
};
