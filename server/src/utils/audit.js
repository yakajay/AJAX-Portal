import { AuditLog } from '../models/auditLog.model.js';
import { logger } from './logger.js';

// Records who did what. Never throws: a failed audit write must not fail the request itself.
export const audit = async (req, { action, entity, entityId = null, summary, meta = null }) => {
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
      ip: req?.ip ?? ''
    });
  } catch (error) {
    logger.error({ err: error, action }, 'audit write failed');
  }
};
