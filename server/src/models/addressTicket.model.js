import mongoose from 'mongoose';
import { schemaOptions } from './schemaOptions.js';

export const ADDRESS_ACTIONS = ['enable', 'disable', 'rename'];
export const TICKET_STATUSES = ['Pending', 'Approved', 'Rejected'];

// Every change to a company's own sign-in address (<slug>.<domain>) is a numbered ticket, so it can be traced later:
// who asked, why, who approved, and what changed. Asked for by the company's admins (Pending until the platform
// decides) or made directly by the platform (recorded as Approved at once). Tickets are never edited or deleted.
const addressTicketSchema = new mongoose.Schema(
  {
    ticketNo: { type: String, required: true, unique: true },
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    companyName: { type: String, default: '' },
    action: { type: String, enum: ADDRESS_ACTIONS, required: true },
    source: { type: String, enum: ['company', 'platform'], required: true },
    status: { type: String, enum: TICKET_STATUSES, default: 'Pending', index: true },
    requestedSlug: { type: String, default: '' },
    reason: { type: String, required: true, trim: true, maxlength: 1000 },
    requestedBy: {
      id: { type: mongoose.Schema.Types.ObjectId, default: null },
      name: { type: String, default: '' },
      email: { type: String, default: '' },
      role: { type: String, default: '' }
    },
    decidedBy: { id: { type: mongoose.Schema.Types.ObjectId, default: null }, name: { type: String, default: '' } },
    decisionNote: { type: String, default: '', trim: true, maxlength: 500 },
    decidedAt: { type: Date, default: null },
    // What the company's address was before and after, filled in when the change is applied
    before: { dedicated: { type: Boolean, default: null }, slug: { type: String, default: '' } },
    after: { dedicated: { type: Boolean, default: null }, slug: { type: String, default: '' } },
    appliedAt: { type: Date, default: null },
    lastReminderAt: { type: Date, default: null }
  },
  schemaOptions()
);
addressTicketSchema.tenantExempt = true; // platform-level record; companies only ever read their own through the admin API

export const AddressTicket = mongoose.model('AddressTicket', addressTicketSchema);
