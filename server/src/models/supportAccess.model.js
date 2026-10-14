import mongoose from 'mongoose';
import { schemaOptions } from './schemaOptions.js';

// A company admin's time-boxed permission for the platform's Super Admin to see this company's sensitive
// data unmasked. It expires on its own; every use is counted here and logged in the company's audit log.
const supportAccessSchema = new mongoose.Schema(
  {
    grantedById: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    grantedByName: { type: String, default: '' },
    reason: { type: String, default: '', trim: true },
    expiresAt: { type: Date, required: true, index: true },
    revokedAt: { type: Date, default: null },
    views: { type: Number, default: 0 },
    lastViewedAt: { type: Date, default: null }
  },
  schemaOptions()
);

supportAccessSchema.virtual('active').get(function active() {
  return !this.revokedAt && this.expiresAt > new Date();
});

export const SupportAccess = mongoose.model('SupportAccess', supportAccessSchema);
export const activeSupportAccess = () =>
  SupportAccess.findOne({ revokedAt: null, expiresAt: { $gt: new Date() } }).sort({ expiresAt: -1 });
