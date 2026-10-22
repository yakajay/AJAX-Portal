import mongoose from 'mongoose';
import { AddressTicket } from '../../models/addressTicket.model.js';
import { Company } from '../../models/company.model.js';
import { runAcrossTenants } from '../../utils/tenantContext.js';
import { decideTicket } from '../../services/addressTicket.service.js';

// The platform's queue of sign-in address tickets (see models/addressTicket.model.js).
// GET /platform/address-requests?status=&companyId=
export const list = async (req, res) => {
  const filter = {};
  if (['Pending', 'Approved', 'Rejected'].includes(req.query.status)) filter.status = req.query.status;
  if (mongoose.isValidObjectId(req.query.companyId)) filter.company = req.query.companyId;
  res.json(await AddressTicket.find(filter).sort({ createdAt: -1 }).limit(300));
};

// PATCH /platform/address-requests/:id { decision: 'approve' | 'reject', note? }
export const decide = async (req, res) => {
  const ticket = mongoose.isValidObjectId(req.params.id) ? await AddressTicket.findById(req.params.id) : null;
  if (!ticket) return res.status(404).json({ message: 'Ticket not found.' });
  const company = await runAcrossTenants(() => Company.findById(ticket.company));
  if (!company || company.status === 'deleted') return res.status(409).json({ message: 'This company no longer exists.' });
  res.json(await decideTicket(req, company, ticket, req.body ?? {}));
};
