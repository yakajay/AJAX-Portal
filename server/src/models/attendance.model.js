import mongoose from 'mongoose';
import { schemaOptions, userRef, withUserVirtual } from './schemaOptions.js';
import { USER_REF } from './userScope.js';

const attendanceSchema = withUserVirtual(new mongoose.Schema(
  {
    userId: userRef(),
    // Real instants (stored as UTC); the client formats them in the viewer's timezone
    checkInAt: { type: Date, required: true },
    checkOutAt: { type: Date, default: null },
    status: { type: String, default: 'Present' },
    // How the entry was created: a live clock-in, a manual punch, or a regularization request
    source: { type: String, enum: ['clock', 'manual', 'regularization'], default: 'clock' },
    reason: { type: String, default: null },
    // Where / from which address the clock-in happened (optional geolocation, always the request IP)
    location: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
      accuracy: { type: Number, default: null }
    },
    ip: { type: String, default: '' },
    remote: { type: Boolean, default: false },
    reviewedById: { type: mongoose.Schema.Types.ObjectId, ref: USER_REF, default: null },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, default: '' }
  },
  schemaOptions()
));

export const Attendance = mongoose.model('Attendance', attendanceSchema);

export const attendanceModel = {
  findById: (id) => (mongoose.isValidObjectId(id) ? Attendance.findById(id) : null),
  findByStatus: (status) =>
    Attendance.find({ status }).sort({ createdAt: -1 }).populate({ path: 'user', select: 'name managerId' }),
  findByUser: (userId) => Attendance.find({ userId }).sort({ createdAt: -1 }),
  findInRange: (userIds, from, to) =>
    Attendance.find({ userId: { $in: userIds }, checkInAt: { $gte: from, $lt: to } }).sort({ checkInAt: 1 }),
  findOpen: (userId) => Attendance.findOne({ userId, checkOutAt: null }).sort({ createdAt: -1 }),
  create: (data) => Attendance.create(data),
  setCheckOut: (id, checkOutAt) =>
    Attendance.findByIdAndUpdate(id, { checkOutAt }, { returnDocument: 'after' }).orFail()
};
