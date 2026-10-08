import { documentModel } from '../../models/document.model.js';
import { holidayModel } from '../../models/holiday.model.js';
import { userModel } from '../../models/user.model.js';

export const myDocuments = async (req, res) => {
  res.json(await documentModel.findByUser(req.user.id));
};

export const holidays = async (req, res) => {
  res.json(await holidayModel.findAll());
};

// Read-only company directory (no permissions, lock state or password data)
export const directory = async (req, res) => {
  res.json(await userModel.findDirectory());
};
