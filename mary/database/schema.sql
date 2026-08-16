-- MaryResult SIAMS relational schema for MySQL 8.0+
CREATE DATABASE IF NOT EXISTS maryresult CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE maryresult;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS audit_logs, clearance_requests, transcript_requests, academic_calendar_events, announcements, notifications,
  attendance_records, attendance_sessions, gpa_records, results, result_batches, grading_scales,
  course_registrations, course_allocations, courses, parent_students, parents, students, staff, lecturers, administrators,
  levels, semesters, academic_sessions, programmes, departments, faculties, settings, login_history,
  password_reset_tokens, user_permissions, role_permissions, permissions, users, roles, institutions;
SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE institutions (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  public_id CHAR(36) NOT NULL UNIQUE DEFAULT (UUID()),
  name VARCHAR(190) NOT NULL,
  slug VARCHAR(120) NOT NULL UNIQUE,
  type ENUM('primary','secondary','college','polytechnic','university','training','other') NOT NULL,
  email VARCHAR(190) NOT NULL,
  google_sub VARCHAR(255) NULL,
  phone VARCHAR(30), address TEXT, logo_url VARCHAR(500), website VARCHAR(255),
  status ENUM('pending','active','suspended','archived') NOT NULL DEFAULT 'pending',
  subscription_plan VARCHAR(60) NOT NULL DEFAULT 'standard',
  subscription_ends_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_institutions_status (status)
) ENGINE=InnoDB;

CREATE TABLE roles (
  id SMALLINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(50) NOT NULL UNIQUE,
  display_name VARCHAR(100) NOT NULL,
  description VARCHAR(255),
  is_system BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB;

CREATE TABLE permissions (
  id SMALLINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL UNIQUE,
  module VARCHAR(60) NOT NULL,
  description VARCHAR(255)
) ENGINE=InnoDB;

CREATE TABLE role_permissions (
  role_id SMALLINT UNSIGNED NOT NULL,
  permission_id SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  CONSTRAINT fk_rp_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_rp_permission FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE users (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  public_id CHAR(36) NOT NULL UNIQUE DEFAULT (UUID()),
  institution_id BIGINT UNSIGNED NULL,
  role_id SMALLINT UNSIGNED NOT NULL,
  email VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(80) NOT NULL,
  last_name VARCHAR(80) NOT NULL,
  phone VARCHAR(30), avatar_url VARCHAR(500),
  status ENUM('pending','active','suspended','locked','archived') NOT NULL DEFAULT 'pending',
  email_verified_at DATETIME NULL, two_factor_secret VARCHAR(255) NULL,
  failed_login_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  locked_until DATETIME NULL, last_login_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_email_institution (institution_id, email),
  UNIQUE KEY uq_user_google_sub (google_sub),
  INDEX idx_users_role_status (role_id, status),
  CONSTRAINT fk_users_institution FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
  CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id)
) ENGINE=InnoDB;

CREATE TABLE user_permissions (
  user_id BIGINT UNSIGNED NOT NULL, permission_id SMALLINT UNSIGNED NOT NULL,
  allowed BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (user_id, permission_id),
  CONSTRAINT fk_up_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_up_permission FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE password_reset_tokens (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT, user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE, expires_at DATETIME NOT NULL, used_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_reset_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_reset_expiry (expires_at)
) ENGINE=InnoDB;

CREATE TABLE login_history (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT, user_id BIGINT UNSIGNED NOT NULL,
  ip_address VARCHAR(45), user_agent VARCHAR(500), successful BOOLEAN NOT NULL,
  attempted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_login_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_login_user_time (user_id, attempted_at)
) ENGINE=InnoDB;

CREATE TABLE settings (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT, institution_id BIGINT UNSIGNED NULL,
  setting_key VARCHAR(120) NOT NULL, setting_value JSON NOT NULL,
  is_public BOOLEAN NOT NULL DEFAULT FALSE, updated_by BIGINT UNSIGNED NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_setting_scope (institution_id, setting_key),
  CONSTRAINT fk_settings_institution FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
  CONSTRAINT fk_settings_user FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE administrators (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT, institution_id BIGINT UNSIGNED NULL,
  user_id BIGINT UNSIGNED NOT NULL, staff_id VARCHAR(50), job_title VARCHAR(120), office VARCHAR(100),
  appointed_at DATE, status ENUM('active','leave','inactive') NOT NULL DEFAULT 'active',
  UNIQUE KEY uq_administrator_user (user_id), UNIQUE KEY uq_admin_staff (institution_id, staff_id),
  CONSTRAINT fk_admin_institution FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
  CONSTRAINT fk_admin_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE faculties (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT, institution_id BIGINT UNSIGNED NOT NULL,
  code VARCHAR(20) NOT NULL, name VARCHAR(150) NOT NULL, dean_user_id BIGINT UNSIGNED NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_faculty_code (institution_id, code), UNIQUE KEY uq_faculty_name (institution_id, name),
  CONSTRAINT fk_faculty_institution FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
  CONSTRAINT fk_faculty_dean FOREIGN KEY (dean_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE departments (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT, institution_id BIGINT UNSIGNED NOT NULL,
  faculty_id BIGINT UNSIGNED NOT NULL, code VARCHAR(20) NOT NULL, name VARCHAR(150) NOT NULL,
  hod_user_id BIGINT UNSIGNED NULL, status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  UNIQUE KEY uq_department_code (institution_id, code),
  INDEX idx_departments_faculty (faculty_id),
  CONSTRAINT fk_department_institution FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
  CONSTRAINT fk_department_faculty FOREIGN KEY (faculty_id) REFERENCES faculties(id),
  CONSTRAINT fk_department_hod FOREIGN KEY (hod_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE programmes (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT, institution_id BIGINT UNSIGNED NOT NULL,
  department_id BIGINT UNSIGNED NOT NULL, code VARCHAR(30) NOT NULL, name VARCHAR(180) NOT NULL,
  award VARCHAR(80), duration_years TINYINT UNSIGNED NOT NULL, required_credits SMALLINT UNSIGNED,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  UNIQUE KEY uq_programme_code (institution_id, code), INDEX idx_programmes_department (department_id),
  CONSTRAINT fk_programme_institution FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
  CONSTRAINT fk_programme_department FOREIGN KEY (department_id) REFERENCES departments(id)
) ENGINE=InnoDB;

CREATE TABLE academic_sessions (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT, institution_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(30) NOT NULL, starts_on DATE NOT NULL, ends_on DATE NOT NULL,
  status ENUM('planned','active','closed') NOT NULL DEFAULT 'planned',
  UNIQUE KEY uq_session_name (institution_id, name),
  CONSTRAINT fk_session_institution FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
  CHECK (ends_on > starts_on)
) ENGINE=InnoDB;

CREATE TABLE semesters (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT, institution_id BIGINT UNSIGNED NOT NULL,
  session_id BIGINT UNSIGNED NOT NULL, name VARCHAR(40) NOT NULL, ordinal TINYINT UNSIGNED NOT NULL,
  starts_on DATE NOT NULL, ends_on DATE NOT NULL, registration_deadline DATE,
  status ENUM('planned','active','result_processing','closed') NOT NULL DEFAULT 'planned',
  UNIQUE KEY uq_semester_ordinal (session_id, ordinal),
  CONSTRAINT fk_semester_institution FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
  CONSTRAINT fk_semester_session FOREIGN KEY (session_id) REFERENCES academic_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE levels (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT, institution_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(60) NOT NULL, ordinal SMALLINT UNSIGNED NOT NULL,
  UNIQUE KEY uq_level_name (institution_id, name),
  CONSTRAINT fk_level_institution FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE lecturers (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT, institution_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NULL, department_id BIGINT UNSIGNED NOT NULL,
  staff_id VARCHAR(50) NOT NULL, first_name VARCHAR(80) NOT NULL, last_name VARCHAR(80) NOT NULL,
  email VARCHAR(190) NOT NULL, phone VARCHAR(30), qualification VARCHAR(150), office VARCHAR(100),
  employment_date DATE NOT NULL, status ENUM('active','leave','inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_lecturer_staff (institution_id, staff_id), UNIQUE KEY uq_lecturer_email (institution_id, email),
  CONSTRAINT fk_lecturer_institution FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
  CONSTRAINT fk_lecturer_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_lecturer_department FOREIGN KEY (department_id) REFERENCES departments(id)
) ENGINE=InnoDB;

CREATE TABLE staff (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT, institution_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NULL, department_id BIGINT UNSIGNED NULL, staff_id VARCHAR(50) NOT NULL,
  first_name VARCHAR(80) NOT NULL, last_name VARCHAR(80) NOT NULL, email VARCHAR(190) NOT NULL,
  phone VARCHAR(30), job_title VARCHAR(120) NOT NULL, employment_date DATE NOT NULL,
  status ENUM('active','leave','inactive') NOT NULL DEFAULT 'active',
  UNIQUE KEY uq_staff_number (institution_id, staff_id),
  CONSTRAINT fk_staff_institution FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
  CONSTRAINT fk_staff_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_staff_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE students (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT, institution_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NULL, student_id CHAR(36) NOT NULL DEFAULT (UUID()),
  matric_number VARCHAR(60) NOT NULL, first_name VARCHAR(80) NOT NULL, middle_name VARCHAR(80),
  last_name VARCHAR(80) NOT NULL, email VARCHAR(190) NOT NULL, phone VARCHAR(30),
  gender ENUM('male','female','other') NOT NULL, date_of_birth DATE NOT NULL,
  address TEXT, passport_url VARCHAR(500), guardian_name VARCHAR(160), guardian_phone VARCHAR(30),
  guardian_email VARCHAR(190), programme_id BIGINT UNSIGNED NOT NULL, level_id BIGINT UNSIGNED NOT NULL,
  admission_date DATE NOT NULL, expected_graduation_date DATE,
  status ENUM('applicant','active','deferred','suspended','withdrawn','graduated','archived') NOT NULL DEFAULT 'applicant',
  graduation_status ENUM('not_eligible','eligible','cleared','graduated') NOT NULL DEFAULT 'not_eligible',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_student_matric (institution_id, matric_number), UNIQUE KEY uq_student_uuid (student_id),
  INDEX idx_students_programme_level (programme_id, level_id), INDEX idx_students_name (last_name, first_name),
  CONSTRAINT fk_student_institution FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
  CONSTRAINT fk_student_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_student_programme FOREIGN KEY (programme_id) REFERENCES programmes(id),
  CONSTRAINT fk_student_level FOREIGN KEY (level_id) REFERENCES levels(id)
) ENGINE=InnoDB;

CREATE TABLE parents (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT, institution_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NULL, full_name VARCHAR(160) NOT NULL, email VARCHAR(190), phone VARCHAR(30) NOT NULL,
  address TEXT, relationship VARCHAR(50),
  CONSTRAINT fk_parent_institution FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
  CONSTRAINT fk_parent_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE parent_students (
  parent_id BIGINT UNSIGNED NOT NULL, student_id BIGINT UNSIGNED NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (parent_id, student_id),
  CONSTRAINT fk_ps_parent FOREIGN KEY (parent_id) REFERENCES parents(id) ON DELETE CASCADE,
  CONSTRAINT fk_ps_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE courses (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT, institution_id BIGINT UNSIGNED NOT NULL,
  department_id BIGINT UNSIGNED NOT NULL, code VARCHAR(30) NOT NULL, title VARCHAR(180) NOT NULL,
  credit_units TINYINT UNSIGNED NOT NULL, level_id BIGINT UNSIGNED NOT NULL,
  course_type ENUM('core','elective','general') NOT NULL DEFAULT 'core', description TEXT,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  UNIQUE KEY uq_course_code (institution_id, code), INDEX idx_courses_department_level (department_id, level_id),
  CONSTRAINT fk_course_institution FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
  CONSTRAINT fk_course_department FOREIGN KEY (department_id) REFERENCES departments(id),
  CONSTRAINT fk_course_level FOREIGN KEY (level_id) REFERENCES levels(id), CHECK (credit_units BETWEEN 1 AND 12)
) ENGINE=InnoDB;

CREATE TABLE course_allocations (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT, institution_id BIGINT UNSIGNED NOT NULL,
  course_id BIGINT UNSIGNED NOT NULL, lecturer_id BIGINT UNSIGNED NOT NULL,
  semester_id BIGINT UNSIGNED NOT NULL, is_coordinator BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE KEY uq_course_lecturer_term (course_id, lecturer_id, semester_id),
  CONSTRAINT fk_allocation_institution FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
  CONSTRAINT fk_allocation_course FOREIGN KEY (course_id) REFERENCES courses(id),
  CONSTRAINT fk_allocation_lecturer FOREIGN KEY (lecturer_id) REFERENCES lecturers(id),
  CONSTRAINT fk_allocation_semester FOREIGN KEY (semester_id) REFERENCES semesters(id)
) ENGINE=InnoDB;

CREATE TABLE course_registrations (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT, institution_id BIGINT UNSIGNED NOT NULL,
  student_id BIGINT UNSIGNED NOT NULL, course_id BIGINT UNSIGNED NOT NULL, semester_id BIGINT UNSIGNED NOT NULL,
  status ENUM('registered','approved','dropped','completed') NOT NULL DEFAULT 'registered',
  registered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, approved_by BIGINT UNSIGNED NULL,
  UNIQUE KEY uq_registration (student_id, course_id, semester_id),
  INDEX idx_registration_course_term (course_id, semester_id),
  CONSTRAINT fk_registration_institution FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
  CONSTRAINT fk_registration_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_registration_course FOREIGN KEY (course_id) REFERENCES courses(id),
  CONSTRAINT fk_registration_semester FOREIGN KEY (semester_id) REFERENCES semesters(id),
  CONSTRAINT fk_registration_approver FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE grading_scales (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT, institution_id BIGINT UNSIGNED NOT NULL,
  letter_grade VARCHAR(3) NOT NULL, min_score DECIMAL(5,2) NOT NULL, max_score DECIMAL(5,2) NOT NULL,
  grade_point DECIMAL(3,2) NOT NULL, remark VARCHAR(80), is_pass BOOLEAN NOT NULL,
  UNIQUE KEY uq_grade_letter (institution_id, letter_grade),
  CONSTRAINT fk_grade_institution FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
  CHECK (min_score >= 0 AND max_score <= 100 AND min_score <= max_score)
) ENGINE=InnoDB;

CREATE TABLE result_batches (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT, institution_id BIGINT UNSIGNED NOT NULL,
  course_id BIGINT UNSIGNED NOT NULL, semester_id BIGINT UNSIGNED NOT NULL,
  submitted_by BIGINT UNSIGNED NOT NULL, status ENUM('draft','submitted','hod_approved','approved','published','rejected') NOT NULL DEFAULT 'draft',
  submitted_at DATETIME NULL, approved_by BIGINT UNSIGNED NULL, approved_at DATETIME NULL,
  published_by BIGINT UNSIGNED NULL, published_at DATETIME NULL, rejection_reason VARCHAR(500),
  UNIQUE KEY uq_result_batch (course_id, semester_id), INDEX idx_result_batch_status (institution_id, status),
  CONSTRAINT fk_batch_institution FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
  CONSTRAINT fk_batch_course FOREIGN KEY (course_id) REFERENCES courses(id),
  CONSTRAINT fk_batch_semester FOREIGN KEY (semester_id) REFERENCES semesters(id),
  CONSTRAINT fk_batch_submitter FOREIGN KEY (submitted_by) REFERENCES users(id),
  CONSTRAINT fk_batch_approver FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_batch_publisher FOREIGN KEY (published_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE results (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT, batch_id BIGINT UNSIGNED NULL,
  course_registration_id BIGINT UNSIGNED NOT NULL, ca_score DECIMAL(5,2) NOT NULL DEFAULT 0,
  assignment_score DECIMAL(5,2) NOT NULL DEFAULT 0, practical_score DECIMAL(5,2) NOT NULL DEFAULT 0,
  exam_score DECIMAL(5,2) NOT NULL DEFAULT 0, total_score DECIMAL(5,2) NOT NULL,
  letter_grade VARCHAR(3) NOT NULL, grade_point DECIMAL(3,2) NOT NULL, remark VARCHAR(80),
  is_carry_over BOOLEAN GENERATED ALWAYS AS (grade_point = 0) STORED,
  entered_by BIGINT UNSIGNED NOT NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_result_registration (course_registration_id), INDEX idx_results_batch (batch_id),
  CONSTRAINT fk_result_batch FOREIGN KEY (batch_id) REFERENCES result_batches(id) ON DELETE SET NULL,
  CONSTRAINT fk_result_registration FOREIGN KEY (course_registration_id) REFERENCES course_registrations(id) ON DELETE CASCADE,
  CONSTRAINT fk_result_entered_by FOREIGN KEY (entered_by) REFERENCES users(id),
  CHECK (total_score BETWEEN 0 AND 100)
) ENGINE=InnoDB;

CREATE TABLE gpa_records (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT, institution_id BIGINT UNSIGNED NOT NULL,
  student_id BIGINT UNSIGNED NOT NULL, semester_id BIGINT UNSIGNED NOT NULL,
  attempted_credits SMALLINT UNSIGNED NOT NULL, earned_credits SMALLINT UNSIGNED NOT NULL,
  quality_points DECIMAL(8,2) NOT NULL, gpa DECIMAL(3,2) NOT NULL, cgpa DECIMAL(3,2) NOT NULL,
  academic_standing VARCHAR(100), classification VARCHAR(100), is_current BOOLEAN NOT NULL DEFAULT TRUE,
  calculated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_gpa_student_term (student_id, semester_id), INDEX idx_gpa_current (institution_id, is_current),
  CONSTRAINT fk_gpa_institution FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
  CONSTRAINT fk_gpa_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_gpa_semester FOREIGN KEY (semester_id) REFERENCES semesters(id)
) ENGINE=InnoDB;

CREATE TABLE attendance_sessions (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT, institution_id BIGINT UNSIGNED NOT NULL,
  course_allocation_id BIGINT UNSIGNED NOT NULL, held_at DATETIME NOT NULL, duration_minutes SMALLINT UNSIGNED,
  method ENUM('manual','qr') NOT NULL DEFAULT 'manual', qr_token_hash CHAR(64), qr_expires_at DATETIME,
  created_by BIGINT UNSIGNED NOT NULL,
  CONSTRAINT fk_att_session_institution FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
  CONSTRAINT fk_att_session_allocation FOREIGN KEY (course_allocation_id) REFERENCES course_allocations(id),
  CONSTRAINT fk_att_session_creator FOREIGN KEY (created_by) REFERENCES users(id),
  INDEX idx_attendance_course_date (course_allocation_id, held_at)
) ENGINE=InnoDB;

CREATE TABLE attendance_records (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT, attendance_session_id BIGINT UNSIGNED NOT NULL,
  student_id BIGINT UNSIGNED NOT NULL, status ENUM('present','absent','late','excused') NOT NULL,
  checked_in_at DATETIME NULL, marked_by BIGINT UNSIGNED NULL,
  UNIQUE KEY uq_attendance_record (attendance_session_id, student_id),
  CONSTRAINT fk_att_record_session FOREIGN KEY (attendance_session_id) REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_att_record_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_att_record_marker FOREIGN KEY (marked_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE notifications (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT, institution_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL, type VARCHAR(60) NOT NULL, title VARCHAR(180) NOT NULL,
  message TEXT NOT NULL, action_url VARCHAR(500), read_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notification_institution FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
  CONSTRAINT fk_notification_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_notification_unread (user_id, read_at, created_at)
) ENGINE=InnoDB;

CREATE TABLE announcements (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT, institution_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(180) NOT NULL, body TEXT NOT NULL, audience JSON NOT NULL,
  starts_at DATETIME NOT NULL, ends_at DATETIME NULL, published_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_announcement_institution FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
  CONSTRAINT fk_announcement_publisher FOREIGN KEY (published_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE academic_calendar_events (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT, institution_id BIGINT UNSIGNED NOT NULL,
  session_id BIGINT UNSIGNED NULL, semester_id BIGINT UNSIGNED NULL, title VARCHAR(180) NOT NULL,
  description TEXT, event_type VARCHAR(60) NOT NULL, starts_at DATETIME NOT NULL, ends_at DATETIME NULL,
  audience JSON NOT NULL, created_by BIGINT UNSIGNED NOT NULL,
  CONSTRAINT fk_calendar_institution FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
  CONSTRAINT fk_calendar_session FOREIGN KEY (session_id) REFERENCES academic_sessions(id) ON DELETE SET NULL,
  CONSTRAINT fk_calendar_semester FOREIGN KEY (semester_id) REFERENCES semesters(id) ON DELETE SET NULL,
  CONSTRAINT fk_calendar_creator FOREIGN KEY (created_by) REFERENCES users(id),
  INDEX idx_calendar_dates (institution_id, starts_at, ends_at)
) ENGINE=InnoDB;

CREATE TABLE transcript_requests (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT, institution_id BIGINT UNSIGNED NOT NULL,
  request_number VARCHAR(50) NOT NULL, student_id BIGINT UNSIGNED NOT NULL,
  copy_type ENUM('student','official') NOT NULL, delivery_method ENUM('download','email','courier') NOT NULL,
  recipient_name VARCHAR(180), recipient_email VARCHAR(190), status ENUM('pending','processing','ready','delivered','rejected') NOT NULL DEFAULT 'pending',
  document_url VARCHAR(500), verification_code VARCHAR(80) UNIQUE, requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_by BIGINT UNSIGNED NULL, processed_at DATETIME NULL,
  UNIQUE KEY uq_transcript_request (institution_id, request_number),
  CONSTRAINT fk_transcript_institution FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
  CONSTRAINT fk_transcript_student FOREIGN KEY (student_id) REFERENCES students(id),
  CONSTRAINT fk_transcript_processor FOREIGN KEY (processed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE clearance_requests (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT, institution_id BIGINT UNSIGNED NOT NULL,
  student_id BIGINT UNSIGNED NOT NULL, clearance_type VARCHAR(100) NOT NULL,
  status ENUM('pending','in_progress','cleared','rejected') NOT NULL DEFAULT 'pending',
  checklist JSON NOT NULL, requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL, processed_by BIGINT UNSIGNED NULL,
  CONSTRAINT fk_clearance_institution FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
  CONSTRAINT fk_clearance_student FOREIGN KEY (student_id) REFERENCES students(id),
  CONSTRAINT fk_clearance_processor FOREIGN KEY (processed_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_clearance_status (institution_id, status)
) ENGINE=InnoDB;

CREATE TABLE audit_logs (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT, institution_id BIGINT UNSIGNED NULL,
  user_id BIGINT UNSIGNED NULL, action VARCHAR(120) NOT NULL, entity_type VARCHAR(80) NOT NULL,
  entity_id VARCHAR(80), metadata JSON, ip_address VARCHAR(45), user_agent VARCHAR(500),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_institution FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE SET NULL,
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_audit_scope_time (institution_id, created_at), INDEX idx_audit_entity (entity_type, entity_id)
) ENGINE=InnoDB;

-- System roles and default five-point grading are seeded separately.