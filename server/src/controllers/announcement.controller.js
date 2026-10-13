import mongoose from 'mongoose';
import { Announcement } from '../models/announcement.model.js';
import { User } from '../models/user.model.js';
import { notify } from '../utils/notify.js';
import { audit } from '../utils/audit.js';
import { isoDate } from '../utils/dates.js';

const live = () => ({ $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] });
const withAuthor = { path: 'author', select: 'name' };

export const listActive = async (req, res) => {
  res.json(await Announcement.find(live()).sort({ pinned: -1, createdAt: -1 }).limit(50).populate(withAuthor));
};

export const listAll = async (req, res) => {
  res.json(await Announcement.find().sort({ createdAt: -1 }).limit(200).populate(withAuthor));
};

const parseExpiry = (value) => {
  if (value === null || value === '' || value === undefined) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

export const create = async (req, res) => {
  const { title, body, pinned } = req.body;
  if (!String(title || '').trim() || !String(body || '').trim()) {
    return res.status(400).json({ message: 'Title and message are required.' });
  }
  const expiresAt = parseExpiry(req.body.expiresAt);
  if (expiresAt === undefined) return res.status(400).json({ message: 'expiresAt must be a valid date.' });

  const announcement = await Announcement.create({
    title: title.trim(), body: body.trim(), pinned: !!pinned, expiresAt, authorId: req.user.id
  });
  const everyone = await User.find({ locked: false }).select('_id');
  await notify(everyone.map((u) => u.id).filter((id) => id !== req.user.id), {
    type: 'announcement', title: announcement.title, body: announcement.body.slice(0, 140), link: '/', email: false
  });
  await audit(req, { action: 'announcement.create', entity: 'announcement', entityId: announcement.id, summary: `Posted announcement "${announcement.title}"` });
  res.status(201).json(await announcement.populate(withAuthor));
};

export const update = async (req, res) => {
  const a = mongoose.isValidObjectId(req.params.id) ? await Announcement.findById(req.params.id) : null;
  if (!a) return res.status(404).json({ message: 'Announcement not found.' });
  if (req.body.title !== undefined) a.title = String(req.body.title).trim();
  if (req.body.body !== undefined) a.body = String(req.body.body).trim();
  if (req.body.pinned !== undefined) a.pinned = !!req.body.pinned;
  if (req.body.expiresAt !== undefined) {
    const expiresAt = parseExpiry(req.body.expiresAt);
    if (expiresAt === undefined) return res.status(400).json({ message: 'expiresAt must be a valid date.' });
    a.expiresAt = expiresAt;
  }
  if (!a.title || !a.body) return res.status(400).json({ message: 'Title and message are required.' });
  await a.save();
  await audit(req, { action: 'announcement.update', entity: 'announcement', entityId: a.id, summary: `Edited announcement "${a.title}"` });
  res.json(await a.populate(withAuthor));
};

export const remove = async (req, res) => {
  const a = mongoose.isValidObjectId(req.params.id) ? await Announcement.findById(req.params.id) : null;
  if (!a) return res.status(404).json({ message: 'Announcement not found.' });
  await a.deleteOne();
  await audit(req, { action: 'announcement.delete', entity: 'announcement', entityId: a.id, summary: `Deleted announcement "${a.title}"` });
  res.json({ message: 'Announcement deleted.' });
};

// Days from `today` until the next occurrence of the month/day in `iso` (0 = today); null if invalid
export const daysUntilNext = (iso, today = new Date()) => {
  if (!iso) return null;
  const [, m, d] = iso.split('-').map(Number);
  if (!m || !d) return null;
  const start = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  let next = Date.UTC(today.getUTCFullYear(), m - 1, d);
  // Feb 29 falls back to Mar 1 in non-leap years via Date.UTC overflow
  if (next < start) next = Date.UTC(today.getUTCFullYear() + 1, m - 1, d);
  return Math.round((next - start) / 86400000);
};

// Dashboard feed: announcements + upcoming birthdays and work anniversaries (next 14 days)
export const feed = async (req, res) => {
  const horizon = 14;
  const today = new Date();
  const [announcements, users] = await Promise.all([
    Announcement.find(live()).sort({ pinned: -1, createdAt: -1 }).limit(5).populate(withAuthor),
    User.find({ locked: false }).select('name department dateOfBirth joinDate')
  ]);

  const upcoming = [];
  for (const u of users) {
    const dob = daysUntilNext(u.dateOfBirth, today);
    if (dob !== null && dob <= horizon) upcoming.push({ kind: 'birthday', userId: u.id, name: u.name, department: u.department, inDays: dob, date: u.dateOfBirth.slice(5) });
    const ann = daysUntilNext(u.joinDate, today);
    if (ann !== null && ann <= horizon) {
      const anniversaryYear = Number(isoDate(new Date(today.getTime() + ann * 86400000)).slice(0, 4));
      const years = anniversaryYear - Number(u.joinDate.slice(0, 4));
      if (years > 0) upcoming.push({ kind: 'anniversary', userId: u.id, name: u.name, department: u.department, inDays: ann, date: u.joinDate, years });
    }
  }
  upcoming.sort((a, b) => a.inDays - b.inDays || a.name.localeCompare(b.name));
  res.json({ announcements, upcoming });
};
