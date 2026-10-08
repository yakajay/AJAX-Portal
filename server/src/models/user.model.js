import mongoose from 'mongoose';
import { schemaOptions, isValidId } from './schemaOptions.js';
import { ALL_ROLES } from '../utils/format.js';
import { Attendance } from './attendance.model.js';
import { HRDocument } from './document.model.js';
import { LeaveRequest } from './leave.model.js';
import { SupportTicket } from './ticket.model.js';

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    department: { type: String, default: 'Engineering' },
    role: { type: String, enum: ALL_ROLES, default: 'USER' },
    permissions: { type: String, default: 'read' }, // comma separated: read,write,delete
    locked: { type: Boolean, default: false },
    emailVerified: { type: Boolean, default: true },
    password: { type: String, default: null }, // scrypt hash
    managerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
  },
  // Password hashes never leave the server
  schemaOptions((ret) => { delete ret.password; })
);

userSchema.virtual('manager', { ref: 'User', localField: 'managerId', foreignField: '_id', justOne: true });

export const User = mongoose.model('User', userSchema);

const withManager = { path: 'manager', select: 'name email' };

export const userModel = {
  findAll: () => User.find().populate(withManager),
  // Limited columns for the employee directory visible to every role
  findDirectory: () =>
    User.find().select('name email role department managerId').populate(withManager),
  findById: (id) => (isValidId(id) ? User.findById(id) : null),
  findByEmail: (email) => User.findOne({ email: String(email).toLowerCase() }),
  create: async (data) => (await User.create(data)).populate(withManager),
  update: (id, data) =>
    User.findByIdAndUpdate(id, data, { new: true, runValidators: true }).populate(withManager).orFail(),
  // Remove dependent records first so nothing is left pointing at the deleted user
  remove: async (id) => {
    const user = await User.findById(id).orFail();
    await Promise.all([
      Attendance.deleteMany({ userId: id }),
      HRDocument.deleteMany({ userId: id }),
      LeaveRequest.deleteMany({ userId: id }),
      SupportTicket.updateMany({ userId: id }, { userId: null }),
      User.updateMany({ managerId: id }, { managerId: null })
    ]);
    await user.deleteOne();
    return user;
  },
  count: () => User.countDocuments()
};
