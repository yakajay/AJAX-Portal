import { Session, hashRefreshToken } from '../models/session.model.js';
import { userModel } from '../models/user.model.js';
import { env } from '../config/env.js';
import { signToken, newRefreshToken } from './token.js';

const expiry = () => new Date(Date.now() + env.refreshTtlHours * 3600 * 1000);

// Creates a session for a freshly authenticated user and returns the token pair
export const startSession = async (user, req) => {
  const refreshToken = newRefreshToken();
  const session = await Session.create({
    userId: user.id,
    refreshHash: hashRefreshToken(refreshToken),
    userAgent: String(req.headers['user-agent'] || '').slice(0, 300),
    ip: req.ip || '',
    expiresAt: expiry()
  });
  return { token: signToken(user, session.id), refreshToken, sessionId: session.id };
};

// Rotates the refresh token. Returns null for unknown / revoked / expired tokens, locked or deleted users.
export const refreshSession = async (refreshToken) => {
  if (!refreshToken || typeof refreshToken !== 'string') return null;
  const session = await Session.findOne({ refreshHash: hashRefreshToken(refreshToken) });
  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  const user = await userModel.findById(session.userId);
  if (!user || user.locked) return null;

  const next = newRefreshToken();
  session.refreshHash = hashRefreshToken(next);
  session.lastUsedAt = new Date();
  session.expiresAt = expiry();
  await session.save();
  return { token: signToken(user, session.id), refreshToken: next, user, sessionId: session.id };
};

export const revokeSession = (userId, sessionId) =>
  Session.updateOne({ _id: sessionId, userId, revokedAt: null }, { revokedAt: new Date() });

// Signs a user out everywhere, optionally keeping the session that made the request
export const revokeAllSessions = (userId, exceptSessionId = null) =>
  Session.updateMany(
    { userId, revokedAt: null, ...(exceptSessionId ? { _id: { $ne: exceptSessionId } } : {}) },
    { revokedAt: new Date() }
  );

export const listSessions = (userId) =>
  Session.find({ userId, revokedAt: null, expiresAt: { $gt: new Date() } }).sort({ lastUsedAt: -1 });
