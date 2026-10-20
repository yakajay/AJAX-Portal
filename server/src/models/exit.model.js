import mongoose from 'mongoose';
import { schemaOptions, userRef, withUserVirtual } from './schemaOptions.js';
import { encrypted } from './encryptedField.js';

export const EXIT_TYPES = ['Resignation', 'Termination', 'Retirement', 'End of contract'];
export const EXIT_STATUSES = ['Pending', 'Approved', 'Rejected', 'Withdrawn', 'Settled'];

const money = encrypted('number', { default: 0 });

// One employee's exit: requested (or started by HR), approved with a last working day, then settled
const exitSchema = withUserVirtual(
  new mongoose.Schema(
    {
      userId: userRef(),
      type: { type: String, enum: EXIT_TYPES, default: 'Resignation' },
      reason: { type: String, default: '' },
      status: { type: String, enum: EXIT_STATUSES, default: 'Pending' },
      requestedLastDay: { type: String, default: null }, // YYYY-MM-DD the employee proposed
      lastWorkingDay: { type: String, default: null }, // YYYY-MM-DD, set by HR on approval
      initiatedById: userRef(false),
      reviewedById: userRef(false),
      reviewedAt: { type: Date, default: null },
      reviewNote: { type: String, default: '' },
      // Full-and-final settlement (money is sealed with the company key, like payslips)
      settlement: {
        salaryDue: money,
        leaveEncashmentDays: { type: Number, default: 0 },
        leaveEncashment: money,
        expensesDue: money,
        deductions: money,
        total: money,
        currency: { type: String, default: 'INR' },
        note: { type: String, default: '' },
        settledAt: { type: Date, default: null },
        settledById: userRef(false)
      }
    },
    schemaOptions(null, { getters: true })
  )
);
exitSchema.index({ userId: 1, status: 1 });

export const Exit = mongoose.model('Exit', exitSchema);
