import mongoose from 'mongoose';
import { schemaOptions } from './schemaOptions.js';

export const STAGES = ['Applied', 'Screening', 'Interview', 'Offer', 'Hired', 'Rejected'];

const jobSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    department: { type: String, default: '', trim: true },
    location: { type: String, default: '', trim: true },
    description: { type: String, default: '' },
    openings: { type: Number, default: 1, min: 1 },
    status: { type: String, enum: ['Open', 'Closed'], default: 'Open' },
    createdById: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
  },
  schemaOptions()
);

export const JobOpening = mongoose.model('JobOpening', jobSchema);

const noteSchema = new mongoose.Schema(
  {
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    authorName: { type: String, default: '' },
    text: { type: String, required: true }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const candidateSchema = new mongoose.Schema(
  {
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'JobOpening', required: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, default: '', trim: true },
    source: { type: String, default: '', trim: true }, // referral, job board, agency...
    stage: { type: String, enum: STAGES, default: 'Applied' },
    rejectionReason: { type: String, default: '' },
    notes: { type: [noteSchema], default: [] },
    hiredUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // The resume; bytes are never part of normal queries or JSON
    resumeName: { type: String, default: '' },
    resumeType: { type: String, default: '' },
    resumeSize: { type: Number, default: 0 },
    resumeData: { type: Buffer, select: false, default: undefined }
  },
  schemaOptions((ret) => {
    delete ret.resumeData;
    ret.hasResume = ret.resumeSize > 0;
  })
);
candidateSchema.index({ companyId: 1, jobId: 1, email: 1 }, { unique: true });
candidateSchema.virtual('job', { ref: 'JobOpening', localField: 'jobId', foreignField: '_id', justOne: true });

export const Candidate = mongoose.model('Candidate', candidateSchema);

export const recruitmentModel = {
  findJobs: () => JobOpening.find().sort({ createdAt: -1 }),
  findJob: (id) => (mongoose.isValidObjectId(id) ? JobOpening.findById(id) : null),
  findCandidates: (filter = {}) => Candidate.find(filter).sort({ createdAt: -1 }),
  findCandidate: (id) => (mongoose.isValidObjectId(id) ? Candidate.findById(id) : null),
  findCandidateWithResume: (id) => (mongoose.isValidObjectId(id) ? Candidate.findById(id).select('+resumeData') : null)
};
