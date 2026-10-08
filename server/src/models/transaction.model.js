import mongoose from 'mongoose';
import { schemaOptions } from './schemaOptions.js';

const transactionSchema = new mongoose.Schema(
  {
    recipient: { type: String, required: true },
    date: { type: String, required: true }, // display label, e.g. "Oct 8, 2026"
    amount: { type: String, required: true }, // formatted with currency, e.g. "$1,500.00"
    status: { type: String, default: 'Success' }, // Success, Processing, Failed
    method: { type: String, required: true }
  },
  schemaOptions()
);

export const Transaction = mongoose.model('Transaction', transactionSchema);

export const transactionModel = {
  findAll: () => Transaction.find().sort({ createdAt: -1 }),
  findSuccessful: () => Transaction.find({ status: 'Success' }),
  create: (data) => Transaction.create(data)
};
