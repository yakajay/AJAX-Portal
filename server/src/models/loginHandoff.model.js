import mongoose from 'mongoose';

// A one-time ticket that carries a finished sign-in from the shared address (crm.<domain>) to a company's own
// address (<slug>.<domain>). Browsers keep sessions per address, so the company address trades the ticket for
// its own session. Only a hash is stored; it works once, for that company, for two minutes.
const loginHandoffSchema = new mongoose.Schema(
  {
    codeHash: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    companyId: { type: mongoose.Schema.Types.ObjectId, required: true },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
    usedAt: { type: Date, default: null }
  },
  { timestamps: true }
);
loginHandoffSchema.tenantExempt = true; // looked up before the company address knows who is arriving

export const LoginHandoff = mongoose.model('LoginHandoff', loginHandoffSchema);
