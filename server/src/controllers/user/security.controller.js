import { userModel } from '../../models/user.model.js';
import { verifyPassword } from '../../utils/password.js';
import { sanitizeUser } from '../../utils/format.js';
import { generateSecret, verifyTotp, otpauthUrl } from '../../utils/totp.js';
import { listSessions, revokeSession, revokeAllSessions } from '../../utils/sessions.js';
import { audit } from '../../utils/audit.js';
import { env } from '../../config/env.js';

export const mySessions = async (req, res) => {
  const sessions = await listSessions(req.user.id);
  res.json(sessions.map((s) => ({ ...s.toJSON(), current: s.id === req.session.id })));
};

export const endSession = async (req, res) => {
  const result = await revokeSession(req.user.id, req.params.id);
  if (!result.modifiedCount) return res.status(404).json({ message: 'Session not found.' });
  res.json({ message: 'Session ended.' });
};

export const endAllSessions = async (req, res) => {
  await revokeAllSessions(req.user.id);
  await audit(req, { action: 'user.logout_all', entity: 'user', entityId: req.user.id, summary: 'Signed out of all devices' });
  res.json({ message: 'Signed out of all devices.' });
};

// Step 1: generate a secret (not active until a valid code is confirmed)
export const setupTotp = async (req, res) => {
  if (req.user.totp?.enabled) return res.status(409).json({ message: 'Two-factor authentication is already enabled.' });
  const secret = generateSecret();
  await userModel.update(req.user.id, { 'totp.secret': secret });
  res.json({ secret, otpauthUrl: otpauthUrl({ secret, account: req.user.email, issuer: env.appName }) });
};

// Step 2: prove the authenticator app produces valid codes, then switch it on
export const enableTotp = async (req, res) => {
  const user = await userModel.findWithTotpSecret(req.user.id);
  if (user.totp.enabled) return res.status(409).json({ message: 'Two-factor authentication is already enabled.' });
  if (!user.totp.secret) return res.status(400).json({ message: 'Start setup first.' });
  if (!verifyTotp(user.totp.secret, req.body.code)) {
    return res.status(400).json({ message: 'That code is not valid. Check your authenticator app and try again.' });
  }
  const updated = await userModel.update(user.id, { 'totp.enabled': true });
  await audit(req, { action: 'user.2fa_enable', entity: 'user', entityId: user.id, summary: 'Enabled two-factor authentication' });
  res.json(sanitizeUser(updated));
};

export const disableTotp = async (req, res) => {
  const user = await userModel.findWithTotpSecret(req.user.id);
  if (!user.totp.enabled) return res.status(409).json({ message: 'Two-factor authentication is not enabled.' });
  if (!verifyPassword(req.body.password, user.password) || !verifyTotp(user.totp.secret, req.body.code)) {
    return res.status(401).json({ message: 'Password or code is incorrect.' });
  }
  const updated = await userModel.update(user.id, { 'totp.enabled': false, 'totp.secret': null });
  await audit(req, { action: 'user.2fa_disable', entity: 'user', entityId: user.id, summary: 'Disabled two-factor authentication' });
  res.json(sanitizeUser(updated));
};
