import { Router } from "express";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "../config/database.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();
const requestSchema = z.object({
  copyType: z.enum(["student", "official"]),
  deliveryMethod: z.enum(["download", "email", "courier"]),
  recipientName: z.string().max(180).optional(),
  recipientEmail: z.string().email().max(190).optional(),
});

router.post("/requests", authenticate, async (req, res) => {
  const input = requestSchema.parse(req.body);
  const [students] = await db.execute("SELECT id FROM students WHERE user_id=? AND institution_id=? LIMIT 1", [req.user.sub, req.user.institutionId]);
  if (!students[0]) throw Object.assign(new Error("Only a linked student account can request a transcript"), { status: 403 });
  const requestNumber = `TR-${new Date().getUTCFullYear()}-${Date.now().toString().slice(-7)}`;
  const verificationCode = randomUUID();
  const [result] = await db.execute(
    `INSERT INTO transcript_requests (institution_id,request_number,student_id,copy_type,delivery_method,
      recipient_name,recipient_email,status,verification_code) VALUES (?,?,?,?,?,?,?,'pending',?)`,
    [req.user.institutionId, requestNumber, students[0].id, input.copyType, input.deliveryMethod, input.recipientName ?? null, input.recipientEmail ?? null, verificationCode],
  );
  res.status(201).json({ id: result.insertId, requestNumber, status: "pending" });
});

router.get("/requests/me", authenticate, async (req, res) => {
  const [rows] = await db.execute(
    `SELECT tr.id,tr.request_number,tr.copy_type,tr.delivery_method,tr.status,tr.document_url,tr.requested_at,tr.processed_at
     FROM transcript_requests tr JOIN students s ON s.id=tr.student_id
     WHERE s.user_id=? AND tr.institution_id=? ORDER BY tr.requested_at DESC`,
    [req.user.sub, req.user.institutionId],
  );
  res.json({ data: rows });
});

router.get("/:studentId/pdf", authenticate, async (req, res) => {
  const [students] = await db.execute(
    `SELECT s.id,s.user_id,s.matric_number,s.first_name,s.last_name,s.admission_date,
      p.name programme,d.name department,f.name faculty,i.name institution
     FROM students s JOIN programmes p ON p.id=s.programme_id JOIN departments d ON d.id=p.department_id
     JOIN faculties f ON f.id=d.faculty_id JOIN institutions i ON i.id=s.institution_id
     WHERE s.id=? AND s.institution_id=? LIMIT 1`,
    [req.params.studentId, req.user.institutionId],
  );
  const student = students[0];
  if (!student) throw Object.assign(new Error("Student not found"), { status: 404 });
  const staffRoles = ["super_admin", "school_admin", "hod"];
  if (req.user.role === "student" && student.user_id !== req.user.sub) {
    throw Object.assign(new Error("You do not have permission to download this transcript"), { status: 403 });
  }
  if (req.user.role !== "student" && !staffRoles.includes(req.user.role)) {
    throw Object.assign(new Error("You do not have permission to download transcripts"), { status: 403 });
  }

  const [results] = await db.execute(
    `SELECT c.code,c.title,c.credit_units,r.total_score,r.letter_grade,r.grade_point,se.name semester,ac.name session_name
     FROM results r JOIN course_registrations cr ON cr.id=r.course_registration_id
     JOIN courses c ON c.id=cr.course_id JOIN semesters se ON se.id=cr.semester_id
     JOIN academic_sessions ac ON ac.id=se.session_id
     WHERE cr.student_id=? ORDER BY ac.starts_on,se.ordinal,c.code`,
    [student.id],
  );
  const verification = `${req.protocol}://${req.get("host")}/api/transcripts/verify/${encodeURIComponent(student.matric_number)}`;
  const qrData = await QRCode.toDataURL(verification, { margin: 0, width: 140 });
  const qrBuffer = Buffer.from(qrData.split(",")[1], "base64");

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="MaryResult-${student.matric_number.replaceAll("/", "-")}.pdf"`);
  const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: `Official Transcript - ${student.first_name} ${student.last_name}`, Author: "MaryResult SIAMS" } });
  doc.pipe(res);
  doc.save().opacity(0.04).fontSize(64).fillColor("#0A3D62").rotate(-38, { origin: [300, 400] }).text("MARYRESULT VERIFIED", 0, 380, { align: "center" }).restore();
  doc.fillColor("#0A3D62").fontSize(22).font("Helvetica-Bold").text(student.institution, { align: "center" });
  doc.fillColor("#F4B400").fontSize(10).text("OFFICIAL ACADEMIC TRANSCRIPT", { align: "center", characterSpacing: 1.5 });
  doc.moveDown(1.5).strokeColor("#D7E0E6").moveTo(48, doc.y).lineTo(547, doc.y).stroke();
  doc.moveDown().fillColor("#1E293B").fontSize(10).font("Helvetica");
  doc.text(`Student: ${student.first_name} ${student.last_name}`);
  doc.text(`Matric number: ${student.matric_number}`);
  doc.text(`Faculty: ${student.faculty}`);
  doc.text(`Programme: ${student.programme}`);
  doc.moveDown();
  const startY = doc.y;
  const columns = [48, 108, 330, 405, 463, 515];
  doc.rect(48, startY, 499, 22).fill("#0A3D62").fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(8);
  ["CODE", "COURSE TITLE", "CREDIT", "SCORE", "GRADE", "POINT"].forEach((heading, index) => doc.text(heading, columns[index] + 4, startY + 7));
  let y = startY + 22;
  doc.font("Helvetica").fillColor("#1E293B");
  for (const result of results) {
    if (y > 730) { doc.addPage(); y = 55; }
    doc.rect(48, y, 499, 22).fill(results.indexOf(result) % 2 ? "#F5F7FA" : "#FFFFFF");
    doc.fillColor("#1E293B").fontSize(7.5);
    const values = [result.code, result.title, result.credit_units, result.total_score, result.letter_grade, result.grade_point];
    values.forEach((value, index) => doc.text(String(value), columns[index] + 4, y + 7, { width: index === 1 ? 210 : 50, ellipsis: true }));
    y += 22;
  }
  doc.image(qrBuffer, 48, 745, { width: 62, height: 62 });
  doc.fillColor("#667789").fontSize(7).text("Scan to verify this document", 118, 763).text("MaryResult Support: bamidelebunmi412@gmail.com | +234 915 179 8360", 118, 779);
  doc.fillColor("#1E293B").font("Helvetica-Bold").text("Registrar signature", 415, 780, { align: "center", width: 130 });
  doc.end();
});

router.get("/verify/:matricNumber", async (req, res) => {
  const [rows] = await db.execute("SELECT matric_number,first_name,last_name,status FROM students WHERE matric_number=? LIMIT 1", [req.params.matricNumber]);
  if (!rows[0]) return res.status(404).json({ verified: false });
  res.json({ verified: true, student: rows[0], verifiedAt: new Date().toISOString() });
});

export default router;