import { Router } from 'express';
import { authenticate, requireAdmin, requirePermission } from '../middleware/auth.js';
import * as users from '../controllers/admin/user.controller.js';
import * as leaves from '../controllers/admin/leave.controller.js';
import * as hr from '../controllers/admin/hr.controller.js';
import * as outsourcing from '../controllers/admin/outsourcing.controller.js';
import * as payroll from '../controllers/admin/payroll.controller.js';
import * as support from '../controllers/admin/support.controller.js';
import * as dashboard from '../controllers/admin/dashboard.controller.js';

// ADMIN and SUPER_ADMIN only. Account-level rules (e.g. only a Super Admin can manage admins)
// are enforced inside the user controller.
const router = Router();
router.use(authenticate, requireAdmin);

router.get('/dashboard/stats', dashboard.stats);

router.get('/users', users.list);
router.post('/users', requirePermission('write'), users.create);
router.put('/users/:id', requirePermission('write'), users.update);
router.patch('/users/:id/lock', requirePermission('write'), users.setLock);
router.post('/users/:id/reset-password', requirePermission('write'), users.resetPassword);
router.delete('/users/:id', requirePermission('delete'), users.remove);

router.get('/leaves', leaves.listAll);
router.put('/leaves/:id', requirePermission('write'), leaves.setStatus);

router.get('/documents', hr.listDocuments);
router.post('/documents', requirePermission('write'), hr.createDocument);

router.get('/contractors', outsourcing.list);
router.post('/contractors', requirePermission('write'), outsourcing.create);

router.get('/transactions', payroll.listTransactions);
router.post('/payroll/run', requirePermission('write'), payroll.run);

router.get('/support/tickets', support.listTickets);
router.put('/support/tickets/:id', requirePermission('write'), support.setTicketStatus);

export default router;
