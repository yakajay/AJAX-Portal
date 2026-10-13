import mongoose from 'mongoose';
import { schemaOptions, userRef, withUserVirtual } from './schemaOptions.js';

const money = { type: Number, default: 0, min: 0 };

// Monthly salary components for one employee
const salarySchema = withUserVirtual(
  new mongoose.Schema(
    {
      userId: { ...userRef(), unique: true },
      currency: { type: String, default: 'USD' },
      basic: money,
      hra: money,
      allowances: money,
      pfPercent: { type: Number, default: 12, min: 0, max: 100 }, // of basic
      taxPercent: { type: Number, default: 10, min: 0, max: 100 }, // of gross
      otherDeductions: money
    },
    schemaOptions()
  )
);

export const SalaryStructure = mongoose.model('SalaryStructure', salarySchema);

const payslipSchema = withUserVirtual(
  new mongoose.Schema(
    {
      userId: userRef(),
      month: { type: String, required: true }, // YYYY-MM
      currency: { type: String, default: 'USD' },
      earnings: { basic: Number, hra: Number, allowances: Number },
      deductions: { pf: Number, tax: Number, other: Number },
      gross: { type: Number, required: true },
      totalDeductions: { type: Number, required: true },
      net: { type: Number, required: true },
      workingDays: { type: Number, required: true },
      paidDays: { type: Number, required: true },
      unpaidLeaveDays: { type: Number, default: 0 },
      status: { type: String, enum: ['Generated', 'Paid'], default: 'Generated' },
      generatedById: userRef(false),
      paidAt: { type: Date, default: null }
    },
    schemaOptions()
  )
);
payslipSchema.index({ userId: 1, month: 1 }, { unique: true });

export const Payslip = mongoose.model('Payslip', payslipSchema);
