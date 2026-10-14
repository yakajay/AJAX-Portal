import mongoose from 'mongoose';
import { schemaOptions } from './schemaOptions.js';
import { USER_REF } from './userScope.js';

const departmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    headId: { type: mongoose.Schema.Types.ObjectId, ref: USER_REF, default: null }
  },
  schemaOptions()
);
departmentSchema.virtual('head', { ref: USER_REF, localField: 'headId', foreignField: '_id', justOne: true });

departmentSchema.index({ companyId: 1, name: 1 }, { unique: true });


export const Department = mongoose.model('Department', departmentSchema);
