import mongoose from 'mongoose';
import { schemaOptions, userRef } from './schemaOptions.js';

const attendanceSchema = new mongoose.Schema(
  {
    userId: userRef(),
    date: { type: String, required: true },
    checkIn: { type: String, required: true },
    checkOut: { type: String, default: null },
    status: { type: String, default: 'Present' }
  },
  schemaOptions()
);

export const Attendance = mongoose.model('Attendance', attendanceSchema);

export const attendanceModel = {
  findByUser: (userId) => Attendance.find({ userId }).sort({ createdAt: -1 }),
  findOpen: (userId) => Attendance.findOne({ userId, checkOut: null }).sort({ createdAt: -1 }),
  create: (data) => Attendance.create(data),
  setCheckOut: (id, checkOut) =>
    Attendance.findByIdAndUpdate(id, { checkOut }, { new: true }).orFail()
};
