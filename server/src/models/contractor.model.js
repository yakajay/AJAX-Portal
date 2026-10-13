import mongoose from 'mongoose';
import { schemaOptions } from './schemaOptions.js';

const contractorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    role: { type: String, required: true },
    company: { type: String, required: true },
    status: { type: String, default: 'Active' }, // Active, On Bench, Pending
    country: { type: String, default: '' },
    rating: { type: Number, default: 0 },
    email: { type: String, default: '', trim: true },
    contractStart: { type: String, default: null }, // YYYY-MM-DD
    contractEnd: { type: String, default: null },
    hourlyRate: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: 'INR' }
  },
  schemaOptions()
);

export const Contractor = mongoose.model('Contractor', contractorSchema);

export const contractorModel = {
  findAll: () => Contractor.find(),
  findById: (id) => (mongoose.isValidObjectId(id) ? Contractor.findById(id) : null),
  create: (data) => Contractor.create(data),
  // Active/pending contracts ending between today and `untilIso` (inclusive)
  findEndingBy: (todayIso, untilIso) =>
    Contractor.find({ contractEnd: { $gte: todayIso, $lte: untilIso }, status: { $ne: 'Ended' } }).sort({ contractEnd: 1 }),
  findExpired: (todayIso) =>
    Contractor.find({ contractEnd: { $lt: todayIso }, status: { $in: ['Active', 'On Bench', 'Pending'] } }).sort({ contractEnd: 1 }),
  countActive: () => Contractor.countDocuments({ status: 'Active' })
};
