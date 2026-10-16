import mongoose from 'mongoose';
import { Payslip } from '../../models/salary.model.js';
import { buildPayslipPdf } from '../../utils/payroll.js';
import { loadBranding } from '../../utils/letterhead.js';

export const myPayslips = async (req, res) => {
  res.json(await Payslip.find({ userId: req.user.id }).sort({ month: -1 }));
};

export const myPayslipPdf = async (req, res) => {
  const slip = mongoose.isValidObjectId(req.params.id) ? await Payslip.findOne({ _id: req.params.id, userId: req.user.id }) : null;
  if (!slip) return res.status(404).json({ message: 'Payslip not found.' });
  const { company, letterhead } = await loadBranding(req.company?.id);
  const pdf = await buildPayslipPdf(slip.toJSON(), req.user, company, letterhead);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="payslip-${slip.month}.pdf"`);
  res.send(pdf);
};
