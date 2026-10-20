import mongoose from 'mongoose';
import { schemaOptions } from './schemaOptions.js';
import { encrypted } from './encryptedField.js';

// An employing legal entity (subsidiary, branch or registered company) that employees belong to.
// Registration and tax numbers are identifiers; the payroll bank account is sealed with the company's key.
const legalEntitySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // short name shown in lists
    legalName: { type: String, default: '', trim: true },
    country: { type: String, default: '', trim: true, uppercase: true }, // ISO 3166 alpha-2
    registrationNumber: { type: String, default: '', trim: true },
    taxId: { type: String, default: '', trim: true },
    address: { type: String, default: '', trim: true },
    currency: { type: String, default: 'INR', uppercase: true },
    contactEmail: { type: String, default: '', trim: true, lowercase: true },
    payrollBank: { bankName: encrypted(), account: encrypted(), routing: encrypted() },
    isDefault: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
    notes: { type: String, default: '' }
  },
  schemaOptions((ret) => {
    // The account number is shown masked; the full value is only used server-side
    if (ret.payrollBank) {
      const account = ret.payrollBank.account ?? '';
      ret.payrollBank = { bankName: ret.payrollBank.bankName ?? '', accountLast4: account ? String(account).slice(-4) : '', routing: ret.payrollBank.routing ?? '', accountSet: !!account };
    }
  }, { getters: true })
);
legalEntitySchema.index({ companyId: 1, name: 1 }, { unique: true });

export const LegalEntity = mongoose.model('LegalEntity', legalEntitySchema);
