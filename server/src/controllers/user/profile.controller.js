import { userModel } from '../../models/user.model.js';
import { hashPassword, verifyPassword } from '../../utils/password.js';
import { sanitizeUser } from '../../utils/format.js';
import { isValidIso } from '../../utils/dates.js';
import { revokeAllSessions } from '../../utils/sessions.js';
import { audit } from '../../utils/audit.js';

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
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ message: 'New password must be at least 6 characters.' });
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
