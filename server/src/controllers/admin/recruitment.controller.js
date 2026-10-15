import crypto from 'node:crypto';
import { Candidate, JobOpening, STAGES, recruitmentModel } from '../../models/recruitment.model.js';
import { userModel } from '../../models/user.model.js';
import { hashPassword } from '../../utils/password.js';
import { isValidIso } from '../../utils/dates.js';
import { audit } from '../../utils/audit.js';
import { assertSeatAvailable } from '../../services/company.service.js';
import { isAllowedUpload, safeFileName } from '../../utils/documentFiles.js';
import { isValidPhone, EMPLOYEE_ID_RE, EMAIL_RE } from './user.controller.js';

const clean = (v, max) => String(v ?? '').trim().slice(0, max);
const duplicate = (err) => err?.code === 11000;

// --- Job openings ---
const readJob = (body, partial = false) => {
  const data = {};
  if (!partial || body.title !== undefined) {
    data.title = clean(body.title, 100);
    if (!data.title) return { error: 'A job title is required.' };
  }
  if (body.department !== undefined) data.department = clean(body.department, 60);
  if (body.location !== undefined) data.location = clean(body.location, 80);
  if (body.description !== undefined) data.description = clean(body.description, 5000);
  if (body.openings !== undefined) {
    const n = Number(body.openings);
    if (!Number.isInteger(n) || n < 1 || n > 500) return { error: 'Openings must be a whole number from 1 to 500.' };
    data.openings = n;
  }
  if (body.status !== undefined) {
    if (!['Open', 'Closed'].includes(body.status)) return { error: 'Status must be Open or Closed.' };
    data.status = body.status;
  }
  return { data };
};

export const listJobs = async (req, res) => {
  const [jobs, counts] = await Promise.all([
    recruitmentModel.findJobs(),
    Candidate.aggregate([{ $group: { _id: { jobId: '$jobId', stage: '$stage' }, n: { $sum: 1 } } }])
  ]);
  const byJob = new Map();
  for (const c of counts) {
    const key = String(c._id.jobId);
    byJob.set(key, { ...(byJob.get(key) ?? {}), [c._id.stage]: c.n });
  }
  res.json(jobs.map((j) => ({ ...j.toJSON(), stageCounts: byJob.get(j.id) ?? {} })));
};

export const createJob = async (req, res) => {
  const { data, error } = readJob(req.body);
  if (error) return res.status(400).json({ message: error });
  const job = await JobOpening.create({ ...data, createdById: req.user.id });
  await audit(req, { action: 'recruitment.job_create', entity: 'job', entityId: job.id, summary: `Opened the position "${job.title}"` });
  res.status(201).json(job);
};

export const updateJob = async (req, res) => {
  const job = await recruitmentModel.findJob(req.params.id);
  if (!job) return res.status(404).json({ message: 'Job not found.' });
  const { data, error } = readJob(req.body, true);
  if (error) return res.status(400).json({ message: error });
  Object.assign(job, data);
  await job.save();
  await audit(req, { action: 'recruitment.job_update', entity: 'job', entityId: job.id, summary: `Updated the position "${job.title}"`, meta: data });
  res.json(job);
};

// --- Candidates ---
export const listCandidates = async (req, res) => {
  const filter = {};
  if (req.query.jobId) filter.jobId = req.query.jobId;
  if (req.query.stage) {
    if (!STAGES.includes(req.query.stage)) return res.status(400).json({ message: 'Unknown stage.' });
    filter.stage = req.query.stage;
  }
  if (filter.jobId && !(await recruitmentModel.findJob(filter.jobId))) return res.status(404).json({ message: 'Job not found.' });
  res.json(await recruitmentModel.findCandidates(filter));
};

const readCandidate = (body) => {
  const name = clean(body.name, 100);
  const email = clean(body.email, 120).toLowerCase();
  const phone = clean(body.phone, 30);
  if (!name) return { error: 'A candidate name is required.' };
  if (!EMAIL_RE.test(email)) return { error: 'A valid email is required.' };
  if (phone && !isValidPhone(phone)) return { error: 'Phone number must be 7-15 digits.' };
  return { data: { name, email, phone, source: clean(body.source, 60) } };
};

export const createCandidate = async (req, res) => {
  const job = await recruitmentModel.findJob(req.body.jobId);
  if (!job) return res.status(404).json({ message: 'Job not found.' });
  if (job.status !== 'Open') return res.status(409).json({ message: 'That position is closed.' });
  const { data, error } = readCandidate(req.body);
  if (error) return res.status(400).json({ message: error });
  try {
    const candidate = await Candidate.create({ ...data, jobId: job.id });
    await audit(req, { action: 'recruitment.candidate_add', entity: 'candidate', entityId: candidate.id, summary: `Added ${candidate.name} for "${job.title}"` });
    res.status(201).json(candidate);
  } catch (err) {
    if (duplicate(err)) return res.status(409).json({ message: `${data.email} has already applied for this position.` });
    throw err;
  }
};

export const updateCandidate = async (req, res) => {
  const candidate = await recruitmentModel.findCandidate(req.params.id);
  if (!candidate) return res.status(404).json({ message: 'Candidate not found.' });
  const { data, error } = readCandidate({ ...candidate.toJSON(), ...req.body });
  if (error) return res.status(400).json({ message: error });
  try {
    Object.assign(candidate, data);
    await candidate.save();
  } catch (err) {
    if (duplicate(err)) return res.status(409).json({ message: `${data.email} has already applied for this position.` });
    throw err;
  }
  res.json(candidate);
};

// Moves a candidate along the pipeline. "Hired" is only reached through the hire step, which creates the account.
export const setStage = async (req, res) => {
  const candidate = await recruitmentModel.findCandidate(req.params.id);
  if (!candidate) return res.status(404).json({ message: 'Candidate not found.' });
  const { stage } = req.body;
  if (!STAGES.includes(stage) || stage === 'Hired') {
    return res.status(400).json({ message: `Stage must be one of: ${STAGES.filter((s) => s !== 'Hired').join(', ')}. Use "Hire" to complete a hire.` });
  }
  if (candidate.stage === 'Hired') return res.status(409).json({ message: 'This candidate has already been hired.' });
  const from = candidate.stage;
  candidate.stage = stage;
  candidate.rejectionReason = stage === 'Rejected' ? clean(req.body.reason, 300) : '';
  await candidate.save();
  await audit(req, { action: 'recruitment.stage', entity: 'candidate', entityId: candidate.id, summary: `Moved ${candidate.name} from ${from} to ${stage}` });
  res.json(candidate);
};

export const addNote = async (req, res) => {
  const candidate = await recruitmentModel.findCandidate(req.params.id);
  if (!candidate) return res.status(404).json({ message: 'Candidate not found.' });
  const text = clean(req.body.text, 2000);
  if (!text) return res.status(400).json({ message: 'Write a note first.' });
  candidate.notes.push({ authorId: req.user.id, authorName: req.user.name, text });
  await candidate.save();
  res.status(201).json(candidate);
};

// PUT .../resume - the request body is the file (PDF or DOCX); X-File-Name carries its name
const RESUME_TYPES = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
export const RESUME_CONTENT_TYPES = RESUME_TYPES;
export const uploadResume = async (req, res) => {
  const candidate = await recruitmentModel.findCandidate(req.params.id);
  if (!candidate) return res.status(404).json({ message: 'Candidate not found.' });
  const body = req.body;
  if (!Buffer.isBuffer(body) || !body.length) return res.status(400).json({ message: 'Send the resume as the request body (PDF or DOCX, up to 5 MB).' });
  const contentType = String(req.headers['content-type'] || '').split(';')[0].trim();
  if (!isAllowedUpload(contentType, body)) return res.status(415).json({ message: 'That file does not look like a valid PDF or DOCX.' });
  candidate.resumeName = safeFileName(req.headers['x-file-name'], contentType, candidate.name);
  candidate.resumeType = contentType;
  candidate.resumeSize = body.length;
  candidate.resumeData = body;
  await candidate.save();
  res.json(candidate);
};

export const downloadResume = async (req, res) => {
  const candidate = await recruitmentModel.findCandidateWithResume(req.params.id);
  if (!candidate?.resumeData?.length) return res.status(404).json({ message: 'No resume on file.' });
  res.set({
    'Content-Type': candidate.resumeType,
    'Content-Disposition': `attachment; filename="${candidate.resumeName}"`,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store'
  });
  res.send(candidate.resumeData);
};

// Turns a candidate into an employee: creates the account (a regular employee with a temporary password)
export const hire = async (req, res) => {
  const candidate = await recruitmentModel.findCandidate(req.params.id);
  if (!candidate) return res.status(404).json({ message: 'Candidate not found.' });
  if (candidate.stage === 'Hired') return res.status(409).json({ message: 'This candidate has already been hired.' });
  if (candidate.stage === 'Rejected') return res.status(409).json({ message: 'Move the candidate out of Rejected before hiring.' });
  const job = await recruitmentModel.findJob(candidate.jobId);

  const employeeId = clean(req.body.employeeId, 32).toUpperCase();
  const phone = clean(req.body.phone, 30) || candidate.phone;
  const joinDate = req.body.joinDate || null;
  if (!EMPLOYEE_ID_RE.test(employeeId)) return res.status(400).json({ message: 'An Employee ID is required (letters, numbers and . _ - /).' });
  if (!phone || !isValidPhone(phone)) return res.status(400).json({ message: 'A valid phone number is required.' });
  if (joinDate && !isValidIso(joinDate)) return res.status(400).json({ message: 'Join date must be YYYY-MM-DD.' });
  if (await userModel.findByEmail(candidate.email)) return res.status(409).json({ message: `${candidate.email} already has an account.` });
  if (await userModel.findByEmployeeId(employeeId)) return res.status(409).json({ message: `Employee ID ${employeeId} is already in use.` });

  await assertSeatAvailable(req.company);
  const tempPassword = crypto.randomBytes(6).toString('base64url');
  const user = await userModel.create({
    email: candidate.email, name: candidate.name, phone, employeeId, password: hashPassword(tempPassword), role: 'USER', permissions: 'read',
    department: clean(req.body.department, 60) || job?.department || 'Engineering',
    designation: clean(req.body.designation, 60) || job?.title || '',
    joinDate
  });
  candidate.stage = 'Hired';
  candidate.hiredUserId = user.id;
  candidate.rejectionReason = '';
  await candidate.save();
  await audit(req, { action: 'recruitment.hire', entity: 'candidate', entityId: candidate.id, summary: `Hired ${candidate.name} (${employeeId})${job ? ` as ${job.title}` : ''}` });
  res.status(201).json({ candidate, user: user.toJSON(), tempPassword });
};
