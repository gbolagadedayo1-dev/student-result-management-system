import { Router } from "express";
import { z } from "zod";
import { db } from "../config/database.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { writeAudit } from "../services/audit.js";

const router = Router();
const sessionSchema = z.object({
  name: z.string().min(4).max(30), startsOn: z.coerce.date(), endsOn: z.coerce.date(),
  status: z.enum(["planned", "active", "closed"]).default("planned"),
}).refine((input) => input.endsOn > input.startsOn, { path: ["endsOn"], message: "End date must be after start date" });

router.use(authenticate);

router.get("/sessions", async (req, res) => {
  const [rows] = await db.execute(
    `SELECT id,name,starts_on,ends_on,status FROM academic_sessions
     WHERE institution_id=? ORDER BY starts_on DESC`,
    [req.user.institutionId],
  );
  res.json({ data: rows });
});

router.post("/sessions", authorize("school_admin", "super_admin"), async (req, res) => {
  const input = sessionSchema.parse(req.body);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    if (input.status === "active") {
      await connection.execute("UPDATE academic_sessions SET status='closed' WHERE institution_id=? AND status='active'", [req.user.institutionId]);
    }
    const [result] = await connection.execute(
      "INSERT INTO academic_sessions (institution_id,name,starts_on,ends_on,status) VALUES (?,?,?,?,?)",
      [req.user.institutionId, input.name, input.startsOn, input.endsOn, input.status],
    );
    await connection.commit();
    await writeAudit({ institutionId: req.user.institutionId, userId: req.user.sub, action: "academic_session.created", entityType: "academic_session", entityId: result.insertId, metadata: { name: input.name }, req });
    res.status(201).json({ id: result.insertId, message: "Academic session created" });
  } catch (error) {
    await connection.rollback();
    if (error.code === "ER_DUP_ENTRY") throw Object.assign(new Error("This academic session already exists"), { status: 409 });
    throw error;
  } finally {
    connection.release();
  }
});

router.delete("/sessions/:id", authorize("school_admin", "super_admin"), async (req, res) => {
  const [result] = await db.execute(
    "DELETE FROM academic_sessions WHERE id=? AND institution_id=? AND status!='active'",
    [req.params.id, req.user.institutionId],
  );
  if (!result.affectedRows) throw Object.assign(new Error("Session was not found or is currently active"), { status: 409 });
  await writeAudit({ institutionId: req.user.institutionId, userId: req.user.sub, action: "academic_session.deleted", entityType: "academic_session", entityId: req.params.id, req });
  res.status(204).end();
});

router.get("/calendar", async (req, res) => {
  const [rows] = await db.execute(
    `SELECT id,title,description,event_type,starts_at,ends_at,audience
     FROM academic_calendar_events WHERE institution_id=? AND starts_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 30 DAY)
     ORDER BY starts_at LIMIT 100`,
    [req.user.institutionId],
  );
  res.json({ data: rows });
});

export default router;