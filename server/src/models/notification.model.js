import mongoose from 'mongoose';
import { schemaOptions, userRef } from './schemaOptions.js';

const notificationSchema = new mongoose.Schema(
  {
    userId: userRef(),
    type: { type: String, required: true }, // leave, ticket, document, payroll, announcement, ...
    title: { type: String, required: true },
    body: { type: String, default: '' },
    link: { type: String, default: '' }, // client route, e.g. /leave
    readAt: { type: Date, default: null },
    // Prevents scheduled jobs from creating the same alert twice
    dedupeKey: { type: String, default: null },
    digestedAt: { type: Date, default: null }
  },
  schemaOptions()
);
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } });

export const Notification = mongoose.model('Notification', notificationSchema);
