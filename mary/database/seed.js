import "dotenv/config";
import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? "root",
  password: process.env.DB_PASSWORD ?? "",
  database: process.env.DB_NAME ?? "maryresult",
  connectionLimit: 5,
});

const firstNames = ["Amara", "David", "Zainab", "Tunde", "Blessing", "Kelvin", "Chiamaka", "Femi", "Aisha", "Daniel", "Ngozi", "Samuel", "Mariam", "Victor", "Temitope", "Adaeze", "Ibrahim", "Esther", "Michael", "Fatima"];
const lastNames = ["Okafor", "Ibe", "Nasir", "Eze", "Ojo", "Mensah", "Nwosu", "Adeyemi", "Bello", "Okoro", "Balogun", "James", "Abubakar", "Afolabi", "Obi", "Usman", "Olawale", "Danladi", "George", "Umeh"];
const facultyNames = ["Computing and Technology", "Engineering", "Management Sciences", "Natural Sciences", "Arts and Humanities", "Education", "Social Sciences", "Health Sciences"];
const departmentNames = [
  ["CSC", "Computer Science"], ["IFT", "Information Technology"], ["CVE", "Civil Engineering"], ["EEE", "Electrical Engineering"],
  ["MEE", "Mechanical Engineering"], ["ACC", "Accounting"], ["BUS", "Business Administration"], ["ECO", "Economics"],
  ["CHM", "Chemistry"], ["PHY", "Physics"], ["BIO", "Biological Sciences"], ["ENG", "English and Literary Studies"],
  ["HIS", "History"], ["EDU", "Educational Management"], ["GCE", "Guidance and Counselling"], ["POL", "Political Science"],
  ["SOC", "Sociology"], ["NUR", "Nursing Science"], ["PHS", "Public Health"], ["MLS", "Medical Laboratory Science"],
];

function date(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function gradeFor(score) {
  if (score >= 70) return ["A", 5, "Excellent"];
  if (score >= 60) return ["B", 4, "Very good"];
  if (score >= 50) return ["C", 3, "Good"];
  if (score >= 45) return ["D", 2, "Fair"];
  if (score >= 40) return ["E", 1, "Pass"];
  return ["F", 0, "Fail"];
}

async function bulkInsert(connection, table, columns, rows, chunkSize = 500) {
  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    const placeholders = chunk.map(() => `(${columns.map(() => "?").join(",")})`).join(",");
    await connection.query(`INSERT INTO ${table} (${columns.join(",")}) VALUES ${placeholders}`, chunk.flat());
  }
}

async function seed() {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    console.log("Seeding MaryResult demo institution...");

    await bulkInsert(connection, "roles", ["name", "display_name", "description"], [
      ["super_admin", "Super Administrator", "Global platform administration"],
      ["school_admin", "School Administrator", "Institution administration"],
      ["hod", "Head of Department", "Department academic approval"],
      ["lecturer", "Lecturer", "Teaching, attendance and result entry"],
      ["student", "Student", "Student self-service portal"],
      ["parent", "Parent", "Linked learner oversight"],
    ]);
    const permissions = ["students.read", "students.manage", "lecturers.manage", "academics.manage", "results.enter", "results.approve", "results.publish", "transcripts.manage", "attendance.manage", "analytics.read", "settings.manage", "audit.read"];
    await bulkInsert(connection, "permissions", ["name", "module", "description"], permissions.map((name) => [name, name.split(".")[0], name.replace(".", " ")]));

    const [institution] = await connection.execute(
      `INSERT INTO institutions (name,slug,type,email,phone,address,status,subscription_plan,subscription_ends_at)
       VALUES ('Maryfield Academy','maryfield-academy','university','admin@maryfield.edu','+234 915 179 8360','12 Academic Way, Lagos, Nigeria','active','enterprise','2027-12-31')`,
    );
    const institutionId = institution.insertId;
    const [[roleRows]] = await connection.query("SELECT JSON_OBJECTAGG(name,id) roles FROM roles");
    const roleIds = typeof roleRows.roles === "string" ? JSON.parse(roleRows.roles) : roleRows.roles;
    const passwordHash = await bcrypt.hash("MaryResult@2026", 12);

    const [admin] = await connection.execute(
      `INSERT INTO users (institution_id,role_id,email,password_hash,first_name,last_name,phone,status,email_verified_at)
       VALUES (?,?,?,?,?,?,?,?,UTC_TIMESTAMP())`,
      [institutionId, roleIds.school_admin, "bamidelebunmi412@gmail.com", passwordHash, "Bunmi", "Adeyemi", "+2349151798360", "active"],
    );
    const adminId = admin.insertId;
    await connection.execute("INSERT INTO administrators (institution_id,user_id,staff_id,job_title,office,appointed_at) VALUES (?,?,?,?,?,?)", [institutionId, adminId, "MR-ADM-0001", "School Administrator", "Registry Block A", "2022-01-10"]);

    await bulkInsert(connection, "faculties", ["institution_id", "code", "name"], facultyNames.map((name, index) => [institutionId, `FAC${String(index + 1).padStart(2, "0")}`, name]));
    const [facultyRows] = await connection.query("SELECT id FROM faculties WHERE institution_id=? ORDER BY id", [institutionId]);
    await bulkInsert(connection, "departments", ["institution_id", "faculty_id", "code", "name"], departmentNames.map(([code, name], index) => [institutionId, facultyRows[Math.floor(index * 8 / 20)].id, code, name]));
    const [departmentRows] = await connection.query("SELECT id,code,name FROM departments WHERE institution_id=? ORDER BY id", [institutionId]);
    await bulkInsert(connection, "programmes", ["institution_id", "department_id", "code", "name", "award", "duration_years", "required_credits"], departmentRows.map((department, index) => [institutionId, department.id, `BSC-${department.code}`, `B.Sc. ${department.name}`, index >= 17 ? "B.Sc. (Health)" : "Bachelor of Science", index >= 17 ? 5 : 4, index >= 17 ? 170 : 140]));
    const [programmeRows] = await connection.query("SELECT id,department_id FROM programmes WHERE institution_id=? ORDER BY id", [institutionId]);
    await bulkInsert(connection, "levels", ["institution_id", "name", "ordinal"], [100, 200, 300, 400, 500].map((level, index) => [institutionId, `${level} Level`, index + 1]));
    const [levelRows] = await connection.query("SELECT id FROM levels WHERE institution_id=? ORDER BY ordinal", [institutionId]);

    const [session] = await connection.execute("INSERT INTO academic_sessions (institution_id,name,starts_on,ends_on,status) VALUES (?,?,?,?,?)", [institutionId, "2024 / 2025", "2024-09-16", "2025-07-25", "active"]);
    await connection.execute("INSERT INTO academic_sessions (institution_id,name,starts_on,ends_on,status) VALUES (?,?,?,?,?)", [institutionId, "2023 / 2024", "2023-09-18", "2024-07-26", "closed"]);
    const [semester] = await connection.execute("INSERT INTO semesters (institution_id,session_id,name,ordinal,starts_on,ends_on,registration_deadline,status) VALUES (?,?,?,?,?,?,?,?)", [institutionId, session.insertId, "Second Semester", 2, "2025-02-17", "2025-07-25", "2025-03-07", "result_processing"]);
    await connection.execute("INSERT INTO semesters (institution_id,session_id,name,ordinal,starts_on,ends_on,registration_deadline,status) VALUES (?,?,?,?,?,?,?,?)", [institutionId, session.insertId, "First Semester", 1, "2024-09-16", "2025-01-31", "2024-10-04", "closed"]);

    await bulkInsert(connection, "grading_scales", ["institution_id", "letter_grade", "min_score", "max_score", "grade_point", "remark", "is_pass"], [
      [institutionId, "A", 70, 100, 5, "Excellent", 1], [institutionId, "B", 60, 69.99, 4, "Very good", 1],
      [institutionId, "C", 50, 59.99, 3, "Good", 1], [institutionId, "D", 45, 49.99, 2, "Fair", 1],
      [institutionId, "E", 40, 44.99, 1, "Pass", 1], [institutionId, "F", 0, 39.99, 0, "Fail", 0],
    ]);

    const lecturerUsers = Array.from({ length: 100 }, (_, index) => {
      const first = firstNames[index % firstNames.length];
      const last = lastNames[(index * 7) % lastNames.length];
      return [institutionId, roleIds.lecturer, `lecturer${index + 1}@maryfield.edu`, passwordHash, first, last, "active", "2024-01-01 00:00:00"];
    });
    await bulkInsert(connection, "users", ["institution_id", "role_id", "email", "password_hash", "first_name", "last_name", "status", "email_verified_at"], lecturerUsers);
    const [lecturerUserRows] = await connection.query("SELECT id,email,first_name,last_name FROM users WHERE institution_id=? AND role_id=? ORDER BY id", [institutionId, roleIds.lecturer]);
    const lecturerRecords = lecturerUserRows.map((user, index) => [institutionId, user.id, departmentRows[index % departmentRows.length].id, `MR-STF-${String(index + 1).padStart(4, "0")}`, user.first_name, user.last_name, user.email, `+23480${String(10000000 + index).padStart(8, "0")}`, index % 4 === 0 ? "PhD" : "M.Sc.", `Block ${String.fromCharCode(65 + index % 8)}, Room ${10 + index}`, date(2014 + index % 10, 1 + index % 9, 2 + index % 20)]);
    await bulkInsert(connection, "lecturers", ["institution_id", "user_id", "department_id", "staff_id", "first_name", "last_name", "email", "phone", "qualification", "office", "employment_date"], lecturerRecords);
    const [lecturerRows] = await connection.query("SELECT id,user_id FROM lecturers WHERE institution_id=? ORDER BY id", [institutionId]);

    const courseRows = [];
    for (let index = 0; index < 300; index += 1) {
      const department = departmentRows[index % departmentRows.length];
      const round = Math.floor(index / departmentRows.length);
      const levelIndex = round % 5;
      const courseNumber = (levelIndex + 1) * 100 + 1 + Math.floor(round / 5) * 2;
      courseRows.push([institutionId, department.id, `${department.code} ${courseNumber}`, `${department.name} ${["Foundations", "Methods", "Systems", "Practice", "Research", "Applications"][Math.floor(index / 20) % 6]} ${Math.floor(index / 120) + 1}`, 2 + index % 3, levelRows[levelIndex].id, index % 5 === 0 ? "elective" : "core"]);
    }
    await bulkInsert(connection, "courses", ["institution_id", "department_id", "code", "title", "credit_units", "level_id", "course_type"], courseRows);
    const [courses] = await connection.query("SELECT id,department_id,credit_units FROM courses WHERE institution_id=? ORDER BY id", [institutionId]);
    await bulkInsert(connection, "course_allocations", ["institution_id", "course_id", "lecturer_id", "semester_id", "is_coordinator"], courses.map((course, index) => [institutionId, course.id, lecturerRows[index % lecturerRows.length].id, semester.insertId, 1]));

    const studentUsers = Array.from({ length: 500 }, (_, index) => {
      const first = firstNames[index % firstNames.length];
      const last = lastNames[(index * 3 + 2) % lastNames.length];
      return [institutionId, roleIds.student, `student${String(index + 1).padStart(4, "0")}@maryfield.edu`, passwordHash, first, last, "active", "2024-01-01 00:00:00"];
    });
    await bulkInsert(connection, "users", ["institution_id", "role_id", "email", "password_hash", "first_name", "last_name", "status", "email_verified_at"], studentUsers);
    const [studentUserRows] = await connection.query("SELECT id,email,first_name,last_name FROM users WHERE institution_id=? AND role_id=? ORDER BY id", [institutionId, roleIds.student]);
    const studentRecords = studentUserRows.map((user, index) => {
      const programme = programmeRows[index % programmeRows.length];
      const levelIndex = index % 5;
      return [institutionId, user.id, `MR/${departmentRows[index % departmentRows.length].code}/${2021 + levelIndex}/${String(index + 1).padStart(4, "0")}`, user.first_name, user.last_name, user.email, `+23481${String(10000000 + index).padStart(8, "0")}`, index % 2 ? "male" : "female", date(1998 + index % 9, 1 + index % 12, 1 + index % 27), programme.id, levelRows[levelIndex].id, date(2021 + levelIndex, 9, 15), levelIndex === 4 ? "eligible" : "not_eligible", "active"];
    });
    await bulkInsert(connection, "students", ["institution_id", "user_id", "matric_number", "first_name", "last_name", "email", "phone", "gender", "date_of_birth", "programme_id", "level_id", "admission_date", "graduation_status", "status"], studentRecords);
    const [dbStudents] = await connection.query("SELECT id,programme_id FROM students WHERE institution_id=? ORDER BY id", [institutionId]);

    const coursesByDepartment = new Map();
    for (const course of courses) {
      if (!coursesByDepartment.has(course.department_id)) coursesByDepartment.set(course.department_id, []);
      coursesByDepartment.get(course.department_id).push(course);
    }
    const registrations = [];
    dbStudents.forEach((student, studentIndex) => {
      const programme = programmeRows.find((item) => item.id === student.programme_id);
      const matchingCourses = coursesByDepartment.get(programme.department_id);
      for (let offset = 0; offset < 6; offset += 1) {
        const course = matchingCourses[(studentIndex + offset) % matchingCourses.length];
        registrations.push([institutionId, student.id, course.id, semester.insertId, "approved", adminId]);
      }
    });
    await bulkInsert(connection, "course_registrations", ["institution_id", "student_id", "course_id", "semester_id", "status", "approved_by"], registrations);
    const [registrationRows] = await connection.query("SELECT cr.id,cr.student_id,cr.course_id,c.credit_units FROM course_registrations cr JOIN courses c ON c.id=cr.course_id WHERE cr.institution_id=? ORDER BY cr.id", [institutionId]);

    const [allocationRows] = await connection.query("SELECT id,course_id FROM course_allocations WHERE institution_id=? ORDER BY id LIMIT 20", [institutionId]);
    for (let index = 0; index < allocationRows.length; index += 1) {
      const allocation = allocationRows[index];
      const [attendanceSession] = await connection.execute(
        "INSERT INTO attendance_sessions (institution_id,course_allocation_id,held_at,duration_minutes,method,created_by) VALUES (?,?,?,?,?,?)",
        [institutionId, allocation.id, `2025-06-${String(2 + index).padStart(2, "0")} 09:00:00`, 120, index % 4 === 0 ? "qr" : "manual", adminId],
      );
      const attendees = registrationRows.filter((registration) => registration.course_id === allocation.course_id);
      if (attendees.length) {
        await bulkInsert(connection, "attendance_records", ["attendance_session_id", "student_id", "status", "checked_in_at", "marked_by"], attendees.map((registration, attendeeIndex) => [attendanceSession.insertId, registration.student_id, attendeeIndex % 11 === 0 ? "absent" : attendeeIndex % 7 === 0 ? "late" : "present", attendeeIndex % 11 === 0 ? null : `2025-06-${String(2 + index).padStart(2, "0")} 09:05:00`, adminId]));
      }
    }

    const batchCourses = courses.slice(0, 80);
    await bulkInsert(connection, "result_batches", ["institution_id", "course_id", "semester_id", "submitted_by", "status", "submitted_at", "approved_by", "approved_at"], batchCourses.map((course, index) => [institutionId, course.id, semester.insertId, lecturerRows[index % lecturerRows.length].user_id, index < 12 ? "submitted" : "approved", "2025-07-20 10:00:00", index < 12 ? null : adminId, index < 12 ? null : "2025-07-22 12:00:00"]));
    const [batches] = await connection.query("SELECT id,course_id FROM result_batches WHERE institution_id=?", [institutionId]);
    const batchMap = new Map(batches.map((batch) => [batch.course_id, batch.id]));
    const resultRecords = registrationRows.map((registration, index) => {
      const ca = 14 + index % 17; const assignment = 4 + index % 7; const practical = index % 3 === 0 ? 8 : 0; const exam = 18 + index % 33;
      const total = Math.min(100, ca + assignment + practical + exam); const [letter, points, remark] = gradeFor(total);
      return [batchMap.get(registration.course_id) ?? null, registration.id, ca, assignment, practical, exam, total, letter, points, remark, adminId];
    });
    await bulkInsert(connection, "results", ["batch_id", "course_registration_id", "ca_score", "assignment_score", "practical_score", "exam_score", "total_score", "letter_grade", "grade_point", "remark", "entered_by"], resultRecords);

    const gpaRecords = dbStudents.map((student, index) => {
      const gpa = Number((2.35 + (index % 265) / 100).toFixed(2));
      return [institutionId, student.id, semester.insertId, 18, gpa >= 2 ? 18 : 14, Number((gpa * 18).toFixed(2)), gpa, Math.min(5, Number((gpa + (index % 7 - 3) / 100).toFixed(2))), gpa >= 4.5 ? "Excellent" : gpa >= 2 ? "Good standing" : "Academic warning", gpa >= 4.5 ? "First class" : gpa >= 3.5 ? "Second class upper" : "Second class lower", 1];
    });
    await bulkInsert(connection, "gpa_records", ["institution_id", "student_id", "semester_id", "attempted_credits", "earned_credits", "quality_points", "gpa", "cgpa", "academic_standing", "classification", "is_current"], gpaRecords);

    await bulkInsert(connection, "notifications", ["institution_id", "user_id", "type", "title", "message", "action_url"], [
      [institutionId, adminId, "results", "Results awaiting approval", "12 course result batches require review.", "/results"],
      [institutionId, adminId, "admissions", "Admissions batch verified", "42 applications have passed initial verification.", "/students"],
    ]);
    await connection.execute("INSERT INTO announcements (institution_id,title,body,audience,starts_at,ends_at,published_by) VALUES (?,?,?,?,?,?,?)", [institutionId, "Second semester result processing", "All lecturers should submit outstanding scores before the published deadline.", JSON.stringify(["lecturer", "hod"]), "2025-07-15", "2025-07-31", adminId]);
    await bulkInsert(connection, "academic_calendar_events", ["institution_id", "session_id", "semester_id", "title", "description", "event_type", "starts_at", "ends_at", "audience", "created_by"], [
      [institutionId, session.insertId, semester.insertId, "Second semester examinations", "University-wide second semester examination period.", "examination", "2025-07-07 08:00:00", "2025-07-18 17:00:00", JSON.stringify(["student", "lecturer"]), adminId],
      [institutionId, session.insertId, semester.insertId, "Result approval senate", "Final approval meeting for second semester results.", "meeting", "2025-08-08 10:00:00", "2025-08-08 14:00:00", JSON.stringify(["school_admin", "hod"]), adminId],
    ]);

    await connection.commit();
    console.log("Seed complete: 1 institution, 8 faculties, 20 departments, 100 lecturers, 300 courses, 500 students, 3,000 registrations and results.");
    console.log("Administrator: bamidelebunmi412@gmail.com / MaryResult@2026");
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

seed().catch((error) => {
  console.error("Seed failed", error);
  process.exit(1);
});