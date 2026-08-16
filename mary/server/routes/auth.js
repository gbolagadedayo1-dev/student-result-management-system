import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { OAuth2Client } from "google-auth-library";
import { db } from "../config/database.js";
import { env } from "../config/env.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { writeAudit } from "../services/audit.js";

const router = Router();
const googleClient = new OAuth2Client(env.googleClientId);
const loginSchema = z.object({ email: z.string().email().max(190), password: z.string().min(8).max(128) });
const googleSchema = z.object({ credential: z.string().min(100), role: z.enum(["super_admin", "school_admin", "hod", "lecturer", "student", "parent"]) });
const registerSchema = z.object({
  institutionSlug: z.string().min(2).max(120),
  role: z.enum(["student", "lecturer"]),
  firstName: z.string().min(2).max(80), lastName: z.string().min(2).max(80),
  email: z.string().email().max(190).refine((email) => email.toLowerCase().endsWith("@gmail.com"), "A Gmail address is required"), password: z.string().min(8).max(128), phone: z.string().max(30).optional(),
  matricNumber: z.string().max(60).optional(), programmeId: z.number().int().positive().optional(),
  levelId: z.number().int().positive().optional(), gender: z.enum(["male", "female", "other"]).optional(),
  dateOfBirth: z.coerce.date().optional(), admissionDate: z.coerce.date().optional(),
  staffId: z.string().max(50).optional(), departmentId: z.number().int().positive().optional(),
  qualification: z.string().max(150).optional(), employmentDate: z.coerce.date().optional(),
}).superRefine((input, context) => {
  const required = input.role === "student"
    ? [[input.matricNumber, "matricNumber"], [input.programmeId, "programmeId"], [input.levelId, "levelId"], [input.gender, "gender"], [input.dateOfBirth, "dateOfBirth"]]
    : [[input.staffId, "staffId"], [input.departmentId, "departmentId"]];
  for (const [value, field] of required) {
    if (!value) context.addIssue({ code: "custom", path: [field], message: `${field} is required for ${input.role} registration` });
  }
});

router.post("/register", async (req, res) => {
  const input = registerSchema.parse(req.body);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [institutions] = await connection.execute("SELECT id FROM institutions WHERE slug=? AND status='active' LIMIT 1", [input.institutionSlug]);
    if (!institutions[0]) throw Object.assign(new Error("Institution code is invalid or unavailable"), { status: 404 });
    const institutionId = institutions[0].id;
    const [roles] = await connection.execute("SELECT id FROM roles WHERE name=? LIMIT 1", [input.role]);
    if (input.role === "student") {
      const [existingStudents] = await connection.execute(
        "SELECT id FROM students WHERE institution_id=? AND LOWER(matric_number)=LOWER(?) LIMIT 1",
        [institutionId, input.matricNumber],
      );
      if (existingStudents[0]) throw Object.assign(new Error(`Matric / Application number '${input.matricNumber}' has already been used`), { status: 409 });
    } else {
      const [existingLecturers] = await connection.execute(
        "SELECT id FROM lecturers WHERE institution_id=? AND LOWER(staff_id)=LOWER(?) LIMIT 1",
        [institutionId, input.staffId],
      );
      if (existingLecturers[0]) throw Object.assign(new Error(`Staff number '${input.staffId}' has already been used`), { status: 409 });
    }
    const passwordHash = await bcrypt.hash(input.password, 12);
    const [userResult] = await connection.execute(
      `INSERT INTO users (institution_id,role_id,email,password_hash,first_name,last_name,phone,status)
       VALUES (?,?,?,?,?,?,?,'pending')`,
      [institutionId, roles[0].id, input.email.toLowerCase(), passwordHash, input.firstName, input.lastName, input.phone ?? null],
    );

    if (input.role === "student") {
      await connection.execute(
        `INSERT INTO students (institution_id,user_id,matric_number,first_name,last_name,email,phone,gender,
         date_of_birth,programme_id,level_id,admission_date,status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'applicant')`,
        [institutionId, userResult.insertId, input.matricNumber, input.firstName, input.lastName, input.email.toLowerCase(), input.phone ?? null, input.gender, input.dateOfBirth, input.programmeId, input.levelId, input.admissionDate ?? new Date()],
      );
    } else {
      await connection.execute(
        `INSERT INTO lecturers (institution_id,user_id,department_id,staff_id,first_name,last_name,email,phone,
         qualification,employment_date,status) VALUES (?,?,?,?,?,?,?,?,?,?, 'inactive')`,
        [institutionId, userResult.insertId, input.departmentId, input.staffId, input.firstName, input.lastName, input.email.toLowerCase(), input.phone ?? null, input.qualification ?? null, input.employmentDate ?? new Date()],
      );
    }
    await connection.commit();
    res.status(201).json({ message: "Registration received and awaiting institution verification", registrationId: userResult.insertId, status: "pending" });
  } catch (error) {
    await connection.rollback();
    if (error.code === "ER_DUP_ENTRY") throw Object.assign(new Error("An account with this email or institutional number already exists"), { status: 409 });
    throw error;
  } finally {
    connection.release();
  }
});

router.post("/login", async (req, res) => {
  const input = loginSchema.parse(req.body);
  const [rows] = await db.execute(
    `SELECT u.id, u.institution_id, u.email, u.password_hash, u.first_name, u.last_name,
            u.status, u.failed_login_attempts, u.locked_until, r.name AS role
       FROM users u JOIN roles r ON r.id = u.role_id
      WHERE u.email = ? LIMIT 1`,
    [input.email.toLowerCase()],
  );
  const user = rows[0];

  if (!user || user.status !== "active" || (user.locked_until && new Date(user.locked_until) > new Date())) {
    throw Object.assign(new Error("Invalid credentials or account unavailable"), { status: 401 });
  }

  if (!(await bcrypt.compare(input.password, user.password_hash))) {
    await db.execute(
      `UPDATE users SET failed_login_attempts = failed_login_attempts + 1,
       locked_until = IF(failed_login_attempts >= 4, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 15 MINUTE), locked_until)
       WHERE id = ?`,
      [user.id],
    );
    throw Object.assign(new Error("Invalid credentials"), { status: 401 });
  }

  await db.execute("UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = UTC_TIMESTAMP() WHERE id = ?", [user.id]);
  const payload = { sub: user.id, institutionId: user.institution_id, role: user.role };
  const token = jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn, issuer: "maryresult-api", audience: "maryresult-web" });
  res.json({ token, user: { id: user.id, email: user.email, name: `${user.first_name} ${user.last_name}`, role: user.role } });
});

router.post("/google", async (req, res) => {
  if (!env.googleClientId) throw Object.assign(new Error("Google sign-in is not configured"), { status: 503 });
  const input = googleSchema.parse(req.body);
  let googleProfile;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: input.credential, audience: env.googleClientId });
    googleProfile = ticket.getPayload();
  } catch {
    throw Object.assign(new Error("Google could not verify this sign-in"), { status: 401 });
  }
  if (!googleProfile?.email || !googleProfile.email_verified) {
    throw Object.assign(new Error("A verified Google email address is required"), { status: 401 });
  }

  const [rows] = await db.execute(
    `SELECT u.id,u.institution_id,u.email,u.google_sub,u.first_name,u.last_name,u.status,r.name role
     FROM users u JOIN roles r ON r.id=u.role_id WHERE u.google_sub=? OR u.email=? LIMIT 1`,
    [googleProfile.sub, googleProfile.email.toLowerCase()],
  );
  const user = rows[0];
  if (!user) throw Object.assign(new Error("No MaryResult account is registered for this Google email"), { status: 404 });
  if (user.status === "pending") throw Object.assign(new Error("Your registration is waiting for administrator approval"), { status: 403 });
  if (user.status !== "active") throw Object.assign(new Error("This account is not available"), { status: 403 });
  const roleMatches = input.role === "school_admin"
    ? ["school_admin", "super_admin", "hod"].includes(user.role)
    : user.role === input.role;
  if (!roleMatches) throw Object.assign(new Error(`This Google email is registered as ${user.role.replaceAll("_", " ")}`), { status: 403 });

  await db.execute(
    "UPDATE users SET google_sub=COALESCE(google_sub,?),avatar_url=COALESCE(?,avatar_url),email_verified_at=COALESCE(email_verified_at,UTC_TIMESTAMP()),last_login_at=UTC_TIMESTAMP() WHERE id=?",
    [googleProfile.sub, googleProfile.picture ?? null, user.id],
  );
  const token = jwt.sign({ sub: user.id, institutionId: user.institution_id, role: user.role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn, issuer: "maryresult-api", audience: "maryresult-web" });
  res.json({ token, user: { id: user.id, email: user.email, name: `${user.first_name} ${user.last_name}`, role: user.role } });
});

router.get("/me", authenticate, async (req, res) => {
  const [rows] = await db.execute(
    `SELECT u.id, u.email, u.first_name, u.last_name, u.avatar_url, u.last_login_at,
            r.name AS role, i.name AS institution
       FROM users u JOIN roles r ON r.id = u.role_id
       LEFT JOIN institutions i ON i.id = u.institution_id
      WHERE u.id = ? LIMIT 1`,
    [req.user.sub],
  );
  if (!rows[0]) throw Object.assign(new Error("User not found"), { status: 404 });
  res.json(rows[0]);
});

router.get("/registrations/pending", authenticate, authorize("school_admin", "super_admin"), async (req, res) => {
  const [rows] = await db.execute(
    `SELECT u.id,u.first_name,u.last_name,u.email,u.phone,u.created_at,r.name role,
            COALESCE(s.matric_number,l.staff_id) institutional_id,
            COALESCE(sd.name,ld.name) department
     FROM users u JOIN roles r ON r.id=u.role_id
     LEFT JOIN students s ON s.user_id=u.id LEFT JOIN programmes p ON p.id=s.programme_id
     LEFT JOIN departments sd ON sd.id=p.department_id
     LEFT JOIN lecturers l ON l.user_id=u.id LEFT JOIN departments ld ON ld.id=l.department_id
     WHERE u.institution_id=? AND u.status='pending' AND r.name IN ('student','lecturer')
     ORDER BY u.created_at`,
    [req.user.institutionId],
  );
  res.json({ data: rows });
});

router.post("/registrations/:id/approve", authenticate, authorize("school_admin", "super_admin"), async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [users] = await connection.execute(
      `SELECT u.id,r.name role FROM users u JOIN roles r ON r.id=u.role_id
       WHERE u.id=? AND u.institution_id=? AND u.status='pending' FOR UPDATE`,
      [req.params.id, req.user.institutionId],
    );
    if (!users[0]) throw Object.assign(new Error("Pending registration was not found"), { status: 404 });
    await connection.execute("UPDATE users SET status='active',email_verified_at=UTC_TIMESTAMP() WHERE id=?", [users[0].id]);
    if (users[0].role === "student") await connection.execute("UPDATE students SET status='active' WHERE user_id=?", [users[0].id]);
    if (users[0].role === "lecturer") await connection.execute("UPDATE lecturers SET status='active' WHERE user_id=?", [users[0].id]);
    await connection.commit();
    await writeAudit({ institutionId: req.user.institutionId, userId: req.user.sub, action: "registration.approved", entityType: "user", entityId: users[0].id, metadata: { role: users[0].role }, req });
    res.json({ message: "Registration approved and account activated" });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

export default router;