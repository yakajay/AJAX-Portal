import { documentModel } from '../../models/document.model.js';
import { userModel } from '../../models/user.model.js';
import { todayLabel } from '../../utils/format.js';

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
  res.status(201).json(document);
};
