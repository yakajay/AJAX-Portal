import mongoose from 'mongoose';
import { schemaOptions } from './schemaOptions.js';

export const DELETE_STATUSES = ['Pending', 'Approved', 'Rejected'];
// What can be deleted through a request, and which admin module guards raising it
export const DELETE_TARGETS = {
  company: { label: 'Company account', module: null },
  user: { label: 'Employee', module: 'users' },
  department: { label: 'Department', module: 'org' },
  announcement: { label: 'Announcement', module: 'announcements' },
  checklistTemplate: { label: 'Checklist template', module: 'onboarding' },
  checklist: { label: 'Checklist', module: 'onboarding' },
  holiday: { label: 'Public holiday', module: 'hr' }
};

const deleteRequestSchema = new mongoose.Schema(
  {
    targetType: { type: String, enum: Object.keys(DELETE_TARGETS), required: true },
    targetId: { type: String, required: true },
    targetLabel: { type: String, default: '' }, // shown in lists even after the record is gone
    reason: { type: String, default: '', trim: true },
    status: { type: String, enum: DELETE_STATUSES, default: 'Pending', index: true },
    requestedById: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    requestedByName: { type: String, default: '' },
    decidedByName: { type: String, default: '' },
    decidedAt: { type: Date, default: null },
    decisionNote: { type: String, default: '', trim: true },
    executedAt: { type: Date, default: null }
  },
  schemaOptions()
);
deleteRequestSchema.index({ companyId: 1, targetType: 1, targetId: 1, status: 1 });

export const DeleteRequest = mongoose.model('DeleteRequest', deleteRequestSchema);
