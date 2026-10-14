import mongoose from 'mongoose';
import { Company, COMPANY_STATUSES, PLANS, companyOrigin } from '../../models/company.model.js';
import { DeleteRequest } from '../../models/deleteRequest.model.js';
import { SupportAccess } from '../../models/supportAccess.model.js';
import { AuditLog } from '../../models/auditLog.model.js';
import { User } from '../../models/user.model.js';
import { SalaryStructure } from '../../models/salary.model.js';
import { Session } from '../../models/session.model.js';
import { runAsTenant, runAcrossTenants } from '../../utils/tenantContext.js';
import { notify } from '../../utils/notify.js';
import { audit } from '../../utils/audit.js';
import { MODULES } from '../../utils/permissions.js';
import {
  ServiceError, createCompany, inviteCompanyAdmin, assertSlugAvailable, cleanModules, cleanPlan, cleanEmail, usageByCompany
} from '../../services/company.service.js';
import { executeDeleteRequest } from '../../services/deletion.service.js';

// The platform Super Admin's console. It manages companies and sees platform-level facts only: profile,
// subscription, usage and status. Employee content is never returned here, except through
// `employees`, which masks sensitive fields unless the company has granted temporary support access.
const MASK = '••••••••';
const text = (value, max = 200) => String(value ?? '').trim().slice(0, max);
const validId = (id) => mongoose.isValidObjectId(id);

const loadCompany = async (req, res) => {
  const company = validId(req.params.id) ? await runAcrossTenants(() => Company.findById(req.params.id)) : null;
  if (!company) res.status(404).json({ message: 'Company not found.' });
  return company;
};

const summary = (company, usage = {}) => ({
  ...company.toJSON(),
  domain: company.domain,
  origin: companyOrigin(company),
  usage: { employees: usage.employees ?? 0, admins: usage.admins ?? 0, seatLimit: company.subscription.seatLimit, lastActiveAt: usage.lastActiveAt ?? null }
});

// GET /platform/stats
export const stats = async (req, res) => {
  const [companies, usage, pendingDeletes] = await runAcrossTenants(() =>
    Promise.all([
      Company.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      usageByCompany(),
      DeleteRequest.countDocuments({ status: 'Pending' })
    ])
  );
  const byStatus = Object.fromEntries(COMPANY_STATUSES.map((s) => [s, 0]));
  for (const row of companies) byStatus[row._id] = row.count;
  const employees = [...usage.values()].reduce((sum, u) => sum + u.employees, 0);
  res.json({ companies: byStatus, employees, pendingDeleteRequests: pendingDeletes, plans: PLANS, modules: MODULES });
};

// GET /platform/companies?status=&q=
export const list = async (req, res) => {
  const filter = {};
  if (COMPANY_STATUSES.includes(req.query.status)) filter.status = req.query.status;
  else filter.status = { $ne: 'deleted' };
  if (typeof req.query.q === 'string' && req.query.q.trim()) {
    const escaped = req.query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [{ name: { $regex: escaped, $options: 'i' } }, { slug: { $regex: escaped, $options: 'i' } }];
  }
  const [companies, usage] = await runAcrossTenants(() => Promise.all([Company.find(filter).sort({ createdAt: -1 }), usageByCompany()]));
  res.json(companies.map((c) => summary(c, usage.get(c.id))));
};

// POST /platform/companies - onboard a company; its subdomain is created from the name unless one is given
export const create = async (req, res) => {
  const { name, slug, primaryContact, plan, seatLimit, modules, profile, firstAdmin } = req.body ?? {};
  // Validate the admin up front so a bad email doesn't leave a half-onboarded company behind
  const adminEmail = firstAdmin?.email ? cleanEmail(firstAdmin.email, 'admin email') : null;

  const company = await createCompany({ name, slug, primaryContact, plan, seatLimit, modules, profile });
  let admin = null;
  if (adminEmail) admin = (await inviteCompanyAdmin(company, { name: firstAdmin.name, email: adminEmail }, 'The platform team')).user;

  await audit(req, {
    action: 'company.create', entity: 'company', entityId: company.id, companyId: company._id,
    summary: `Onboarded ${company.name} at ${company.domain}`, meta: { plan: company.subscription.plan, admin: admin?.email ?? null }
  });
  res.status(201).json({ ...summary(company), firstAdmin: admin ? { id: admin.id, name: admin.name, email: admin.email } : null });
};

// GET /platform/companies/:id
export const get = async (req, res) => {
  const company = await loadCompany(req, res);
  if (!company) return;
  const [usage, grant, openRequests] = await runAcrossTenants(() =>
    Promise.all([
      usageByCompany(),
      SupportAccess.findOne({ companyId: company._id, revokedAt: null, expiresAt: { $gt: new Date() } }).sort({ expiresAt: -1 }),
      DeleteRequest.countDocuments({ companyId: company._id, status: 'Pending' })
    ])
  );
  res.json({
    ...summary(company, usage.get(company.id)),
    pendingDeleteRequests: openRequests,
    supportAccess: grant ? { active: true, expiresAt: grant.expiresAt, reason: grant.reason, grantedByName: grant.grantedByName } : { active: false }
  });
};

// PUT /platform/companies/:id
export const update = async (req, res) => {
  const company = await loadCompany(req, res);
  if (!company) return;
  if (company.status === 'deleted') return res.status(409).json({ message: 'This company has been deleted.' });
  const { name, slug, primaryContact, plan, seatLimit, modules, expiresAt } = req.body ?? {};
  const changed = [];

  if (name !== undefined) {
    if (!text(name)) return res.status(400).json({ message: 'Company name is required.' });
    company.name = text(name);
    changed.push('name');
  }
  if (slug !== undefined && String(slug).trim().toLowerCase() !== company.slug) {
    const next = String(slug).trim().toLowerCase();
    await assertSlugAvailable(next, company._id);
    company.slug = next; // moving the subdomain also moves the SSO redirect URIs their IdP knows about
    changed.push('slug');
  }
  if (primaryContact !== undefined) {
    company.primaryContact = {
      name: text(primaryContact?.name),
      email: primaryContact?.email ? cleanEmail(primaryContact.email, 'contact email') : '',
      phone: text(primaryContact?.phone, 40)
    };
    changed.push('primaryContact');
  }
  if (plan !== undefined || seatLimit !== undefined) {
    const next = cleanPlan(plan, seatLimit);
    if (next.plan) company.subscription.plan = next.plan;
    if (next.seatLimit) company.subscription.seatLimit = next.seatLimit;
    changed.push('subscription');
  }
  if (expiresAt !== undefined) {
    if (expiresAt && Number.isNaN(Date.parse(expiresAt))) return res.status(400).json({ message: 'expiresAt must be a date.' });
    company.subscription.expiresAt = expiresAt ? new Date(expiresAt) : null;
    changed.push('subscription');
  }
  if (modules !== undefined) {
    company.modules = cleanModules(modules);
    changed.push('modules');
  }
  await company.save();
  await audit(req, { action: 'company.update', entity: 'company', entityId: company.id, companyId: company._id, summary: `Updated ${company.name}`, meta: [...new Set(changed)] });
  res.json(summary(company));
};

// PATCH /platform/companies/:id/status { status: active | suspended | inactive, reason }
export const setStatus = async (req, res) => {
  const company = await loadCompany(req, res);
  if (!company) return;
  const status = req.body?.status;
  if (!['active', 'suspended', 'inactive'].includes(status)) {
    return res.status(400).json({ message: 'status must be active, suspended or inactive.' });
  }
  if (company.status === 'deleted') return res.status(409).json({ message: 'This company has been deleted.' });
  const reason = text(req.body?.reason, 300);
  if (status !== 'active' && !reason) return res.status(400).json({ message: 'Give a reason for suspending or deactivating a company.' });

  const previous = company.status;
  company.status = status;
  company.statusReason = status === 'active' ? '' : reason;
  await company.save();
  // Leaving "active" signs everyone out right away rather than waiting for their tokens to lapse
  if (status !== 'active') await runAsTenant(company._id, () => Session.updateMany({ revokedAt: null }, { revokedAt: new Date() }));
  const verb = { active: 'Activated', suspended: 'Suspended', inactive: 'Deactivated' }[status];
  await audit(req, {
    action: `company.${status === 'active' ? 'activate' : status === 'suspended' ? 'suspend' : 'deactivate'}`, entity: 'company',
    entityId: company.id, companyId: company._id, summary: `${verb} ${company.name}${reason ? `: ${reason}` : ''}`, meta: { from: previous, to: status }
  });
  res.json(summary(company));
};

// POST /platform/companies/:id/admins { name, email } - invite (or promote) a company admin
export const inviteAdmin = async (req, res) => {
  const company = await loadCompany(req, res);
  if (!company) return;
  if (company.status === 'deleted') return res.status(409).json({ message: 'This company has been deleted.' });
  const { user, created } = await inviteCompanyAdmin(company, req.body ?? {}, 'The platform team');
  await audit(req, {
    action: 'company.invite_admin', entity: 'company', entityId: company.id, companyId: company._id,
    summary: `${created ? 'Invited' : 'Re-invited'} ${user.email} as admin of ${company.name}`
  });
  res.status(created ? 201 : 200).json({ id: user.id, name: user.name, email: user.email, created });
};

// GET /platform/companies/:id/employees
// Names and roles are always visible. Sensitive fields (salary, bank details, government IDs) are masked
// unless the company admin has granted support access that has not expired; each unmasked view is logged.
export const employees = async (req, res) => {
  const company = await loadCompany(req, res);
  if (!company) return;
  if (company.status === 'deleted') return res.status(409).json({ message: 'This company has been deleted.' });

  const grant = await runAcrossTenants(() =>
    SupportAccess.findOne({ companyId: company._id, revokedAt: null, expiresAt: { $gt: new Date() } }).sort({ expiresAt: -1 })
  );
  const unmasked = !!grant;

  const rows = await runAsTenant(company._id, async () => {
    const [users, salaries] = await Promise.all([User.find().sort({ name: 1 }).limit(500), SalaryStructure.find()]);
    const pay = new Map(salaries.map((s) => [String(s.userId), s]));
    return users.map((u) => {
      const s = u.sensitive ?? {};
      const salary = pay.get(u.id);
      const show = (value) => (value ? (unmasked ? value : MASK) : null);
      return {
        id: u.id, name: u.name, email: u.email, role: u.role, department: u.department, designation: u.designation, locked: u.locked,
        sensitive: {
          bankName: show(s.bankName), bankAccount: show(s.bankAccount), bankIfsc: show(s.bankIfsc),
          governmentId: show(s.governmentId), taxId: show(s.taxId),
          monthlyGross: salary ? (unmasked ? salary.basic + salary.hra + salary.allowances : MASK) : null,
          currency: salary?.currency ?? null
        }
      };
    });
  });

  if (unmasked) {
    await runAcrossTenants(() => SupportAccess.updateOne({ _id: grant._id }, { $inc: { views: 1 }, lastViewedAt: new Date() }));
    await audit(req, {
      action: 'support.view', entity: 'company', entityId: company.id, companyId: company._id,
      summary: `Viewed unmasked employee data (${rows.length} people) under support access`, meta: { grantId: grant.id, reason: grant.reason }
    });
  }
  res.json({ unmasked, accessExpiresAt: unmasked ? grant.expiresAt : null, employees: rows });
};

// GET /platform/delete-requests?status=&companyId=
export const listDeleteRequests = async (req, res) => {
  const filter = {};
  if (['Pending', 'Approved', 'Rejected'].includes(req.query.status)) filter.status = req.query.status;
  if (validId(req.query.companyId)) filter.companyId = req.query.companyId;
  const [requests, companies] = await runAcrossTenants(() =>
    Promise.all([DeleteRequest.find(filter).sort({ createdAt: -1 }).limit(200), Company.find().select('name slug')])
  );
  const names = new Map(companies.map((c) => [c.id, { name: c.name, slug: c.slug }]));
  res.json(requests.map((r) => ({ ...r.toJSON(), companyId: String(r.companyId), company: names.get(String(r.companyId)) ?? null })));
};

// PATCH /platform/delete-requests/:id { decision: 'approve' | 'reject', note }
export const decideDeleteRequest = async (req, res) => {
  const decision = req.body?.decision;
  if (!['approve', 'reject'].includes(decision)) return res.status(400).json({ message: 'decision must be "approve" or "reject".' });
  const note = text(req.body?.note, 300);
  if (decision === 'reject' && !note) return res.status(400).json({ message: 'Give the company a reason for rejecting.' });
  if (!validId(req.params.id)) return res.status(404).json({ message: 'Request not found.' });

  // Only one decision can win: the status flips from Pending atomically
  const request = await runAcrossTenants(() =>
    DeleteRequest.findOneAndUpdate(
      { _id: req.params.id, status: 'Pending' },
      { status: decision === 'approve' ? 'Approved' : 'Rejected', decidedByName: req.user.name, decidedAt: new Date(), decisionNote: note },
      { returnDocument: 'after' }
    )
  );
  if (!request) {
    const existing = await runAcrossTenants(() => DeleteRequest.findById(req.params.id));
    return res.status(existing ? 409 : 404).json({ message: existing ? `This request was already ${existing.status.toLowerCase()}.` : 'Request not found.' });
  }

  if (decision === 'approve') {
    try {
      const label = await runAcrossTenants(() => executeDeleteRequest(request));
      request.executedAt = new Date();
      await runAcrossTenants(() => request.save());
      await audit(req, {
        action: 'delete_request.approve', entity: 'delete_request', entityId: request.id, companyId: request.companyId,
        summary: `Approved deletion of ${request.targetType} "${request.targetLabel}"`, meta: { targetType: request.targetType, targetId: request.targetId, deleted: label }
      });
    } catch (error) {
      // The deletion could not be carried out: put the request back so it can be retried or rejected
      await runAcrossTenants(() => DeleteRequest.updateOne({ _id: request._id }, { status: 'Pending', decidedByName: '', decidedAt: null, decisionNote: '' }));
      const status = error instanceof ServiceError ? error.status : 500;
      return res.status(status).json({ message: error instanceof ServiceError ? error.message : 'The deletion failed. Nothing was changed.' });
    }
  } else {
    await audit(req, {
      action: 'delete_request.reject', entity: 'delete_request', entityId: request.id, companyId: request.companyId,
      summary: `Rejected deletion of ${request.targetType} "${request.targetLabel}": ${note}`, meta: { targetType: request.targetType, targetId: request.targetId }
    });
  }

  if (request.targetType !== 'company' || decision === 'reject') {
    await runAsTenant(request.companyId, () =>
      notify(request.requestedById, {
        type: 'delete_request',
        title: `Your request to delete ${request.targetLabel} was ${decision === 'approve' ? 'approved' : 'rejected'}`,
        body: note, link: '/company', email: false
      })
    );
  }
  res.json(request);
};

// GET /platform/audit?companyId=&q=&page=&limit=
export const auditLog = async (req, res) => {
  const filter = {};
  if (validId(req.query.companyId)) filter.companyId = req.query.companyId;
  if (typeof req.query.action === 'string' && req.query.action) filter.action = req.query.action;
  if (typeof req.query.q === 'string' && req.query.q.trim()) {
    const escaped = req.query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [{ summary: { $regex: escaped, $options: 'i' } }, { actorName: { $regex: escaped, $options: 'i' } }];
  }
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 200);
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const [items, total] = await runAcrossTenants(() =>
    Promise.all([AuditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit), AuditLog.countDocuments(filter)])
  );
  res.json({ items: items.map((i) => ({ ...i.toJSON(), companyId: i.companyId ? String(i.companyId) : null })), total, page, pages: Math.max(Math.ceil(total / limit), 1) });
};
