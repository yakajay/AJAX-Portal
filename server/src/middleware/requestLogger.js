import crypto from 'node:crypto';
import { logger } from '../utils/logger.js';
import { recordRequest } from '../utils/metrics.js';

// Adds a request id, logs one structured line per request, and records metrics
export const requestLogger = (req, res, next) => {
  const start = process.hrtime.bigint();
  req.id = req.headers['x-request-id']?.toString().slice(0, 64) || crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    // Use the route pattern (not the raw URL) so ids don't explode metric cardinality
    const route = req.route ? `${req.baseUrl}${req.route.path}` : 'unmatched';
    recordRequest(req.method, route, res.statusCode, durationMs);
    if (req.path === '/api/health') return;
    logger.info(
      { reqId: req.id, method: req.method, url: req.originalUrl.split('?')[0], status: res.statusCode, ms: Math.round(durationMs), userId: req.user?.id },
      'request'
    );
  });
  next();
};
