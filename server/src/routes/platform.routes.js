import { Router } from 'express';
import { authenticate, requirePlatformAdmin, requirePlatformLevel, platformReadWrite } from '../middleware/auth.js';
import * as companies from '../controllers/platform/company.controller.js';
import * as team from '../controllers/platform/team.controller.js';

// The Super Admin console: only reachable on the platform host, only for platform accounts.
const router = Router();
// Portal Viewers can read everything; changes need Portal Admin; deleting and the team need Portal Super Admin.
router.use(authenticate, requirePlatformAdmin, platformReadWrite);

router.get('/stats', companies.stats);
router.get('/companies', companies.list);
router.post('/companies', companies.create);
router.get('/companies/:id', companies.get);
router.put('/companies/:id', companies.update);
router.patch('/companies/:id/status', companies.setStatus);
router.post('/companies/:id/admins', companies.inviteAdmin);
router.get('/companies/:id/employees', companies.employees);

router.get('/delete-requests', companies.listDeleteRequests);
router.patch('/delete-requests/:id', requirePlatformLevel('super'), companies.decideDeleteRequest);

router.get('/team', requirePlatformLevel('super'), team.team);
router.patch('/team/requests/:id', requirePlatformLevel('super'), team.decideRequest);
router.patch('/team/:id', requirePlatformLevel('super'), team.updateMember);

router.get('/audit', companies.auditLog);

export default router;
