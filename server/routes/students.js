import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "../config/database.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { writeAudit } from "../services/audit.js";

const router = Router();
const createSchema = z.object({
  firstName: z.string().min(2).max(80), lastName: z.string().min(2).max(80),
  email: z.string().email().max(190).refine((email) => email.toLowerCase().endsWith("@gmail.com"), "A Gmail address is required"), matricNumber: z.string().min(4).max(60),
  programmeId: z.number().int().positive(), levelId: z.number().int().positive(),
  gender: z.enum(["male", "female", "other"]), dateOfBirth: z.coerce.date(),
  phone: z.string().max(30).optional(), admissionDate: z.coerce.date(),
  password: z.string().min(8).max(128),
});

router.use(authenticate);
router.get("/", authorize("super_admin", "school_admin", "hod", "lecturer"), async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 25));
  const search = `%${String(req.query.search ?? "").trim()}%`;
  const offset = (page - 1) * limit;
  const params = [req.user.institutionId, search, search, search];
  const [rows] = await db.execute(
    `SELECT s.id, s.student_id, s.matric_number, s.first_name, s.last_name, s.email,
            s.phone, s.status, s.graduation_status, p.name AS programme, d.name AS department,
            l.name AS level, COALESCE(g.cgpa, 0) AS cgpa
       FROM students s
       JOIN programmes p ON p.id = s.programme_id JOIN departments d ON d.id = p.department_id
       JOIN levels l ON l.id = s.level_id
       LEFT JOIN gpa_records g ON g.student_id = s.id AND g.is_current = 1
      WHERE s.institution_id = ? AND (s.first_name LIKE ? OR s.last_name LIKE ? OR s.matric_number LIKE ?)
      ORDER BY s.created_at DESC LIMIT ${limit} OFFSET ${offset}`,
    params,
  );
  const [[count]] = await db.execute(
    `SELECT COUNT(*) AS total FROM students s WHERE s.institution_id = ?
     AND (s.first_name LIKE ? OR s.last_name LIKE ? OR s.matric_number LIKE ?)`, params,
  );
  res.json({ data: rows, pagination: { page, limit, total: count.total, pages: Math.ceil(count.total / limit) } });
});

router.post("/", authorize("super_admin", "school_admin"), async (req, res) => {
  const input = createSchema.parse(req.body);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [existing] = await connection.execute(
      "SELECT id FROM students WHERE institution_id=? AND LOWER(matric_number)=LOWER(?) LIMIT 1",
      [req.user.institutionId, input.matricNumber],
    );
    if (existing[0]) throw Object.assign(new Error(`Matric number '${input.matricNumber}' has already been used`), { status: 409 });
    const [roles] = await connection.execute("SELECT id FROM roles WHERE name='student' LIMIT 1");
    const passwordHash = await bcrypt.hash(input.password, 12);
    const [userResult] = await connection.execute(
      `INSERT INTO users (institution_id,role_id,email,password_hash,first_name,last_name,phone,status,email_verified_at)
       VALUES (?,?,?,?,?,?,?,'active',UTC_TIMESTAMP())`,
      [req.user.institutionId, roles[0].id, input.email.toLowerCase(), passwordHash, input.firstName, input.lastName, input.phone ?? null],
    );
    const [result] = await connection.execute(
      `INSERT INTO students (institution_id,user_id,student_id,matric_number,first_name,last_name,email,
        phone,gender,date_of_birth,programme_id,level_id,admission_date,status)
       VALUES (?,?,UUID(),?,?,?,?,?,?,?,?,?,?,'active')`,
      [req.user.institutionId, userResult.insertId, input.matricNumber, input.firstName, input.lastName, input.email.toLowerCase(), input.phone ?? null, input.gender, input.dateOfBirth, input.programmeId, input.levelId, input.admissionDate],
    );
    await connection.commit();
    await writeAudit({ institutionId: req.user.institutionId, userId: req.user.sub, action: "student.created", entityType: "student", entityId: result.insertId, metadata: { matricNumber: input.matricNumber, loginCreated: true }, req });
    res.status(201).json({ id: result.insertId, userId: userResult.insertId, message: "Student and login account created" });
  } catch (error) {
    await connection.rollback();
    if (error.code === "ER_DUP_ENTRY") throw Object.assign(new Error("This Gmail address or matric number is already registered"), { status: 409 });
    throw error;
  } finally {
    connection.release();
  }
});

router.get("/:id", async (req, res) => {
  const [rows] = await db.execute(
    `SELECT s.*, p.name AS programme, d.name AS department, f.name AS faculty, l.name AS level
     FROM students s JOIN programmes p ON p.id=s.programme_id JOIN departments d ON d.id=p.department_id
     JOIN faculties f ON f.id=d.faculty_id JOIN levels l ON l.id=s.level_id
     WHERE s.id=? AND s.institution_id=? LIMIT 1`,
    [req.params.id, req.user.institutionId],
  );
  if (!rows[0]) throw Object.assign(new Error("Student not found"), { status: 404 });
  if (req.user.role === "student" && rows[0].user_id !== req.user.sub) {
    throw Object.assign(new Error("You do not have permission to view this student"), { status: 403 });
  }
  if (req.user.role === "parent") {
    const [links] = await db.execute(
      "SELECT 1 FROM parents p JOIN parent_students ps ON ps.parent_id=p.id WHERE p.user_id=? AND ps.student_id=? LIMIT 1",
      [req.user.sub, rows[0].id],
    );
    if (!links[0]) throw Object.assign(new Error("You do not have permission to view this student"), { status: 403 });
  }
  res.json(rows[0]);
});

export default router;