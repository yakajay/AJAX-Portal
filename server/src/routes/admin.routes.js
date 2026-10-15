import { Router, raw } from 'express';
import { authenticate, requireAdmin, requireSuperAdmin, can } from '../middleware/auth.js';
import * as users from '../controllers/admin/user.controller.js';
import * as leaves from '../controllers/admin/leave.controller.js';
import * as attendance from '../controllers/admin/attendance.controller.js';
import * as hr from '../controllers/admin/hr.controller.js';
import * as outsourcing from '../controllers/admin/outsourcing.controller.js';
import * as payroll from '../controllers/admin/payroll.controller.js';
import * as support from '../controllers/admin/support.controller.js';
import * as dashboard from '../controllers/admin/dashboard.controller.js';
import * as audit from '../controllers/admin/audit.controller.js';
import * as org from '../controllers/org.controller.js';
import * as announcements from '../controllers/announcement.controller.js';
import * as performance from '../controllers/performance.controller.js';
import * as expenses from '../controllers/expense.controller.js';
import * as checklists from '../controllers/checklist.controller.js';
import * as company from '../controllers/admin/company.controller.js';
import * as sensitive from '../controllers/admin/sensitive.controller.js';

// ADMIN and SUPER_ADMIN only. Each route also checks a per-module permission (see utils/permissions.js).
// Account-level rules (e.g. only a Super Admin can manage admins) are enforced inside the user controller.
// Company admins never delete directly: every DELETE route files a request for the platform Super Admin to
// approve or reject (see controllers/admin/company.controller.js and the platform delete-request routes).
const router = Router();
router.use(authenticate, requireAdmin);

router.get('/dashboard/stats', dashboard.stats);
router.get('/dashboard/analytics', dashboard.analytics);

router.get('/users', can('users').read, users.list);
router.post('/users', can('users').write, users.create);
router.put('/users/:id', can('users').write, users.update);
router.patch('/users/:id/lock', can('users').write, users.setLock);
router.post('/users/:id/reset-password', can('users').write, users.resetPassword);
router.get('/users/:id/sensitive', can('users').write, sensitive.read);
router.put('/users/:id/sensitive', can('users').write, sensitive.update);
router.delete('/users/:id', can('users').delete, company.deleteViaRequest('user'));

router.get('/leaves', can('leave').read, leaves.listAll);
router.put('/leaves/:id', can('leave').write, leaves.setStatus);

router.get('/attendance/report', can('attendance').read, attendance.report);
router.get('/attendance/regularizations', can('attendance').read, attendance.listRegularizations);
router.put('/attendance/:id/review', can('attendance').write, attendance.reviewRequest);

router.get('/documents', can('hr').read, hr.listDocuments);
router.post('/documents', can('hr').write, hr.createDocument);

router.get('/contractors', can('outsourcing').read, outsourcing.list);
router.get('/contractors/alerts', can('outsourcing').read, outsourcing.alerts);
router.post('/contractors', can('outsourcing').write, outsourcing.create);
router.put('/contractors/:id', can('outsourcing').write, outsourcing.update);
router.post('/contractors/:id/timesheets', can('outsourcing').write, outsourcing.createTimesheet);
router.get('/timesheets', can('outsourcing').read, outsourcing.listTimesheets);
router.put('/timesheets/:id', can('outsourcing').write, outsourcing.reviewTimesheet);
router.get('/invoices', can('outsourcing').read, outsourcing.listInvoices);
router.post('/invoices', can('outsourcing').write, outsourcing.createInvoice);
router.put('/invoices/:id', can('outsourcing').write, outsourcing.updateInvoice);

router.get('/transactions', can('payroll').read, payroll.listTransactions);
router.post('/payroll/run', can('payroll').write, payroll.run);
router.get('/payroll/structures', can('payroll').read, payroll.listStructures);
router.put('/payroll/structures/:userId', can('payroll').write, payroll.setStructure);
router.post('/payroll/run-monthly', can('payroll').write, payroll.runMonthly);
router.get('/payroll/payslips', can('payroll').read, payroll.listPayslips);
router.post('/payroll/payslips/mark-paid', can('payroll').write, payroll.markPaid);
router.get('/payroll/payslips/:id/pdf', can('payroll').read, payroll.payslipPdf);

router.get('/support/tickets', can('support').read, support.listTickets);
router.get('/support/tickets/:id', can('support').read, support.getTicket);
router.put('/support/tickets/:id', can('support').write, support.updateTicket);
router.post('/support/tickets/:id/comments', can('support').write, support.addComment);

router.post('/departments', can('org').write, org.createDepartment);
router.put('/departments/:id', can('org').write, org.updateDepartment);
router.delete('/departments/:id', can('org').delete, company.deleteViaRequest('department'));

router.get('/announcements', can('announcements').read, announcements.listAll);
router.post('/announcements', can('announcements').write, announcements.create);
router.put('/announcements/:id', can('announcements').write, announcements.update);
router.delete('/announcements/:id', can('announcements').delete, company.deleteViaRequest('announcement'));

router.get('/performance/cycles', can('performance').read, performance.listCycles);
router.post('/performance/cycles', can('performance').write, performance.createCycle);
router.put('/performance/cycles/:id/close', can('performance').write, performance.closeCycle);
router.get('/performance/reviews', can('performance').read, performance.listReviews);
router.put('/performance/reviews/:id/manager', can('performance').write, performance.submitAsAdmin);

router.get('/expenses', can('expenses').read, expenses.listAll);
router.put('/expenses/:id/review', can('expenses').write, expenses.review);
router.post('/expenses/:id/reimburse', can('expenses').write, expenses.reimburse);

router.get('/checklist-templates', can('onboarding').read, checklists.listTemplates);
router.post('/checklist-templates', can('onboarding').write, checklists.createTemplate);
router.put('/checklist-templates/:id', can('onboarding').write, checklists.updateTemplate);
router.delete('/checklist-templates/:id', can('onboarding').delete, company.deleteViaRequest('checklistTemplate'));
router.get('/checklists', can('onboarding').read, checklists.listAll);
router.post('/checklists', can('onboarding').write, checklists.assign);
router.put('/checklists/:id/tasks/:taskId', can('onboarding').write, checklists.completeTaskAsAdmin);
router.delete('/checklists/:id', can('onboarding').delete, company.deleteViaRequest('checklist'));

// Company settings, single sign-on and support access: the company admin (SUPER_ADMIN) only
router.get('/company', requireSuperAdmin, company.get);
router.put('/company', requireSuperAdmin, company.update);
router.get('/company/sso', requireSuperAdmin, company.getSso);
router.put('/company/sso', requireSuperAdmin, company.updateSso);
router.get('/company/mail', requireSuperAdmin, company.getMail);
router.put('/company/mail', requireSuperAdmin, company.updateMail);
router.post('/company/mail/test', requireSuperAdmin, company.testMail);
// The logo is uploaded as the raw image body (the JSON parser would reject it)
router.put('/company/logo', requireSuperAdmin, raw({ type: ['image/png', 'image/jpeg', 'image/webp'], limit: company.MAX_LOGO_BYTES }), company.uploadLogo);
router.delete('/company/logo', requireSuperAdmin, company.removeLogo);
router.get('/support-access', requireSuperAdmin, company.listSupportAccess);
router.post('/support-access', requireSuperAdmin, company.grantSupportAccess);
router.post('/support-access/:id/revoke', requireSuperAdmin, company.revokeSupportAccess);

// Any admin can see and raise delete requests; raising one needs delete permission on that module
router.get('/delete-requests', company.listDeleteRequests);
router.post('/delete-requests', company.createDeleteRequest);

router.get('/audit', requireSuperAdmin, audit.list);

export default router;
