# MaryResult SIAMS

MaryResult Student Information & Academic Management System is a multi-role academic administration platform for schools, colleges, polytechnics, universities, and training organizations.

The repository includes:

- Responsive React 19 and Tailwind CSS v4 public website
- Administrator, lecturer, and student workspaces
- Searchable student records, result approvals, analytics, notifications, theme control, and responsive navigation
- Student and lecturer self-registration with institution verification
- Lecturer-owned result recording, editing, deletion, and submission with administrator-only approval
- Secure Express 5 REST API foundation with JWT and RBAC
- MySQL 8 relational schema with tenant-aware indexes and constraints
- Demo generator for 500 students, 100 lecturers, 20 departments, 8 faculties, 300 courses, registrations, results, and GPA records
- PDF transcript generation with watermark and QR verification
- Cloudinary storage and Nodemailer service adapters
- Horizontal, stacked, icon-only, light, dark, and transparent SVG brand assets

## Quick Start

Requirements: Node.js 20+, npm 10+, and MySQL 8.0+.

```bash
cp .env.example .env
npm install
mysql -u root -p < database/schema.sql
node database/seed.js
node server/server.js
```

In a second terminal:

```bash
npm run dev
```

Open `http://localhost:5173`. Student and lecturer accounts must be registered with a Gmail address and approved by an administrator before they can sign in. The seeded API administrator is:

```text
bamidelebunmi412@gmail.com
MaryResult@2026
```

Change all seeded credentials and secrets before any deployment.

## Build

```bash
npm run build
```

The optimized frontend is written to `dist/`. Start the API with `node server/server.js` behind a process supervisor or container runtime.

## Project Layout

```text
src/                    React application and design system
public/                 MaryResult SVG logos and favicon
server/config/          Runtime configuration and MySQL pool
server/middleware/      JWT, RBAC, validation, and errors
server/routes/          Authentication and academic REST endpoints
server/services/        Audit, email, storage, and document services
database/schema.sql     Complete MySQL schema
database/seed.js        Deterministic institutional demo data
database/ERD.md         Mermaid entity relationship diagram
docs/                   Architecture, API, and deployment notes
```

## Security Baseline

- Parameterized database queries and strict request schemas
- Short-lived JWT access tokens with fixed issuer and audience
- bcrypt password hashing and timed account lock protection
- Role authorization on protected academic operations
- Helmet headers, explicit CORS origins, body limits, and rate limits
- Tenant scoping on records and analytics
- Immutable audit events for student and result changes
- Hashed password reset token model and login history
- Cloud storage adapter that rejects use when not configured

Bearer-token authentication does not use browser cookies, so it is not exposed to conventional cookie-based CSRF. If refresh tokens are moved to cookies, add same-site secure cookies and a CSRF token strategy.

## Support

MaryResult Support  
Email: bamidelebunmi412@gmail.com  
Phone: +234 915 179 8360

See [Architecture](docs/architecture.md), [API Reference](docs/api.md), and [Deployment](docs/deployment.md).