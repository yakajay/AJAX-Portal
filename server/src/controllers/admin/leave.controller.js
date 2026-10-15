import { leaveModel } from '../../models/leave.model.js';
import { decideLeave } from '../../services/leave.service.js';
import { Company } from '../../models/company.model.js';
import { policyFor, validatePolicy } from '../../utils/leavePolicy.js';
import { audit } from '../../utils/audit.js';

const asRows = (policy) => Object.entries(policy).map(([type, p]) => ({ type, ...p }));

export const getPolicy = async (req, res) => {
  res.json(asRows(policyFor(req.company)));
};

// Replaces the company's leave types. Existing requests keep their type name; balances only list current types.
export const updatePolicy = async (req, res) => {
  const { policy, error } = validatePolicy(req.body.policy);
  if (error) return res.status(400).json({ message: error });
  const company = await Company.findById(req.company.id);
  company.settings.leavePolicy = policy;
  await company.save();
  await audit(req, { action: 'leave.policy', entity: 'company', entityId: company.id, summary: 'Updated the leave policy', meta: policy.map((p) => p.type) });
  res.json(asRows(policyFor(company)));
};

export const listAll = async (req, res) => {
  res.json(await leaveModel.findAll());
};

export const setStatus = async (req, res) => {
  const { status, note } = req.body;
  if (!['Pending', 'Approved', 'Rejected'].includes(status)) {
    return res.status(400).json({ message: 'Status must be Pending, Approved or Rejected.' });
  }
  const target = await leaveModel.findById(req.params.id);
  if (!target) return res.status(404).json({ message: 'Leave request not found.' });
  if (String(target.userId) === req.user.id) {
    return res.status(403).json({ message: 'You cannot review your own leave request.' });
  }
  if (target.status === 'Cancelled') {
    return res.status(409).json({ message: 'This request was cancelled by the employee.' });
  }
  res.json(await decideLeave(req, target, status, note));
};
