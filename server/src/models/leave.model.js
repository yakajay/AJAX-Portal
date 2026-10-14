import mongoose from 'mongoose';
import { schemaOptions, userRef, withUserVirtual, isValidId } from './schemaOptions.js';
import { USER_REF } from './userScope.js';

const leaveSchema = withUserVirtual(
  new mongoose.Schema(
    {
      userId: userRef(),
      type: { type: String, required: true }, // see LEAVE_POLICY
      startDate: { type: String, required: true },
      endDate: { type: String, required: true },
      days: { type: Number, required: true, min: 0.5 }, // working days; 0.5 for a half day
      halfDay: { type: Boolean, default: false },
      halfDayPart: { type: String, enum: ['First Half', 'Second Half', null], default: null },
      status: { type: String, enum: ['Pending', 'Approved', 'Rejected', 'Cancelled'], default: 'Pending' },
      reason: { type: String, default: null },
      // Reporting manager when the request was made: they can review it as well as admins
      approverId: { type: mongoose.Schema.Types.ObjectId, ref: USER_REF, default: null, index: true },
      reviewedById: { type: mongoose.Schema.Types.ObjectId, ref: USER_REF, default: null },
      reviewedAt: { type: Date, default: null },
      reviewNote: { type: String, default: '' }
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
  findByUserInRange: (userIds, start, end) =>
    LeaveRequest.find({
      userId: { $in: userIds },
      status: { $in: ['Pending', 'Approved'] },
      startDate: { $lte: end },
      endDate: { $gte: start }
    }).populate(withUser),
  findByApprover: (approverId) => LeaveRequest.find({ approverId }).sort({ createdAt: -1 }).populate(withUser),
  setStatus: (id, status, review = {}) =>
    LeaveRequest.findByIdAndUpdate(id, { status, ...review }, { returnDocument: 'after' }).populate(withUser).orFail(),
  countByStatus: (status, userId) =>
    LeaveRequest.countDocuments({ status, ...(userId ? { userId } : {}) })
};
