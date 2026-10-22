import { Router, raw, text } from 'express';
import { authenticate, requireAdmin, requireSuperAdmin, can } from '../middleware/auth.js';
import * as users from '../controllers/admin/user.controller.js';
import * as leaves from '../controllers/admin/leave.controller.js';
import { DOCUMENT_TYPES, MAX_DOCUMENT_BYTES } from '../utils/documentFiles.js';
import * as recruitment from '../controllers/admin/recruitment.controller.js';
import { requireModule } from '../middleware/tenant.js';
import * as shifts from '../controllers/admin/shift.controller.js';
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
import * as exits from '../controllers/exit.controller.js';
import * as reports from '../controllers/admin/report.controller.js';
import * as sensitive from '../controllers/admin/sensitive.controller.js';
import * as payrollControl from '../controllers/admin/payrollControl.controller.js';
import * as compliance from '../controllers/admin/compliance.controller.js';
import * as entities from '../controllers/admin/entity.controller.js';

// ADMIN and SUPER_ADMIN only. Each route also checks a per-module permission (see utils/permissions.js).
// Account-level rules (e.g. only a Super Admin can manage admins) are enforced inside the user controller.
// Company admins never delete directly: every DELETE route files a request for the platform Super Admin to
// approve or reject (see controllers/admin/company.controller.js and the platform delete-request routes).
const router = Router();
router.use(authenticate, requireAdmin);

router.get('/dashboard/stats', dashboard.stats);
router.get('/dashboard/analytics', dashboard.analytics);

router.get('/users', can('users').read, users.list);
router.delete('/users/:id/avatar', can('users').write, users.removeAvatar);
router.get('/users/export', can('users').read, reports.exportEmployees);
router.get('/users/import/template', can('users').write, users.importTemplate);
router.post('/users/import', can('users').write, text({ type: 'text/csv', limit: users.MAX_IMPORT_BYTES }), users.importUsers);
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
router.get('/attendance/records', can('attendance').read, attendance.listRecords);
router.post('/attendance', can('attendance').write, attendance.createRecord);
router.put('/attendance/:id', can('attendance').write, attendance.updateRecord);
router.delete('/attendance/:id', can('attendance').delete, attendance.deleteRecord);
router.put('/attendance/:id/review', can('attendance').write, attendance.reviewRequest);

router.get('/shifts', can('attendance').read, shifts.list);
router.post('/shifts', can('attendance').write, shifts.create);
router.put('/shifts/assign', can('attendance').write, shifts.assign);
router.put('/shifts/:id', can('attendance').write, shifts.update);
router.delete('/shifts/:id', can('attendance').write, shifts.remove);

// Recruitment: jobs, a candidate pipeline, resumes, and hiring (which creates the employee account)
router.use('/recruitment', requireModule('recruitment'));
router.get('/recruitment/jobs', can('recruitment').read, recruitment.listJobs);
router.post('/recruitment/jobs', can('recruitment').write, recruitment.createJob);
router.put('/recruitment/jobs/:id', can('recruitment').write, recruitment.updateJob);
router.get('/recruitment/candidates', can('recruitment').read, recruitment.listCandidates);
router.post('/recruitment/candidates', can('recruitment').write, recruitment.createCandidate);
router.put('/recruitment/candidates/:id', can('recruitment').write, recruitment.updateCandidate);
router.put('/recruitment/candidates/:id/stage', can('recruitment').write, recruitment.setStage);
router.post('/recruitment/candidates/:id/notes', can('recruitment').write, recruitment.addNote);
router.put('/recruitment/candidates/:id/resume', can('recruitment').write, raw({ type: recruitment.RESUME_CONTENT_TYPES, limit: MAX_DOCUMENT_BYTES }), recruitment.uploadResume);
router.get('/recruitment/candidates/:id/resume', can('recruitment').read, recruitment.downloadResume);
router.post('/recruitment/candidates/:id/hire', can('recruitment').write, can('users').write, recruitment.hire);

// Compliance rules, checks and the filing calendar
router.get('/compliance', can('hr').read, compliance.report);
router.get('/compliance/settings', can('hr').read, compliance.getSettings);
router.put('/compliance/settings', can('hr').write, compliance.setSettings);
router.post('/compliance/filings', can('hr').write, compliance.markFiling);

// Employer records: the legal entities employees belong to
router.get('/entities', can('hr').read, entities.list);
router.post('/entities', can('hr').write, entities.create);
router.put('/entities/assign', can('hr').write, entities.assign);
router.put('/entities/:id', can('hr').write, entities.update);

router.get('/leave-balances', can('leave').read, leaves.balances);
router.get('/leave-policy', can('leave').read, leaves.getPolicy);
router.put('/leave-policy', can('leave').write, leaves.updatePolicy);

router.post('/holidays', can('hr').write, hr.createHoliday);
router.put('/holidays/:id', can('hr').write, hr.updateHoliday);
router.delete('/holidays/:id', can('hr').delete, company.deleteViaRequest('holiday'));

router.get('/documents', can('hr').read, hr.listDocuments);
router.post('/documents', can('hr').write, hr.createDocument);
router.post('/documents/letter', can('hr').write, hr.generateLetter);
router.put('/documents/:id/file', can('hr').write, raw({ type: Object.keys(DOCUMENT_TYPES), limit: MAX_DOCUMENT_BYTES }), hr.uploadDocumentFile);
router.get('/documents/:id/file', can('hr').read, hr.downloadDocumentFile);

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
router.get('/payroll/tax-policy', can('payroll').read, payroll.getTaxPolicy);
router.put('/payroll/tax-policy', can('payroll').write, payroll.setTaxPolicy);
router.get('/payroll/structures', can('payroll').read, payroll.listStructures);
router.put('/payroll/structures/:userId', can('payroll').write, payroll.setStructure);
router.post('/payroll/run-monthly', can('payroll').write, payroll.runMonthly);
router.get('/payroll/checks', can('payroll').read, payrollControl.checks);
// Bank and accounting files carry account numbers and ledger totals: payroll write access, and every download is audited
router.get('/payroll/bank-export/preview', can('payroll').write, payrollControl.bankPreview);
router.get('/payroll/bank-export', can('payroll').write, payrollControl.bankExport);
router.get('/payroll/accounting', can('payroll').read, payrollControl.getAccounting);
router.put('/payroll/accounting', can('payroll').write, payrollControl.setAccounting);
router.get('/payroll/accounting-export/preview', can('payroll').read, payrollControl.accountingPreview);
router.get('/payroll/accounting-export', can('payroll').write, payrollControl.accountingExport);
router.get('/payroll/payslips/export', can('payroll').read, reports.exportPayslips);
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

router.get('/reports/workforce', can('users').read, reports.workforce);
router.get('/reports/payroll', can('payroll').read, reports.payrollCost);
router.get('/reports/leave', can('leave').read, reports.leaveUsage);

router.get('/exits', can('onboarding').read, exits.listAll);
router.post('/exits', can('onboarding').write, exits.initiate);
router.put('/exits/:id/review', can('onboarding').write, exits.review);
router.get('/exits/:id/settlement', can('onboarding').write, can('payroll').read, exits.previewSettlement);
router.post('/exits/:id/settle', can('onboarding').write, can('payroll').write, exits.settle);

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
router.put('/company/branding', requireSuperAdmin, company.updateBranding);
// Admins can ask for their own sign-in address (or to give it up); the platform team decides. Each ask is a ticket.
router.get('/company/address-requests', company.listAddressRequests);
router.post('/company/address-requests', company.requestAddressChange);
router.put('/company/letterhead', requireSuperAdmin, raw({ type: ['image/png', 'image/jpeg'], limit: company.MAX_LETTERHEAD_BYTES }), company.uploadLetterhead);
router.get('/company/letterhead', requireSuperAdmin, company.getLetterhead);
router.delete('/company/letterhead', requireSuperAdmin, company.removeLetterhead);
router.get('/support-access', requireSuperAdmin, company.listSupportAccess);
router.post('/support-access', requireSuperAdmin, company.grantSupportAccess);
router.post('/support-access/:id/revoke', requireSuperAdmin, company.revokeSupportAccess);

// Any admin can see and raise delete requests; raising one needs delete permission on that module
router.get('/delete-requests', company.listDeleteRequests);
router.post('/delete-requests', company.createDeleteRequest);

router.get('/audit', requireSuperAdmin, audit.list);

export default router;
