import mongoose from 'mongoose';
import { schemaOptions, isValidId } from './schemaOptions.js';
import { ALL_ROLES } from '../utils/format.js';
import { Attendance } from './attendance.model.js';
import { HRDocument } from './document.model.js';
import { LeaveRequest } from './leave.model.js';
import { SupportTicket } from './ticket.model.js';
import { Session } from './session.model.js';
import { Notification } from './notification.model.js';
import { SalaryStructure, Payslip } from './salary.model.js';
import { Review, Goal } from './performance.model.js';
import { Expense } from './expense.model.js';
import { Checklist } from './checklist.model.js';
import { Department } from './department.model.js';

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
    managerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    designation: { type: String, default: '', trim: true },
    dateOfBirth: { type: String, default: null }, // YYYY-MM-DD (birthday reminders)
    joinDate: { type: String, default: null }, // YYYY-MM-DD (work anniversaries)
    preferences: {
      language: { type: String, default: 'en' },
      emailNotifications: { type: Boolean, default: true },
      emailDigest: { type: Boolean, default: false }
    },
    // Authenticator-app 2FA. The secret is stripped from every JSON response (see the transform below).
    totp: {
      secret: { type: String, default: null },
      enabled: { type: Boolean, default: false },
      // Last accepted 30-second step, so a code can't be replayed within its validity window
      lastStep: { type: Number, default: 0 }
    }
  },
  // Password hashes and 2FA secrets never leave the server
  schemaOptions((ret) => {
    delete ret.password;
    ret.totpEnabled = !!ret.totp?.enabled;
    delete ret.totp;
  })
);

userSchema.virtual('manager', { ref: 'User', localField: 'managerId', foreignField: '_id', justOne: true });

export const User = mongoose.model('User', userSchema);

const withManager = { path: 'manager', select: 'name email' };

export const userModel = {
  findAll: () => User.find().populate(withManager),
  // Limited columns for the employee directory visible to every role
  findDirectory: () =>
    User.find().select('name email role department designation managerId dateOfBirth joinDate').populate(withManager),
  findById: (id) => (isValidId(id) ? User.findById(id) : null),
  findWithTotpSecret: (id) => User.findById(id),
  // Atomically records a used TOTP step; false if that step (or a later one) was already used
  consumeTotpStep: async (id, step) =>
    (await User.updateOne({ _id: id, 'totp.lastStep': { $lt: step } }, { $set: { 'totp.lastStep': step } })).modifiedCount === 1,
  findByEmail: (email) => User.findOne({ email: String(email).toLowerCase() }),
  create: async (data) => (await User.create(data)).populate(withManager),
  update: (id, data) =>
    User.findByIdAndUpdate(id, data, { returnDocument: 'after', runValidators: true }).populate(withManager).orFail(),
  // Remove dependent records first so nothing is left pointing at the deleted user
  remove: async (id) => {
    const user = await User.findById(id).orFail();
    await Promise.all([
      Attendance.deleteMany({ userId: id }),
      HRDocument.deleteMany({ userId: id }),
      LeaveRequest.deleteMany({ userId: id }),
      SupportTicket.updateMany({ userId: id }, { userId: null }),
      Session.deleteMany({ userId: id }),
      Notification.deleteMany({ userId: id }),
      SalaryStructure.deleteMany({ userId: id }),
      Payslip.deleteMany({ userId: id }),
      Review.deleteMany({ userId: id }),
      Review.updateMany({ reviewerId: id }, { reviewerId: null }),
      Goal.deleteMany({ userId: id }),
      Expense.deleteMany({ userId: id }),
      Checklist.deleteMany({ userId: id }),
      Department.updateMany({ headId: id }, { headId: null }),
      User.updateMany({ managerId: id }, { managerId: null })
    ]);
    await user.deleteOne();
    return user;
  },
  count: () => User.countDocuments()
};
