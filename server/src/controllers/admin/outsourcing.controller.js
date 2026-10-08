import { contractorModel } from '../../models/contractor.model.js';

export const list = async (req, res) => {
  res.json(await contractorModel.findAll());
};

export const create = async (req, res) => {
  const { name, role, company, status, country, rating } = req.body;
  if (!name || !role || !company) {
    return res.status(400).json({ message: 'Name, role and company are required.' });
  }
  const contractor = await contractorModel.create({
    name, role, company,
    status: status || 'Active',
    country: country || '',
    rating: parseFloat(rating) || 0
  });
  res.status(201).json(contractor);
};
