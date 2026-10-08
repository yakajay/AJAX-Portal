import { userModel } from '../../models/user.model.js';
import { hashPassword, verifyPassword } from '../../utils/password.js';
import { sanitizeUser } from '../../utils/format.js';

export const getProfile = (req, res) => res.json(sanitizeUser(req.user));

// Only the display name is self-editable: email is the login identity, role/permissions are admin-managed
export const updateProfile = async (req, res) => {
  const name = req.body.name?.trim();
  if (!name) return res.status(400).json({ message: 'Name is required.' });
  const user = await userModel.update(req.user.id, { name });
  res.json(sanitizeUser(user));
};

export const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ message: 'New password must be at least 6 characters.' });
  }
  if (!verifyPassword(currentPassword, req.user.password)) {
    return res.status(401).json({ message: 'Current password is incorrect.' });
  }
  await userModel.update(req.user.id, { password: hashPassword(newPassword) });
  res.json({ message: 'Password updated successfully.' });
};
