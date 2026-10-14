import { currentCompanyId } from '../utils/tenantContext.js';
import { encryptValue, decryptValue, isSealed } from '../utils/crypto.js';

// Schema defaults skip setters, so a default has to be sealed here or it would sit in the database in the clear
const sealedDefault = (value) =>
  function sealDefault() {
    const companyId = currentCompanyId() ?? this?.companyId;
    return companyId ? encryptValue(companyId, value) : value;
  };

// Schema path definition for a value stored encrypted with its company's key. Reading the property
// returns the plain value (a number for kind 'number'); the database only ever holds ciphertext.
// Encrypted values cannot be filtered, sorted or aggregated in the database.
export const encrypted = (kind = 'string', { default: fallback, ...options } = {}) => ({
  type: String,
  ...options,
  ...(fallback !== undefined ? { default: sealedDefault(fallback) } : {}),
  set(value) {
    if (value === null || value === undefined || value === '') return value;
    // Query updates have no document, so fall back to the request's tenant
    const companyId = currentCompanyId() ?? this?.companyId;
    return encryptValue(companyId, kind === 'number' ? Number(value) : String(value));
  },
  get(value) {
    if (value === null || value === undefined) return value;
    if (!isSealed(value)) return kind === 'number' ? Number(value) : value; // legacy plaintext
    return decryptValue(this?.companyId ?? currentCompanyId(), value);
  }
});
