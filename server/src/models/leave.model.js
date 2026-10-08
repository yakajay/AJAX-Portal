import mongoose from 'mongoose';
import { schemaOptions, userRef, withUserVirtual, isValidId } from './schemaOptions.js';

const leaveSchema = withUserVirtual(
  new mongoose.Schema(
    {
      userId: userRef(),
      type: { type: String, required: true }, // Annual Leave, Sick Leave, Casual Leave
      startDate: { type: String, required: true },
      endDate: { type: String, required: true },
      days: { type: Number, required: true, min: 1 },
      status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' },
      reason: { type: String, default: null }
    },
    schemaOptions()
  )
);

export const LeaveRequest = mongoose.model('LeaveRequest', leaveSchema);

const withUser = { path: 'user', select: 'name' };

export const leaveModel = {
  findAll: () => LeaveRequest.find().sort({ createdAt: -1 }).populate(withUser),
  findById: (id) => (isValidId(id) ? LeaveRequest.findById(id) : null),
  findByUser: (userId) => LeaveRequest.find({ userId }).sort({ createdAt: -1 }),
  findApprovedByUser: (userId) => LeaveRequest.find({ userId, status: 'Approved' }),
  create: (data) => LeaveRequest.create(data),
  setStatus: (id, status) =>
    LeaveRequest.findByIdAndUpdate(id, { status }, { new: true }).populate(withUser).orFail(),
  countByStatus: (status, userId) =>
    LeaveRequest.countDocuments({ status, ...(userId ? { userId } : {}) })
};
