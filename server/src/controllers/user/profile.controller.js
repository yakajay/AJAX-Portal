import { userModel } from '../../models/user.model.js';
import { hashPassword, verifyPassword, passwordPolicyError } from '../../utils/password.js';
import { sanitizeUser } from '../../utils/format.js';
import { isValidIso } from '../../utils/dates.js';
import { revokeAllSessions } from '../../utils/sessions.js';
import { audit } from '../../utils/audit.js';
import { sniffImageType } from '../admin/company.controller.js';
import { User } from '../../models/user.model.js';
import { readSensitive, buildSensitiveUpdate } from '../admin/sensitive.controller.js';

export const getProfile = (req, res) => res.json(sanitizeUser(req.user));

// Self-editable: display name and birthday. Email is the login identity; role, permissions,
// department and join date are admin-managed.
export const updateProfile = async (req, res) => {
  const data = {};
  if (req.body.name !== undefined) {
    const name = String(req.body.name).trim();
    if (!name) return res.status(400).json({ message: 'Name is required.' });
    data.name = name;
  }
  if (req.body.dateOfBirth !== undefined) {
    if (req.body.dateOfBirth && !isValidIso(req.body.dateOfBirth)) {
      return res.status(400).json({ message: 'Date of birth must be a valid date.' });
    }
    data.dateOfBirth = req.body.dateOfBirth || null;
  }
  if (!Object.keys(data).length) return res.status(400).json({ message: 'Nothing to update.' });
  const user = await userModel.update(req.user.id, data);
  res.json(sanitizeUser(user));
};

// Own bank details and government IDs (sealed with the company key; never part of the normal profile)
export const getSensitive = async (req, res) => res.json(readSensitive(await User.findById(req.user.id)));

export const updateSensitive = async (req, res) => {
  const { set, error } = buildSensitiveUpdate(req.body ?? {});
  if (error) return res.status(400).json({ message: error });
  await User.updateOne({ _id: req.user.id }, { $set: set });
  await audit(req, { action: 'sensitive.update', entity: 'user', entityId: req.user.id, summary: 'Updated own bank and ID details', meta: Object.keys(set).map((k) => k.split('.')[1]) });
  res.json(readSensitive(await User.findById(req.user.id)));
};

const LANGUAGES = ['en', 'hi', 'es'];

export const updatePreferences = async (req, res) => {
  const { language, emailNotifications, emailDigest } = req.body;
  const data = {};
  if (language !== undefined) {
    if (!LANGUAGES.includes(language)) return res.status(400).json({ message: 'Unsupported language.' });
    data['preferences.language'] = language;
  }
  if (emailNotifications !== undefined) data['preferences.emailNotifications'] = !!emailNotifications;
  if (emailDigest !== undefined) data['preferences.emailDigest'] = !!emailDigest;
  if (!Object.keys(data).length) return res.status(400).json({ message: 'Nothing to update.' });
  res.json(sanitizeUser(await userModel.update(req.user.id, data)));
};

export const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (passwordPolicyError(newPassword)) {
    return res.status(400).json({ message: passwordPolicyError(newPassword) });
  }
  if (!verifyPassword(currentPassword, req.user.password)) {
    // 400, not 401: a 401 tells the client its session expired and would sign the user out
    return res.status(400).json({ message: 'Current password is incorrect.' });
  }
  await userModel.update(req.user.id, { password: hashPassword(newPassword) });
  // A password change signs every other device out
  await revokeAllSessions(req.user.id, req.session.id);
  await audit(req, { action: 'user.password_change', entity: 'user', entityId: req.user.id, summary: 'Changed own password' });
  res.json({ message: 'Password updated successfully. Other devices were signed out.' });
};

// --- Profile photo ---
export const MAX_AVATAR_BYTES = 512 * 1024;
export const AVATAR_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

// PUT /user/profile/avatar - the request body is the image itself
export const uploadAvatar = async (req, res) => {
  const body = req.body;
  if (!Buffer.isBuffer(body) || !body.length) return res.status(400).json({ message: 'Send the photo as the request body (PNG, JPEG or WebP, up to 512 KB).' });
  const type = sniffImageType(body);
  if (!type) return res.status(415).json({ message: 'The photo must be a PNG, JPEG or WebP image.' });
  await User.updateOne({ _id: req.user.id }, { avatarData: body, avatarType: type, avatarUpdatedAt: new Date() });
  res.json(sanitizeUser(await userModel.findById(req.user.id)));
};

export const removeAvatar = async (req, res) => {
  await User.updateOne({ _id: req.user.id }, { avatarData: null, avatarType: '', avatarUpdatedAt: null });
  res.json(sanitizeUser(await userModel.findById(req.user.id)));
};

// GET /user/avatars/:id - anyone signed in to the company can see a colleague's photo (it is shown in the directory)
export const getAvatar = async (req, res) => {
  const user = await userModel.findWithAvatar(req.params.id);
  if (!user?.avatarData?.length) return res.status(404).json({ message: 'No photo.' });
  res.set({ 'Content-Type': user.avatarType, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=86400' });
  res.send(user.avatarData);
};
