import mongoose from 'mongoose';
import { schemaOptions } from './schemaOptions.js';

const timesheetSchema = new mongoose.Schema(
  {
    contractorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contractor', required: true, index: true },
    weekStart: { type: String, required: true }, // Monday, YYYY-MM-DD
    hours: { type: Number, required: true, min: 0, max: 168 },
    notes: { type: String, default: '' },
    status: { type: String, enum: ['Submitted', 'Approved', 'Rejected'], default: 'Submitted' }
  },
  schemaOptions()
);
timesheetSchema.index({ contractorId: 1, weekStart: 1 }, { unique: true });
export const Timesheet = mongoose.model('Timesheet', timesheetSchema);

const invoiceSchema = new mongoose.Schema(
  {
    contractorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contractor', required: true, index: true },
    number: { type: String, required: true, unique: true, trim: true },
    amount: { type: Number, required: true, min: 0.01 },
    currency: { type: String, default: 'INR' },
    issueDate: { type: String, required: true },
    dueDate: { type: String, required: true },
    status: { type: String, enum: ['Draft', 'Sent', 'Paid'], default: 'Draft' },
    paidAt: { type: Date, default: null },
    notes: { type: String, default: '' }
  },
  schemaOptions()
);
invoiceSchema.virtual('contractor', { ref: 'Contractor', localField: 'contractorId', foreignField: '_id', justOne: true });
// A sent invoice past its due date is shown as Overdue
invoiceSchema.virtual('displayStatus').get(function () {
  return this.status === 'Sent' && this.dueDate < new Date().toISOString().slice(0, 10) ? 'Overdue' : this.status;
});
export const Invoice = mongoose.model('Invoice', invoiceSchema);
