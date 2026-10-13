import mongoose from 'mongoose';
import { Checklist, ChecklistTemplate, CHECKLIST_KINDS, TASK_OWNERS } from '../models/checklist.model.js';
import { userModel } from '../models/user.model.js';
import { notify, adminIdsFor } from '../utils/notify.js';
import { audit } from '../utils/audit.js';

const valid = (id) => mongoose.isValidObjectId(id);
const withUser = { path: 'user', select: 'name email department' };

// ---------- Templates ----------
const cleanTasks = (tasks) => {
  if (!Array.isArray(tasks) || tasks.length === 0 || tasks.length > 50) return { error: 'Add between 1 and 50 tasks.' };
  const out = [];
  for (const t of tasks) {
    const title = String(t.title || '').trim();
    if (!title) return { error: 'Every task needs a title.' };
    if (t.owner !== undefined && !TASK_OWNERS.includes(t.owner)) return { error: 'Task owner must be EMPLOYEE or HR.' };
    out.push({ title, description: String(t.description || '').trim(), owner: t.owner || 'EMPLOYEE', requiresAck: !!t.requiresAck });
  }
  return { value: out };
};

export const listTemplates = async (req, res) => {
  res.json(await ChecklistTemplate.find().sort({ kind: 1, name: 1 }));
};

export const createTemplate = async (req, res) => {
  const { name, kind } = req.body;
  if (!String(name || '').trim() || !CHECKLIST_KINDS.includes(kind)) {
    return res.status(400).json({ message: 'A name and a kind (ONBOARDING or OFFBOARDING) are required.' });
  }
  const tasks = cleanTasks(req.body.tasks);
  if (tasks.error) return res.status(400).json({ message: tasks.error });
  const template = await ChecklistTemplate.create({ name: name.trim(), kind, tasks: tasks.value });
  await audit(req, { action: 'checklist.template_create', entity: 'checklist_template', entityId: template.id, summary: `Created ${kind.toLowerCase()} template ${template.name}` });
  res.status(201).json(template);
};

export const updateTemplate = async (req, res) => {
  const template = valid(req.params.id) ? await ChecklistTemplate.findById(req.params.id) : null;
  if (!template) return res.status(404).json({ message: 'Template not found.' });
  if (req.body.name !== undefined) {
    if (!String(req.body.name).trim()) return res.status(400).json({ message: 'Name is required.' });
    template.name = String(req.body.name).trim();
  }
  if (req.body.tasks !== undefined) {
    const tasks = cleanTasks(req.body.tasks);
    if (tasks.error) return res.status(400).json({ message: tasks.error });
    template.tasks = tasks.value;
  }
  await template.save();
  res.json(template);
};

export const deleteTemplate = async (req, res) => {
  const result = valid(req.params.id) ? await ChecklistTemplate.deleteOne({ _id: req.params.id }) : { deletedCount: 0 };
  if (!result.deletedCount) return res.status(404).json({ message: 'Template not found.' });
  res.json({ message: 'Template deleted.' });
};

// ---------- Assigned checklists ----------
export const assign = async (req, res) => {
  const { userId, templateId } = req.body;
  const [user, template] = await Promise.all([
    valid(userId) ? userModel.findById(userId) : null,
    valid(templateId) ? ChecklistTemplate.findById(templateId) : null
  ]);
  if (!user) return res.status(404).json({ message: 'Employee not found.' });
  if (!template) return res.status(404).json({ message: 'Template not found.' });

  const checklist = await Checklist.create({
    userId: user.id,
    kind: template.kind,
    title: `${template.name} - ${user.name}`,
    templateId: template.id,
    tasks: template.tasks.map((t) => ({ title: t.title, description: t.description, owner: t.owner, requiresAck: t.requiresAck })),
    createdById: req.user.id
  });
  await notify(user.id, {
    type: 'checklist', title: `${template.kind === 'ONBOARDING' ? 'Onboarding' : 'Offboarding'} checklist assigned`,
    body: template.name, link: '/onboarding'
  });
  await audit(req, { action: 'checklist.assign', entity: 'checklist', entityId: checklist.id, summary: `Assigned "${template.name}" to ${user.name}` });
  res.status(201).json(await checklist.populate(withUser));
};

export const listAll = async (req, res) => {
  const filter = {};
  if (valid(req.query.userId)) filter.userId = req.query.userId;
  if (CHECKLIST_KINDS.includes(req.query.kind)) filter.kind = req.query.kind;
  res.json(await Checklist.find(filter).sort({ createdAt: -1 }).populate(withUser));
};

export const deleteChecklist = async (req, res) => {
  const result = valid(req.params.id) ? await Checklist.deleteOne({ _id: req.params.id }) : { deletedCount: 0 };
  if (!result.deletedCount) return res.status(404).json({ message: 'Checklist not found.' });
  res.json({ message: 'Checklist deleted.' });
};

export const listMine = async (req, res) => {
  res.json(await Checklist.find({ userId: req.user.id }).sort({ createdAt: -1 }));
};

// Toggles one task. Employees may only touch their own EMPLOYEE tasks; HR/admins may touch any.
const setTask = async (req, res, { asAdmin }) => {
  const filter = { _id: req.params.id, ...(asAdmin ? {} : { userId: req.user.id }) };
  const checklist = valid(req.params.id) ? await Checklist.findOne(filter).populate(withUser) : null;
  const task = checklist?.tasks.id(req.params.taskId);
  if (!checklist || !task) return res.status(404).json({ message: 'Task not found.' });
  if (!asAdmin && task.owner !== 'EMPLOYEE') return res.status(403).json({ message: 'This task is completed by HR.' });

  const done = req.body.done === undefined ? true : !!req.body.done;
  if (done && task.requiresAck && !req.body.acknowledged) {
    return res.status(400).json({ message: 'You must acknowledge this item to complete it.' });
  }
  task.done = done;
  task.acknowledged = done && task.requiresAck ? true : false;
  task.doneAt = done ? new Date() : null;
  task.doneById = done ? req.user.id : null;

  const wasComplete = !!checklist.completedAt;
  const nowComplete = checklist.tasks.every((t) => t.done);
  checklist.completedAt = nowComplete ? (checklist.completedAt || new Date()) : null;
  await checklist.save();

  if (nowComplete && !wasComplete) {
    await notify(await adminIdsFor('onboarding'), {
      type: 'checklist', title: `${checklist.user?.name ?? 'An employee'} completed "${checklist.title}"`, link: '/onboarding', email: false
    });
  }
  res.json(checklist);
};

export const completeTaskAsEmployee = (req, res) => setTask(req, res, { asAdmin: false });
export const completeTaskAsAdmin = (req, res) => setTask(req, res, { asAdmin: true });
