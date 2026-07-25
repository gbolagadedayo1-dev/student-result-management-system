import { Router } from "express";
import { db } from "../config/database.js";
import { authenticate, authorize } from "../middleware/auth.js";

const router = Router();
router.get("/overview", authenticate, authorize("super_admin", "school_admin", "hod"), async (req, res) => {
  const institutionId = req.user.institutionId;
  const [[students]] = await db.execute("SELECT COUNT(*) total FROM students WHERE institution_id=? AND status='active'", [institutionId]);
  const [[lecturers]] = await db.execute("SELECT COUNT(*) total FROM lecturers WHERE institution_id=? AND status='active'", [institutionId]);
  const [[results]] = await db.execute("SELECT COUNT(*) pending FROM result_batches WHERE institution_id=? AND status IN ('submitted','hod_approved')", [institutionId]);
  const [[gpa]] = await db.execute("SELECT ROUND(AVG(cgpa),2) average FROM gpa_records WHERE institution_id=? AND is_current=1", [institutionId]);
  const [departments] = await db.execute(
    `SELECT d.name, ROUND(AVG(r.total_score),1) score FROM results r
     JOIN course_registrations cr ON cr.id=r.course_registration_id JOIN students s ON s.id=cr.student_id
     JOIN programmes p ON p.id=s.programme_id JOIN departments d ON d.id=p.department_id
     WHERE s.institution_id=? GROUP BY d.id ORDER BY score DESC LIMIT 10`, [institutionId],
  );
  res.json({ totals: { students: students.total, lecturers: lecturers.total, pendingResults: results.pending, averageCgpa: gpa.average ?? 0 }, departments });
});
export default router;