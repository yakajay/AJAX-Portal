import { Company } from '../models/company.model.js';
import { env } from '../config/env.js';
import { primeCompanyKey } from '../utils/crypto.js';
import { enterScope } from '../utils/tenantContext.js';

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

export const resolveTenant = async (req, res, next) => {
  const target = classifyHost(requestHost(req));

  if (target.kind === 'platform') {
    req.tenant = { kind: 'platform' };
    return enterScope({ scope: 'platform', companyId: null }, next);
  }
  if (target.kind === 'unknown') {
    return res.status(404).json({ code: 'WORKSPACE_NOT_FOUND', message: 'No workspace is configured for this address.' });
  }

  const company = await Company.findOne({ slug: target.slug }).select('+dataKey');
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
  enterScope({ scope: 'tenant', companyId: company._id, slug: company.slug }, next);
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
