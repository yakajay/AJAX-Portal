import crypto from 'node:crypto';
import dotenv from 'dotenv';

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';

let jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  if (isProduction) throw new Error('JWT_SECRET must be set in production.');
  // Dev fallback: tokens are invalidated on every restart
  jwtSecret = crypto.randomBytes(32).toString('hex');
  console.warn('[config] JWT_SECRET not set - using an ephemeral secret for this run.');
}

// Master key that wraps every company's data-encryption key (32 bytes, base64 or hex). Losing it makes
// encrypted employee data unreadable, so keep it in a secret manager and back it up separately.
const parseMasterKey = (raw) => {
  if (!raw) return null;
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('DATA_ENCRYPTION_KEY must be 32 bytes (64 hex characters or base64).');
  return key;
};
let dataKey = parseMasterKey(process.env.DATA_ENCRYPTION_KEY);
if (!dataKey) {
  if (isProduction) throw new Error('DATA_ENCRYPTION_KEY must be set in production.');
  // Dev/test fallback: stable across restarts so seeded data stays readable, but NOT secret
  dataKey = crypto.createHash('sha256').update('yakflow-development-data-key').digest();
  console.warn('[config] DATA_ENCRYPTION_KEY not set - using an insecure development key.');
}

const baseDomain = (process.env.BASE_DOMAIN || 'localhost').trim().toLowerCase();

export const env = {
  isProduction,
  port: process.env.PORT || 5000,
  // Multi-tenancy: company workspaces live at <slug>.<baseDomain>; the platform console at <platformSubdomain>.<baseDomain>
  tenancy: {
    baseDomain,
    platformSubdomain: (process.env.PLATFORM_SUBDOMAIN || 'admin').trim().toLowerCase(),
    // Public URL parts, used to show admins the redirect URIs to register with their identity provider
    publicScheme: process.env.PUBLIC_SCHEME || (isProduction ? 'https' : 'http'),
    publicPort: process.env.PUBLIC_PORT || '',
    // Single-company installs without wildcard DNS: any host that is not under baseDomain serves this company
    defaultTenantSlug: (process.env.DEFAULT_TENANT_SLUG || '').trim().toLowerCase()
  },
  dataEncryptionKey: dataKey,
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  mongo: {
    uri: process.env.MONGODB_URI,
    dbName: process.env.MONGODB_DB_NAME
  },
  jwtSecret,
  // Short-lived access token; the refresh token (tied to a revocable session) keeps the user signed in
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
  refreshTtlHours: parseInt(process.env.REFRESH_TTL_HOURS || '12'),
  trustProxy: process.env.TRUST_PROXY || false,
  logLevel: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
  metricsToken: process.env.METRICS_TOKEN || '',
  appName: 'YakFlow',
  attendance: {
    // Local wall-clock times (viewer's timezone) used for late / early-out flags
    lateAfter: process.env.ATTENDANCE_LATE_AFTER || '09:30',
    earlyBefore: process.env.ATTENDANCE_EARLY_BEFORE || '17:30',
    // Hours in a normal working day; time beyond this on a day counts as overtime (a shift's own length wins)
    standardHours: parseFloat(process.env.ATTENDANCE_STANDARD_HOURS || '8'),
    // Optional check-in restrictions. Empty = unrestricted.
    allowedIps: (process.env.ATTENDANCE_ALLOWED_IPS || '').split(',').map((s) => s.trim()).filter(Boolean),
    office: process.env.OFFICE_LAT && process.env.OFFICE_LNG
      ? {
          lat: parseFloat(process.env.OFFICE_LAT),
          lng: parseFloat(process.env.OFFICE_LNG),
          radiusMeters: parseInt(process.env.OFFICE_RADIUS_M || '300')
        }
      : null
  },
  jobs: {
    enabled: process.env.JOBS_ENABLED !== 'false' && process.env.NODE_ENV !== 'test',
    digestHour: parseInt(process.env.DIGEST_HOUR || '8'),
    contractAlertDays: parseInt(process.env.CONTRACT_ALERT_DAYS || '30')
  },
  sso: {
    // Identity providers are configured per company by its admins. Providers on private addresses are
    // refused unless this is set (guards against server-side request forgery).
    allowPrivateHosts: process.env.SSO_ALLOW_PRIVATE_HOSTS === 'true',
    requestTimeoutMs: parseInt(process.env.SSO_TIMEOUT_MS || '10000')
  },
  otpTtlMinutes: parseInt(process.env.OTP_TTL_MINUTES || '10'),
  otpMaxAttempts: 5,
  otpResendSeconds: 60,
  smtp: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.MAIL_FROM || 'YakFlow <no-reply@yakflow.local>'
  }
};
