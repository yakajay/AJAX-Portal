import { Router, raw } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireModule } from '../middleware/tenant.js';
import * as profile from '../controllers/user/profile.controller.js';
import * as security from '../controllers/user/security.controller.js';
import * as attendance from '../controllers/user/attendance.controller.js';
import * as leave from '../controllers/user/leave.controller.js';
import * as exits from '../controllers/exit.controller.js';
import * as hr from '../controllers/user/hr.controller.js';
import * as support from '../controllers/user/support.controller.js';
import * as dashboard from '../controllers/user/dashboard.controller.js';
import * as notifications from '../controllers/user/notification.controller.js';
import * as payslips from '../controllers/user/payslip.controller.js';
import * as org from '../controllers/org.controller.js';
import * as announcements from '../controllers/announcement.controller.js';
import * as performance from '../controllers/performance.controller.js';
import * as expenses from '../controllers/expense.controller.js';
import * as checklists from '../controllers/checklist.controller.js';

// Self-service endpoints: every role may call these, and each only ever touches the caller's own data
// (the /team/* routes additionally expose a manager's direct reports).
const router = Router();
router.use(authenticate);

router.get('/profile', profile.getProfile);
router.put('/profile/avatar', raw({ type: profile.AVATAR_CONTENT_TYPES, limit: profile.MAX_AVATAR_BYTES }), profile.uploadAvatar);
router.delete('/profile/avatar', profile.removeAvatar);
router.get('/avatars/:id', profile.getAvatar);
router.put('/profile', profile.updateProfile);
router.get('/profile/sensitive', profile.getSensitive);
router.put('/profile/sensitive', profile.updateSensitive);
router.put('/preferences', profile.updatePreferences);
router.put('/password', profile.changePassword);

// Security: devices and authenticator-app 2FA
router.get('/sessions', security.mySessions);
router.post('/sessions/logout-all', security.endAllSessions);
router.delete('/sessions/:id', security.endSession);
router.post('/2fa/setup', security.setupTotp);
router.post('/2fa/enable', security.enableTotp);
router.post('/2fa/disable', security.disableTotp);

// A company only gets the modules its plan includes (the admin routes check the same list)
router.use('/attendance', requireModule('attendance'));
router.use('/leaves', requireModule('leave'));
router.use(['/documents', '/holidays'], requireModule('hr'));
router.use('/payslips', requireModule('payroll'));
router.use('/support', requireModule('support'));
router.use(['/performance', '/goals'], requireModule('performance'));
router.use('/expenses', requireModule('expenses'));
router.use(['/checklists', '/exits'], requireModule('onboarding'));
router.use('/announcements', requireModule('announcements'));
router.use(['/departments', '/org-chart'], requireModule('org'));

router.get('/dashboard', dashboard.stats);
router.get('/feed', announcements.feed);
router.get('/announcements', announcements.listActive);

router.get('/notifications', notifications.list);
router.patch('/notifications/read-all', notifications.markAllRead);
router.patch('/notifications/:id/read', notifications.markRead);
router.delete('/notifications/:id', notifications.remove);

router.get('/attendance', attendance.listMine);
router.get('/attendance/summary', attendance.summary);
router.get('/attendance/export', attendance.exportMine);
router.post('/attendance/check-in', attendance.checkIn);
router.post('/attendance/check-out', attendance.checkOut);
router.post('/attendance/manual', attendance.addManual);

router.get('/leaves', leave.listMine);
router.get('/leaves/balance', leave.balance);
router.get('/leaves/types', leave.types);
router.get('/leaves/calendar', leave.calendar);
router.post('/leaves', leave.apply);
router.patch('/leaves/:id/cancel', leave.cancel);

router.get('/documents', hr.myDocuments);
router.get('/documents/:id/file', hr.downloadMyDocument);
router.get('/holidays', hr.holidays);
router.get('/directory', hr.directory);
router.get('/departments', org.listDepartments);
router.get('/org-chart', org.orgChart);

router.get('/payslips', payslips.myPayslips);
router.get('/payslips/:id/pdf', payslips.myPayslipPdf);

router.get('/support/tickets', support.myTickets);
router.post('/support/tickets', support.createTicket);
router.get('/support/tickets/:id', support.getTicket);
router.post('/support/tickets/:id/comments', support.addComment);

router.get('/performance/reviews', performance.myReviews);
router.put('/performance/reviews/:id/self', performance.submitSelf);
router.get('/goals', performance.myGoals);
router.post('/goals', performance.createGoal);
router.put('/goals/:id', performance.updateGoal);
router.delete('/goals/:id', performance.deleteGoal);

router.get('/expenses', expenses.listMine);
router.post('/expenses', expenses.submit);
router.delete('/expenses/:id', expenses.withdraw);

router.get('/exits', exits.listMine);
router.post('/exits', exits.submit);
router.delete('/exits/:id', exits.withdraw);
router.get('/checklists', checklists.listMine);
router.put('/checklists/:id/tasks/:taskId', checklists.completeTaskAsEmployee);

// Manager views: only the caller's direct reports
router.get('/team/leaves', leave.teamLeaves);
router.put('/team/leaves/:id', leave.teamDecision);
router.get('/team/regularizations', attendance.teamRegularizations);
router.put('/team/regularizations/:id', attendance.teamReview);
router.get('/team/reviews', performance.teamReviews);
router.put('/team/reviews/:id', performance.submitManager);
router.get('/team/goals', performance.teamGoals);

export default router;
