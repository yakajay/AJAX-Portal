import { holidayModel } from '../../models/holiday.model.js';
import { isValidId } from '../../models/schemaOptions.js';
import { isValidIso, labelToIso } from '../../utils/dates.js';
import { documentModel } from '../../models/document.model.js';
import { userModel } from '../../models/user.model.js';
import { todayLabel } from '../../utils/format.js';
import { notify } from '../../utils/notify.js';
import { audit } from '../../utils/audit.js';

export const listDocuments = async (req, res) => {
  res.json(await documentModel.findAll());
};

export const createDocument = async (req, res) => {
  const { userId, name, type, date } = req.body;
  if (!userId || !name?.trim() || !type) {
    return res.status(400).json({ message: 'Employee, document name and type are required.' });
  }
  if (!(await userModel.findById(userId))) {
    return res.status(404).json({ message: 'Employee not found.' });
  }
  const document = await documentModel.create({
    userId, name: name.trim(), type, date: date || todayLabel()
  });
  await notify(userId, { type: 'document', title: `New document: ${document.name}`, body: document.type, link: '/hr-hub' });
  await audit(req, { action: 'document.create', entity: 'document', entityId: document.id, summary: `Added ${document.type} "${document.name}" for user ${userId}` });
  res.status(201).json(document);
};

// --- Public holidays. Stored as a display label ("Oct 2, 2026"); the API takes and returns ISO dates too. ---
const isoToLabel = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const withIso = (h) => ({ ...h.toJSON(), iso: labelToIso(h.date) });

const readHoliday = async (req, res, existingId = null) => {
  const name = String(req.body.name ?? '').trim();
  const { date } = req.body;
  if (!name || name.length > 100) { res.status(400).json({ message: 'A holiday name of up to 100 characters is required.' }); return null; }
  if (!isValidIso(date)) { res.status(400).json({ message: 'The date must look like 2026-10-02.' }); return null; }
  const clash = (await holidayModel.findAll()).find((h) => labelToIso(h.date) === date && h.id !== existingId);
  if (clash) { res.status(409).json({ message: `${date} is already marked as "${clash.name}".` }); return null; }
  return { name, date: isoToLabel(date) };
};

export const createHoliday = async (req, res) => {
  const data = await readHoliday(req, res);
  if (!data) return;
  const holiday = await holidayModel.create(data);
  await audit(req, { action: 'holiday.create', entity: 'holiday', entityId: holiday.id, summary: `Added holiday "${holiday.name}" on ${holiday.date}` });
  res.status(201).json(withIso(holiday));
};

export const updateHoliday = async (req, res) => {
  const holiday = isValidId(req.params.id) ? await holidayModel.findById(req.params.id) : null;
  if (!holiday) return res.status(404).json({ message: 'Holiday not found.' });
  const data = await readHoliday(req, res, holiday.id);
  if (!data) return;
  holiday.set(data);
  await holiday.save();
  await audit(req, { action: 'holiday.update', entity: 'holiday', entityId: holiday.id, summary: `Changed holiday to "${holiday.name}" on ${holiday.date}` });
  res.json(withIso(holiday));
};
