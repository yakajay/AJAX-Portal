import request from 'supertest';
import app from '../../src/app.js';
import { User } from '../../src/models/user.model.js';
import { Holiday } from '../../src/models/holiday.model.js';
import { hashPassword } from '../../src/utils/password.js';
import { startSession } from '../../src/utils/sessions.js';
import { runAsTenant, runAsPlatform } from '../../src/utils/tenantContext.js';
import { createCompany } from '../../src/services/company.service.js';
import { testCompany } from './db.js';

export const TEST_HOST = 'acme.localhost';
export const PLATFORM_HOST = 'admin.localhost';

// supertest client that talks to a given workspace (the Host header picks the company)
export const api = (host = TEST_HOST) => {
  const agent = request(app);
  return new Proxy(agent, {
    get: (target, prop) =>
      ['get', 'post', 'put', 'patch', 'delete'].includes(prop) ? (...args) => target[prop](...args).set('Host', host) : target[prop]
  });
};
export const platformApi = () => api(PLATFORM_HOST);

// Runs database work as the default company (models are tenant-scoped, so direct access needs a scope)
export const inTenant = (fn, company = testCompany) => runAsTenant(company._id, fn);

const session = (user) => startSession(user, { headers: { 'user-agent': 'vitest' }, ip: '127.0.0.1' });

// Creates a user and a ready-to-use session (skips the emailed-code login steps)
export const makeUser = async (overrides = {}, company = testCompany) => {
  const n = Math.random().toString(36).slice(2, 8);
  return runAsTenant(company._id, async () => {
    const user = await User.create({
      email: `u${n}@test.local`,
      name: `User ${n}`,
      password: hashPassword('Password@1'),
      role: 'USER',
      permissions: 'read',
      department: 'Engineering',
      ...overrides
    });
    const tokens = await session(user);
    return { user, ...tokens, auth: { Authorization: `Bearer ${tokens.token}` } };
  });
};

export const makeAdmin = (overrides = {}, company) =>
  makeUser({ role: 'ADMIN', permissions: 'read,write', ...overrides }, company);
// SUPER_ADMIN is the company admin inside a workspace
export const makeSuperAdmin = (overrides = {}, company) =>
  makeUser({ role: 'SUPER_ADMIN', permissions: 'read,write,delete', ...overrides }, company);

// The platform owner's Super Admin: lives outside every company
export const makePlatformAdmin = async (overrides = {}) => {
  const n = Math.random().toString(36).slice(2, 8);
  return runAsPlatform(async () => {
    const user = await User.create({
      email: `platform${n}@yakflow.test`, name: 'Platform Admin', password: hashPassword('Password@1'),
      role: 'PLATFORM_ADMIN', permissions: 'read,write,delete', department: 'Platform', ...overrides
    });
    const tokens = await session(user);
    return { user, ...tokens, auth: { Authorization: `Bearer ${tokens.token}` } };
  });
};

// Another company, to prove tenants cannot see each other
export const makeCompany = async (slug, overrides = {}) => {
  const company = await createCompany({ name: `${slug} Ltd`, slug, plan: 'enterprise', seatLimit: 1000, ...overrides });
  return { company, host: `${slug}.localhost`, api: () => api(`${slug}.localhost`) };
};

export const addHoliday = (date, name = 'Test holiday') => inTenant(() => Holiday.create({ date, name }));

// Next Monday-Friday dates from a fixed future week, as ISO strings
export const weekdays = (startMonday = '2030-03-04') => {
  const base = new Date(`${startMonday}T00:00:00Z`);
  return Array.from({ length: 5 }, (_, i) => new Date(base.getTime() + i * 86400000).toISOString().slice(0, 10));
};
