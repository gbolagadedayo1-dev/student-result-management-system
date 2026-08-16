# Architecture

## Client

The React application is a responsive single-page experience. `src/App.tsx` owns the public brand surface, role selection, administrator workspace, lecturer workspace, and student self-service view. Framer Motion provides restrained transitions. Recharts renders enrollment, grade distribution, and department performance. `src/index.css` provides the theme tokens, responsive system, and dark workspace mode.

The current demo keeps its view state in memory so every workflow can be reviewed without infrastructure. For a deployed system, replace the demo state handlers with an API client using the endpoints in `docs/api.md`, store the access token in memory, and use a rotated secure refresh token.

## API

The Express service follows a layered flow:

```text
request -> security middleware -> JWT -> RBAC -> Zod validation -> route -> MySQL -> audit -> response
```

- `server/config`: typed runtime values and pooled database access
- `server/middleware`: authentication, authorization, 404s, and safe error responses
- `server/routes`: thin HTTP controllers with tenant-scoped queries
- `server/services`: reusable audit, mail, file storage, and document behavior

Every protected query is scoped to the institution ID embedded in a signed token. Global super administrator endpoints should be kept in a distinct route group and require the `super_admin` role.

## Data

MySQL is normalized around institution, identity, academic structure, enrollment, assessment, attendance, and official-record domains. Composite indexes support tenant-aware searches. Foreign keys prevent orphan academic records. JSON is limited to flexible settings, audiences, checklists, and audit metadata.

## Production Extensions

- Move refresh tokens into a revocable session table and rotate on every use.
- Add a Redis-backed queue for email, large imports, reports, backups, and transcript generation.
- Store generated documents in Cloudinary or S3, not on the API filesystem.
- Add object-level rules for students and parents before exposing self-service API routes.
- Add OpenTelemetry traces, centralized logs, uptime checks, and alerting.
- Run schema changes through versioned migrations rather than importing `schema.sql` after initial setup.
- Split frontend routes with React lazy loading as feature modules grow.