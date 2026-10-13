import mongoose from 'mongoose';
import crypto from 'node:crypto';
import { schemaOptions, userRef } from './schemaOptions.js';

// One row per signed-in device. The refresh token is only stored hashed.
const sessionSchema = new mongoose.Schema(
  {
    userId: userRef(),
    refreshHash: { type: String, required: true, index: true },
    userAgent: { type: String, default: '' },
    ip: { type: String, default: '' },
    lastUsedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
    revokedAt: { type: Date, default: null }
  },
  schemaOptions((ret) => { delete ret.refreshHash; })
);

export const Session = mongoose.model('Session', sessionSchema);

export const hashRefreshToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
