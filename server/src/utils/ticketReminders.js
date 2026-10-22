import { SupportTicket, PRIORITY_CODE, WAITING } from '../models/ticket.model.js';
import { AddressTicket } from '../models/addressTicket.model.js';
import { User } from '../models/user.model.js';
import { sendMail } from './mailer.js';
import { adminIdsFor } from './notify.js';
import { runAsPlatform } from './tenantContext.js';
import { PLATFORM_ROLE, ADMIN_ROLES } from './format.js';
import { logger } from './logger.js';
import { env } from '../config/env.js';

// Reminders and reports for open tickets.
//   - P1 (Urgent) and P2 (High) remind every 30 minutes; P3 and P4 every hour.
//   - Each reminder goes to the person who raised the ticket and to the admins, until the ticket is closed or decided.
//   - Once a day each manager gets a report on the tickets their people are resolving.

const MIN = 60_000;
export const reminderMinutes = (priority) => (priority === 'Urgent' || priority === 'High' ? env.jobs.ticketFastMinutes : env.jobs.ticketSlowMinutes);
// One minute of slack, so a job that ticks a few seconds late does not skip a whole interval
export const reminderDue = (ticket, minutes, now) => now.getTime() - new Date(ticket.lastReminderAt ?? ticket.createdAt).getTime() >= (minutes - 1) * MIN;

const ageText = (from, now) => {
  const mins = Math.max(0, Math.round((now.getTime() - new Date(from).getTime()) / MIN));
  return mins < 90 ? `${mins} min` : mins < 2880 ? `${Math.round(mins / 60)} h` : `${Math.round(mins / 1440)} days`;
};

/** Sends one email per person, honouring "email notifications: off". Failures are logged, never thrown. */
export const emailPeople = async (people, subject, textFor) => {
  let sent = 0;
  const seen = new Set();
  for (const p of people) {
    const email = String(p?.email ?? '').toLowerCase();
    if (!email || seen.has(email) || p.locked || p.preferences?.emailNotifications === false) continue;
    seen.add(email);
    try {
      await sendMail({ to: email, subject: `${env.appName} - ${subject}`, text: textFor(p) });
      sent += 1;
    } catch (error) {
      logger.warn({ err: error, to: email }, 'ticket email failed');
    }
  }
  return sent;
};

const adminPeople = async (module) => User.find({ _id: { $in: await adminIdsFor(module, 'read') } });
const idOf = (ref) => String(ref?._id ?? ref ?? '');

// ---------------------------------------------------------------- Support tickets (run inside one company)
const supportLine = (t, now) =>
  `${PRIORITY_CODE[t.priority]} ${t.priority} · ${t.status} · ${t.assignee ? `with ${t.assignee.name}` : 'not assigned yet'} · open ${ageText(t.createdAt, now)} · SLA ${t.slaState}${t.dueAt ? ` (due ${t.dueAt.toISOString().slice(0, 16).replace('T', ' ')} UTC)` : ''}`;

/** Raised: tell every admin and Super Admin. */
export const announceNewTicket = async (ticket, raisedBy) => {
  const admins = await adminPeople('support');
  return emailPeople(admins, `New ${PRIORITY_CODE[ticket.priority]} ticket: ${ticket.subject}`, (a) =>
    `Hi ${a.name},\n\n${raisedBy.name} raised a ${PRIORITY_CODE[ticket.priority]} (${ticket.priority}) ticket.\n\nSubject: ${ticket.subject}\n${ticket.message.slice(0, 300)}\n\nSLA: ${ticket.priority} tickets should be resolved within ${Math.round((ticket.dueAt - ticket.createdAt) / 3_600_000)} h. You will get a reminder ${reminderMinutes(ticket.priority) === env.jobs.ticketFastMinutes ? 'every 30 minutes' : 'every hour'} until it is closed.\n`);
};

export const remindSupportTickets = async (now = new Date()) => {
  // Tickets waiting for the requester are left alone: the assignee already did their part
  const open = await SupportTicket.find({ status: { $nin: ['Closed', WAITING] } }).populate([{ path: 'user', select: 'name email locked preferences' }, { path: 'assignee', select: 'name email locked preferences' }]);
  const due = open.filter((t) => reminderDue(t, reminderMinutes(t.priority), now));
  if (!due.length) return 0;
  const admins = await adminPeople('support');
  let sent = 0;
  for (const t of due) {
    // Claim this reminder before sending: with several server copies, only the one whose update matches sends it
    const claimed = await SupportTicket.updateOne({ _id: t._id, status: { $nin: ['Closed', WAITING] }, lastReminderAt: t.lastReminderAt ?? null }, { lastReminderAt: now });
    if (claimed.modifiedCount !== 1) continue;
    const summary = supportLine(t, now);
    const title = `${PRIORITY_CODE[t.priority]} reminder: ${t.subject}`;
    const people = [
      ...(t.user ? [{ ...t.user.toObject(), role: 'requester' }] : []),
      ...(t.assignee ? [{ ...t.assignee.toObject(), role: 'assignee' }] : []),
      ...admins.map((a) => ({ ...a.toObject(), role: 'admin' }))
    ];
    sent += await emailPeople(people, title, (p) =>
      p.role === 'requester'
        ? `Hi ${p.name},\n\nStatus of your ticket "${t.subject}":\n${summary}\n\nReply on the ticket if anything changed. We keep reminding until it is closed.\n`
        : `Hi ${p.name},\n\nOpen ticket "${t.subject}"${t.user ? ` raised by ${t.user.name}` : ''}:\n${summary}\n`);
  }
  return sent;
};

// ---------------------------------------------------------------- Resolution report for managers (inside one company)
const OPEN_STATES = { Paused: 0, 'On Track': 0, 'At Risk': 1, Breached: 2 };

/** Open tickets grouped by the person resolving them. The unassigned ones are listed under `assignee: null`. */
export const buildSupportReport = async (now = new Date()) => {
  const open = await SupportTicket.find({ status: { $ne: 'Closed' } }).sort({ createdAt: 1 })
    .populate([{ path: 'user', select: 'name' }, { path: 'assignee', select: 'name email managerId locked preferences' }]);
  const groups = new Map();
  for (const t of open) {
    const key = idOf(t.assignee) || 'unassigned';
    if (!groups.has(key)) groups.set(key, { assignee: t.assignee ?? null, tickets: [] });
    groups.get(key).tickets.push(t);
  }
  return {
    generatedAt: now,
    groups: [...groups.values()].map((g) => ({
      assignee: g.assignee ? { id: g.assignee.id, name: g.assignee.name, email: g.assignee.email, managerId: g.assignee.managerId ?? null } : null,
      open: g.tickets.length,
      inProgress: g.tickets.filter((t) => t.status === 'In Progress').length,
      atRisk: g.tickets.filter((t) => t.slaState === 'At Risk').length,
      breached: g.tickets.filter((t) => t.slaState === 'Breached').length,
      p1p2: g.tickets.filter((t) => t.priority === 'Urgent' || t.priority === 'High').length,
      tickets: g.tickets
        .map((t) => ({ id: t.id, subject: t.subject, priority: t.priority, code: PRIORITY_CODE[t.priority], status: t.status, slaState: t.slaState, raisedBy: t.user?.name ?? '', ageMinutes: Math.round((now.getTime() - t.createdAt.getTime()) / MIN), dueAt: t.dueAt }))
        .sort((a, b) => OPEN_STATES[b.slaState] - OPEN_STATES[a.slaState] || a.code.localeCompare(b.code))
    }))
  };
};

const section = (g, now) =>
  `${g.assignee ? g.assignee.name : 'Not assigned to anyone'}: ${g.open} open (${g.p1p2} P1/P2), ${g.breached} breached, ${g.atRisk} at risk\n` +
  g.tickets.slice(0, 25).map((t) => `  - [${t.code}] ${t.subject} · ${t.status} · SLA ${t.slaState} · open ${ageText(now.getTime() - t.ageMinutes * MIN, now)}${t.raisedBy ? ` · from ${t.raisedBy}` : ''}`).join('\n') +
  (g.tickets.length > 25 ? `\n  …and ${g.tickets.length - 25} more` : '');

/** Emails each manager the open tickets of the people who report to them; unassigned tickets go to the admins. */
export const sendSupportReports = async (now = new Date()) => {
  const report = await buildSupportReport(now);
  if (!report.groups.length) return 0;
  const supers = await User.find({ role: 'SUPER_ADMIN', locked: false });
  const byManager = new Map(); // managerId -> sections
  const add = (id, g) => byManager.set(id, [...(byManager.get(id) ?? []), g]);
  const unassigned = [];
  for (const g of report.groups) {
    if (!g.assignee) { unassigned.push(g); continue; }
    if (g.assignee.managerId) add(String(g.assignee.managerId), g);
    else supers.forEach((s) => add(s.id, g)); // no manager on record: the Super Admins see it
  }
  let sent = 0;
  const managers = await User.find({ _id: { $in: [...byManager.keys()] }, locked: false });
  for (const m of managers) {
    const groups = byManager.get(m.id);
    sent += await emailPeople([m], `Ticket resolution report (${groups.reduce((n, g) => n + g.open, 0)} open)`, (p) =>
      `Hi ${p.name},\n\nOpen tickets for the people who report to you, as of ${now.toISOString().slice(0, 16).replace('T', ' ')} UTC:\n\n${groups.map((g) => section(g, now)).join('\n\n')}\n`);
  }
  if (unassigned.length) {
    const admins = (await User.find({ role: { $in: ADMIN_ROLES }, locked: false }));
    sent += await emailPeople(admins, 'Unassigned tickets need an owner', (p) =>
      `Hi ${p.name},\n\nThese open tickets have nobody resolving them yet:\n\n${unassigned.map((g) => section(g, now)).join('\n\n')}\n`);
  }
  return sent;
};

// ---------------------------------------------------------------- Address tickets (platform side)
const platformStaff = () => runAsPlatform(() => User.find({ role: PLATFORM_ROLE, locked: false }));
const canDecide = (u) => (u.platformRole ?? 'super') !== 'viewer';

/** Raised: tell every Portal Admin and Super Admin. */
export const announceAddressTicket = async (ticket) => {
  const staff = (await platformStaff()).filter(canDecide);
  return emailPeople(staff, `New address ticket ${ticket.ticketNo}: ${ticket.companyName}`, (p) =>
    `Hi ${p.name},\n\n${ticket.requestedBy.name} (${ticket.companyName}) asked to ${ticket.action} their sign-in address.\n\nReason: ${ticket.reason}\n\nDecide it under Support & activity → Address tickets. You will be reminded every hour until it is decided.\n`);
};

export const remindAddressTickets = async (now = new Date()) => {
  const pending = (await AddressTicket.find({ status: 'Pending' })).filter((t) => reminderDue(t, env.jobs.ticketSlowMinutes, now));
  if (!pending.length) return 0;
  const staff = (await platformStaff()).filter(canDecide);
  let sent = 0;
  for (const t of pending) {
    const claimed = await AddressTicket.updateOne({ _id: t._id, status: 'Pending', lastReminderAt: t.lastReminderAt ?? null }, { lastReminderAt: now });
    if (claimed.modifiedCount !== 1) continue;
    const line = `${t.ticketNo} · ${t.companyName} · ${t.action} · waiting ${ageText(t.createdAt, now)}`;
    const people = [{ name: t.requestedBy.name, email: t.requestedBy.email, role: 'requester' }, ...staff.map((s) => ({ ...s.toObject(), role: 'staff' }))];
    sent += await emailPeople(people, `Reminder ${t.ticketNo}: sign-in address request`, (p) =>
      p.role === 'requester'
        ? `Hi ${p.name},\n\nYour request ${line} is still waiting for the platform team.\n`
        : `Hi ${p.name},\n\nStill waiting for a decision: ${line}\nReason given: ${t.reason}\n`);
  }
  return sent;
};
