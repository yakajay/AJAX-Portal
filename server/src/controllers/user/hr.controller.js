import { documentModel } from '../../models/document.model.js';
import { holidayModel } from '../../models/holiday.model.js';
import { userModel } from '../../models/user.model.js';
import { labelToIso } from '../../utils/dates.js';

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
