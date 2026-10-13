import mongoose from 'mongoose';
import { ReviewCycle, Review, Goal } from '../models/performance.model.js';
import { User } from '../models/user.model.js';
import { isValidIso } from '../utils/dates.js';
import { notify } from '../utils/notify.js';
import { audit } from '../utils/audit.js';

const valid = (id) => mongoose.isValidObjectId(id);
const people = [{ path: 'user', select: 'name department designation' }, { path: 'reviewer', select: 'name' }, { path: 'cycle', select: 'name status startDate endDate' }];

const parseRating = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
};

// ---------- Admin: review cycles ----------
export const listCycles = async (req, res) => {
  const cycles = await ReviewCycle.find().sort({ createdAt: -1 });
  const counts = await Review.aggregate([{ $group: { _id: { cycle: '$cycleId', status: '$status' }, n: { $sum: 1 } } }]);
  res.json(
    cycles.map((c) => {
      const mine = counts.filter((x) => String(x._id.cycle) === c.id);
      const total = mine.reduce((s, x) => s + x.n, 0);
      const completed = mine.filter((x) => x._id.status === 'Completed').reduce((s, x) => s + x.n, 0);
      return { ...c.toJSON(), total, completed };
    })
  );
};

export const createCycle = async (req, res) => {
  const { name, startDate, endDate } = req.body;
  if (!String(name || '').trim() || !isValidIso(startDate) || !isValidIso(endDate) || endDate < startDate) {
    return res.status(400).json({ message: 'A name and a valid start/end date are required.' });
  }
  const cycle = await ReviewCycle.create({ name: name.trim(), startDate, endDate });
  const users = await User.find({ locked: false });
  await Review.insertMany(users.map((u) => ({ cycleId: cycle.id, userId: u.id, reviewerId: u.managerId || null })));
  await notify(users.map((u) => u.id), {
    type: 'performance', title: `Performance review "${cycle.name}" has started`, body: 'Submit your self-assessment.', link: '/performance'
  });
  await audit(req, { action: 'performance.cycle_create', entity: 'review_cycle', entityId: cycle.id, summary: `Started review cycle ${cycle.name} for ${users.length} people` });
  res.status(201).json({ ...cycle.toJSON(), total: users.length, completed: 0 });
};

export const closeCycle = async (req, res) => {
  const cycle = valid(req.params.id) ? await ReviewCycle.findById(req.params.id) : null;
  if (!cycle) return res.status(404).json({ message: 'Review cycle not found.' });
  cycle.status = 'Closed';
  await cycle.save();
  await audit(req, { action: 'performance.cycle_close', entity: 'review_cycle', entityId: cycle.id, summary: `Closed review cycle ${cycle.name}` });
  res.json(cycle);
};

export const listReviews = async (req, res) => {
  const filter = valid(req.query.cycleId) ? { cycleId: req.query.cycleId } : {};
  res.json(await Review.find(filter).sort({ createdAt: -1 }).populate(people));
};

// ---------- Reviews: employee self-assessment & manager review ----------
export const myReviews = async (req, res) => {
  res.json(await Review.find({ userId: req.user.id }).sort({ createdAt: -1 }).populate(people));
};

export const submitSelf = async (req, res) => {
  const rating = parseRating(req.body.rating);
  if (!rating) return res.status(400).json({ message: 'Rating must be a whole number from 1 to 5.' });
  const review = valid(req.params.id) ? await Review.findOne({ _id: req.params.id, userId: req.user.id }).populate('cycle') : null;
  if (!review) return res.status(404).json({ message: 'Review not found.' });
  if (review.cycle?.status === 'Closed') return res.status(409).json({ message: 'This review cycle is closed.' });
  if (review.status === 'Completed') return res.status(409).json({ message: 'This review is already completed.' });

  review.selfRating = rating;
  review.selfComment = String(req.body.comment || '').trim().slice(0, 2000);
  review.status = 'Pending Manager';
  await review.save();
  if (review.reviewerId) {
    await notify(review.reviewerId, { type: 'performance', title: `${req.user.name} submitted a self-assessment`, link: '/performance' });
  }
  res.json(await review.populate(people));
};

export const teamReviews = async (req, res) => {
  res.json(await Review.find({ reviewerId: req.user.id }).sort({ createdAt: -1 }).populate(people));
};

const completeReview = async (req, res, review) => {
  const rating = parseRating(req.body.rating);
  if (!rating) return res.status(400).json({ message: 'Rating must be a whole number from 1 to 5.' });
  if (String(review.userId) === req.user.id) return res.status(403).json({ message: 'You cannot review yourself.' });
  if (review.status !== 'Pending Manager') {
    return res.status(409).json({ message: review.status === 'Completed' ? 'This review is already completed.' : 'The employee has not submitted a self-assessment yet.' });
  }
  if (review.cycle?.status === 'Closed') return res.status(409).json({ message: 'This review cycle is closed.' });

  review.managerRating = rating;
  review.managerComment = String(req.body.comment || '').trim().slice(0, 2000);
  review.status = 'Completed';
  review.reviewerId = review.reviewerId || req.user.id;
  await review.save();
  await notify(review.userId, { type: 'performance', title: 'Your performance review is complete', link: '/performance' });
  await audit(req, { action: 'performance.review', entity: 'review', entityId: review.id, summary: `Completed review for user ${review.userId}` });
  res.json(await review.populate(people));
};

export const submitManager = async (req, res) => {
  const review = valid(req.params.id) ? await Review.findOne({ _id: req.params.id, reviewerId: req.user.id }).populate('cycle') : null;
  if (!review) return res.status(404).json({ message: 'Review not found.' });
  return completeReview(req, res, review);
};

// An admin with performance:write can complete a review for someone without a manager
export const submitAsAdmin = async (req, res) => {
  const review = valid(req.params.id) ? await Review.findById(req.params.id).populate('cycle') : null;
  if (!review) return res.status(404).json({ message: 'Review not found.' });
  return completeReview(req, res, review);
};

// ---------- Goals / OKRs ----------
const cleanKeyResults = (input) => {
  if (!Array.isArray(input)) return { error: 'keyResults must be a list.' };
  const out = [];
  for (const kr of input.slice(0, 10)) {
    const title = String(kr.title || '').trim();
    const target = Number(kr.target);
    const current = kr.current === undefined ? 0 : Number(kr.current);
    if (!title || !Number.isFinite(target) || target < 0 || !Number.isFinite(current) || current < 0) {
      return { error: 'Each key result needs a title, a target and a current value (0 or more).' };
    }
    out.push({ ...(valid(kr.id) ? { _id: kr.id } : {}), title, target, current, unit: String(kr.unit || '').trim() });
  }
  return { value: out };
};

export const myGoals = async (req, res) => {
  res.json(await Goal.find({ userId: req.user.id }).sort({ createdAt: -1 }));
};

export const createGoal = async (req, res) => {
  const title = String(req.body.title || '').trim();
  if (!title) return res.status(400).json({ message: 'Goal title is required.' });
  if (req.body.dueDate && !isValidIso(req.body.dueDate)) return res.status(400).json({ message: 'dueDate must be a valid date.' });
  const kr = cleanKeyResults(req.body.keyResults ?? []);
  if (kr.error) return res.status(400).json({ message: kr.error });
  const goal = await Goal.create({
    userId: req.user.id, title, description: String(req.body.description || ''), dueDate: req.body.dueDate || null, keyResults: kr.value,
    cycleId: valid(req.body.cycleId) ? req.body.cycleId : null
  });
  res.status(201).json(goal);
};

export const updateGoal = async (req, res) => {
  const goal = valid(req.params.id) ? await Goal.findOne({ _id: req.params.id, userId: req.user.id }) : null;
  if (!goal) return res.status(404).json({ message: 'Goal not found.' });
  if (req.body.title !== undefined) {
    if (!String(req.body.title).trim()) return res.status(400).json({ message: 'Goal title is required.' });
    goal.title = String(req.body.title).trim();
  }
  if (req.body.description !== undefined) goal.description = String(req.body.description);
  if (req.body.dueDate !== undefined) {
    if (req.body.dueDate && !isValidIso(req.body.dueDate)) return res.status(400).json({ message: 'dueDate must be a valid date.' });
    goal.dueDate = req.body.dueDate || null;
  }
  if (req.body.keyResults !== undefined) {
    const kr = cleanKeyResults(req.body.keyResults);
    if (kr.error) return res.status(400).json({ message: kr.error });
    goal.keyResults = kr.value;
  }
  if (req.body.status !== undefined) {
    if (!['On Track', 'At Risk', 'Done'].includes(req.body.status)) return res.status(400).json({ message: 'Invalid status.' });
    goal.status = req.body.status;
  }
  if (goal.keyResults.length && goal.progress === 100) goal.status = 'Done';
  await goal.save();
  res.json(goal);
};

export const deleteGoal = async (req, res) => {
  const result = valid(req.params.id) ? await Goal.deleteOne({ _id: req.params.id, userId: req.user.id }) : { deletedCount: 0 };
  if (!result.deletedCount) return res.status(404).json({ message: 'Goal not found.' });
  res.json({ message: 'Goal deleted.' });
};

export const teamGoals = async (req, res) => {
  const reports = await User.find({ managerId: req.user.id }).select('_id');
  res.json(await Goal.find({ userId: { $in: reports.map((r) => r.id) } }).sort({ createdAt: -1 }).populate({ path: 'user', select: 'name department' }));
};
