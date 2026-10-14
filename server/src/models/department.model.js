import mongoose from 'mongoose';
import { schemaOptions } from './schemaOptions.js';

const departmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    headId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
  },
  schemaOptions()
);
departmentSchema.virtual('head', { ref: 'User', localField: 'headId', foreignField: '_id', justOne: true });

departmentSchema.index({ companyId: 1, name: 1 }, { unique: true });


export const Department = mongoose.model('Department', departmentSchema);
