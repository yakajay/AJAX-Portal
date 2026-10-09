import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import * as profile from '../controllers/user/profile.controller.js';
import * as attendance from '../controllers/user/attendance.controller.js';
import * as leave from '../controllers/user/leave.controller.js';
import * as hr from '../controllers/user/hr.controller.js';
import * as support from '../controllers/user/support.controller.js';
import * as dashboard from '../controllers/user/dashboard.controller.js';

// Self-service endpoints: every role may call these, and each only ever touches the caller's own data
const router = Router();
router.use(authenticate);

router.get('/profile', profile.getProfile);
router.put('/profile', profile.updateProfile);
router.put('/password', profile.changePassword);

router.get('/dashboard', dashboard.stats);

router.get('/attendance', attendance.listMine);
router.post('/attendance/check-in', attendance.checkIn);
router.post('/attendance/check-out', attendance.checkOut);
router.post('/attendance/manual', attendance.addManual);

router.get('/leaves', leave.listMine);
router.get('/leaves/balance', leave.balance);
router.post('/leaves', leave.apply);

router.get('/documents', hr.myDocuments);
router.get('/holidays', hr.holidays);
router.get('/directory', hr.directory);

router.get('/support/tickets', support.myTickets);
router.post('/support/tickets', support.createTicket);

export default router;
