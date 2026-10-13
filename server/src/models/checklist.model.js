import mongoose from 'mongoose';
import { schemaOptions, userRef, withUserVirtual } from './schemaOptions.js';

export const CHECKLIST_KINDS = ['ONBOARDING', 'OFFBOARDING'];
export const TASK_OWNERS = ['EMPLOYEE', 'HR'];

const templateTaskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    owner: { type: String, enum: TASK_OWNERS, default: 'EMPLOYEE' },
    requiresAck: { type: Boolean, default: false } // e.g. a policy the employee must acknowledge
  },
  { _id: false }
);

const templateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    kind: { type: String, enum: CHECKLIST_KINDS, required: true },
    tasks: { type: [templateTaskSchema], default: [] }
  },
  schemaOptions()
);
export const ChecklistTemplate = mongoose.model('ChecklistTemplate', templateSchema);

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, default: '' },
    owner: { type: String, enum: TASK_OWNERS, default: 'EMPLOYEE' },
    requiresAck: { type: Boolean, default: false },
    done: { type: Boolean, default: false },
    acknowledged: { type: Boolean, default: false },
    doneAt: { type: Date, default: null },
    doneById: userRef(false)
  },
  { toJSON: { virtuals: true, versionKey: false, transform: (doc, ret) => { delete ret._id; } } }
);

const checklistSchema = withUserVirtual(
  new mongoose.Schema(
    {
      userId: userRef(),
      kind: { type: String, enum: CHECKLIST_KINDS, required: true },
      title: { type: String, required: true },
      templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChecklistTemplate', default: null },
      tasks: { type: [taskSchema], default: [] },
      createdById: userRef(false),
      completedAt: { type: Date, default: null }
    },
    schemaOptions()
  )
);
checklistSchema.virtual('status').get(function () {
  return this.tasks.length > 0 && this.tasks.every((t) => t.done) ? 'Completed' : 'In Progress';
});
checklistSchema.virtual('progress').get(function () {
  return this.tasks.length ? Math.round((this.tasks.filter((t) => t.done).length / this.tasks.length) * 100) : 0;
});
export const Checklist = mongoose.model('Checklist', checklistSchema);
