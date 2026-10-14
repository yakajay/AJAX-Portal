import { contractorModel } from './models/contractor.model.js';
import { Notification } from './models/notification.model.js';
import { User } from './models/user.model.js';
import { notify, adminIdsFor } from './utils/notify.js';
import { sendMail } from './utils/mailer.js';
import { addDays, isoDate } from './utils/dates.js';
import { logger } from './utils/logger.js';
import { env } from './config/env.js';
import { forEachActiveCompany } from './utils/tenants.js';

// Alerts admins once per contractor/end-date when a contract is within the alert window
export const contractAlerts = async (now = new Date()) => {
  const today = isoDate(now);
  const ending = await contractorModel.findEndingBy(today, addDays(today, env.jobs.contractAlertDays));
  const admins = await adminIdsFor('outsourcing', 'read');
  let sent = 0;
  for (const c of ending) {
    sent += await notify(admins, {
      type: 'contract',
      title: `Contract ending soon: ${c.name}`,
      body: `${c.company} - ends ${c.contractEnd}`,
      link: '/outsourcing',
      dedupeKey: `contract:${c.id}:${c.contractEnd}`
    });
  }
  return sent;
};

// Emails one summary of everything unread and not yet digested to users who opted in
export const sendDigests = async () => {
  const users = await User.find({ locked: false, 'preferences.emailDigest': true }).select('email name');
  let sent = 0;
  for (const user of users) {
    const items = await Notification.find({ userId: user.id, readAt: null, digestedAt: null }).sort({ createdAt: -1 }).limit(25);
    if (!items.length) continue;
    const lines = items.map((n) => `- ${n.title}${n.body ? ` (${n.body})` : ''}`).join('\n');
    try {
      await sendMail({
        to: user.email,
        subject: `${env.appName} - ${items.length} unread notification${items.length === 1 ? '' : 's'}`,
        text: `Hi ${user.name},\n\nHere is what you missed:\n\n${lines}\n\nYou can turn this digest off under Preferences.`
      });
      await Notification.updateMany({ _id: { $in: items.map((n) => n._id) } }, { digestedAt: new Date() });
      sent++;
    } catch (error) {
      logger.warn({ err: error, to: user.email }, 'digest email failed');
    }
  }
  return sent;
};

// Both jobs work on one company at a time; these run them for every active company
const sum = (counts) => counts.reduce((a, b) => a + b, 0);
export const contractAlertsAllCompanies = async (now) => sum(await forEachActiveCompany(() => contractAlerts(now)));
export const sendDigestsAllCompanies = async () => sum(await forEachActiveCompany(() => sendDigests()));

let lastDigestDay = null;

// Runs hourly; the digest goes out once a day at DIGEST_HOUR (server time)
export const runScheduled = async (now = new Date()) => {
  const results = { contractAlerts: await contractAlertsAllCompanies(now), digests: 0 };
  const day = isoDate(now);
  if (now.getHours() === env.jobs.digestHour && lastDigestDay !== day) {
    lastDigestDay = day;
    results.digests = await sendDigestsAllCompanies();
  }
  return results;
};

export const startJobs = () => {
  if (!env.jobs.enabled) return () => {};
  const tick = () => runScheduled().then((r) => logger.info(r, 'scheduled jobs ran'), (e) => logger.error({ err: e }, 'scheduled jobs failed'));
  setTimeout(tick, 15_000).unref();
  const timer = setInterval(tick, 60 * 60 * 1000);
  timer.unref();
  return () => clearInterval(timer);
};
