import mongoose from 'mongoose';
import { schemaOptions, userRef, withUserVirtual } from './schemaOptions.js';

const ticketSchema = withUserVirtual(
  new mongoose.Schema(
    {
      userId: userRef(false),
      subject: { type: String, required: true, trim: true },
      category: { type: String, default: 'General Inquiry' },
      message: { type: String, required: true },
      status: { type: String, enum: ['Open', 'In Progress', 'Closed'], default: 'Open' }
    },
    schemaOptions()
  )
);

export const SupportTicket = mongoose.model('SupportTicket', ticketSchema);

export const ticketModel = {
  findAll: () => SupportTicket.find().sort({ createdAt: -1 }).populate({ path: 'user', select: 'name email' }),
  findByUser: (userId) => SupportTicket.find({ userId }).sort({ createdAt: -1 }),
  create: (data) => SupportTicket.create(data),
  setStatus: (id, status) =>
    SupportTicket.findByIdAndUpdate(id, { status }, { new: true }).orFail()
};
