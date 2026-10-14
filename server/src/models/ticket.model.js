import mongoose from 'mongoose';
import { schemaOptions, userRef, withUserVirtual } from './schemaOptions.js';
import { USER_REF } from './userScope.js';

export const TICKET_PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];
// Hours allowed to resolve a ticket, by priority
export const SLA_HOURS = { Low: 120, Medium: 48, High: 24, Urgent: 4 };

const commentSchema = new mongoose.Schema(
  {
    authorId: userRef(false),
    authorName: { type: String, default: 'Unknown' },
    authorRole: { type: String, default: 'USER' },
    message: { type: String, required: true, trim: true }
  },
  { timestamps: { createdAt: true, updatedAt: false }, toJSON: { versionKey: false, transform: (doc, ret) => { ret.id = String(ret._id); delete ret._id; } } }
);

const ticketSchema = withUserVirtual(
  new mongoose.Schema(
    {
      userId: userRef(false),
      subject: { type: String, required: true, trim: true },
      category: { type: String, default: 'General Inquiry' },
      message: { type: String, required: true },
      status: { type: String, enum: ['Open', 'In Progress', 'Closed'], default: 'Open' },
      priority: { type: String, enum: TICKET_PRIORITIES, default: 'Medium' },
      assigneeId: userRef(false),
      comments: { type: [commentSchema], default: [] },
      dueAt: { type: Date, default: null },
      closedAt: { type: Date, default: null }
    },
    schemaOptions()
  )
);
ticketSchema.virtual('assignee', { ref: USER_REF, localField: 'assigneeId', foreignField: '_id', justOne: true });

export const slaDueAt = (createdAt, priority) =>
  new Date(new Date(createdAt).getTime() + SLA_HOURS[priority] * 3600 * 1000);

// Met / Breached once closed; otherwise On Track, At Risk (< 25% of the window left) or Breached
ticketSchema.virtual('slaState').get(function () {
  if (!this.dueAt) return 'On Track';
  if (this.closedAt) return this.closedAt <= this.dueAt ? 'Met' : 'Breached';
  const now = Date.now();
  if (now > this.dueAt.getTime()) return 'Breached';
  const total = this.dueAt.getTime() - this.createdAt.getTime();
  return this.dueAt.getTime() - now < total * 0.25 ? 'At Risk' : 'On Track';
});

export const SupportTicket = mongoose.model('SupportTicket', ticketSchema);

const withPeople = [{ path: 'user', select: 'name email' }, { path: 'assignee', select: 'name email' }];

export const ticketModel = {
  findAll: (filter = {}) => SupportTicket.find(filter).sort({ createdAt: -1 }).populate(withPeople),
  findById: (id) => (mongoose.isValidObjectId(id) ? SupportTicket.findById(id).populate(withPeople) : null),
  findByUser: (userId) => SupportTicket.find({ userId }).sort({ createdAt: -1 }).populate(withPeople),
  // createdAt is set explicitly so the SLA window is measured from exactly the same instant
  create: (data) => {
    const now = new Date();
    return SupportTicket.create({ ...data, createdAt: now, dueAt: slaDueAt(now, data.priority || 'Medium') });
  },
  populate: (ticket) => ticket.populate(withPeople)
};
