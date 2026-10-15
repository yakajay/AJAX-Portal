import mongoose from 'mongoose';
import { schemaOptions } from './schemaOptions.js';

const shiftSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // Local wall-clock times (HH:MM), compared in the viewer's timezone like the company-wide defaults
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    // Clock-ins up to this many minutes after the start still count as on time
    graceMinutes: { type: Number, default: 0, min: 0, max: 240 }
  },
  schemaOptions()
);
shiftSchema.index({ companyId: 1, name: 1 }, { unique: true });

export const Shift = mongoose.model('Shift', shiftSchema);

export const shiftModel = {
  findAll: () => Shift.find().sort({ startTime: 1, name: 1 }),
  findById: (id) => (mongoose.isValidObjectId(id) ? Shift.findById(id) : null),
  create: (data) => Shift.create(data)
};
