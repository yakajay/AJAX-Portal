import mongoose from 'mongoose';
import { schemaOptions, userRef, withUserVirtual } from './schemaOptions.js';

export const EXPENSE_CATEGORIES = ['Travel', 'Meals', 'Accommodation', 'Equipment', 'Software', 'Training', 'Other'];

const expenseSchema = withUserVirtual(
  new mongoose.Schema(
    {
      userId: userRef(),
      title: { type: String, required: true, trim: true },
      category: { type: String, enum: EXPENSE_CATEGORIES, default: 'Other' },
      amount: { type: Number, required: true, min: 0.01 },
      currency: { type: String, default: 'INR' },
      date: { type: String, required: true }, // YYYY-MM-DD the money was spent
      description: { type: String, default: '' },
      receiptRef: { type: String, default: '' }, // receipt number or link (no file uploads)
      status: { type: String, enum: ['Pending', 'Approved', 'Rejected', 'Reimbursed'], default: 'Pending' },
      reviewedById: userRef(false),
      reviewedAt: { type: Date, default: null },
      reviewNote: { type: String, default: '' },
      reimbursedAt: { type: Date, default: null }
    },
    schemaOptions()
  )
);

export const Expense = mongoose.model('Expense', expenseSchema);
