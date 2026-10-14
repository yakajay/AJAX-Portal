import mongoose from 'mongoose';
import { schemaOptions, userRef, withUserVirtual } from './schemaOptions.js';
import { encrypted } from './encryptedField.js';

// Pay figures are sealed with the company's key; the database never holds them in the clear
const money = encrypted('number', { default: 0 });

// Monthly salary components for one employee
const salarySchema = withUserVirtual(
  new mongoose.Schema(
    {
      userId: { ...userRef(), unique: true },
      currency: { type: String, default: 'INR' },
      basic: money,
      hra: money,
      allowances: money,
      pfPercent: encrypted('number', { default: 12 }), // of basic
      taxPercent: encrypted('number', { default: 10 }), // of gross
      otherDeductions: money
    },
    schemaOptions(null, { getters: true })
  )
);

export const SalaryStructure = mongoose.model('SalaryStructure', salarySchema);

const payslipSchema = withUserVirtual(
  new mongoose.Schema(
    {
      userId: userRef(),
      month: { type: String, required: true }, // YYYY-MM
      currency: { type: String, default: 'INR' },
      earnings: { basic: encrypted('number'), hra: encrypted('number'), allowances: encrypted('number') },
      deductions: { pf: encrypted('number'), tax: encrypted('number'), other: encrypted('number') },
      gross: encrypted('number', { required: true }),
      totalDeductions: encrypted('number', { required: true }),
      net: encrypted('number', { required: true }),
      workingDays: { type: Number, required: true },
      paidDays: { type: Number, required: true },
      unpaidLeaveDays: { type: Number, default: 0 },
      status: { type: String, enum: ['Generated', 'Paid'], default: 'Generated' },
      generatedById: userRef(false),
      paidAt: { type: Date, default: null }
    },
    schemaOptions(null, { getters: true })
  )
);
payslipSchema.index({ userId: 1, month: 1 }, { unique: true });

export const Payslip = mongoose.model('Payslip', payslipSchema);
