import mongoose from 'mongoose';
import { schemaOptions } from './schemaOptions.js';
import { MODULES } from '../utils/permissions.js';
import { env } from '../config/env.js';

export const COMPANY_STATUSES = ['active', 'suspended', 'inactive', 'deleted'];
export const PLANS = {
  trial: { label: 'Trial', seats: 10 },
  starter: { label: 'Starter', seats: 50 },
  business: { label: 'Business', seats: 250 },
  enterprise: { label: 'Enterprise', seats: 5000 }
};

// Subdomains that must never be handed to a company
export const RESERVED_SLUGS = [
  'admin', 'www', 'api', 'app', 'platform', 'mail', 'smtp', 'ftp', 'static', 'assets', 'cdn',
  'support', 'status', 'billing', 'login', 'sso', 'auth', 'docs', 'help', 'root', 'localhost'
];
export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

const companySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    status: { type: String, enum: COMPANY_STATUSES, default: 'active', index: true },
    statusReason: { type: String, default: '' },
    deletedAt: { type: Date, default: null },

    primaryContact: {
      name: { type: String, default: '', trim: true },
      email: { type: String, default: '', trim: true, lowercase: true },
      phone: { type: String, default: '', trim: true }
    },
    profile: {
      industry: { type: String, default: '', trim: true },
      website: { type: String, default: '', trim: true },
      address: { type: String, default: '', trim: true },
      timezone: { type: String, default: 'UTC' }
    },

    subscription: {
      plan: { type: String, enum: Object.keys(PLANS), default: 'trial' },
      seatLimit: { type: Number, default: PLANS.trial.seats, min: 1 },
      startedAt: { type: Date, default: Date.now },
      expiresAt: { type: Date, default: null }
    },
    modules: { type: [String], default: () => [...MODULES] },
    settings: {
      // Self-signup is off by default: a workspace belongs to one company, so people are added by its admins or SSO
      allowSelfSignup: { type: Boolean, default: false }
    },

    // Single sign-on, configured by the company's own admins. Secrets are write-only.
    sso: {
      enabled: { type: Boolean, default: false },
      protocol: { type: String, enum: ['oidc', 'saml'], default: 'oidc' },
      providerName: { type: String, default: 'company account', trim: true },
      allowedDomains: { type: [String], default: [] },
      autoProvision: { type: Boolean, default: true },
      oidc: {
        issuer: { type: String, default: '' },
        clientId: { type: String, default: '' },
        clientSecret: { type: String, default: '' } // sealed with the company data key
      },
      saml: {
        entryPoint: { type: String, default: '' }, // IdP single sign-on URL
        idpIssuer: { type: String, default: '' }, // IdP entity ID
        idpCert: { type: String, default: '' } // IdP signing certificate (PEM)
      }
    },

    // This company's data-encryption key, wrapped with the master key. Never leaves the server.
    dataKey: { type: String, required: true, select: false }
  },
  schemaOptions((ret) => {
    delete ret.dataKey;
    if (ret.sso?.oidc) {
      ret.sso.oidc.clientSecretSet = !!ret.sso.oidc.clientSecret;
      delete ret.sso.oidc.clientSecret;
    }
  })
);
companySchema.tenantExempt = true; // it is the tenant registry itself

companySchema.virtual('domain').get(function domain() {
  return `${this.slug}.${env.tenancy.baseDomain}`;
});

export const Company = mongoose.model('Company', companySchema);

// https://acme.ourhrms.com - what a company's users type into the browser
export const companyOrigin = (company) => {
  const { publicScheme, publicPort, baseDomain } = env.tenancy;
  return `${publicScheme}://${company.slug}.${baseDomain}${publicPort ? `:${publicPort}` : ''}`;
};
