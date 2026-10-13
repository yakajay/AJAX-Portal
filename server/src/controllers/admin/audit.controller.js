import { AuditLog } from '../../models/auditLog.model.js';
import mongoose from 'mongoose';

// GET /admin/audit?entity=&action=&actorId=&q=&from=&to=&page=&limit=
export const list = async (req, res) => {
  const filter = {};
  if (typeof req.query.entity === 'string' && req.query.entity) filter.entity = req.query.entity;
  if (typeof req.query.action === 'string' && req.query.action) filter.action = req.query.action;
  if (mongoose.isValidObjectId(req.query.actorId)) filter.actorId = req.query.actorId;
  if (typeof req.query.q === 'string' && req.query.q.trim()) {
    const escaped = req.query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [{ summary: { $regex: escaped, $options: 'i' } }, { actorName: { $regex: escaped, $options: 'i' } }];
  }
  const range = {};
  if (req.query.from && !Number.isNaN(Date.parse(req.query.from))) range.$gte = new Date(req.query.from);
  if (req.query.to && !Number.isNaN(Date.parse(req.query.to))) range.$lte = new Date(req.query.to);
  if (Object.keys(range).length) filter.createdAt = range;

  const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 200);
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const [items, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    AuditLog.countDocuments(filter)
  ]);
  res.json({ items, total, page, pages: Math.max(Math.ceil(total / limit), 1) });
};
