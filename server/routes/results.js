import { Router } from "express";
import { z } from "zod";
import { db } from "../config/database.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { writeAudit } from "../services/audit.js";

const router = Router();
const scoreSchema = z.object({
  registrationId: z.number().int().positive(),
  caScore: z.number().min(0).max(30),
  assignmentScore: z.number().min(0).max(10).default(0),
  practicalScore: z.number().min(0).max(10).default(0),
  examScore: z.number().min(0).max(50),
});
const scoreUpdateSchema = scoreSchema.omit({ registrationId: true }).partial().refine(
  (input) => Object.keys(input).length > 0,
  "At least one score must be supplied",
);

async function getGrade(institutionId, total) {
  const [grades] = await db.execute(
    `SELECT letter_grade,grade_point,remark FROM grading_scales
     WHERE institution_id=? AND ? BETWEEN min_score AND max_score ORDER BY min_score DESC LIMIT 1`,
    [institutionId, total],
  );
  if (!grades[0]) throw Object.assign(new Error("No grading scale covers this score"), { status: 422 });
  return grades[0];
}

async function getLecturerRegistration(user, registrationId) {
  const [rows] = await db.execute(
    `SELECT cr.id,cr.course_id,cr.semester_id,c.code,c.title
     FROM course_registrations cr JOIN courses c ON c.id=cr.course_id
     JOIN course_allocations ca ON ca.course_id=cr.course_id AND ca.semester_id=cr.semester_id
     JOIN lecturers l ON l.id=ca.lecturer_id
     WHERE cr.id=? AND cr.institution_id=? AND l.user_id=? LIMIT 1`,
    [registrationId, user.institutionId, user.sub],
  );
  if (!rows[0]) throw Object.assign(new Error("Registration was not found or the course is not assigned to you"), { status: 403 });
  return rows[0];
}

async function getOwnedResult(user, resultId) {
  const [rows] = await db.execute(
    `SELECT r.id,r.batch_id,r.course_registration_id,r.ca_score,r.assignment_score,r.practical_score,r.exam_score,
            cr.course_id,cr.semester_id,rb.status batch_status
     FROM results r JOIN course_registrations cr ON cr.id=r.course_registration_id
     JOIN course_allocations ca ON ca.course_id=cr.course_id AND ca.semester_id=cr.semester_id
     JOIN lecturers l ON l.id=ca.lecturer_id LEFT JOIN result_batches rb ON rb.id=r.batch_id
     WHERE r.id=? AND cr.institution_id=? AND l.user_id=? LIMIT 1`,
    [resultId, user.institutionId, user.sub],
  );
  if (!rows[0]) throw Object.assign(new Error("Result was not found or is not assigned to you"), { status: 404 });
  if (["approved", "published"].includes(rows[0].batch_status)) {
    throw Object.assign(new Error("An approved result is locked and cannot be changed"), { status: 409 });
  }
  return rows[0];
}

router.use(authenticate);

router.get("/pending", authorize("school_admin", "super_admin"), async (req, res) => {
  const [rows] = await db.execute(
    `SELECT rb.id,c.code,c.title,CONCAT(u.first_name,' ',u.last_name) submitted_by,
            COUNT(r.id) student_count,ROUND(AVG(r.total_score),1) class_average,rb.submitted_at
     FROM result_batches rb JOIN courses c ON c.id=rb.course_id JOIN users u ON u.id=rb.submitted_by
     LEFT JOIN results r ON r.batch_id=rb.id
     WHERE rb.institution_id=? AND rb.status='submitted'
     GROUP BY rb.id ORDER BY rb.submitted_at`,
    [req.user.institutionId],
  );
  res.json({ data: rows });
});

router.get("/mine", authorize("lecturer"), async (req, res) => {
  const [rows] = await db.execute(
    `SELECT r.id,r.course_registration_id,s.matric_number,CONCAT(s.first_name,' ',s.last_name) student,
            c.code,c.title,r.ca_score,r.assignment_score,r.practical_score,r.exam_score,r.total_score,
            r.letter_grade,r.grade_point,COALESCE(rb.status,'draft') status,r.updated_at
     FROM results r JOIN course_registrations cr ON cr.id=r.course_registration_id
     JOIN students s ON s.id=cr.student_id JOIN courses c ON c.id=cr.course_id
     JOIN course_allocations ca ON ca.course_id=cr.course_id AND ca.semester_id=cr.semester_id
     JOIN lecturers l ON l.id=ca.lecturer_id LEFT JOIN result_batches rb ON rb.id=r.batch_id
     WHERE cr.institution_id=? AND l.user_id=? ORDER BY r.updated_at DESC`,
    [req.user.institutionId, req.user.sub],
  );
  res.json({ data: rows });
});

router.get("/student", authorize("student"), async (req, res) => {
  const [rows] = await db.execute(
    `SELECT c.code,c.title,c.credit_units,r.total_score,r.letter_grade,r.grade_point,r.remark,
            se.name semester,ac.name session_name
     FROM users u JOIN students s ON s.user_id=u.id
     JOIN course_registrations cr ON cr.student_id=s.id JOIN results r ON r.course_registration_id=cr.id
     JOIN result_batches rb ON rb.id=r.batch_id JOIN courses c ON c.id=cr.course_id
     JOIN semesters se ON se.id=cr.semester_id JOIN academic_sessions ac ON ac.id=se.session_id
     WHERE u.id=? AND s.institution_id=? AND rb.status IN ('approved','published')
     ORDER BY ac.starts_on DESC,se.ordinal DESC,c.code`,
    [req.user.sub, req.user.institutionId],
  );
  res.json({ data: rows });
});

router.post("/scores", authorize("lecturer"), async (req, res) => {
  const input = scoreSchema.parse(req.body);
  const registration = await getLecturerRegistration(req.user, input.registrationId);
  const [batchRows] = await db.execute("SELECT id,status FROM result_batches WHERE course_id=? AND semester_id=? LIMIT 1", [registration.course_id, registration.semester_id]);
  let batch = batchRows[0];
  if (batch && ["approved", "published"].includes(batch.status)) throw Object.assign(new Error("Results for this course are already approved and locked"), { status: 409 });
  if (!batch) {
    const [batchResult] = await db.execute(
      "INSERT INTO result_batches (institution_id,course_id,semester_id,submitted_by,status) VALUES (?,?,?,?,'draft')",
      [req.user.institutionId, registration.course_id, registration.semester_id, req.user.sub],
    );
    batch = { id: batchResult.insertId, status: "draft" };
  }
  const total = input.caScore + input.assignmentScore + input.practicalScore + input.examScore;
  const grade = await getGrade(req.user.institutionId, total);
  const [result] = await db.execute(
    `INSERT INTO results (batch_id,course_registration_id,ca_score,assignment_score,practical_score,
      exam_score,total_score,letter_grade,grade_point,remark,entered_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [batch.id, input.registrationId, input.caScore, input.assignmentScore, input.practicalScore, input.examScore, total, grade.letter_grade, grade.grade_point, grade.remark, req.user.sub],
  );
  if (batch.status === "submitted") await db.execute("UPDATE result_batches SET status='draft',submitted_at=NULL WHERE id=?", [batch.id]);
  await writeAudit({ institutionId: req.user.institutionId, userId: req.user.sub, action: "result.recorded", entityType: "result", entityId: result.insertId, metadata: { course: registration.code }, req });
  res.status(201).json({ id: result.insertId, total, ...grade, status: "draft" });
});

router.patch("/scores/:id", authorize("lecturer"), async (req, res) => {
  const input = scoreUpdateSchema.parse(req.body);
  const current = await getOwnedResult(req.user, req.params.id);
  const scores = {
    caScore: input.caScore ?? current.ca_score,
    assignmentScore: input.assignmentScore ?? current.assignment_score,
    practicalScore: input.practicalScore ?? current.practical_score,
    examScore: input.examScore ?? current.exam_score,
  };
  const total = scores.caScore + scores.assignmentScore + scores.practicalScore + scores.examScore;
  const grade = await getGrade(req.user.institutionId, total);
  await db.execute(
    `UPDATE results SET ca_score=?,assignment_score=?,practical_score=?,exam_score=?,total_score=?,
      letter_grade=?,grade_point=?,remark=?,entered_by=? WHERE id=?`,
    [scores.caScore, scores.assignmentScore, scores.practicalScore, scores.examScore, total, grade.letter_grade, grade.grade_point, grade.remark, req.user.sub, current.id],
  );
  if (current.batch_id) await db.execute("UPDATE result_batches SET status='draft',submitted_at=NULL WHERE id=?", [current.batch_id]);
  await writeAudit({ institutionId: req.user.institutionId, userId: req.user.sub, action: "result.updated", entityType: "result", entityId: current.id, req });
  res.json({ id: current.id, total, ...grade, status: "draft" });
});

router.delete("/scores/:id", authorize("lecturer"), async (req, res) => {
  const current = await getOwnedResult(req.user, req.params.id);
  await db.execute("DELETE FROM results WHERE id=?", [current.id]);
  if (current.batch_id) await db.execute("UPDATE result_batches SET status='draft',submitted_at=NULL WHERE id=?", [current.batch_id]);
  await writeAudit({ institutionId: req.user.institutionId, userId: req.user.sub, action: "result.deleted", entityType: "result", entityId: current.id, req });
  res.status(204).end();
});

router.post("/batches/:id/submit", authorize("lecturer"), async (req, res) => {
  const [result] = await db.execute(
    `UPDATE result_batches rb JOIN course_allocations ca ON ca.course_id=rb.course_id AND ca.semester_id=rb.semester_id
     JOIN lecturers l ON l.id=ca.lecturer_id SET rb.status='submitted',rb.submitted_by=?,rb.submitted_at=UTC_TIMESTAMP()
     WHERE rb.id=? AND rb.institution_id=? AND rb.status='draft' AND l.user_id=?
       AND EXISTS (SELECT 1 FROM results r WHERE r.batch_id=rb.id)`,
    [req.user.sub, req.params.id, req.user.institutionId, req.user.sub],
  );
  if (!result.affectedRows) throw Object.assign(new Error("Draft batch was not found or has no recorded scores"), { status: 409 });
  await writeAudit({ institutionId: req.user.institutionId, userId: req.user.sub, action: "result.submitted", entityType: "result_batch", entityId: req.params.id, req });
  res.json({ message: "Results submitted to the administrator for approval" });
});

router.post("/batches/:id/approve", authorize("school_admin", "super_admin"), async (req, res) => {
  const [result] = await db.execute(
    "UPDATE result_batches SET status='approved',approved_by=?,approved_at=UTC_TIMESTAMP() WHERE id=? AND institution_id=? AND status='submitted'",
    [req.user.sub, req.params.id, req.user.institutionId],
  );
  if (!result.affectedRows) throw Object.assign(new Error("Submitted result batch was not found or already processed"), { status: 409 });
  await writeAudit({ institutionId: req.user.institutionId, userId: req.user.sub, action: "result.approved", entityType: "result_batch", entityId: req.params.id, req });
  res.json({ message: "Results approved and locked" });
});

export default router;