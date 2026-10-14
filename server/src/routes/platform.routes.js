import { Router } from 'express';
import { authenticate, requirePlatformAdmin } from '../middleware/auth.js';
import * as companies from '../controllers/platform/company.controller.js';

// The Super Admin console: only reachable on the platform host, only for platform accounts.
const router = Router();
router.use(authenticate, requirePlatformAdmin);

router.get('/stats', companies.stats);
router.get('/companies', companies.list);
router.post('/companies', companies.create);
router.get('/companies/:id', companies.get);
router.put('/companies/:id', companies.update);
router.patch('/companies/:id/status', companies.setStatus);
router.post('/companies/:id/admins', companies.inviteAdmin);
router.get('/companies/:id/employees', companies.employees);

router.get('/delete-requests', companies.listDeleteRequests);
router.patch('/delete-requests/:id', companies.decideDeleteRequest);

router.get('/audit', companies.auditLog);

export default router;
