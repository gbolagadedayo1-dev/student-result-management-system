# REST API

Base URL: `/api`. JSON is used for all requests except PDF downloads.

## Authentication

### POST `/auth/register`

Public registration is available only for students and lecturers. New accounts are created as `pending` and become active after institution verification.

```json
{
  "institutionSlug": "maryfield-academy",
  "role": "student",
  "firstName": "Amara",
  "lastName": "Okafor",
  "email": "amara@maryfield.edu",
  "password": "a-strong-password",
  "matricNumber": "MR/CSC/2025/0001",
  "programmeId": 1,
  "levelId": 1,
  "gender": "female",
  "dateOfBirth": "2006-03-14"
}
```

Lecturer registration uses `staffId`, `departmentId`, `qualification`, and optional `employmentDate` instead of student academic fields.

### GET `/auth/registrations/pending`

Role: school administrator. Lists pending student and lecturer registrations.

### POST `/auth/registrations/:id/approve`

Role: school administrator. Activates the user and matching student or lecturer profile.

### POST `/auth/login`

```json
{
  "email": "admin@maryfield.edu",
  "password": "MaryResult@2026"
}
```

Returns a signed access token and a safe user profile. Send the token on protected calls:

```http
Authorization: Bearer <token>
```

### POST `/auth/google`

Accepts a Google Identity Services ID-token credential and selected MaryResult role. The API verifies the token signature, audience, and verified-email claim with Google's official authentication library. The Gmail must already belong to an active MaryResult account; pending registrations are rejected until an administrator approves them.

### GET `/auth/me`

Returns the authenticated profile, role, and institution.

## Students

### GET `/students?page=1&limit=25&search=amara`

Roles: super administrator, school administrator, HOD, lecturer. Returns paginated records and current CGPA.

### GET `/students/:id`

Returns a tenant-scoped student and academic structure.

### POST `/students`

Roles: super administrator, school administrator.

```json
{
  "firstName": "Amara",
  "lastName": "Okafor",
  "email": "amara@maryfield.edu",
  "matricNumber": "MR/CSC/2025/0001",
  "programmeId": 1,
  "levelId": 1,
  "gender": "female",
  "dateOfBirth": "2006-03-14",
  "admissionDate": "2025-09-15"
}
```

## Results

### GET `/results/pending`

Roles: school administrator, HOD. Returns submitted batches with class average and lecturer.

### POST `/results/scores`

Role: lecturer. Records a new score for a student registered in one of the lecturer's allocated courses. The result remains a draft.

```json
{
  "registrationId": 104,
  "caScore": 24,
  "assignmentScore": 8,
  "practicalScore": 0,
  "examScore": 41
}
```

### GET `/results/mine`

Role: lecturer. Returns the lecturer's editable and approved result records.

### PATCH `/results/scores/:id`

Role: lecturer. Edits one or more score components. Editing a submitted result returns its batch to draft so it must be resubmitted.

### DELETE `/results/scores/:id`

Role: lecturer. Deletes a draft or submitted result. Approved and published results are locked.

### POST `/results/batches/:id/submit`

Role: lecturer. Submits a non-empty draft batch to the administrator.

### POST `/results/batches/:id/approve`

Roles: school administrator or super administrator. Only an administrator can approve a lecturer submission. Approval locks the batch against lecturer editing and deletion. Every record, edit, deletion, submission, and approval writes an audit event.

## Analytics

### GET `/analytics/overview`

Roles: super administrator, school administrator, HOD. Returns students, lecturers, pending results, mean CGPA, and ranked department performance.

## Transcripts

### POST `/transcripts/requests`

Role: student. Creates a tracked official or student-copy transcript request.

### GET `/transcripts/requests/me`

Role: student. Returns the student's transcript request history and ready document links.

### GET `/transcripts/:studentId/pdf`

Streams a watermarked official PDF with course history, institution details, support contact, and a QR verification code.

### GET `/transcripts/verify/:matricNumber`

Public verification endpoint used by the document QR code.

## Academic Sessions And Calendar

### GET `/academics/sessions`

Returns the institution's academic sessions for every authenticated role.

### POST `/academics/sessions`

Roles: school administrator or super administrator. Adds a planned, active, or closed academic session after validating its date range.

### DELETE `/academics/sessions/:id`

Roles: school administrator or super administrator. Deletes a non-active session.

### GET `/academics/calendar`

Returns upcoming academic calendar events for students, lecturers, and administrators.

## Operations

### GET `/health`

Unauthenticated liveness response. Use a separate protected readiness endpoint that pings MySQL if required by the hosting platform.

Errors use a consistent shape:

```json
{
  "error": "Validation failed",
  "details": [{ "field": "email", "message": "Invalid email address" }]
}
```