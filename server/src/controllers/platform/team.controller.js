import mongoose from 'mongoose';
import { userModel } from '../../models/user.model.js';
import { PortalAccessRequest, PORTAL_ROLES } from '../../models/portalAccessRequest.model.js';
import { runAsPlatform } from '../../utils/tenantContext.js';
import { PLATFORM_ROLE } from '../../utils/format.js';
import { platformLevel } from '../../middleware/auth.js';
import { revokeAllSessions } from '../../utils/sessions.js';
import { sendMail } from '../../utils/mailer.js';
import { audit } from '../../utils/audit.js';
import { logger } from '../../utils/logger.js';
import { env } from '../../config/env.js';

// The people who work the client portal, and the requests from staff who want to join them.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const text = (value, max = 200) => String(value ?? '').trim().slice(0, max);
const validId = (id) => mongoose.isValidObjectId(id);
const member = (u) => ({
  id: u.id, name: u.name, email: u.email, team: u.department, title: u.designation, phone: u.phone, employeeId: u.employeeId,
  role: platformLevel(u), locked: !!u.locked, createdAt: u.createdAt
});

const platformOrigin = () => {
  const { publicScheme, publicPort, baseDomain, platformSubdomain, platformHost } = env.tenancy;
  return `${publicScheme}://${platformHost || `${platformSubdomain}.${baseDomain}`}${publicPort && !platformHost ? `:${publicPort}` : ''}`;
};

// ---------------------------------------------------------------- Public: ask for access
// POST /auth/portal-access
export const requestAccess = async (req, res) => {
  if (req.tenant?.kind !== 'platform') return res.status(403).json({ message: 'Portal access is requested on the platform address.' });
  const b = req.body ?? {};
  const email = text(b.email, 200).toLowerCase();
  if (!EMAIL_PATTERN.test(email)) return res.status(400).json({ message: 'A valid work email is required.' });
  const domain = env.tenancy.platformStaffDomain;
  if (domain && !email.endsWith(`@${domain}`)) return res.status(400).json({ message: `Use your work email ending in @${domain}.` });
  const required = { name: b.name, phone: b.phone, employeeId: b.employeeId, title: b.title, manager: b.manager, reason: b.reason };
  if (Object.values(required).some((v) => !text(v))) return res.status(400).json({ message: 'Fill in every field so the approver can verify you.' });
  if (b.agree !== true) return res.status(400).json({ message: 'Please confirm the data-access statement.' });
  const wantedRole = Object.keys(PORTAL_ROLES).includes(b.wantedRole) ? b.wantedRole : 'admin';

  if (await userModel.findByEmail(email)) return res.status(409).json({ message: 'This email already has portal access. Sign in instead.' });
  if (await PortalAccessRequest.exists({ email, status: 'Pending' })) return res.status(409).json({ message: 'A request for this email is already waiting for approval.' });

  const request = await PortalAccessRequest.create({
    name: text(b.name, 120), email, phone: text(b.phone, 40), employeeId: text(b.employeeId, 40), title: text(b.title, 120),
    team: text(b.team, 60), manager: text(b.manager, 120), wantedRole, reason: text(b.reason, 1000)
  });
  res.status(201).json({ id: request.id, status: request.status });
};

// GET /auth/portal-access/status?email=  - only the outcome, nothing the requester did not write themselves
export const requestStatus = async (req, res) => {
  if (req.tenant?.kind !== 'platform') return res.status(403).json({ message: 'Portal access is requested on the platform address.' });
  const email = text(req.query.email, 200).toLowerCase();
  const latest = email ? await PortalAccessRequest.findOne({ email }).sort({ createdAt: -1 }) : null;
  if (!latest) return res.status(404).json({ message: 'No request found for that email.' });
  res.json({
    id: latest.id, status: latest.status,
    role: latest.status === 'Approved' ? PORTAL_ROLES[latest.grantedRole ?? latest.wantedRole] : null,
    note: latest.status === 'Rejected' ? latest.note : ''
  });
};

// ---------------------------------------------------------------- Portal Super Admin: manage the team
// GET /platform/team
export const team = async (req, res) => {
  const [members, requests] = await Promise.all([
    userModel.findByRole(PLATFORM_ROLE),
    PortalAccessRequest.find().sort({ createdAt: -1 }).limit(200)
  ]);
  res.json({ members: members.map(member), requests });
};

const loadMember = async (req, res) => {
  const user = validId(req.params.id) ? await userModel.findById(req.params.id) : null;
  if (!user || user.role !== PLATFORM_ROLE) { res.status(404).json({ message: 'Team member not found.' }); return null; }
  return user;
};

// The portal must never be left without anyone who can manage it
const otherActiveSupers = async (user) =>
  (await userModel.findByRole(PLATFORM_ROLE)).filter((u) => u.id !== user.id && !u.locked && platformLevel(u) === 'super').length;

// PATCH /platform/team/:id  { role?, locked? }
export const updateMember = async (req, res) => {
  const user = await loadMember(req, res);
  if (!user) return;
  const { role, locked } = req.body ?? {};
  const changes = [];
  const losesSuper = platformLevel(user) === 'super' && (role !== undefined && role !== 'super' || locked === true);
  if (losesSuper && user.id === req.user.id) return res.status(400).json({ message: 'You cannot lower or disable your own access.' });
  if (losesSuper && !(await otherActiveSupers(user))) return res.status(400).json({ message: 'Keep at least one active Portal Super Admin.' });

  const patch = {};
  if (role !== undefined) {
    if (!Object.keys(PORTAL_ROLES).includes(role)) return res.status(400).json({ message: 'role must be viewer, admin or super.' });
    patch.platformRole = role;
    changes.push(`role ${PORTAL_ROLES[role]}`);
  }
  if (locked !== undefined) {
    patch.locked = !!locked;
    changes.push(locked ? 'disabled' : 'enabled');
  }
  if (!changes.length) return res.status(400).json({ message: 'Nothing to change.' });
  const updated = await userModel.update(user.id, patch);
  if (patch.locked || patch.platformRole) await revokeAllSessions(user.id); // new rights apply at the next sign-in
  await audit(req, { action: 'platform.team.update', entity: 'user', entityId: user.id, summary: `Changed ${user.name}: ${changes.join(', ')}` });
  res.json(member(updated));
};

// PATCH /platform/team/requests/:id  { decision: 'approve' | 'reject', role?, note? }
export const decideRequest = async (req, res) => {
  const request = validId(req.params.id) ? await PortalAccessRequest.findById(req.params.id) : null;
  if (!request) return res.status(404).json({ message: 'Request not found.' });
  if (request.status !== 'Pending') return res.status(409).json({ message: `This request was already ${request.status.toLowerCase()}.` });
  const { decision } = req.body ?? {};
  if (!['approve', 'reject'].includes(decision)) return res.status(400).json({ message: 'decision must be "approve" or "reject".' });

  if (decision === 'reject') {
    const note = text(req.body?.note, 500);
    if (!note) return res.status(400).json({ message: 'Give the requester a reason for rejecting.' });
    Object.assign(request, { status: 'Rejected', note, decidedByName: req.user.name, decidedAt: new Date() });
    await request.save();
    await audit(req, { action: 'platform.team.reject', entity: 'portalAccessRequest', entityId: request.id, summary: `Rejected portal access for ${request.email}` });
    return res.json(request);
  }

  const role = req.body?.role ?? request.wantedRole;
  if (!Object.keys(PORTAL_ROLES).includes(role)) return res.status(400).json({ message: 'role must be viewer, admin or super.' });
  if (await userModel.findByEmail(request.email)) return res.status(409).json({ message: 'This email already has an account.' });

  await runAsPlatform(() =>
    userModel.create({
      email: request.email, name: request.name, role: PLATFORM_ROLE, platformRole: role, permissions: 'read,write,delete',
      department: request.team, designation: request.title, phone: request.phone, employeeId: request.employeeId || null,
      emailVerified: true, password: null
    })
  );
  Object.assign(request, { status: 'Approved', grantedRole: role, decidedByName: req.user.name, decidedAt: new Date() });
  await request.save();
  await audit(req, { action: 'platform.team.approve', entity: 'portalAccessRequest', entityId: request.id, summary: `Approved portal access for ${request.email} as ${PORTAL_ROLES[role]}` });

  try {
    const origin = platformOrigin();
    await sendMail({
      to: request.email,
      subject: `${env.appName} - your portal access is approved`,
      text: `Hi ${request.name},\n\n${req.user.name} approved your request as ${PORTAL_ROLES[role]}.\n\n` +
        `To choose your password, open ${origin}/forgot-password, enter ${request.email}, and use the code we email you. Then sign in at ${origin}.\n`
    });
  } catch (error) {
    logger.warn({ err: error, to: request.email }, 'portal access approval email failed');
  }
  res.json(request);
};
