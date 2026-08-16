# Deployment Guide

## Environment

Copy `.env.example` into the secret manager of the selected platform. Use a random JWT secret of at least 32 bytes. Set a precise comma-separated `APP_ORIGIN`; do not use a wildcard with credentials.

Required production services:

- Node.js 20 or later
- MySQL 8 with automated encrypted backups
- TLS termination at the load balancer or reverse proxy
- Cloudinary account for profile and document files
- SMTP provider for verification, password reset, and notifications
- Google Cloud OAuth 2.0 Web Client for verified Gmail sign-in

## Google Sign-In

1. Create an OAuth 2.0 Client ID of type Web application in Google Cloud Console.
2. Add the frontend origins, such as `http://localhost:5173` and the production HTTPS origin, under Authorized JavaScript origins.
3. Set the same client ID in `GOOGLE_CLIENT_ID` for the API and `VITE_GOOGLE_CLIENT_ID` for the frontend build.
4. Set `VITE_API_URL` to the public API origin before building the frontend.
5. Keep the administrator approval workflow enabled. Google verifies Gmail ownership; MaryResult still verifies that the Google email belongs to an approved institutional account.

## Database

1. Create a least-privilege MySQL user for the application.
2. Import `database/schema.sql` once.
3. Run `node database/seed.js` only in a demo or staging environment.
4. Enable point-in-time recovery and test restores regularly.
5. Use private networking between the API and database where available.

Existing databases created before Google sign-in was added must apply `database/migrations/001_google_auth.sql` once. New installations already include the Google account identifier in `database/schema.sql`.

## Frontend

Run `npm run build`. Serve `dist/index.html` from a CDN or static host. The Vite single-file configuration creates one deployable document. Set the API origin in the future API client configuration rather than hard-coding it in UI components.

## API

Start with `NODE_ENV=production node server/server.js`. Run it behind a supervisor such as a container orchestrator, systemd, or a managed Node platform. Route `/api/*` to port 4000 and all remaining paths to the frontend.

Example reverse-proxy behavior:

```text
/api/*  -> http://maryresult-api:4000
/*      -> static dist/index.html
```

## Release Checklist

- Replace all seeded passwords and rotate secrets.
- Configure Cloudinary, SMTP, CORS, rate-limit proxy behavior, and database TLS.
- Verify role and object-level permissions with integration tests.
- Run dependency and container vulnerability scans.
- Add privacy retention rules for student records, exports, audit logs, and backups.
- Confirm PDF transcript wording, registrar signature, and institutional logo with the registrar.
- Test keyboard navigation, reduced motion, mobile layouts, print output, and screen-reader labels.
- Monitor HTTP latency, error rate, connection-pool saturation, failed logins, and queue age.

## Support

Email: bamidelebunmi412@gmail.com  
Phone: +234 915 179 8360