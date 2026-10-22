import mongoose from 'mongoose';
import { Company, companyOrigin, hasDedicatedAddress, sharedHost } from '../../models/company.model.js';
import { AddressTicket } from '../../models/addressTicket.model.js';
import { openCompanyRequest } from '../../services/addressTicket.service.js';
import { DeleteRequest, DELETE_TARGETS } from '../../models/deleteRequest.model.js';
import { SupportAccess } from '../../models/supportAccess.model.js';
import { userModel } from '../../models/user.model.js';
import { encryptValue, decryptValue, primeCompanyKey } from '../../utils/crypto.js';
import { assertPublicUrl, assertPublicHost } from '../../utils/safeFetch.js';
import { buildCompanyTransport, fromAddress } from '../../utils/mailTransport.js';
import { env } from '../../config/env.js';
import { hasPermission } from '../../utils/permissions.js';
import { describeTarget, executeDeleteRequest } from '../../services/deletion.service.js';
import { seatsUsed, ServiceError } from '../../services/company.service.js';
import { oidcRedirectUri, samlAcsUrl, samlEntityId } from '../sso.controller.js';
import { audit } from '../../utils/audit.js';

// The company admin (SUPER_ADMIN inside a workspace) edits their own company here. Plan, modules,
// status and subdomain belong to the platform and are read-only.
const text = (value, max = 200) => String(value ?? '').trim().slice(0, max);
const bad = (res, message) => res.status(400).json({ message });

const view = async (company) => ({
  ...company.toJSON(),
  origin: companyOrigin(company),
  usage: { employees: await seatsUsed(company), seatLimit: company.subscription.seatLimit }
});

// GET /admin/company
export const get = async (req, res) => res.json(await view(req.company));

// PUT /admin/company
export const update = async (req, res) => {
  const { name, primaryContact, profile, settings } = req.body;
  const company = await Company.findById(req.company.id);
  const changed = [];

  if (name !== undefined) {
    if (!text(name)) return bad(res, 'Company name is required.');
    company.name = text(name);
    changed.push('name');
  }
  if (primaryContact !== undefined) {
    const email = text(primaryContact?.email).toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad(res, 'Contact email is not valid.');
    company.primaryContact = { name: text(primaryContact?.name), email, phone: text(primaryContact?.phone, 40) };
    changed.push('primaryContact');
  }
  if (profile !== undefined) {
    company.profile = {
      industry: text(profile?.industry),
      website: text(profile?.website),
      address: text(profile?.address, 500),
      timezone: text(profile?.timezone, 60) || 'UTC'
    };
    changed.push('profile');
  }
  if (settings?.allowSelfSignup !== undefined) {
    company.settings.allowSelfSignup = !!settings.allowSelfSignup;
    changed.push('settings');
  }
  await company.save();
  await audit(req, { action: 'company.update', entity: 'company', entityId: company.id, summary: 'Updated company details', meta: changed });
  res.json(await view(company));
};

// ---------------------------------------------------------------- Logo (a feature the platform enables per company)
export const MAX_LOGO_BYTES = 256 * 1024;

// Identifies the image by its first bytes rather than trusting the declared type. SVG is refused on purpose:
// it can carry scripts.
export const sniffImageType = (buf) => {
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
};

const requireLogoFeature = (req, res) => {
  if (req.company.features.customLogo) return true;
  res.status(403).json({ code: 'FEATURE_DISABLED', message: 'Custom logos are not part of your plan. Ask the platform administrator to enable them.' });
  return false;
};

// PUT /admin/company/logo - the request body is the image itself (image/png, image/jpeg or image/webp)
export const uploadLogo = async (req, res) => {
  if (!requireLogoFeature(req, res)) return;
  const body = req.body;
  if (!Buffer.isBuffer(body) || !body.length) return bad(res, 'Send the image as the request body (PNG, JPEG or WebP, up to 256 KB).');
  const type = sniffImageType(body);
  if (!type) return bad(res, 'The logo must be a PNG, JPEG or WebP image.');
  await Company.updateOne({ _id: req.company.id }, { logoData: body, logoContentType: type, logoUpdatedAt: new Date() });
  await audit(req, { action: 'company.logo', entity: 'company', entityId: req.company.id, summary: 'Uploaded the company logo', meta: { type, bytes: body.length } });
  res.json({ hasLogo: true, logoUpdatedAt: new Date() });
};

// PUT /admin/company/branding  { displayName, showPoweredBy } - the name shown beside the logo (part of the custom-branding feature)
export const updateBranding = async (req, res) => {
  if (!requireLogoFeature(req, res)) return;
  const { displayName, showPoweredBy } = req.body ?? {};
  const set = {};
  if (displayName !== undefined) {
    const name = text(displayName, 40);
    if (!name) return bad(res, 'Enter the company name to show to employees.');
    set['branding.displayName'] = name;
  }
  if (showPoweredBy !== undefined) set['branding.showPoweredBy'] = !!showPoweredBy;
  await Company.updateOne({ _id: req.company.id }, { $set: set });
  await audit(req, { action: 'company.branding', entity: 'company', entityId: req.company.id, summary: 'Updated the company branding', meta: set });
  res.json(await view(await Company.findById(req.company.id)));
};

// DELETE /admin/company/logo - goes back to the platform's logo (a setting, not a record, so it is immediate)
export const removeLogo = async (req, res) => {
  if (!requireLogoFeature(req, res)) return;
  await Company.updateOne({ _id: req.company.id }, { logoData: null, logoContentType: '', logoUpdatedAt: null });
  await audit(req, { action: 'company.logo', entity: 'company', entityId: req.company.id, summary: 'Removed the company logo' });
  res.json({ hasLogo: false });
};

// ---------------------------------------------------------------- Letterhead (printed on payslips and company letters)
// PDFs can only embed PNG and JPEG, so those are the only types accepted.
export const MAX_LETTERHEAD_BYTES = 1024 * 1024;

// PUT /admin/company/letterhead - the request body is the image itself (image/png or image/jpeg)
export const uploadLetterhead = async (req, res) => {
  const body = req.body;
  if (!Buffer.isBuffer(body) || !body.length) return bad(res, 'Send the image as the request body (PNG or JPEG, up to 1 MB).');
  const type = sniffImageType(body);
  if (type !== 'image/png' && type !== 'image/jpeg') return bad(res, 'The letterhead must be a PNG or JPEG image.');
  await Company.updateOne({ _id: req.company.id }, { letterheadData: body, letterheadContentType: type, letterheadUpdatedAt: new Date() });
  await audit(req, { action: 'company.letterhead', entity: 'company', entityId: req.company.id, summary: 'Uploaded the company letterhead', meta: { type, bytes: body.length } });
  res.json({ hasLetterhead: true, letterheadUpdatedAt: new Date() });
};

// GET /admin/company/letterhead - the image, for the settings preview
export const getLetterhead = async (req, res) => {
  const company = await Company.findById(req.company.id).select('+letterheadData');
  if (!company?.letterheadData?.length) return res.status(404).json({ message: 'No letterhead.' });
  res.set({
    'Content-Type': company.letterheadContentType,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox"
  });
  res.send(company.letterheadData);
};

// DELETE /admin/company/letterhead - documents go back to the plain text header
export const removeLetterhead = async (req, res) => {
  await Company.updateOne({ _id: req.company.id }, { letterheadData: null, letterheadContentType: '', letterheadUpdatedAt: null });
  await audit(req, { action: 'company.letterhead', entity: 'company', entityId: req.company.id, summary: 'Removed the company letterhead' });
  res.json({ hasLetterhead: false });
};

// ---------------------------------------------------------------- SSO
const ssoView = (company) => {
  const origin = companyOrigin(company);
  return {
    ...company.toJSON().sso,
    // Values the admin registers with their identity provider
    registration: {
      oidcRedirectUri: oidcRedirectUri(origin),
      samlAcsUrl: samlAcsUrl(origin),
      samlEntityId: samlEntityId(origin),
      samlMetadataUrl: samlEntityId(origin)
    }
  };
};

// GET /admin/company/sso
export const getSso = (req, res) => res.json(ssoView(req.company));

const cleanDomains = (domains) => {
  const list = (Array.isArray(domains) ? domains : String(domains ?? '').split(/[,\s]+/))
    .map((d) => String(d).trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);
  const invalid = list.find((d) => !/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/.test(d));
  if (invalid) throw Object.assign(new Error(`"${invalid}" is not a valid email domain.`), { status: 400 });
  return [...new Set(list)];
};

const PEM_BODY = /^[A-Za-z0-9+/=\s-]+$/;

// PUT /admin/company/sso - configure, enable or disable single sign-on
export const updateSso = async (req, res) => {
  const body = req.body ?? {};
  const company = await Company.findById(req.company.id);
  const sso = company.sso;
  const touched = [];

  try {
    if (body.protocol !== undefined) {
      if (!['oidc', 'saml'].includes(body.protocol)) return bad(res, 'protocol must be "oidc" or "saml".');
      sso.protocol = body.protocol;
      touched.push('protocol');
    }
    if (body.providerName !== undefined) { sso.providerName = text(body.providerName, 60) || 'company account'; touched.push('providerName'); }
    if (body.autoProvision !== undefined) { sso.autoProvision = !!body.autoProvision; touched.push('autoProvision'); }
    if (body.allowedDomains !== undefined) { sso.allowedDomains = cleanDomains(body.allowedDomains); touched.push('allowedDomains'); }

    if (body.oidc) {
      if (body.oidc.issuer !== undefined) {
        const issuer = text(body.oidc.issuer, 300).replace(/\/+$/, '');
        if (issuer) await assertPublicUrl(issuer);
        sso.oidc.issuer = issuer;
        touched.push('oidc.issuer');
      }
      if (body.oidc.clientId !== undefined) { sso.oidc.clientId = text(body.oidc.clientId, 300); touched.push('oidc.clientId'); }
      // Write-only: an empty value keeps the stored secret
      if (body.oidc.clientSecret) {
        sso.oidc.clientSecret = encryptValue(company.id, String(body.oidc.clientSecret));
        touched.push('oidc.clientSecret');
      }
    }
    if (body.saml) {
      if (body.saml.entryPoint !== undefined) {
        const entryPoint = text(body.saml.entryPoint, 500);
        if (entryPoint) await assertPublicUrl(entryPoint);
        sso.saml.entryPoint = entryPoint;
        touched.push('saml.entryPoint');
      }
      if (body.saml.idpIssuer !== undefined) { sso.saml.idpIssuer = text(body.saml.idpIssuer, 300); touched.push('saml.idpIssuer'); }
      if (body.saml.idpCert !== undefined) {
        const cert = String(body.saml.idpCert).trim();
        if (cert && !PEM_BODY.test(cert)) return bad(res, 'The certificate must be the PEM text from your identity provider.');
        sso.saml.idpCert = cert;
        touched.push('saml.idpCert');
      }
    }

    if (body.enabled !== undefined) {
      const enable = !!body.enabled;
      if (enable) {
        if (!sso.allowedDomains.length) return bad(res, 'Add at least one allowed email domain before enabling single sign-on.');
        const complete = sso.protocol === 'saml'
          ? sso.saml.entryPoint && sso.saml.idpIssuer && sso.saml.idpCert
          : sso.oidc.issuer && sso.oidc.clientId && sso.oidc.clientSecret;
        if (!complete) return bad(res, 'Finish the identity provider settings before enabling single sign-on.');
      }
      sso.enabled = enable;
      touched.push('enabled');
    }
  } catch (error) {
    return bad(res, error.message);
  }

  await company.save();
  await audit(req, {
    action: touched.includes('enabled') ? (sso.enabled ? 'sso.enable' : 'sso.disable') : 'sso.update',
    entity: 'company', entityId: company.id,
    summary: touched.includes('enabled') ? `${sso.enabled ? 'Enabled' : 'Disabled'} single sign-on (${sso.protocol.toUpperCase()})` : 'Updated single sign-on settings',
    meta: touched // field names only; never values
  });
  res.json(ssoView(company));
};

// ---------------------------------------------------------------- Support access
const MAX_SUPPORT_HOURS = 24 * 7;

// GET /admin/support-access
export const listSupportAccess = async (req, res) => {
  res.json(await SupportAccess.find().sort({ createdAt: -1 }).limit(50));
};

// POST /admin/support-access { hours, reason }
export const grantSupportAccess = async (req, res) => {
  const hours = Number(req.body.hours ?? 24);
  if (!Number.isFinite(hours) || hours <= 0 || hours > MAX_SUPPORT_HOURS) {
    return bad(res, `hours must be between 1 and ${MAX_SUPPORT_HOURS}.`);
  }
  const reason = text(req.body.reason, 300);
  if (!reason) return bad(res, 'Tell us what the support access is for.');
  const grant = await SupportAccess.create({
    grantedById: req.user.id,
    grantedByName: req.user.name,
    reason,
    expiresAt: new Date(Date.now() + hours * 3600 * 1000)
  });
  await audit(req, { action: 'support.grant', entity: 'support_access', entityId: grant.id, summary: `Granted platform support access for ${hours}h: ${reason}` });
  res.status(201).json(grant);
};

// POST /admin/support-access/:id/revoke
export const revokeSupportAccess = async (req, res) => {
  const grant = mongoose.isValidObjectId(req.params.id)
    ? await SupportAccess.findOneAndUpdate({ _id: req.params.id, revokedAt: null }, { revokedAt: new Date() }, { returnDocument: 'after' })
    : null;
  if (!grant) return res.status(404).json({ message: 'No active support access with that id.' });
  await audit(req, { action: 'support.revoke', entity: 'support_access', entityId: grant.id, summary: 'Revoked platform support access' });
  res.json(grant);
};

// ---------------------------------------------------------------- Delete requests
// GET /admin/delete-requests?status=
export const listDeleteRequests = async (req, res) => {
  const filter = {};
  if (['Pending', 'Approved', 'Rejected'].includes(req.query.status)) filter.status = req.query.status;
  res.json(await DeleteRequest.find(filter).sort({ createdAt: -1 }).limit(200));
};

// Creates a Pending request; shared by POST /admin/delete-requests and the DELETE routes
export const raiseDeleteRequest = async (req, { targetType, targetId, reason }) => {
  const target = DELETE_TARGETS[targetType];
  if (!target) return { status: 400, body: { message: 'Unknown delete target.' } };

  if (targetType === 'company') {
    if (req.user.role !== 'SUPER_ADMIN') return { status: 403, body: { message: 'Only a company admin can request deleting the whole company.' } };
    targetId = req.company.id;
  } else if (target.module && !hasPermission(req.user, target.module, 'delete')) {
    return { status: 403, body: { message: `Missing "delete" permission on ${target.module}.` } };
  }

  const label = targetType === 'company' ? req.company.name : await describeTarget(targetType, targetId);
  if (!label) return { status: 404, body: { message: `${target.label} not found.` } };
  if (targetType === 'user' && String(targetId) === req.user.id) {
    return { status: 403, body: { message: 'You cannot request deletion of your own account.' } };
  }
  if (targetType === 'user') {
    // The same rule the direct route used: only a company admin may remove privileged accounts
    const account = await userModel.findById(targetId);
    if (account.role !== 'USER' && req.user.role !== 'SUPER_ADMIN') {
      return { status: 403, body: { message: 'You do not have permission to manage this account.' } };
    }
  }

  // A company admin (SUPER_ADMIN) removes employees of their own company directly, without the platform's approval
  if (targetType === 'user' && req.user.role === 'SUPER_ADMIN') {
    try {
      const deleted = await executeDeleteRequest({ targetType, targetId: String(targetId), companyId: req.company.id });
      await audit(req, {
        action: 'user.delete', entity: 'user', entityId: String(targetId),
        summary: `Deleted employee "${deleted}"`, meta: { targetType, targetId: String(targetId), reason: text(reason, 500) }
      });
      return { status: 200, body: { deleted: true, targetLabel: label, message: 'Employee deleted.' } };
    } catch (error) {
      if (error instanceof ServiceError) return { status: error.status, body: { message: error.message } };
      throw error;
    }
  }

  const existing = await DeleteRequest.findOne({ targetType, targetId: String(targetId), status: 'Pending' });
  if (existing) return { status: 409, body: { message: 'A delete request for this is already pending.', request: existing } };

  const request = await DeleteRequest.create({
    targetType,
    targetId: String(targetId),
    targetLabel: label,
    reason: text(reason, 500),
    requestedById: req.user.id,
    requestedByName: req.user.name
  });
  await audit(req, {
    action: 'delete_request.create', entity: 'delete_request', entityId: request.id,
    summary: `Requested deletion of ${target.label.toLowerCase()} "${label}"`, meta: { targetType, targetId: String(targetId), reason: request.reason }
  });
  return { status: 202, body: request };
};

// POST /admin/delete-requests { targetType, targetId, reason }
export const createDeleteRequest = async (req, res) => {
  const { status, body } = await raiseDeleteRequest(req, req.body ?? {});
  res.status(status === 202 ? 201 : status).json(body);};

// Used as the handler of the DELETE routes: admins can't delete, so the call becomes a request
export const deleteViaRequest = (targetType) => async (req, res) => {
  const { status, body } = await raiseDeleteRequest(req, { targetType, targetId: req.params.id, reason: req.body?.reason });
  res.status(status).json(
    status === 202
      ? { ...body.toJSON(), message: 'Deletion needs approval. A request has been sent to the platform administrator.' }
      : body
  );
};

// ---------------------------------------------------------------- Outgoing mail
const mailView = (company) => company.toJSON().mail;

// Sending from the company's own mailbox is something the platform switches on per company
const requireMailFeature = (req, res) => {
  if (req.company.features.customEmail) return true;
  res.status(403).json({ code: 'FEATURE_DISABLED', message: 'Sending from your own email address is not part of your plan. Ask the platform administrator to enable it.' });
  return false;
};

// GET /admin/company/mail
export const getMail = (req, res) => {
  if (requireMailFeature(req, res)) res.json(mailView(req.company));
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// PUT /admin/company/mail - send this company's mail (sign-in codes, approvals, alerts) from its own mailbox
export const updateMail = async (req, res) => {
  if (!requireMailFeature(req, res)) return;
  const body = req.body ?? {};
  const company = await Company.findById(req.company.id);
  const mail = company.mail;
  const touched = [];
  const connection = () => JSON.stringify([mail.host, mail.port, mail.secure, mail.username, mail.password, mail.fromEmail]);
  const before = connection();

  try {
    if (body.host !== undefined) {
      const host = text(body.host, 253).toLowerCase();
      if (host) await assertPublicHost(host);
      mail.host = host;
      touched.push('host');
    }
    if (body.port !== undefined) {
      const port = Number(body.port);
      if (!Number.isInteger(port) || port < 1 || port > 65535) return bad(res, 'Port must be between 1 and 65535.');
      mail.port = port;
      touched.push('port');
    }
    if (body.secure !== undefined) { mail.secure = !!body.secure; touched.push('secure'); }
    if (body.username !== undefined) { mail.username = text(body.username, 254); touched.push('username'); }
    // Write-only: an empty value keeps the stored password
    if (body.password) {
      mail.password = encryptValue(company.id, String(body.password));
      touched.push('password');
    }
    if (body.fromName !== undefined) { mail.fromName = text(body.fromName, 80).replace(/[\r\n<>"]/g, ''); touched.push('fromName'); }
    if (body.fromEmail !== undefined) {
      const fromEmail = text(body.fromEmail, 254).toLowerCase();
      if (fromEmail && !EMAIL.test(fromEmail)) return bad(res, 'The sender email address is not valid.');
      mail.fromEmail = fromEmail;
      touched.push('fromEmail');
    }

    if (body.enabled !== undefined) {
      const enable = !!body.enabled;
      if (enable) {
        if (!mail.host || !mail.fromEmail) return bad(res, 'Enter the mail server and sender email address before turning this on.');
        if (!mail.lastTestOk || connection() !== before) {
          return bad(res, 'Send a test email successfully before turning this on.');
        }
      }
      mail.enabled = enable;
      touched.push('enabled');
    }
  } catch (error) {
    return bad(res, error.message);
  }

  // Any change to the connection invalidates the last successful test and switches the mailbox off
  if (connection() !== before) {
    mail.lastTestOk = null;
    mail.lastTestAt = null;
    mail.enabled = false;
  }

  await company.save();
  await audit(req, {
    action: touched.includes('enabled') ? (mail.enabled ? 'mail.enable' : 'mail.disable') : 'mail.update',
    entity: 'company', entityId: company.id,
    summary: touched.includes('enabled') ? `${mail.enabled ? 'Enabled' : 'Disabled'} the company mailbox` : 'Updated outgoing mail settings',
    meta: touched // field names only; never values
  });
  res.json(mailView(company));
};

// POST /admin/company/mail/test - send a test message with the saved settings to the admin's own address
export const testMail = async (req, res) => {
  if (!requireMailFeature(req, res)) return;
  const company = await Company.findById(req.company.id).select('+dataKey');
  const mail = company.mail;
  if (!mail.host || !mail.fromEmail) return bad(res, 'Save the mail server and sender email address first.');
  primeCompanyKey(company.id, company.dataKey);

  let ok = false;
  let reason = '';
  try {
    await assertPublicHost(mail.host);
    const transport = buildCompanyTransport(mail, mail.password ? decryptValue(company.id, mail.password) : undefined);
    await transport.sendMail({
      from: fromAddress(mail),
      to: req.user.email,
      subject: `${env.appName} - test email`,
      text: `This is a test from ${company.name}'s ${env.appName} workspace. Sign-in codes and notifications can now be sent from this mailbox.`
    });
    ok = true;
  } catch (error) {
    reason = String(error.message || 'Could not send the test email.').slice(0, 300);
  }

  company.mail.lastTestAt = new Date();
  company.mail.lastTestOk = ok;
  if (!ok) company.mail.enabled = false;
  await company.save();
  await audit(req, {
    action: 'mail.test', entity: 'company', entityId: company.id,
    summary: ok ? 'Sent a test email from the company mailbox' : 'Test email from the company mailbox failed'
  });
  if (!ok) return res.status(422).json({ message: `Test email failed: ${reason}` });
  res.json({ ...mailView(company), sentTo: req.user.email });
};

// ---------------------------------------------------------------- Sign-in address tickets
// GET /admin/company/address-requests - the company's current sign-in address and its tickets, newest first
export const listAddressRequests = async (req, res) => {
  const { company } = req;
  res.json({
    current: {
      dedicated: hasDedicatedAddress(company), slug: company.slug, address: companyOrigin(company), shared: sharedHost(),
      plan: company.subscription.plan, baseDomain: env.tenancy.baseDomain
    },
    tickets: await AddressTicket.find({ company: company._id }).sort({ createdAt: -1 }).limit(100)
  });
};

// POST /admin/company/address-requests { action: 'enable' | 'disable' | 'rename', slug?, reason }
// Only asks: the platform team approves or rejects, and nothing changes until then.
export const requestAddressChange = async (req, res) => {
  const ticket = await openCompanyRequest(req, req.company, req.body ?? {});
  res.status(201).json(ticket);
};
