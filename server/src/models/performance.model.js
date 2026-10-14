import mongoose from 'mongoose';
import { schemaOptions, userRef, withUserVirtual } from './schemaOptions.js';
import { USER_REF } from './userScope.js';

const cycleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },
    status: { type: String, enum: ['Open', 'Closed'], default: 'Open' }
  },
  schemaOptions()
);
export const ReviewCycle = mongoose.model('ReviewCycle', cycleSchema);

const rating = { type: Number, min: 1, max: 5, default: null };

const reviewSchema = withUserVirtual(
  new mongoose.Schema(
    {
      cycleId: { type: mongoose.Schema.Types.ObjectId, ref: 'ReviewCycle', required: true, index: true },
      userId: userRef(),
      reviewerId: userRef(false),
      selfRating: rating,
      selfComment: { type: String, default: '' },
      managerRating: rating,
      managerComment: { type: String, default: '' },
      status: { type: String, enum: ['Pending Self', 'Pending Manager', 'Completed'], default: 'Pending Self' }
    },
    schemaOptions()
  )
);
reviewSchema.index({ cycleId: 1, userId: 1 }, { unique: true });
reviewSchema.virtual('reviewer', { ref: USER_REF, localField: 'reviewerId', foreignField: '_id', justOne: true });
reviewSchema.virtual('cycle', { ref: 'ReviewCycle', localField: 'cycleId', foreignField: '_id', justOne: true });
export const Review = mongoose.model('Review', reviewSchema);

const keyResultSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    target: { type: Number, required: true, min: 0 },
    current: { type: Number, default: 0, min: 0 },
    unit: { type: String, default: '' }
  },
  { _id: true }
);

const goalSchema = withUserVirtual(
  new mongoose.Schema(
    {
      userId: userRef(),
      cycleId: { type: mongoose.Schema.Types.ObjectId, ref: 'ReviewCycle', default: null },
      title: { type: String, required: true, trim: true },
      description: { type: String, default: '' },
      dueDate: { type: String, default: null },
      keyResults: { type: [keyResultSchema], default: [] },
      status: { type: String, enum: ['On Track', 'At Risk', 'Done'], default: 'On Track' }
    },
    schemaOptions()
  )
);
// 0-100: mean completion of the key results (capped per result)
goalSchema.virtual('progress').get(function () {
  if (!this.keyResults.length) return this.status === 'Done' ? 100 : 0;
  const mean = this.keyResults.reduce((sum, kr) => sum + (kr.target > 0 ? Math.min(kr.current / kr.target, 1) : 1), 0) / this.keyResults.length;
  return Math.round(mean * 100);
});
export const Goal = mongoose.model('Goal', goalSchema);
