import { Company, RESERVED_SLUGS, SLUG_PATTERN, PLANS, companyOrigin } from '../models/company.model.js';
import { User } from '../models/user.model.js';
import { Session } from '../models/session.model.js';
import { generateWrappedCompanyKey, primeCompanyKey } from '../utils/crypto.js';
import { runAsTenant, runAcrossTenants } from '../utils/tenantContext.js';
import { MODULES } from '../utils/permissions.js';
import { sendMail } from '../utils/mailer.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

export class ServiceError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ServiceError';
    this.status = status;
  }
}

export const slugify = (name) =>
  String(name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

export const assertSlugAvailable = async (slug, exceptId = null) => {
  if (!SLUG_PATTERN.test(slug)) {
    throw new ServiceError(400, 'Subdomain must be 3-40 characters: lowercase letters, digits and hyphens, not starting or ending with a hyphen.');
  }
  if (RESERVED_SLUGS.includes(slug) || slug === env.tenancy.platformSubdomain) {
    throw new ServiceError(400, `"${slug}" is reserved. Choose another subdomain.`);
  }
  const taken = await Company.findOne({ slug, ...(exceptId ? { _id: { $ne: exceptId } } : {}) }).select('_id');
  if (taken) throw new ServiceError(409, `The subdomain "${slug}" is already taken.`);
};

// Picks a free subdomain based on the company name (acme, acme-2, ...)
const freeSlugFor = async (name) => {
  const base = slugify(name);
  if (base.length < 3) throw new ServiceError(400, 'Enter a longer company name or choose a subdomain.');
  for (let i = 1; i < 50; i++) {
    const slug = i === 1 ? base : `${base.slice(0, 36)}-${i}`;
    try {
      await assertSlugAvailable(slug);
      return slug;
    } catch (error) {
      if (error.status === 400 && i === 1) continue; // reserved/invalid base: try a suffix
      if (error.status !== 409) throw error;
    }
  }
  throw new ServiceError(409, 'Could not find a free subdomain. Choose one manually.');
};

export const cleanModules = (modules) => {
  if (modules === undefined) return undefined;
  if (!Array.isArray(modules)) throw new ServiceError(400, 'modules must be a list.');
  const unknown = modules.find((m) => !MODULES.includes(m));
  if (unknown) throw new ServiceError(400, `Unknown module "${unknown}".`);
  return [...new Set(modules)];
};

export const cleanPlan = (plan, seatLimit) => {
  const out = {};
  if (plan !== undefined) {
    if (!PLANS[plan]) throw new ServiceError(400, `Plan must be one of: ${Object.keys(PLANS).join(', ')}.`);
    out.plan = plan;
  }
  if (seatLimit !== undefined) {
    const n = Number(seatLimit);
    if (!Number.isInteger(n) || n < 1 || n > 100000) throw new ServiceError(400, 'seatLimit must be a whole number from 1 to 100000.');
    out.seatLimit = n;
  } else if (out.plan) {
    out.seatLimit = PLANS[out.plan].seats;
  }
  return out;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const cleanEmail = (email, label = 'email') => {
  const value = String(email ?? '').trim().toLowerCase();
  if (!EMAIL.test(value)) throw new ServiceError(400, `A valid ${label} is required.`);
  return value;
};

export const FEATURES = ['customLogo'];
export const cleanFeatures = (features) => {
  if (features === undefined) return undefined;
  if (!features || typeof features !== 'object') throw new ServiceError(400, 'features must be an object.');
  const unknown = Object.keys(features).find((f) => !FEATURES.includes(f));
  if (unknown) throw new ServiceError(400, `Unknown feature "${unknown}".`);
  return Object.fromEntries(Object.entries(features).map(([k, v]) => [k, !!v]));
};

export const createCompany = async ({ name, slug, primaryContact = {}, plan = 'trial', seatLimit, modules, features, profile = {} }) => {
  const cleanName = String(name ?? '').trim();
  if (!cleanName) throw new ServiceError(400, 'Company name is required.');
  const subscription = cleanPlan(plan, seatLimit);

  const chosen = slug ? String(slug).trim().toLowerCase() : await freeSlugFor(cleanName);
  if (slug) await assertSlugAvailable(chosen);

  const contactEmail = primaryContact.email ? cleanEmail(primaryContact.email, 'contact email') : '';
  const company = await Company.create({
    name: cleanName,
    slug: chosen,
    primaryContact: { name: primaryContact.name ?? '', email: contactEmail, phone: primaryContact.phone ?? '' },
    profile: { industry: profile.industry ?? '', website: profile.website ?? '', address: profile.address ?? '', timezone: profile.timezone || 'UTC' },
    subscription,
    ...(modules !== undefined ? { modules: cleanModules(modules) } : {}),
    ...(features !== undefined ? { features: cleanFeatures(features) } : {}),
    dataKey: generateWrappedCompanyKey()
  });
  const withKey = await Company.findById(company.id).select('+dataKey');
  primeCompanyKey(company.id, withKey.dataKey);
  return company;
};

export const seatsUsed = (company) => runAsTenant(company._id, () => User.countDocuments());

// Throws when the subscription has no free seat left
export const assertSeatAvailable = async (company) => {
  if (!company) return;
  const used = await seatsUsed(company);
  if (used >= company.subscription.seatLimit) {
    throw new ServiceError(402, `Your plan allows ${company.subscription.seatLimit} employees and all seats are in use. Ask the platform administrator to upgrade.`);
  }
};

// Creates (or finds) the company's admin and emails an invitation. The account has no password yet;
// the invitee sets one with "Forgot password", which proves they own the mailbox.
export const inviteCompanyAdmin = async (company, { name, email }, invitedBy = 'The platform team') => {
  const address = cleanEmail(email, 'admin email');
  const adminName = String(name || address.split('@')[0]).trim();

  const { user, created } = await runAsTenant(company._id, async () => {
    const existing = await User.findOne({ email: address });
    if (existing) {
      if (existing.role !== 'SUPER_ADMIN') {
        existing.role = 'SUPER_ADMIN';
        existing.permissions = 'read,write,delete';
        await existing.save();
      }
      return { user: existing, created: false };
    }
    await assertSeatAvailable(company);
    const fresh = await User.create({
      email: address,
      name: adminName,
      role: 'SUPER_ADMIN',
      permissions: 'read,write,delete',
      department: 'Management',
      emailVerified: true,
      password: null
    });
    return { user: fresh, created: true };
  });

  const link = `${companyOrigin(company)}/forgot-password`;
  try {
    await sendMail({
      to: address,
      subject: `${env.appName} - your ${company.name} workspace is ready`,
      text:
        `Hi ${user.name},\n\n${invitedBy} has set up ${company.name} on ${env.appName} and made you its administrator.\n\n` +
        `Workspace: ${companyOrigin(company)}\n\nTo choose your password, open ${link}, enter ${address}, and use the code we email you.\n`
    });
  } catch (error) {
    logger.warn({ err: error, to: address }, 'company admin invitation email failed');
  }
  return { user, created };
};

// Usage figures for the platform console. Counts only - never employee content.
export const usageByCompany = async () => {
  const [users, sessions] = await runAcrossTenants(() =>
    Promise.all([
      User.aggregate([
        { $match: { companyId: { $ne: null } } },
        { $group: { _id: '$companyId', employees: { $sum: 1 }, admins: { $sum: { $cond: [{ $in: ['$role', ['ADMIN', 'SUPER_ADMIN']] }, 1, 0] } } } }
      ]),
      Session.aggregate([
        { $match: { companyId: { $ne: null } } },
        { $group: { _id: '$companyId', lastActiveAt: { $max: '$lastUsedAt' } } }
      ])
    ])
  );
  const map = new Map();
  for (const u of users) map.set(String(u._id), { employees: u.employees, admins: u.admins, lastActiveAt: null });
  for (const s of sessions) {
    const row = map.get(String(s._id)) ?? { employees: 0, admins: 0 };
    map.set(String(s._id), { ...row, lastActiveAt: s.lastActiveAt });
  }
  return map;
};
