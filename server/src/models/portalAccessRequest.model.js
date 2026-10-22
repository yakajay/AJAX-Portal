import mongoose from 'mongoose';
import { schemaOptions } from './schemaOptions.js';

export const PORTAL_ROLES = { viewer: 'Portal Viewer', admin: 'Portal Admin', super: 'Portal Super Admin' };
export const REQUEST_STATUSES = ['Pending', 'Approved', 'Rejected'];

// Someone from the platform's own staff asking for a Portal account. A Portal Super Admin approves (and picks the
// role) or rejects. Platform-level: not owned by any company.
const portalAccessRequestSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    phone: { type: String, default: '', trim: true, maxlength: 40 },
    employeeId: { type: String, default: '', trim: true, maxlength: 40 },
    title: { type: String, default: '', trim: true, maxlength: 120 },
    team: { type: String, default: '', trim: true, maxlength: 60 },
    manager: { type: String, default: '', trim: true, maxlength: 120 },
    wantedRole: { type: String, enum: Object.keys(PORTAL_ROLES), default: 'admin' },
    reason: { type: String, default: '', trim: true, maxlength: 1000 },
    status: { type: String, enum: REQUEST_STATUSES, default: 'Pending', index: true },
    grantedRole: { type: String, enum: [...Object.keys(PORTAL_ROLES), null], default: null },
    note: { type: String, default: '', trim: true, maxlength: 500 },
    decidedByName: { type: String, default: '' },
    decidedAt: { type: Date, default: null }
  },
  schemaOptions()
);
portalAccessRequestSchema.tenantExempt = true;

export const PortalAccessRequest = mongoose.model('PortalAccessRequest', portalAccessRequestSchema);
