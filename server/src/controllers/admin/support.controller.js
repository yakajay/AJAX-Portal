import { ticketModel, slaDueAt, pauseSla, resumeSla, WAITING, TICKET_PRIORITIES } from '../../models/ticket.model.js';
import { userModel } from '../../models/user.model.js';
import { ADMIN_ROLES } from '../../utils/format.js';
import { notify } from '../../utils/notify.js';
import { audit } from '../../utils/audit.js';
import { buildSupportReport } from '../../utils/ticketReminders.js';
import { sendCsv } from '../../utils/csv.js';

const STATUSES = ['Open', 'In Progress', WAITING, 'Closed'];

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
  const comment = String(req.body.comment ?? '').trim();
  if (status !== undefined && !STATUSES.includes(status)) {
    return res.status(400).json({ message: `Status must be one of ${STATUSES.join(', ')}.` });
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
    ticket.dueAt = slaDueAt(ticket.createdAt, priority, ticket.pausedMs);
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
    const now = new Date();
    if (status === WAITING) {
      // Only whoever is resolving the ticket (or a Super Admin) can say they are waiting on the requester
      const owner = String(ticket.assigneeId?._id ?? ticket.assigneeId ?? '');
      if (!owner) return res.status(400).json({ message: 'Assign the ticket to someone before waiting for the requester.' });
      if (owner !== req.user.id && req.user.role !== 'SUPER_ADMIN') return res.status(403).json({ message: 'Only the person this ticket is assigned to can wait for the requester and pause reminders.' });
      if (!comment) return res.status(400).json({ message: 'Tell the requester what you need from them; it is sent with the status change.' });
      if (!ticket.userId) return res.status(400).json({ message: 'This ticket has no requester to wait for.' });
      ticket.comments.push({ authorId: req.user.id, authorName: req.user.name, authorRole: req.user.role, message: comment });
      pauseSla(ticket, now);
    } else {
      resumeSla(ticket, now);
      ticket.status = status;
    }
    ticket.closedAt = status === 'Closed' ? now : null;
    changes.push(`status ${status}`);
    if (ticket.userId) {
      await notify(ticket.userId._id ?? ticket.userId, {
        type: 'ticket', title: status === WAITING ? `Your reply is needed on "${ticket.subject}"` : `Your ticket "${ticket.subject}" is now ${status}`,
        body: status === WAITING ? comment.slice(0, 300) : '', link: '/support'
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

// GET /admin/support/report[?format=csv] - open tickets grouped by the person resolving them, with SLA state
export const resolutionReport = async (req, res) => {
  const report = await buildSupportReport();
  if (req.query.format === 'csv') {
    const rows = report.groups.flatMap((g) => g.tickets.map((t) => ({ resolver: g.assignee?.name ?? 'Unassigned', ...t })));
    return sendCsv(res, 'ticket-resolution-report.csv', rows, [
      { header: 'Resolver', value: (r) => r.resolver }, { header: 'Priority', value: (r) => r.code }, { header: 'Subject', value: (r) => r.subject },
      { header: 'Status', value: (r) => r.status }, { header: 'SLA', value: (r) => r.slaState }, { header: 'Raised by', value: (r) => r.raisedBy },
      { header: 'Open (min)', value: (r) => r.ageMinutes }
    ]);
  }
  res.json(report);
};
