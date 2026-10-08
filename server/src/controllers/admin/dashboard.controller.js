import { userModel } from '../../models/user.model.js';
import { leaveModel } from '../../models/leave.model.js';
import { contractorModel } from '../../models/contractor.model.js';
import { transactionModel } from '../../models/transaction.model.js';

export const stats = async (req, res) => {
  const now = new Date();
  const month = now.toLocaleDateString('en-US', { month: 'short' });
  const year = String(now.getFullYear());

  const [workforce, pendingLeaves, activePartners, transactions] = await Promise.all([
    userModel.count(),
    leaveModel.countByStatus('Pending'),
    contractorModel.countActive(),
    transactionModel.findSuccessful()
  ]);
  const monthlySpend = transactions
    .filter(t => t.date.startsWith(month) && t.date.endsWith(year))
    .reduce((sum, t) => sum + (parseFloat(t.amount.replace(/[^0-9.]/g, '')) || 0), 0);

  res.json({ workforce, pendingLeaves, activePartners, monthlySpend });
};
