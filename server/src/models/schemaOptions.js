import mongoose from 'mongoose';

export const isValidId = (id) => mongoose.isValidObjectId(id);

// Keeps the JSON shape the client expects: `id` (string) instead of `_id`, no `__v`,
// and populated virtuals (e.g. `user`, `manager`) included.
export const schemaOptions = (extraTransform) => ({
  timestamps: true,
  toJSON: {
    virtuals: true,
    versionKey: false,
    transform: (doc, ret) => {
      delete ret._id;
      extraTransform?.(ret);
      return ret;
    }
  }
});

// Adds a `user` virtual that resolves `userId` to the owning user when populated
export const withUserVirtual = (schema) => {
  schema.virtual('user', { ref: 'User', localField: 'userId', foreignField: '_id', justOne: true });
  return schema;
};

export const userRef = (required = true) => ({
  type: mongoose.Schema.Types.ObjectId,
  ref: 'User',
  required,
  index: true,
  default: required ? undefined : null
});
