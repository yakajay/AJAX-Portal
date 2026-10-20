import mongoose from 'mongoose';
import { schemaOptions, userRef } from './schemaOptions.js';

// A filing or payment obligation (configured in the company's compliance settings) marked done for one period
const complianceFilingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    period: { type: String, required: true }, // 2026-09, 2026-Q3 or 2025
    completedById: userRef(false),
    completedByName: { type: String, default: '' },
    completedAt: { type: Date, default: Date.now },
    note: { type: String, default: '' }
  },
  schemaOptions()
);
complianceFilingSchema.index({ companyId: 1, key: 1, period: 1 }, { unique: true });

export const ComplianceFiling = mongoose.model('ComplianceFiling', complianceFilingSchema);
