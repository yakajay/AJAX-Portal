import crypto from 'node:crypto';
import { env } from '../config/env.js';

// Envelope encryption for sensitive employee data.
//   master key (env, DATA_ENCRYPTION_KEY)  --wraps-->  one random data key per company (stored on the Company)
//   company data key                       --seals-->  individual field values (AES-256-GCM)
// A value is bound to its company (as additional authenticated data), so ciphertext copied into another
// company's document fails to decrypt. Destroying a company's wrapped key renders its data unreadable.
const PREFIX = 'enc:v1:';
const WRAP_PREFIX = 'wrap:v1:';

const seal = (key, plaintext, aad) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  if (aad) cipher.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return [iv, cipher.getAuthTag(), ct].map((b) => b.toString('base64url')).join('.');
};

const open = (key, sealed, aad) => {
  const [iv, tag, ct] = String(sealed).split('.').map((p) => Buffer.from(p, 'base64url'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  if (aad) decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
};

// --- Company data keys ---
export const generateWrappedCompanyKey = () =>
  WRAP_PREFIX + seal(env.dataEncryptionKey, crypto.randomBytes(32), 'company-key');

const unwrapCompanyKey = (wrapped) => {
  if (!String(wrapped || '').startsWith(WRAP_PREFIX)) throw new Error('Unsupported company key format.');
  return open(env.dataEncryptionKey, wrapped.slice(WRAP_PREFIX.length), 'company-key');
};

// Unwrapped keys are kept in memory so field getters/setters can stay synchronous
const keyCache = new Map();
export const primeCompanyKey = (companyId, wrapped) => {
  const id = String(companyId);
  if (!keyCache.has(id)) keyCache.set(id, unwrapCompanyKey(wrapped));
};

const keyFor = (companyId) => {
  const key = keyCache.get(String(companyId));
  if (!key) throw new Error('Company encryption key is not loaded.');
  return key;
};

// --- Field values ---
export const isSealed = (value) => typeof value === 'string' && value.startsWith(PREFIX);

export const encryptValue = (companyId, value) => {
  if (value === null || value === undefined || value === '') return value;
  if (isSealed(value)) return value;
  if (!companyId) throw new Error('Cannot encrypt without a company.');
  return PREFIX + seal(keyFor(companyId), Buffer.from(JSON.stringify(value)), String(companyId));
};

export const decryptValue = (companyId, value) => {
  if (!isSealed(value)) return value;
  return JSON.parse(open(keyFor(companyId), value.slice(PREFIX.length), String(companyId)).toString());
};
