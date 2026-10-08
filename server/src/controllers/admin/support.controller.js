import { ticketModel } from '../../models/ticket.model.js';

export const listTickets = async (req, res) => {
  res.json(await ticketModel.findAll());
};

export const setTicketStatus = async (req, res) => {
  const { status } = req.body;
  if (!['Open', 'In Progress', 'Closed'].includes(status)) {
    return res.status(400).json({ message: 'Status must be Open, In Progress or Closed.' });
  }
  res.json(await ticketModel.setStatus(req.params.id, status));
};
