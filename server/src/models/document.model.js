import mongoose from 'mongoose';
import { schemaOptions, userRef, withUserVirtual } from './schemaOptions.js';

const documentSchema = withUserVirtual(
  new mongoose.Schema(
    {
      userId: userRef(),
      name: { type: String, required: true, trim: true },
      type: { type: String, required: true }, // Letter, Payslip, Tax
      date: { type: String, required: true },
      // The attached file itself (optional). The bytes live here but are never part of the JSON or normal queries.
      fileName: { type: String, default: '' },
      contentType: { type: String, default: '' },
      size: { type: Number, default: 0 },
      fileData: { type: Buffer, select: false, default: undefined }
    },
    schemaOptions((ret) => {
      delete ret.fileData;
      ret.hasFile = ret.size > 0;
    })
  )
);

export const HRDocument = mongoose.model('HRDocument', documentSchema);

const withUser = { path: 'user', select: 'name' };

export const documentModel = {
  findAll: () => HRDocument.find().sort({ createdAt: -1 }).populate(withUser),
  findByUser: (userId) => HRDocument.find({ userId }).sort({ createdAt: -1 }),
  create: async (data) => (await HRDocument.create(data)).populate(withUser),
  findByIdWithFile: (id) => (mongoose.isValidObjectId(id) ? HRDocument.findById(id).select('+fileData') : null),
  findById: (id) => (mongoose.isValidObjectId(id) ? HRDocument.findById(id) : null),
  countByUser: (userId) => HRDocument.countDocuments({ userId })
};
