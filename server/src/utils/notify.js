import { Notification } from '../models/notification.model.js';
import { User } from '../models/user.model.js';
import { sendMail } from './mailer.js';
import { logger } from './logger.js';
import { ADMIN_ROLES } from './format.js';
import { hasPermission } from './permissions.js';
import { env } from '../config/env.js';

// Creates in-app notifications and, for users who left email notifications on, a short email.
// Failures are logged, never thrown - a notification must not break the action that triggered it.
export const notify = async (userIds, { type, title, body = '', link = '', dedupeKey = null, email = true }) => {
  try {
    const ids = [...new Set((Array.isArray(userIds) ? userIds : [userIds]).filter(Boolean).map(String))];
    if (!ids.length) return 0;

    let targets = ids;
    if (dedupeKey) {
      const existing = await Notification.find({ userId: { $in: ids }, dedupeKey }).select('userId');
      const seen = new Set(existing.map((n) => String(n.userId)));
      targets = ids.filter((id) => !seen.has(id));
      if (!targets.length) return 0;
    }

    await Notification.insertMany(targets.map((userId) => ({ userId, type, title, body, link, dedupeKey })));

    if (email) {
      const users = await User.find({ _id: { $in: targets }, locked: false, 'preferences.emailNotifications': { $ne: false } }).select('email name');
      await Promise.allSettled(
        users.map((u) =>
          sendMail({
            to: u.email,
            subject: `${env.appName} - ${title}`,
            text: `Hi ${u.name},\n\n${title}${body ? `\n${body}` : ''}\n\nOpen the portal${link ? ` (${link})` : ''} for details.`
          }).catch((error) => logger.warn({ err: error, to: u.email }, 'notification email failed'))
        )
      );
    }
    return targets.length;
  } catch (error) {
    logger.error({ err: error, type }, 'notify failed');
    return 0;
  }
};

// Admins who may act on a module (for "needs your attention" alerts)
export const adminIdsFor = async (module, action = 'write') => {
  const admins = await User.find({ role: { $in: ADMIN_ROLES }, locked: false });
  return admins.filter((a) => hasPermission(a, module, action)).map((a) => a.id);
};

// Who should be asked to review something an employee submitted: their manager, else the admins
export const reviewersFor = async (user, module) =>
  user.managerId ? [String(user.managerId)] : adminIdsFor(module);
