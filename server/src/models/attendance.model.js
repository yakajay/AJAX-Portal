import mongoose from 'mongoose';
import { schemaOptions, userRef } from './schemaOptions.js';

const attendanceSchema = new mongoose.Schema(
  {
    userId: userRef(),
    // Real instants (stored as UTC); the client formats them in the viewer's timezone
    checkInAt: { type: Date, required: true },
    checkOutAt: { type: Date, default: null },
    status: { type: String, default: 'Present' },
    // How the entry was created: a live clock-in, a manual punch, or a regularization request
    source: { type: String, enum: ['clock', 'manual', 'regularization'], default: 'clock' },
    reason: { type: String, default: null }
  },
  schemaOptions()
);

export const Attendance = mongoose.model('Attendance', attendanceSchema);

export const attendanceModel = {
  findByUser: (userId) => Attendance.find({ userId }).sort({ createdAt: -1 }),
  findOpen: (userId) => Attendance.findOne({ userId, checkOutAt: null }).sort({ createdAt: -1 }),
  create: (data) => Attendance.create(data),
  setCheckOut: (id, checkOutAt) =>
    Attendance.findByIdAndUpdate(id, { checkOutAt }, { new: true }).orFail()
};
