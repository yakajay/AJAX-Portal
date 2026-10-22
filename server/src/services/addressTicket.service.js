import { AddressTicket } from '../models/addressTicket.model.js';
import { hasDedicatedAddress, companyOrigin } from '../models/company.model.js';
import { ServiceError, assertSlugAvailable } from './company.service.js';
import { audit } from '../utils/audit.js';
import { sendMail } from '../utils/mailer.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';
import { User } from '../models/user.model.js';
import { ADMIN_ROLES } from '../utils/format.js';
import { announceAddressTicket, emailPeople } from '../utils/ticketReminders.js';

const actor = (user) => ({ id: user?.id ?? null, name: user?.name ?? 'System', email: user?.email ?? '', role: user?.role ?? '' });

// ADR-0001, ADR-0002, ... The unique index settles a race between two tickets opened at the same moment.
const createWithNumber = async (data) => {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const ticketNo = `ADR-${String((await AddressTicket.countDocuments()) + 1 + attempt).padStart(4, '0')}`;
    try {
      return await AddressTicket.create({ ...data, ticketNo });
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
  }
  throw new ServiceError(503, 'Could not number the ticket. Try again.');
};

/** The address as it will be after `action`, or an error when it cannot be done. Does not save anything. */
export const planAddressChange = async (company, action, requestedSlug) => {
  const slug = String(requestedSlug ?? '').trim().toLowerCase();
  if (action === 'disable') {
    if (!hasDedicatedAddress(company)) throw new ServiceError(409, 'This company already uses the shared address.');
    return { dedicated: false, slug: company.slug };
  }
  if (company.subscription.plan === 'trial') throw new ServiceError(400, 'Trial companies use the shared address. Move them to a paid plan first.');
  if (action === 'enable' && hasDedicatedAddress(company)) throw new ServiceError(409, 'This company already has its own address.');
  if (action === 'rename' && !hasDedicatedAddress(company)) throw new ServiceError(409, 'Only companies with their own address can rename it.');
  const next = slug || company.slug;
  if (next !== company.slug) await assertSlugAvailable(next, company._id);
  else if (action === 'rename') throw new ServiceError(400, 'Choose a different subdomain.');
  return { dedicated: true, slug: next };
};

/** Applies a planned change to the company and returns what it was before and after. */
export const applyAddressChange = async (company, planned) => {
  const before = { dedicated: hasDedicatedAddress(company), slug: company.slug };
  company.dedicatedAddress = planned.dedicated;
  company.slug = planned.slug;
  await company.save();
  return { before, after: { dedicated: hasDedicatedAddress(company), slug: company.slug } };
};

const auditFor = (req, company, ticket, verb, extra = '') =>
  audit(req, {
    action: `company.address.${verb}`, entity: 'addressTicket', entityId: ticket.id, companyId: company._id,
    summary: `${ticket.ticketNo} · ${verb} · ${company.name}${extra}`,
    meta: { ticketNo: ticket.ticketNo, action: ticket.action, reason: ticket.reason, source: ticket.source, before: ticket.before, after: ticket.after }
  });

/** A company admin asks for a change. Nothing changes until the platform approves. */
export const openCompanyRequest = async (req, company, { action, slug, reason }) => {
  if (!['enable', 'disable', 'rename'].includes(action)) throw new ServiceError(400, 'action must be enable, disable or rename.');
  const why = String(reason ?? '').trim();
  if (!why) throw new ServiceError(400, 'Say why the address should change; it is kept with the ticket.');
  if (await AddressTicket.exists({ company: company._id, status: 'Pending' })) {
    throw new ServiceError(409, 'There is already an address request waiting for the platform team.');
  }
  await planAddressChange(company, action, slug); // refuse impossible requests now rather than at approval
  const ticket = await createWithNumber({
    company: company._id, companyName: company.name, action, source: 'company', status: 'Pending',
    requestedSlug: String(slug ?? '').trim().toLowerCase(), reason: why.slice(0, 1000), requestedBy: actor(req.user)
  });
  await auditFor(req, company, ticket, 'request');
  // Raised: the platform's Portal Admins and Super Admins, and this company's own admins, are told by email
  await announceAddressTicket(ticket);
  const own = await User.find({ role: { $in: ADMIN_ROLES }, locked: false });
  await emailPeople(own, `Address request ${ticket.ticketNo} sent`, (p) =>
    `Hi ${p.name},\n\n${ticket.requestedBy.name} asked the platform team to ${ticket.action} ${company.name}'s sign-in address (${ticket.ticketNo}).\n\nReason: ${ticket.reason}\n\nNothing changes until the platform team decides. We will remind you of the status every hour.\n`);
  return ticket;
};

/** The platform changes an address itself. A reason is required, and the ticket is recorded as approved straight away. */
export const recordPlatformChange = async (req, company, { action, reason, planned, before, after }) => {
  const why = String(reason ?? '').trim();
  const ticket = await createWithNumber({
    company: company._id, companyName: company.name, action, source: 'platform', status: 'Approved',
    requestedSlug: planned?.slug ?? '', reason: why.slice(0, 1000), requestedBy: actor(req.user),
    decidedBy: { id: req.user?.id ?? null, name: req.user?.name ?? 'System' }, decidedAt: new Date(),
    before, after, appliedAt: new Date()
  });
  await auditFor(req, company, ticket, action);
  return ticket;
};

/** The platform approves or rejects a company's request. Approving applies the change in the same step. */
export const decideTicket = async (req, company, ticket, { decision, note }) => {
  if (ticket.status !== 'Pending') throw new ServiceError(409, `${ticket.ticketNo} was already ${ticket.status.toLowerCase()}.`);
  const text = String(note ?? '').trim().slice(0, 500);
  if (decision === 'reject') {
    if (!text) throw new ServiceError(400, 'Give the company a reason for rejecting.');
  } else if (decision === 'approve') {
    const planned = await planAddressChange(company, ticket.action, ticket.requestedSlug);
    const { before, after } = await applyAddressChange(company, planned);
    Object.assign(ticket, { before, after, appliedAt: new Date() });
  } else {
    throw new ServiceError(400, 'decision must be "approve" or "reject".');
  }
  Object.assign(ticket, {
    status: decision === 'approve' ? 'Approved' : 'Rejected', decisionNote: text,
    decidedBy: { id: req.user.id, name: req.user.name }, decidedAt: new Date()
  });
  await ticket.save();
  await auditFor(req, company, ticket, decision === 'approve' ? 'approve' : 'reject', text ? ` · ${text}` : '');

  if (ticket.requestedBy.email) {
    try {
      const where = decision === 'approve' ? `\nYour address: ${companyOrigin(company)}\n` : '';
      await sendMail({
        to: ticket.requestedBy.email,
        subject: `${env.appName} - ${ticket.ticketNo} ${decision === 'approve' ? 'approved' : 'rejected'}`,
        text: `Hi ${ticket.requestedBy.name},\n\nYour request ${ticket.ticketNo} (${ticket.action} sign-in address) was ${decision === 'approve' ? 'approved' : 'rejected'} by ${req.user.name}.${text ? `\n\nNote: ${text}` : ''}\n${where}`
      });
    } catch (error) {
      logger.warn({ err: error, ticket: ticket.ticketNo }, 'address ticket email failed');
    }
  }
  return ticket;
};
