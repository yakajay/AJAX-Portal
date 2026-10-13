import { ticketModel, TICKET_PRIORITIES } from '../../models/ticket.model.js';
import { notify, adminIdsFor } from '../../utils/notify.js';

export const createTicket = async (req, res) => {
  const { subject, category, message, priority } = req.body;
  if (!subject?.trim() || !message?.trim()) {
    return res.status(400).json({ message: 'Subject and message are required.' });
  }
  if (priority !== undefined && !TICKET_PRIORITIES.includes(priority)) {
    return res.status(400).json({ message: `Priority must be one of ${TICKET_PRIORITIES.join(', ')}.` });
  }
  const ticket = await ticketModel.create({
    userId: req.user.id, subject: subject.trim(), category, message: message.trim(), priority: priority || 'Medium'
  });
  await notify(await adminIdsFor('support'), {
    type: 'ticket', title: `New ${ticket.priority} ticket: ${ticket.subject}`, body: `From ${req.user.name}`, link: '/support'
  });
  res.status(201).json(await ticketModel.populate(ticket));
};

export const myTickets = async (req, res) => {
  res.json(await ticketModel.findByUser(req.user.id));
};

const ownTicket = async (req) => {
  const ticket = await ticketModel.findById(req.params.id);
  return ticket && String(ticket.userId?._id ?? ticket.userId) === req.user.id ? ticket : null;
};

export const getTicket = async (req, res) => {
  const ticket = await ownTicket(req);
  if (!ticket) return res.status(404).json({ message: 'Ticket not found.' });
  res.json(ticket);
};

export const addComment = async (req, res) => {
  const message = String(req.body.message || '').trim();
  if (!message) return res.status(400).json({ message: 'Write a message first.' });
  const ticket = await ownTicket(req);
  if (!ticket) return res.status(404).json({ message: 'Ticket not found.' });

  ticket.comments.push({ authorId: req.user.id, authorName: req.user.name, authorRole: req.user.role, message });
  // Replying to a closed ticket re-opens it (and restarts its SLA clock is intentionally not done)
  if (ticket.status === 'Closed') { ticket.status = 'Open'; ticket.closedAt = null; }
  await ticket.save();

  const recipients = ticket.assigneeId ? [ticket.assigneeId._id ?? ticket.assigneeId] : await adminIdsFor('support');
  await notify(recipients, { type: 'ticket', title: `${req.user.name} replied on "${ticket.subject}"`, body: message.slice(0, 140), link: '/support' });
  res.status(201).json(ticket);
};
