import mongoose from 'mongoose';
import { Department } from '../models/department.model.js';
import { User, userModel } from '../models/user.model.js';
import { audit } from '../utils/audit.js';

// --- Read (every role) ---
export const listDepartments = async (req, res) => {
  const [departments, counts] = await Promise.all([
    Department.find().sort({ name: 1 }).populate({ path: 'head', select: 'name email' }),
    User.aggregate([{ $group: { _id: '$department', count: { $sum: 1 } } }])
  ]);
  const byName = Object.fromEntries(counts.map((c) => [c._id, c.count]));
  res.json(departments.map((d) => ({ ...d.toJSON(), memberCount: byName[d.name] || 0 })));
};

// Reporting tree built from managerId links. People without a manager are roots.
export const orgChart = async (req, res) => {
  const users = await userModel.findDirectory();
  const nodes = new Map(
    users.map((u) => [u.id, { id: u.id, name: u.name, email: u.email, department: u.department, designation: u.designation, reports: [] }])
  );
  const roots = [];
  for (const u of users) {
    const parent = u.managerId ? nodes.get(String(u.managerId)) : null;
    // The managerId chain could in theory loop; treat anyone whose parent chain returns to them as a root
    (parent && !isAncestor(nodes, u.id, String(u.managerId), users) ? parent.reports : roots).push(nodes.get(u.id));
  }
  res.json(roots);
};

const isAncestor = (nodes, candidateId, startId, users) => {
  const managerOf = Object.fromEntries(users.map((u) => [u.id, u.managerId ? String(u.managerId) : null]));
  const seen = new Set();
  for (let cur = startId; cur; cur = managerOf[cur]) {
    if (cur === candidateId) return true;
    if (seen.has(cur)) return false;
    seen.add(cur);
  }
  return false;
};

// --- Admin CRUD ---
const cleanHead = async (headId) => {
  if (!headId) return null;
  if (!mongoose.isValidObjectId(headId) || !(await userModel.findById(headId))) throw Object.assign(new Error('Head not found.'), { status: 400 });
  return headId;
};

export const createDepartment = async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ message: 'Department name is required.' });
  let headId;
  try { headId = await cleanHead(req.body.headId); } catch (e) { return res.status(e.status || 500).json({ message: e.message }); }
  const department = await Department.create({ name, description: req.body.description || '', headId });
  await audit(req, { action: 'department.create', entity: 'department', entityId: department.id, summary: `Created department ${name}` });
  res.status(201).json(await department.populate({ path: 'head', select: 'name email' }));
};

export const updateDepartment = async (req, res) => {
  const department = mongoose.isValidObjectId(req.params.id) ? await Department.findById(req.params.id) : null;
  if (!department) return res.status(404).json({ message: 'Department not found.' });
  const previousName = department.name;
  if (req.body.name !== undefined) {
    const name = String(req.body.name).trim();
    if (!name) return res.status(400).json({ message: 'Department name is required.' });
    department.name = name;
  }
  if (req.body.description !== undefined) department.description = String(req.body.description);
  if (req.body.headId !== undefined) {
    try { department.headId = await cleanHead(req.body.headId); } catch (e) { return res.status(e.status || 500).json({ message: e.message }); }
  }
  await department.save();
  // Users store the department by name, so keep them in step with a rename
  if (department.name !== previousName) await User.updateMany({ department: previousName }, { department: department.name });
  await audit(req, { action: 'department.update', entity: 'department', entityId: department.id, summary: `Updated department ${department.name}` });
  res.json(await department.populate({ path: 'head', select: 'name email' }));
};

export const deleteDepartment = async (req, res) => {
  const department = mongoose.isValidObjectId(req.params.id) ? await Department.findById(req.params.id) : null;
  if (!department) return res.status(404).json({ message: 'Department not found.' });
  const members = await User.countDocuments({ department: department.name });
  if (members > 0) {
    return res.status(409).json({ message: `${members} employee(s) still belong to this department. Move them first.` });
  }
  await department.deleteOne();
  await audit(req, { action: 'department.delete', entity: 'department', entityId: department.id, summary: `Deleted department ${department.name}` });
  res.json({ message: 'Department deleted.' });
};
