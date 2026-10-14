import { Router } from 'express';
import mongoose from 'mongoose';
import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import adminRoutes from './admin.routes.js';
import docsRoutes from './docs.routes.js';
import platformRoutes from './platform.routes.js';
import { resolveTenant, requireTenantHost, requirePlatformHost } from '../middleware/tenant.js';
import { renderMetrics } from '../utils/metrics.js';
import { env } from '../config/env.js';

const router = Router();

const dbUp = () => mongoose.connection.readyState === 1;

// Liveness: always 200 while the process is up (used by the Docker healthcheck)
router.get('/health', (req, res) =>
  res.json({ status: 'ok', db: dbUp() ? 'up' : 'down', uptimeSeconds: Math.round(process.uptime()) })
);
// Readiness: 503 until MongoDB is connected
router.get('/health/ready', (req, res) =>
  dbUp() ? res.json({ status: 'ready' }) : res.status(503).json({ status: 'unavailable', db: 'down' })
);
// Prometheus-style metrics; protected by METRICS_TOKEN when one is set
router.get('/metrics', (req, res) => {
  if (env.metricsToken && req.headers.authorization !== `Bearer ${env.metricsToken}`) {
    return res.status(401).json({ message: 'Metrics token required.' });
  }
  res.type('text/plain; version=0.0.4').send(renderMetrics({ mongodb_connected: dbUp() ? 1 : 0 }));
});

router.use('/', docsRoutes);        // /docs (Swagger UI) and /openapi.json
// Every route below runs inside a tenant scope chosen from the Host header (see middleware/tenant.js)
router.use('/auth', resolveTenant, authRoutes);    // public (login, OTP, register, reset)
router.use('/user', resolveTenant, userRoutes);    // any authenticated role, own data only
router.use('/admin', resolveTenant, requireTenantHost, adminRoutes);  // company ADMIN / SUPER_ADMIN
router.use('/platform', resolveTenant, requirePlatformHost, platformRoutes);  // platform Super Admin

export default router;
