import { ticketModel, slaDueAt, TICKET_PRIORITIES } from '../../models/ticket.model.js';
import { userModel } from '../../models/user.model.js';
import { ADMIN_ROLES } from '../../utils/format.js';
import { notify } from '../../utils/notify.js';
import { audit } from '../../utils/audit.js';

const STATUSES = ['Open', 'In Progress', 'Closed'];

export const listTickets = async (req, res) => {
  const filter = {};
  if (STATUSES.includes(req.query.status)) filter.status = req.query.status;
  if (TICKET_PRIORITIES.includes(req.query.priority)) filter.priority = req.query.priority;
  if (req.query.assignee === 'me') filter.assigneeId = req.user.id;
  res.json(await ticketModel.findAll(filter));
};

export const getTicket = async (req, res) => {
  const ticket = await ticketModel.findById(req.params.id);
  if (!ticket) return res.status(404).json({ message: 'Ticket not found.' });
  res.json(ticket);
};

// Update status, priority and/or assignee in one call
export const updateTicket = async (req, res) => {
  const { status, priority, assigneeId } = req.body;
  if (status !== undefined && !STATUSES.includes(status)) {
    return res.status(400).json({ message: 'Status must be Open, In Progress or Closed.' });
  }
  if (priority !== undefined && !TICKET_PRIORITIES.includes(priority)) {
    return res.status(400).json({ message: `Priority must be one of ${TICKET_PRIORITIES.join(', ')}.` });
  }
  const ticket = await ticketModel.findById(req.params.id);
  if (!ticket) return res.status(404).json({ message: 'Ticket not found.' });

  const changes = [];
  if (priority !== undefined && priority !== ticket.priority) {
    ticket.priority = priority;
    // The SLA window is measured from when the ticket was raised
    ticket.dueAt = slaDueAt(ticket.createdAt, priority);
    changes.push(`priority ${priority}`);
  }
  if (assigneeId !== undefined) {
    const assignee = assigneeId ? await userModel.findById(assigneeId) : null;
    if (assigneeId && (!assignee || !ADMIN_ROLES.includes(assignee.role))) {
      return res.status(400).json({ message: 'Tickets can only be assigned to an admin.' });
    }
    if (String(ticket.assigneeId?._id ?? ticket.assigneeId ?? '') !== String(assigneeId || '')) {
      ticket.assigneeId = assignee ? assignee.id : null;
      changes.push(assignee ? `assigned to ${assignee.name}` : 'unassigned');
      if (assignee && assignee.id !== req.user.id) {
        await notify(assignee.id, { type: 'ticket', title: `Ticket assigned to you: ${ticket.subject}`, link: '/support' });
      }
    }
  }
  if (status !== undefined && status !== ticket.status) {
    ticket.status = status;
    ticket.closedAt = status === 'Closed' ? new Date() : null;
    changes.push(`status ${status}`);
    if (ticket.userId) {
      await notify(ticket.userId._id ?? ticket.userId, {
        type: 'ticket', title: `Your ticket "${ticket.subject}" is now ${status}`, link: '/support'
      });
    }
  }
  await ticket.save();
  if (changes.length) {
    await audit(req, { action: 'ticket.update', entity: 'ticket', entityId: ticket.id, summary: `Ticket "${ticket.subject}": ${changes.join(', ')}` });
  }
  res.json(await ticketModel.findById(ticket.id));
};

// Kept for the original PUT body shape: { status }
export const setTicketStatus = updateTicket;

export const addComment = async (req, res) => {
  const message = String(req.body.message || '').trim();
  if (!message) return res.status(400).json({ message: 'Write a message first.' });
  const ticket = await ticketModel.findById(req.params.id);
  if (!ticket) return res.status(404).json({ message: 'Ticket not found.' });

  ticket.comments.push({ authorId: req.user.id, authorName: req.user.name, authorRole: req.user.role, message });
  if (ticket.status === 'Open') ticket.status = 'In Progress';
  await ticket.save();
  if (ticket.userId) {
    await notify(ticket.userId._id ?? ticket.userId, {
      type: 'ticket', title: `New reply on "${ticket.subject}"`, body: message.slice(0, 140), link: '/support'
    });
  }
  res.status(201).json(await ticketModel.findById(ticket.id));
};
