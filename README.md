# AJAX Portal (YakFlow)

React + Vite client (`client/`) and Express + MongoDB API (`server/`).

## What's in the portal

| Area | Highlights |
|---|---|
| **Leave** | Monthly accrual for annual leave, carry-forward (max 5 days), half days, working-day counting that skips weekends and public holidays, overlap and balance checks, cancel pending requests, a team calendar, and approvals by the employee's manager (or any admin with leave permission). |
| **Attendance** | Clock in/out (with optional geolocation), monthly summaries with late / early-out flags, CSV export, attendance corrections approved by the manager or HR, an all-employee month report, and optional office-IP / geofence rules. |
| **Payroll** | Salary structures per employee, a monthly payroll run (unpaid leave prorates pay), PDF payslips for employees and admins, mark-as-paid, plus the existing partner payments ledger. |
| **Notifications** | In-app bell + page, email for important events (leave, tickets, payroll, expenses…), per-user opt-out and an optional daily digest. |
| **Organisation** | Departments, reporting lines, an org chart, manager-level approvals, announcements, and birthday / work-anniversary reminders on the dashboard. |
| **People processes** | Onboarding / offboarding checklists with acknowledgements, performance review cycles (self + manager rating), goals with key results, expense claims with approval and reimbursement. |
| **Support** | Tickets with priority, SLA timers, assignment, a comment thread, and a staff queue. |
| **Outsourcing** | Contract start/end dates with expiry alerts, weekly timesheets, invoices (with overdue detection). |
| **Security** | Short-lived access tokens + rotating refresh tokens, device list and "sign out everywhere", authenticator-app (TOTP) 2FA next to the emailed code, per-module admin permissions, and a Super-Admin audit log. |
| **UX** | `Ctrl/Cmd+K` command palette, dashboard charts, English / Hindi / Spanish shell, dark mode, mobile-friendly layout. |

Not included: file uploads / storage (receipts and ticket attachments take a reference or link instead; HR documents stay metadata-only).

## Run with Docker

Requires Docker Desktop (Compose v2).

```bash
cp server/.env.example server/.env      # then edit it (see below)
docker compose up --build
docker compose run --rm api npm run seed   # first run only: sample accounts + holidays
```

- Web: http://localhost:5173
- API: http://localhost:5000/api (health check: `/api/health`)

Edit `server/.env`:
- `MONGODB_URI` - your MongoDB / Atlas connection string (URL-encode special characters in the password). On Atlas, allow your IP under Network Access.
- `MONGODB_DB_NAME` - database name (default `yakflow`).
- `JWT_SECRET` - required when `NODE_ENV=production`.

### No MongoDB account? Use the bundled one

```bash
docker compose -f docker-compose.yml -f docker-compose.localdb.yml up --build
docker compose -f docker-compose.yml -f docker-compose.localdb.yml run --rm api npm run seed
```

This starts a local MongoDB container (data kept in the `mongo-data` volume; `down -v` wipes it) and overrides `MONGODB_URI` for the API.

### Login codes in development

Login, signup and password reset use emailed one-time codes. By default the stack runs with `NODE_ENV=development` and no SMTP, so codes are printed to the API log:

```bash
docker compose logs -f api
```

For a real deployment set `NODE_ENV=production`, `JWT_SECRET` and the `SMTP_*` variables.

### Test accounts (from `npm run seed`)

| Email | Password | Role / purpose |
|---|---|---|
| `admin@organization.com` | `Admin@123` | Super Admin (read/write/delete, manages admins) |
| `hr.admin@organization.com` | `Admin@123` | Admin with read/write |
| `readonly.admin@organization.com` | `Admin@123` | Admin with read only (write actions return 403) |
| `jane@organization.com` | `Welcome@123` | User (has sample leaves, documents, attendance) |
| `john@organization.com` | `Welcome@123` | User |
| `alice@organization.com` | `Welcome@123` | User |
| `bob@organization.com` | `Welcome@123` | User |
| `locked@organization.com` | `Welcome@123` | Locked account (login is refused) |
| `unverified@organization.com` | `Welcome@123` | Email not verified (login asks for a verification code) |

The seed also adds sample leave requests, HR documents, attendance, contractors and payroll transactions, but only into empty collections, so re-running it never duplicates them. Re-running does reset the account passwords above. Change them before using real data.

### Changing ports or hostnames

`VITE_API_URL` is baked into the web bundle at build time and must be the address the **browser** uses for the API. If you change it (or the web port), also set `CLIENT_ORIGIN` to the web app's address, then rebuild:

```bash
VITE_API_URL=https://api.example.com/api CLIENT_ORIGIN=https://app.example.com docker compose up --build
```

### Creating your own Super Admin

Sign-in always asks for an emailed code. In development (no SMTP) that code is printed in the API log (`docker compose logs -f api`), so the address doesn't need a real mailbox. To create or reset a Super Admin in the database your `server/.env` points to:

```bash
docker compose run --rm -e ADMIN_PASSWORD='<password>' api node scripts/create-admin.js you@example.com "Your Name"
# without Docker:  cd server && ADMIN_PASSWORD='<password>' npm run create-admin -- you@example.com "Your Name"
```

### Merging duplicate attendance entries

Attendance is one entry per day. If you have older days with several clock-ins, collapse them (earliest clock-in to latest clock-out) with:

```bash
docker compose run --rm api node scripts/merge-attendance.js --tz Asia/Kolkata          # dry run: shows what would change
docker compose run --rm api node scripts/merge-attendance.js --tz Asia/Kolkata --apply  # does it
```

`--tz` is the timezone that defines a "day". Merged-away entries are deleted, so back up the `attendances` collection first if the data matters.

### Roles and permissions

`USER` accounts only ever see their own data (plus their direct reports through the manager screens). `ADMIN` accounts get the admin screens, gated by permission tokens stored on the account:

- global tokens `read`, `write`, `delete` apply to **every** area, and `all` grants everything;
- area tokens such as `payroll:write`, `hr:delete` or `users:*` grant more in **one** area only (areas: `users leave attendance hr payroll outsourcing support org announcements performance expenses onboarding`).

For example `read,payroll:write` is an admin who can see everything but only change payroll. `SUPER_ADMIN` bypasses all checks and is the only role that can read the audit log or manage other admins. Edit permissions under **User Management**.

### Configuration

Beyond the variables above (see `server/.env.example` for the full, commented list):

| Variable | Purpose |
|---|---|
| `JWT_EXPIRES_IN` / `REFRESH_TTL_HOURS` | Access token lifetime (default `15m`) and how long a device session lasts without activity (default `12`). |
| `TRUST_PROXY` | Set when behind a reverse proxy so client IPs are correct (rate limits, sessions, attendance IP rules). |
| `ATTENDANCE_LATE_AFTER`, `ATTENDANCE_EARLY_BEFORE` | Local times used for late / early-out flags (`09:30` / `17:30`). |
| `ATTENDANCE_ALLOWED_IPS`, `OFFICE_LAT`, `OFFICE_LNG`, `OFFICE_RADIUS_M` | Optional clock-in restrictions: an allowed IP (or prefix) **or** being inside the office geofence is enough. Unset = no restriction. |
| `DIGEST_HOUR`, `CONTRACT_ALERT_DAYS`, `JOBS_ENABLED` | Background jobs: the daily email digest hour, how early contract-expiry alerts start, and an off switch. |
| `LOG_LEVEL`, `METRICS_TOKEN` | Log verbosity and an optional bearer token for `/api/metrics`. |

Scheduled jobs run inside the API process (hourly). To run them from cron instead, set `JOBS_ENABLED=false` and call `npm run jobs` (or `npm run digest`) in `server/`.

### API documentation and operations

- Interactive OpenAPI docs: `http://localhost:5000/api/docs` (JSON at `/api/openapi.json`). The document is generated from the live route table, so it always lists every endpoint.
- `GET /api/health` (liveness), `GET /api/health/ready` (503 until MongoDB is connected) and `GET /api/metrics` (Prometheus text format; protect with `METRICS_TOKEN`).
- Logs are structured JSON (pino) with a request id (`X-Request-Id`) on every line.

### Tests and CI

```bash
cd server && npm test      # Vitest + supertest; starts an in-memory MongoDB (downloaded on first run)
cd client && npm test      # Vitest + Testing Library
cd client && npm run typecheck && npm run lint && npm run build
```

Set `MONGODB_TEST_URI=mongodb://127.0.0.1:27017` to run the API tests against an existing MongoDB instead of downloading one (each test file uses its own throw-away database). GitHub Actions (`.github/workflows/ci.yml`) runs both suites against a `mongo:7` service, lints, type-checks, builds the client and builds the Docker images.

`client` type-checking currently covers the new code (`tsconfig.typed.json`); the older pages are not strictly typed yet.

## Run without Docker

```bash
cd server && cp .env.example .env && npm install && npm run seed && npm run dev
cd client && npm install && npm run dev
```
