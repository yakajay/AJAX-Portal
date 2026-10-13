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
