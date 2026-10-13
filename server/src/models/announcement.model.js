import mongoose from 'mongoose';
import { schemaOptions, userRef } from './schemaOptions.js';

const announcementSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true },
    pinned: { type: Boolean, default: false },
    authorId: userRef(false),
    expiresAt: { type: Date, default: null }
  },
  schemaOptions()
);
announcementSchema.virtual('author', { ref: 'User', localField: 'authorId', foreignField: '_id', justOne: true });

export const Announcement = mongoose.model('Announcement', announcementSchema);
