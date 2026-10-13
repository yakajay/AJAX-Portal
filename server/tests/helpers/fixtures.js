import request from 'supertest';
import app from '../../src/app.js';
import { User } from '../../src/models/user.model.js';
import { Holiday } from '../../src/models/holiday.model.js';
import { hashPassword } from '../../src/utils/password.js';
import { startSession } from '../../src/utils/sessions.js';

export const api = () => request(app);

// Creates a user and a ready-to-use session (skips the emailed-code login steps)
export const makeUser = async (overrides = {}) => {
  const n = Math.random().toString(36).slice(2, 8);
  const user = await User.create({
    email: `u${n}@test.local`,
    name: `User ${n}`,
    password: hashPassword('Password@1'),
    role: 'USER',
    permissions: 'read',
    department: 'Engineering',
    ...overrides
  });
  const tokens = await startSession(user, { headers: { 'user-agent': 'vitest' }, ip: '127.0.0.1' });
  return { user, ...tokens, auth: { Authorization: `Bearer ${tokens.token}` } };
};

export const makeAdmin = (overrides = {}) =>
  makeUser({ role: 'ADMIN', permissions: 'read,write', ...overrides });
export const makeSuperAdmin = (overrides = {}) =>
  makeUser({ role: 'SUPER_ADMIN', permissions: 'read,write,delete', ...overrides });

export const addHoliday = (date, name = 'Test holiday') => Holiday.create({ date, name });

// Next Monday-Friday dates from a fixed future week, as ISO strings
export const weekdays = (startMonday = '2030-03-04') => {
  const base = new Date(`${startMonday}T00:00:00Z`);
  return Array.from({ length: 5 }, (_, i) => new Date(base.getTime() + i * 86400000).toISOString().slice(0, 10));
};
