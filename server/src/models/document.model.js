import mongoose from 'mongoose';
import { schemaOptions, userRef, withUserVirtual } from './schemaOptions.js';

const documentSchema = withUserVirtual(
  new mongoose.Schema(
    {
      userId: userRef(),
      name: { type: String, required: true, trim: true },
      type: { type: String, required: true }, // Letter, Payslip, Tax
      date: { type: String, required: true }
    },
    schemaOptions()
  )
);

export const HRDocument = mongoose.model('HRDocument', documentSchema);

const withUser = { path: 'user', select: 'name' };

export const documentModel = {
  findAll: () => HRDocument.find().sort({ createdAt: -1 }).populate(withUser),
  findByUser: (userId) => HRDocument.find({ userId }).sort({ createdAt: -1 }),
  create: async (data) => (await HRDocument.create(data)).populate(withUser),
  countByUser: (userId) => HRDocument.countDocuments({ userId })
};
