import mongoose from 'mongoose';
import { schemaOptions } from './schemaOptions.js';

const auditSchema = new mongoose.Schema(
  {
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    actorName: { type: String, default: 'System' },
    actorRole: { type: String, default: '' },
    action: { type: String, required: true, index: true }, // e.g. user.create, leave.approve
    entity: { type: String, required: true, index: true }, // user, leave, payroll, ...
    entityId: { type: String, default: null },
    summary: { type: String, required: true },
    meta: { type: mongoose.Schema.Types.Mixed, default: null },
    ip: { type: String, default: '' }
  },
  schemaOptions()
);
auditSchema.index({ createdAt: -1 });

export const AuditLog = mongoose.model('AuditLog', auditSchema);
