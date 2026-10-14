import mongoose from 'mongoose';
import { tenantPlugin } from '../plugins/tenant.js';
import { USER_REF } from './userScope.js';

// Must run before any model is compiled; every model imports this file first
mongoose.plugin(tenantPlugin);

export const isValidId = (id) => mongoose.isValidObjectId(id);

// Keeps the JSON shape the client expects: `id` (string) instead of `_id`, no `__v`,
// and populated virtuals (e.g. `user`, `manager`) included.
// `getters` is on for models with encrypted fields so JSON output carries the decrypted values
export const schemaOptions = (extraTransform, { getters = false } = {}) => ({
  timestamps: true,
  toJSON: {
    virtuals: true,
    getters,
    versionKey: false,
    transform: (doc, ret) => {
      delete ret._id;
      delete ret.companyId; // tenancy is internal; clients never need it
      extraTransform?.(ret);
      return ret;
    }
  }
});

// Adds a `user` virtual that resolves `userId` to the owning user when populated
export const withUserVirtual = (schema) => {
  schema.virtual('user', { ref: USER_REF, localField: 'userId', foreignField: '_id', justOne: true });
  return schema;
};

export const userRef = (required = true) => ({
  type: mongoose.Schema.Types.ObjectId,
  ref: USER_REF,
  required,
  index: true,
  default: required ? undefined : null
});
