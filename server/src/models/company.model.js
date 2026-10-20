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
    // Optional extras the platform switches on per company (part of what we provide to them)
    features: {
      customLogo: { type: Boolean, default: false },
      // Lets the company's admin send OTPs and notifications from their own mailbox (see `mail`)
      customEmail: { type: Boolean, default: false }
    },
    // The company's own logo, shown instead of ours. The image bytes live in `logo` and are only loaded
    // by the logo endpoint; `logoUpdatedAt` tells everyone else whether one exists.
    logoUpdatedAt: { type: Date, default: null },
    logoContentType: { type: String, default: '' },
    logoData: { type: Buffer, select: false },
    // The company's letterhead: a wide banner image printed at the top of payslips and company letters
    letterheadUpdatedAt: { type: Date, default: null },
    letterheadContentType: { type: String, default: '' },
    letterheadData: { type: Buffer, select: false },
    settings: {
      // Self-signup is off by default: a workspace belongs to one company, so people are added by its admins or SSO
      allowSelfSignup: { type: Boolean, default: false },
      // Income tax withholding slabs for payroll; no slabs means each employee's flat tax % applies (utils/payrollTax.js)
      payrollTax: {
        slabs: {
          type: [new mongoose.Schema({
            upTo: { type: Number, default: null }, // annual taxable income this band ends at; null = no limit
            ratePercent: { type: Number, required: true }
          }, { _id: false })],
          default: undefined
        },
        standardDeduction: { type: Number, default: 0 },
        pfReducesTaxable: { type: Boolean, default: true }
      },
      // Ledger accounts the payroll journal posts to (utils/accountingExport.js); blanks use the defaults
      accounting: {
        salaryExpense: { type: String, default: '', trim: true },
        pfPayable: { type: String, default: '', trim: true },
        taxPayable: { type: String, default: '', trim: true },
        otherPayable: { type: String, default: '', trim: true },
        salariesPayable: { type: String, default: '', trim: true },
        entityName: { type: String, default: '', trim: true } // company name inside the accounting package (Tally)
      },
      // Thresholds and recurring filings the company is held to (utils/compliance.js). Nothing statutory is built in.
      compliance: {
        requireGovernmentId: { type: Boolean, default: false },
        requireTaxId: { type: Boolean, default: false },
        minimumWage: { amount: { type: Number, default: null }, currency: { type: String, default: 'INR' } },
        noticePeriodDays: { type: Number, default: null },
        settlementDays: { type: Number, default: null },
        maxMonthlyOvertimeHours: { type: Number, default: null },
        filings: {
          type: [new mongoose.Schema({
            key: { type: String, required: true },
            name: { type: String, required: true },
            frequency: { type: String, enum: ['monthly', 'quarterly', 'yearly'], required: true },
            dueDay: { type: Number, required: true },
            dueMonth: { type: Number, default: null },
            since: { type: String, default: null }, // YYYY-MM-DD: deadlines before this are not tracked
            authority: { type: String, default: '' },
            note: { type: String, default: '' }
          }, { _id: false })],
          default: undefined
        }
      },
      // Leave types and entitlements; empty means the built-in defaults (utils/leavePolicy.js)
      leavePolicy: {
        type: [new mongoose.Schema({
          type: { type: String, required: true, trim: true },
          yearly: { type: Number, default: null },
          accrual: { type: String, enum: ['monthly', 'upfront', 'none'], default: 'upfront' },
          carryForwardMax: { type: Number, default: 0 }
        }, { _id: false })],
        default: undefined
      }
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

    // Outgoing mail (OTPs, notifications, approvals) sent from the company's own mailbox instead of the platform's.
    // The password is write-only and sealed with the company data key.
    mail: {
      enabled: { type: Boolean, default: false },
      host: { type: String, default: '', trim: true },
      port: { type: Number, default: 587 },
      secure: { type: Boolean, default: false }, // implicit TLS (port 465); otherwise STARTTLS is required
      username: { type: String, default: '', trim: true },
      password: { type: String, default: '' },
      fromName: { type: String, default: '', trim: true },
      fromEmail: { type: String, default: '', trim: true, lowercase: true },
      lastTestAt: { type: Date, default: null },
      lastTestOk: { type: Boolean, default: null }
    },

    // This company's data-encryption key, wrapped with the master key. Never leaves the server.
    dataKey: { type: String, required: true, select: false }
  },
  schemaOptions((ret) => {
    delete ret.dataKey;
    delete ret.logoData;
    delete ret.letterheadData;
    if (ret.mail) {
      ret.mail.passwordSet = !!ret.mail.password;
      delete ret.mail.password;
    }
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
