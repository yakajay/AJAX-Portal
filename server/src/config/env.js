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

export const env = {
  isProduction,
  port: process.env.PORT || 5000,
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
  // Single sign-on via any OpenID Connect provider (Microsoft Entra ID, Google Workspace, Okta, ...)
  sso: {
    issuer: (process.env.SSO_ISSUER || '').replace(/\/+$/, ''),
    clientId: process.env.SSO_CLIENT_ID || '',
    clientSecret: process.env.SSO_CLIENT_SECRET || '',
    // Where the IdP sends the user back; must match the redirect URI registered with the IdP
    redirectUri: process.env.SSO_REDIRECT_URI || `http://localhost:${process.env.PORT || 5000}/api/auth/sso/callback`,
    providerName: process.env.SSO_PROVIDER_NAME || 'company account',
    allowedDomains: (process.env.SSO_ALLOWED_DOMAINS || '').split(',').map((s) => s.trim().toLowerCase().replace(/^@/, '')).filter(Boolean),
    autoProvision: process.env.SSO_AUTO_PROVISION !== 'false'
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
