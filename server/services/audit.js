import { db } from "../config/database.js";

export async function writeAudit({ institutionId, userId, action, entityType, entityId, metadata, req }) {
  await db.execute(
    `INSERT INTO audit_logs
      (institution_id, user_id, action, entity_type, entity_id, metadata, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [institutionId, userId, action, entityType, entityId ?? null, JSON.stringify(metadata ?? {}), req.ip, req.get("user-agent") ?? null],
  );
}