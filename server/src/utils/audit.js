import { AuditLog } from '../models/auditLog.model.js';
import { logger } from './logger.js';

// Records who did what. Never throws: a failed audit write must not fail the request itself.
// `companyId` is only needed when the platform acts on a company: the entry is then also visible in that company's own log.
export const audit = async (req, { action, entity, entityId = null, summary, meta = null, companyId }) => {
  try {
    await AuditLog.create({
      actorId: req?.user?.id ?? null,
      actorName: req?.user?.name ?? 'System',
      actorRole: req?.user?.role ?? '',
      action,
      entity,
      entityId: entityId ? String(entityId) : null,
      summary,
      meta,
      ip: req?.ip ?? '',
      ...(companyId ? { companyId } : {})
    });
  } catch (error) {
    logger.error({ err: error, action }, 'audit write failed');
  }
};
