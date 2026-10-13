import pino from 'pino';
import { env } from '../config/env.js';

// Structured JSON logs (one object per line); LOG_LEVEL=silent disables output (used by tests)
export const logger = pino({
  level: env.logLevel,
  base: { service: 'yakflow-api' },
  redact: ['req.headers.authorization', 'password', 'refreshToken', 'otp'],
  ...(env.isProduction ? {} : { timestamp: pino.stdTimeFunctions.isoTime })
});
