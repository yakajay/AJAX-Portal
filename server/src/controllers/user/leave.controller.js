import { leaveModel } from '../../models/leave.model.js';
import { holidayModel } from '../../models/holiday.model.js';
import { userModel } from '../../models/user.model.js';
import { policyFor, leaveBalances } from '../../utils/leavePolicy.js';
import { isValidIso, isValidMonth, monthBounds, workingDays, labelToIso, overlaps, isoDate, currentMonth } from '../../utils/dates.js';
import { holidaySet, decideLeave } from '../../services/leave.service.js';
import { notify, adminIdsFor } from '../../utils/notify.js';

export const listMine = async (req, res) => {
  res.json(await leaveModel.findByUser(req.user.id));
};

export const balance = async (req, res) => {
  const leaves = await leaveModel.findByUser(req.user.id);
  res.json(leaveBalances(leaves, isoDate(new Date()), { joinDate: req.user.joinDate, policy: policyFor(req.company) }));
};

export const apply = async (req, res) => {
  const { type, startDate, endDate, reason, halfDay, halfDayPart } = req.body;
  const policy = policyFor(req.company);
  if (!Object.hasOwn(policy, type) || !isValidIso(startDate) || !isValidIso(endDate) || endDate < startDate) {
    return res.status(400).json({ message: 'A valid leave type and start/end dates are required.' });
  }
  if (halfDay && startDate !== endDate) {
    return res.status(400).json({ message: 'A half day can only be requested for a single date.' });
  }
  if (halfDay && !['First Half', 'Second Half'].includes(halfDayPart)) {
    return res.status(400).json({ message: 'Choose First Half or Second Half for a half-day leave.' });
  }

  // The server is the source of truth for the length: weekdays only, public holidays excluded
  const holidays = await holidaySet();
  const counted = workingDays(startDate, endDate, holidays);
  if (counted === 0) {
    return res.status(400).json({ message: 'The selected dates contain no working days.' });
  }
  const days = halfDay ? 0.5 : counted;

  const mine = await leaveModel.findByUser(req.user.id);
  const clash = mine.find(
    (l) => ['Pending', 'Approved'].includes(l.status) && overlaps(startDate, endDate, l.startDate, l.endDate) &&
      !(halfDay && l.halfDay && l.halfDayPart !== halfDayPart)
  );
  if (clash) {
    return res.status(409).json({ message: `This overlaps your ${clash.status.toLowerCase()} leave from ${clash.startDate} to ${clash.endDate}.` });
  }

  if (policy[type].yearly !== null) {
    const balanceFor = leaveBalances(mine, startDate, { joinDate: req.user.joinDate, policy }).find((b) => b.type === type);
    if (days > balanceFor.remaining) {
      return res.status(400).json({
        message: `Not enough ${type} balance: ${balanceFor.remaining} day(s) available, ${days} requested.`
      });
    }
  }

  // userId always comes from the token, never the request body; status always starts as Pending
  const leave = await leaveModel.create({
    userId: req.user.id,
    type,
    startDate,
    endDate,
    days,
    halfDay: !!halfDay,
    halfDayPart: halfDay ? halfDayPart : null,
    reason: reason ? String(reason).trim() : null,
    approverId: req.user.managerId || null
  });

  const reviewers = req.user.managerId ? [req.user.managerId] : await adminIdsFor('leave');
  await notify(reviewers.filter((id) => String(id) !== req.user.id), {
    type: 'leave',
    title: `${req.user.name} requested ${days} day(s) of ${type}`,
    body: `${startDate} to ${endDate}`,
    link: '/leave'
  });
  res.status(201).json(leave);
};

export const cancel = async (req, res) => {
  const leave = await leaveModel.findById(req.params.id);
  if (!leave || String(leave.userId) !== req.user.id) return res.status(404).json({ message: 'Leave request not found.' });
  if (leave.status !== 'Pending') {
    return res.status(409).json({ message: 'Only pending requests can be cancelled.' });
  }
  res.json(await leaveModel.setStatus(leave.id, 'Cancelled'));
};

// Who is out in a month: approved and pending leave for everyone, plus public holidays.
// Reasons are deliberately not exposed.
// The company's leave types, for the application form
export const types = async (req, res) => {
  res.json(Object.entries(policyFor(req.company)).map(([type, p]) => ({ type, ...p })));
};

export const calendar = async (req, res) => {
  const month = req.query.month || currentMonth();
  if (!isValidMonth(month)) return res.status(400).json({ message: 'month must look like 2026-10.' });
  const { start, end } = monthBounds(month);

  const everyone = await userModel.findDirectory();
  const ids = everyone.map((u) => u.id);
  const leaves = await leaveModel.findByUserInRange(ids, start, end);
  const byId = Object.fromEntries(everyone.map((u) => [u.id, u]));
  const holidays = (await holidayModel.findAll())
    .map((h) => ({ date: labelToIso(h.date), name: h.name }))
    .filter((h) => h.date && h.date >= start && h.date <= end);

  res.json({
    month,
    leaves: leaves.map((l) => ({
      id: l.id,
      userId: String(l.userId),
      name: byId[String(l.userId)]?.name ?? 'Unknown',
      department: byId[String(l.userId)]?.department ?? '',
      type: l.type,
      startDate: l.startDate,
      endDate: l.endDate,
      days: l.days,
      halfDay: l.halfDay,
      status: l.status
    })),
    holidays
  });
};

// --- Manager approvals: a manager reviews requests from their direct reports ---
export const teamLeaves = async (req, res) => {
  res.json(await leaveModel.findByApprover(req.user.id));
};

export const teamDecision = async (req, res) => {
  const { status, note } = req.body;
  if (!['Approved', 'Rejected'].includes(status)) {
    return res.status(400).json({ message: 'Status must be Approved or Rejected.' });
  }
  const leave = await leaveModel.findById(req.params.id);
  if (!leave || String(leave.approverId) !== req.user.id) {
    return res.status(404).json({ message: 'Leave request not found.' });
  }
  if (leave.status !== 'Pending') return res.status(409).json({ message: 'This request was already reviewed.' });
  res.json(await decideLeave(req, leave, status, note));
};
