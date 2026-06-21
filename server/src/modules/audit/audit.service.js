import { AuditLog } from './audit-log.model.js';

export async function recordAudit({ actor, action, entityType, entityId, metadata }) {
  try {
    await AuditLog.create({
      actorId: actor?.id,
      actorRole: actor?.role,
      action,
      entityType,
      entityId,
      metadata
    });
  } catch (error) {
    console.warn('Audit log write failed:', error.message);
  }
}
