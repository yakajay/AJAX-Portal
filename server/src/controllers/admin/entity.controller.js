import mongoose from 'mongoose';
import { LegalEntity } from '../../models/legalEntity.model.js';
import { User } from '../../models/user.model.js';
import { audit } from '../../utils/audit.js';

const FIELDS = ['name', 'legalName', 'country', 'registrationNumber', 'taxId', 'address', 'currency', 'contactEmail', 'notes'];
const LIMITS = { name: 120, legalName: 200, country: 2, registrationNumber: 60, taxId: 60, address: 400, currency: 3, contactEmail: 200, notes: 1000 };
const BANK_FIELDS = { bankName: 'bankName', account: 'account', routing: 'routing' };

// Returns { set } or { error } for a create/update body. `partial` keeps untouched fields out of the update.
const build = (body, partial) => {
  const set = {};
  for (const field of FIELDS) {
    if (body[field] === undefined) continue;
    const value = String(body[field] ?? '').trim();
    if (value.length > LIMITS[field]) return { error: `${field} is too long.` };
    set[field] = value;
  }
  if (!partial && !set.name) return { error: 'A name is required.' };
  if (set.name === '') return { error: 'A name is required.' };
  if (set.country && !/^[A-Za-z]{2}$/.test(set.country)) return { error: 'Country must be a 2-letter code such as IN or US.' };
  if (set.currency && !/^[A-Za-z]{3}$/.test(set.currency)) return { error: 'Currency must be a 3-letter code.' };
  if (set.contactEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(set.contactEmail)) return { error: 'Contact email is not valid.' };
  if (set.country) set.country = set.country.toUpperCase();
  if (set.currency) set.currency = set.currency.toUpperCase();
  if (body.payrollBank && typeof body.payrollBank === 'object') {
    for (const [field, path] of Object.entries(BANK_FIELDS)) {
      if (body.payrollBank[field] === undefined) continue;
      const value = String(body.payrollBank[field] ?? '').trim();
      if (value.length > 64) return { error: `Bank ${field} is too long.` };
      set[`payrollBank.${path}`] = value; // blank clears it
    }
  }
  return { set };
};

const withCounts = async (entities) => {
  const counts = await User.aggregate([{ $match: { entityId: { $in: entities.map((e) => e._id) } } }, { $group: { _id: '$entityId', n: { $sum: 1 } } }]);
  const byId = new Map(counts.map((c) => [String(c._id), c.n]));
  return entities.map((e) => ({ ...e.toJSON(), employeeCount: byId.get(e.id) ?? 0 }));
};

export const list = async (req, res) => {
  res.json(await withCounts(await LegalEntity.find().sort({ isDefault: -1, name: 1 })));
};

export const create = async (req, res) => {
  const { set, error } = build(req.body ?? {}, false);
  if (error) return res.status(400).json({ message: error });
  if (await LegalEntity.exists({ name: set.name })) return res.status(409).json({ message: 'An employer record with that name already exists.' });
  const first = !(await LegalEntity.exists({}));
  const entity = await LegalEntity.create({ ...Object.fromEntries(Object.entries(set).filter(([k]) => !k.includes('.'))), payrollBank: {
    bankName: set['payrollBank.bankName'], account: set['payrollBank.account'], routing: set['payrollBank.routing'] }, isDefault: first });
  await audit(req, { action: 'entity.create', entity: 'legalEntity', entityId: entity.id, summary: `Added employer record ${entity.name}` });
  res.status(201).json({ ...entity.toJSON(), employeeCount: 0 });
};

const load = async (req, res) => {
  const entity = mongoose.isValidObjectId(req.params.id) ? await LegalEntity.findById(req.params.id) : null;
  if (!entity) res.status(404).json({ message: 'Employer record not found.' });
  return entity;
};

export const update = async (req, res) => {
  const entity = await load(req, res);
  if (!entity) return;
  const { set, error } = build(req.body ?? {}, true);
  if (error) return res.status(400).json({ message: error });
  if (set.name && set.name !== entity.name && (await LegalEntity.exists({ name: set.name, _id: { $ne: entity.id } }))) return res.status(409).json({ message: 'An employer record with that name already exists.' });
  if (req.body.active === false && entity.isDefault) return res.status(409).json({ message: 'Make another record the default before deactivating this one.' });
  if (typeof req.body.active === 'boolean') set.active = req.body.active;
  if (req.body.isDefault === true) {
    await LegalEntity.updateMany({ _id: { $ne: entity.id } }, { $set: { isDefault: false } });
    set.isDefault = true;
    set.active = true;
  }
  await LegalEntity.updateOne({ _id: entity.id }, { $set: set });
  await audit(req, { action: 'entity.update', entity: 'legalEntity', entityId: entity.id, summary: `Updated employer record ${entity.name}`, meta: Object.keys(set) });
  const [fresh] = await withCounts([await LegalEntity.findById(entity.id)]);
  res.json(fresh);
};

// PUT /admin/entities/assign { entityId: id | null, userIds: [...] } - move employees to an employer record
export const assign = async (req, res) => {
  const { entityId, userIds } = req.body ?? {};
  if (!Array.isArray(userIds) || !userIds.length || userIds.length > 500 || !userIds.every((id) => mongoose.isValidObjectId(id))) return res.status(400).json({ message: 'Choose between 1 and 500 employees.' });
  let entity = null;
  if (entityId) {
    entity = mongoose.isValidObjectId(entityId) ? await LegalEntity.findById(entityId) : null;
    if (!entity) return res.status(404).json({ message: 'Employer record not found.' });
    if (!entity.active) return res.status(409).json({ message: 'That employer record is inactive.' });
  }
  const result = await User.updateMany({ _id: { $in: userIds } }, { $set: { entityId: entity?.id ?? null } });
  await audit(req, { action: 'entity.assign', entity: 'legalEntity', entityId: entity?.id ?? null, summary: `${entity ? `Assigned ${result.modifiedCount} employee(s) to ${entity.name}` : `Cleared the employer record of ${result.modifiedCount} employee(s)`}` });
  res.json({ entityId: entity?.id ?? null, updated: result.modifiedCount });
};
