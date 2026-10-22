import mongoose from 'mongoose';

// Lets several server copies share scheduled work: whoever inserts the key first does the job, the others skip it.
const jobRunSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    // Old claims clean themselves up after a week
    createdAt: { type: Date, default: Date.now, index: { expireAfterSeconds: 7 * 24 * 3600 } }
  },
  { versionKey: false }
);
jobRunSchema.tenantExempt = true;

const JobRun = mongoose.model('JobRun', jobRunSchema);

/** True for exactly one caller per key, even across processes. */
export const claimJob = async (...parts) => {
  await JobRun.init(); // the unique index is what makes the claim exclusive, so make sure it exists first
  try {
    await JobRun.create({ key: parts.join(':') });
    return true;
  } catch (error) {
    if (error.code === 11000) return false;
    throw error;
  }
};
