import mongoose from 'mongoose';
import { schemaOptions } from './schemaOptions.js';

const contractorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    role: { type: String, required: true },
    company: { type: String, required: true },
    status: { type: String, default: 'Active' }, // Active, On Bench, Pending
    country: { type: String, default: '' },
    rating: { type: Number, default: 0 }
  },
  schemaOptions()
);

export const Contractor = mongoose.model('Contractor', contractorSchema);

export const contractorModel = {
  findAll: () => Contractor.find(),
  create: (data) => Contractor.create(data),
  countActive: () => Contractor.countDocuments({ status: 'Active' })
};
