import { ticketModel } from '../../models/ticket.model.js';

export const createTicket = async (req, res) => {
  const { subject, category, message } = req.body;
  if (!subject?.trim() || !message?.trim()) {
    return res.status(400).json({ message: 'Subject and message are required.' });
  }
  const ticket = await ticketModel.create({
    userId: req.user.id, subject: subject.trim(), category, message: message.trim()
  });
  res.status(201).json(ticket);
};

export const myTickets = async (req, res) => {
  res.json(await ticketModel.findByUser(req.user.id));
};
