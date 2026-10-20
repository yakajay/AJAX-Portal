import mongoose from 'mongoose';
import { Company } from '../models/company.model.js';
import { env } from '../config/env.js';
import { primeCompanyKey } from '../utils/crypto.js';
import { enterScope, runAcrossTenants } from '../utils/tenantContext.js';
import { verifyToken } from '../utils/token.js';
import { hashRefreshToken } from '../models/session.model.js';

// Decides which company (or the platform console) a request is for, from its Host header:
//   admin.<baseDomain> or <baseDomain>   -> the platform console (Super Admin)
//   <slug>.<baseDomain>                  -> that company's workspace
// and runs the rest of the request inside that scope, so the data layer can only see that tenant.
export const classifyHost = (hostname) => {
  const { baseDomain, platformSubdomain, defaultTenantSlug } = env.tenancy;
  const host = String(hostname || '').toLowerCase().replace(/\.$/, '');
  if (host === baseDomain || host === `${platformSubdomain}.${baseDomain}`) return { kind: 'platform' };
  if (host.endsWith(`.${baseDomain}`)) {
    const slug = host.slice(0, -(baseDomain.length + 1));
    if (slug && !slug.includes('.')) return { kind: 'tenant', slug };
  }
  if (defaultTenantSlug) return { kind: 'tenant', slug: defaultTenantSlug };
  return { kind: 'unknown' };
};

// Reachable for a suspended company too, so its users see why they can't sign in
const ALWAYS_REACHABLE = new Set(['/api/auth/workspace']);

const SUSPENDED_MESSAGES = {
  suspended: 'This workspace is temporarily suspended. Please contact your administrator.',
  inactive: 'This workspace has been deactivated. Please contact your administrator.'
};

// The raw Host header, not req.hostname: with TRUST_PROXY on, Express would prefer a client-supplied
// X-Forwarded-Host. The reverse proxy must therefore pass the browser's Host through unchanged.
const requestHost = (req) => String(req.headers.host || '').replace(/:\d+$/, '');

// On an address that names no workspace (e.g. a shared *.web.app URL) the portal is worked out from who is
// asking: the token's company once signed in, the user's company from the email while signing in.
// Returns { kind: 'platform' | 'tenant' (with companyId) | 'portal' | 'ambiguous' }.
const inferTarget = async (req) => {
  const [scheme, bearer] = String(req.headers.authorization || '').split(' ');
  if (scheme === 'Bearer' && bearer) {
    try {
      const { cid } = verifyToken(bearer);
      if (cid) return { kind: 'tenant', companyId: cid };
      if (cid === null) return { kind: 'platform' };
    } catch { /* an invalid token is rejected later by authenticate */ }
  }

  const body = req.body || {};
  let companyIds = null;
  if (typeof body.email === 'string' && body.email.trim()) {
    const users = await runAcrossTenants(() =>
      mongoose.model('User').find({ email: body.email.trim().toLowerCase() }).select('companyId'));
    companyIds = [...new Set(users.map((u) => (u.companyId ? String(u.companyId) : null)))];
  } else if (typeof body.refreshToken === 'string' && body.refreshToken) {
    const session = await runAcrossTenants(() =>
      mongoose.model('Session').findOne({ refreshHash: hashRefreshToken(body.refreshToken) }).select('companyId'));
    if (session) companyIds = [session.companyId ? String(session.companyId) : null];
  }
  if (!companyIds?.length) return { kind: 'portal' };
  if (companyIds.length > 1) return { kind: 'ambiguous' };
  return companyIds[0] ? { kind: 'tenant', companyId: companyIds[0] } : { kind: 'platform' };
};

export const resolveTenant = async (req, res, next) => {
  let target = classifyHost(requestHost(req));
  if (target.kind === 'unknown') target = await inferTarget(req);

  if (target.kind === 'platform') {
    req.tenant = { kind: 'platform' };
    return enterScope({ scope: 'platform', companyId: null }, next);
  }
  if (target.kind === 'portal') {
    // Nobody identified yet: platform-scoped so lookups find nothing, and the login page can show a neutral form
    req.tenant = { kind: 'portal' };
    return enterScope({ scope: 'platform', companyId: null }, next);
  }
  if (target.kind === 'ambiguous') {
    return res.status(409).json({
      code: 'AMBIGUOUS_WORKSPACE',
      message: 'This email belongs to more than one workspace. Open your company address to sign in.'
    });
  }

  const company = await Company.findOne(target.companyId ? { _id: target.companyId } : { slug: target.slug }).select('+dataKey');
  if (!company || company.status === 'deleted') {
    return res.status(404).json({ code: 'WORKSPACE_NOT_FOUND', message: 'This workspace does not exist.' });
  }
  const route = req.baseUrl + req.path;
  if (company.status !== 'active' && !ALWAYS_REACHABLE.has(route)) {
    return res.status(403).json({ code: 'WORKSPACE_SUSPENDED', message: SUSPENDED_MESSAGES[company.status] });
  }

  primeCompanyKey(company.id, company.dataKey);
  req.tenant = { kind: 'tenant' };
  req.company = company;
  enterScope({ scope: 'tenant', companyId: company._id }, next);
};

export const requireTenantHost = (req, res, next) =>
  req.tenant?.kind === 'tenant'
    ? next()
    : res.status(403).json({ message: 'Open your company workspace to use this.' });

export const requirePlatformHost = (req, res, next) =>
  req.tenant?.kind === 'platform'
    ? next()
    : res.status(403).json({ message: 'This is only available in the platform console.' });

// Blocks a module that the company's subscription does not include
export const requireModule = (module) => (req, res, next) => {
  if (req.company && module && !req.company.modules.includes(module)) {
    return res.status(403).json({ code: 'MODULE_DISABLED', message: `The ${module} module is not part of your company's plan.` });
  }
  next();
};
