import mongoose from 'mongoose';
import { User } from '../../models/user.model.js';
import { audit } from '../../utils/audit.js';

// Bank details and government IDs. Stored sealed with the company's key (see models/encryptedField.js)
// and kept out of every normal user response; only these endpoints return them.
export const SENSITIVE_FIELDS = ['bankName', 'bankAccount', 'bankIfsc', 'governmentId', 'taxId'];

export const readSensitive = (user) =>
  Object.fromEntries(SENSITIVE_FIELDS.map((field) => [field, user.sensitive?.[field] ?? '']));

// Validates a request body and returns the $set document, or { error }
export const buildSensitiveUpdate = (body) => {
  const set = {};
  for (const field of SENSITIVE_FIELDS) {
    if (body[field] === undefined) continue;
    const value = String(body[field] ?? '').trim();
    if (value.length > 64) return { error: `${field} is too long.` };
    set[`sensitive.${field}`] = value; // an empty string clears it
  }
  return Object.keys(set).length ? { set } : { error: 'Nothing to update.' };
};

const loadTarget = async (req, res) => {
  const user = mongoose.isValidObjectId(req.params.id) ? await User.findById(req.params.id) : null;
  if (!user) res.status(404).json({ message: 'Employee not found.' });
  return user;
};

// GET /admin/users/:id/sensitive
export const read = async (req, res) => {
  const user = await loadTarget(req, res);
  if (!user) return;
  await audit(req, { action: 'sensitive.view', entity: 'user', entityId: user.id, summary: `Viewed bank and ID details of ${user.email}` });
  res.json(readSensitive(user));
};

// PUT /admin/users/:id/sensitive
export const update = async (req, res) => {
  const user = await loadTarget(req, res);
  if (!user) return;
  const { set, error } = buildSensitiveUpdate(req.body ?? {});
  if (error) return res.status(400).json({ message: error });
  await User.updateOne({ _id: user.id }, { $set: set });
  // Field names only - the values themselves never go into the audit log
  await audit(req, { action: 'sensitive.update', entity: 'user', entityId: user.id, summary: `Updated bank and ID details of ${user.email}`, meta: Object.keys(set).map((k) => k.split('.')[1]) });
  res.json(readSensitive(await User.findById(user.id)));
};
