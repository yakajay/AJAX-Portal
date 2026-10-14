import mongoose from 'mongoose';
import { Company, companyOrigin } from '../../models/company.model.js';
import { DeleteRequest, DELETE_TARGETS } from '../../models/deleteRequest.model.js';
import { SupportAccess } from '../../models/supportAccess.model.js';
import { userModel } from '../../models/user.model.js';
import { encryptValue } from '../../utils/crypto.js';
import { assertPublicUrl } from '../../utils/safeFetch.js';
import { hasPermission } from '../../utils/permissions.js';
import { describeTarget } from '../../services/deletion.service.js';
import { seatsUsed } from '../../services/company.service.js';
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
  res.status(status === 202 ? 201 : status).json(body);
};

// Used as the handler of the DELETE routes: admins can't delete, so the call becomes a request
export const deleteViaRequest = (targetType) => async (req, res) => {
  const { status, body } = await raiseDeleteRequest(req, { targetType, targetId: req.params.id, reason: req.body?.reason });
  res.status(status).json(
    status === 202
      ? { ...body.toJSON(), message: 'Deletion needs approval. A request has been sent to the platform administrator.' }
      : body
  );
};
