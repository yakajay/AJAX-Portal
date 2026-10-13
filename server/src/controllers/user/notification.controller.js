import mongoose from 'mongoose';
import { Notification } from '../../models/notification.model.js';

export const list = async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 30, 1), 100);
  const filter = { userId: req.user.id, ...(req.query.unread === '1' ? { readAt: null } : {}) };
  const [items, unread] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).limit(limit),
    Notification.countDocuments({ userId: req.user.id, readAt: null })
  ]);
  res.json({ items, unread });
};

export const markRead = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Notification not found.' });
  const result = await Notification.updateOne({ _id: req.params.id, userId: req.user.id, readAt: null }, { readAt: new Date() });
  if (!result.matchedCount && !(await Notification.exists({ _id: req.params.id, userId: req.user.id }))) {
    return res.status(404).json({ message: 'Notification not found.' });
  }
  res.json({ message: 'Marked as read.' });
};

export const markAllRead = async (req, res) => {
  const result = await Notification.updateMany({ userId: req.user.id, readAt: null }, { readAt: new Date() });
  res.json({ updated: result.modifiedCount });
};

export const remove = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Notification not found.' });
  const result = await Notification.deleteOne({ _id: req.params.id, userId: req.user.id });
  if (!result.deletedCount) return res.status(404).json({ message: 'Notification not found.' });
  res.json({ message: 'Deleted.' });
};
