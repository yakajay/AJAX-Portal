import { holidayModel } from '../../models/holiday.model.js';
import { isValidId } from '../../models/schemaOptions.js';
import { isValidIso, labelToIso } from '../../utils/dates.js';
import { documentModel } from '../../models/document.model.js';
import { userModel } from '../../models/user.model.js';
import { todayLabel } from '../../utils/format.js';
import { notify } from '../../utils/notify.js';
import { audit } from '../../utils/audit.js';
import { isAllowedUpload, safeFileName } from '../../utils/documentFiles.js';
import { sendDocumentFile } from '../user/hr.controller.js';
import { loadBranding, buildLetterPdf } from '../../utils/letterhead.js';

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

// PUT /admin/documents/:id/file - the request body is the file itself; X-File-Name carries its name
export const uploadDocumentFile = async (req, res) => {
  const document = await documentModel.findById(req.params.id);
  if (!document) return res.status(404).json({ message: 'Document not found.' });
  const body = req.body;
  if (!Buffer.isBuffer(body) || !body.length) {
    return res.status(400).json({ message: 'Send the file as the request body (PDF, PNG, JPEG, DOCX or XLSX, up to 5 MB).' });
  }
  const contentType = String(req.headers['content-type'] || '').split(';')[0].trim();
  if (!isAllowedUpload(contentType, body)) {
    return res.status(415).json({ message: 'That file does not look like a valid PDF, PNG, JPEG, DOCX or XLSX.' });
  }
  document.fileName = safeFileName(req.headers['x-file-name'], contentType, document.name);
  document.contentType = contentType;
  document.size = body.length;
  document.fileData = body;
  await document.save();
  await audit(req, { action: 'document.upload', entity: 'document', entityId: document.id, summary: `Attached ${document.fileName} to "${document.name}"`, meta: { bytes: body.length, contentType } });
  res.json(document);
};

export const downloadDocumentFile = async (req, res) => sendDocumentFile(req, res, await documentModel.findByIdWithFile(req.params.id));

// POST /admin/documents/letter - writes a letter to an employee on the company's letterhead and files it
// under their documents as a PDF. Without a letterhead it falls back to a plain header with the company name.
export const generateLetter = async (req, res) => {
  const { userId, subject, body, date } = req.body;
  const cleanSubject = String(subject ?? '').trim();
  const cleanBody = String(body ?? '').trim();
  if (!userId || !cleanSubject || !cleanBody) return res.status(400).json({ message: 'Employee, subject and letter text are required.' });
  if (cleanSubject.length > 150 || cleanBody.length > 10000) return res.status(400).json({ message: 'The subject may be up to 150 characters and the letter up to 10,000.' });
  const employee = isValidId(userId) ? await userModel.findById(userId) : null;
  if (!employee) return res.status(404).json({ message: 'Employee not found.' });

  const { company, letterhead } = await loadBranding(req.company?.id, 'Company');
  const label = date || todayLabel();
  const pdf = await buildLetterPdf({
    company, letterhead, date: label, subject: cleanSubject, body: cleanBody,
    recipient: { name: employee.name, designation: employee.designation, department: employee.department },
    signatory: req.user.name
  });
  const document = await documentModel.create({
    userId, name: cleanSubject, type: 'Letter', date: label,
    fileName: safeFileName(cleanSubject, 'application/pdf', 'letter'), contentType: 'application/pdf', size: pdf.length, fileData: pdf
  });
  await notify(userId, { type: 'document', title: `New document: ${document.name}`, body: 'Letter', link: '/hr-hub' });
  await audit(req, { action: 'document.letter', entity: 'document', entityId: document.id, summary: `Issued letter "${document.name}" to user ${userId}`, meta: { letterhead: !!letterhead } });
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
