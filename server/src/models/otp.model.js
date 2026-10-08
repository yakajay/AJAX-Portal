import mongoose from 'mongoose';
import { schemaOptions } from './schemaOptions.js';

const otpSchema = new mongoose.Schema(
  {
    email: { type: String, required: true },
    purpose: { type: String, required: true }, // VERIFY_EMAIL, LOGIN, RESET_PASSWORD
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    // MongoDB removes the document automatically once this time passes
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } }
  },
  schemaOptions()
);
otpSchema.index({ email: 1, purpose: 1 });

export const Otp = mongoose.model('Otp', otpSchema);

export const otpModel = {
  latest: (email, purpose) => Otp.findOne({ email, purpose }).sort({ createdAt: -1 }),
  replace: async (email, purpose, data) => {
    await Otp.deleteMany({ email, purpose });
    return Otp.create({ email, purpose, ...data });
  },
  bumpAttempts: (id) => Otp.updateOne({ _id: id }, { $inc: { attempts: 1 } }),
  remove: (id) => Otp.deleteOne({ _id: id })
};
