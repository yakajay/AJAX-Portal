import { transactionModel } from '../../models/transaction.model.js';
import { todayLabel } from '../../utils/format.js';

export const listTransactions = async (req, res) => {
  res.json(await transactionModel.findAll());
};

export const run = async (req, res) => {
  const { company, amount, method } = req.body;
  const parsed = parseFloat(amount);
  if (!company || !(parsed > 0)) {
    return res.status(400).json({ message: 'Company and a positive amount are required.' });
  }
  const transaction = await transactionModel.create({
    recipient: company,
    date: todayLabel(),
    amount: `$${parsed.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
    status: 'Success',
    method: method || 'Bank Transfer'
  });
  res.status(201).json(transaction);
};
