# MaryResult ER Diagram

The production schema is defined in `database/schema.sql`. The diagram below highlights the central relationships. Tenant-owned tables also carry `institution_id` even where the line is omitted for readability.

```mermaid
erDiagram
  INSTITUTIONS ||--o{ USERS : owns
  INSTITUTIONS ||--o{ FACULTIES : has
  ROLES ||--o{ USERS : assigns
  USERS ||--o| ADMINISTRATORS : profiles
  ROLES }o--o{ PERMISSIONS : grants
  FACULTIES ||--o{ DEPARTMENTS : contains
  DEPARTMENTS ||--o{ PROGRAMMES : offers
  DEPARTMENTS ||--o{ LECTURERS : employs
  DEPARTMENTS ||--o{ COURSES : owns
  PROGRAMMES ||--o{ STUDENTS : enrolls
  LEVELS ||--o{ STUDENTS : classifies
  LEVELS ||--o{ COURSES : targets
  USERS o|--o| STUDENTS : authenticates
  USERS o|--o| LECTURERS : authenticates
  PARENTS }o--o{ STUDENTS : monitors
  ACADEMIC_SESSIONS ||--o{ SEMESTERS : contains
  COURSES ||--o{ COURSE_ALLOCATIONS : allocated
  LECTURERS ||--o{ COURSE_ALLOCATIONS : teaches
  SEMESTERS ||--o{ COURSE_ALLOCATIONS : schedules
  STUDENTS ||--o{ COURSE_REGISTRATIONS : registers
  COURSES ||--o{ COURSE_REGISTRATIONS : selected
  SEMESTERS ||--o{ COURSE_REGISTRATIONS : occurs_in
  COURSE_REGISTRATIONS ||--o| RESULTS : receives
  RESULT_BATCHES ||--o{ RESULTS : groups
  STUDENTS ||--o{ GPA_RECORDS : earns
  COURSE_ALLOCATIONS ||--o{ ATTENDANCE_SESSIONS : holds
  ATTENDANCE_SESSIONS ||--o{ ATTENDANCE_RECORDS : captures
  STUDENTS ||--o{ ATTENDANCE_RECORDS : marks
  STUDENTS ||--o{ TRANSCRIPT_REQUESTS : requests
  STUDENTS ||--o{ CLEARANCE_REQUESTS : requests
  USERS ||--o{ NOTIFICATIONS : receives
  ACADEMIC_SESSIONS ||--o{ ACADEMIC_CALENDAR_EVENTS : schedules
  USERS ||--o{ AUDIT_LOGS : performs
```

## Data Rules

- Every student matric number, course code, department code, and faculty code is unique inside an institution.
- A student can register a course only once per semester.
- A course has one result batch per semester, and a registration has one final result.
- Score and grading checks are enforced both at the API boundary and in MySQL.
- Audit records retain actor, IP address, user agent, entity, action, and JSON metadata.
- Transcript verification codes and public UUIDs avoid exposing sequential identifiers in documents.