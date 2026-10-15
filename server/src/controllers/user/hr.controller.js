import { documentModel } from '../../models/document.model.js';
import { holidayModel } from '../../models/holiday.model.js';
import { userModel } from '../../models/user.model.js';
import { labelToIso } from '../../utils/dates.js';

// Sends the stored file as a download (never rendered inline, so an uploaded file can't run in our origin)
export const sendDocumentFile = (req, res, document) => {
  if (!document || !document.fileData?.length) return res.status(404).json({ message: 'File not found.' });
  res.set({
    'Content-Type': document.contentType,
    'Content-Disposition': `attachment; filename="${document.fileName}"`,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store'
  });
  res.send(document.fileData);
};

// Employees can only fetch files on their own documents
export const downloadMyDocument = async (req, res) => {
  const document = await documentModel.findByIdWithFile(req.params.id);
  sendDocumentFile(req, res, document && String(document.userId) === req.user.id ? document : null);
};

export const myDocuments = async (req, res) => {
  res.json(await documentModel.findByUser(req.user.id));
};

// Holidays are stored with a display label ("Oct 2, 2026"); `iso` adds the sortable calendar date
export const holidays = async (req, res) => {
  const list = await holidayModel.findAll();
  res.json(list.map((h) => ({ ...h.toJSON(), iso: labelToIso(h.date) })));
};

// Read-only company directory (no permissions, lock state or password data)
export const directory = async (req, res) => {
  res.json(await userModel.findDirectory());
};
