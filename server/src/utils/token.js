import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { env } from '../config/env.js';

// `sid` ties an access token to a revocable Session row
export const signToken = (user, sid) =>
  jwt.sign({ sub: user.id, role: user.role, sid: String(sid), cid: user.companyId ? String(user.companyId) : null }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });

export const verifyToken = (token) => jwt.verify(token, env.jwtSecret);

export const newRefreshToken = () => crypto.randomBytes(48).toString('base64url');
