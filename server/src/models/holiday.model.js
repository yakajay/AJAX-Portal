import mongoose from 'mongoose';
import { schemaOptions } from './schemaOptions.js';

const holidaySchema = new mongoose.Schema(
  {
    date: { type: String, required: true },
    name: { type: String, required: true }
  },
  schemaOptions()
);

export const Holiday = mongoose.model('Holiday', holidaySchema);

export const holidayModel = {
  findAll: () => Holiday.find()
};
