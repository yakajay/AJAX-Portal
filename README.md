# AJAX Portal (YakFlow)

React + Vite client (`client/`) and Express + MongoDB API (`server/`).

## What's in the portal

| Area | Highlights |
|---|---|
| **Leave** | Monthly accrual for annual leave, carry-forward (max 5 days), half days, working-day counting that skips weekends and public holidays, overlap and balance checks, cancel pending requests, a team calendar, and approvals by the employee's manager (or any admin with leave permission). Admins manage the company's public holidays and its leave types, yearly days, accrual and carry-forward under **Leave → Policy & holidays**. |
| **Attendance** | Clock in/out (with optional geolocation), monthly summaries with late / early-out flags, CSV export, attendance corrections approved by the manager or HR, an all-employee month report, and optional office-IP / geofence rules. |
| **Payroll** | Salary structures per employee, a monthly payroll run (unpaid leave prorates pay), PDF payslips for employees and admins, mark-as-paid, plus the existing partner payments ledger. |
| **Notifications** | In-app bell + page, email for important events (leave, tickets, payroll, expenses…), per-user opt-out and an optional daily digest. |
| **Organisation** | Departments, reporting lines, an org chart, manager-level approvals, announcements, and birthday / work-anniversary reminders on the dashboard. |
| **People processes** | Onboarding / offboarding checklists with acknowledgements, performance review cycles (self + manager rating), goals with key results, expense claims with approval and reimbursement. |
| **Support** | Tickets with priority, SLA timers, assignment, a comment thread, and a staff queue. |
| **Outsourcing** | Contract start/end dates with expiry alerts, weekly timesheets, invoices (with overdue detection). |
| **Security** | Short-lived access tokens + rotating refresh tokens, device list and "sign out everywhere", authenticator-app (TOTP) 2FA next to the emailed code, optional per-company single sign-on (OpenID Connect or SAML 2.0: Microsoft Entra ID, Google Workspace, Okta), per-module admin permissions, per-company audit logs, and encrypted salary / bank / ID data. |
| **Multi-tenancy** | Each client company gets its own workspace at `<company>.yourplatform.com`, onboarded by the platform's Super Admin (plan, enabled modules, first admin, suspend / deactivate). Companies are isolated at the data layer, admins raise delete requests instead of deleting, and the Super Admin sees platform-level data only unless a company grants temporary support access. See [Multi-tenancy](#multi-tenancy-companies-subdomains-and-sso). |
| **UX** | `Ctrl/Cmd+K` command palette, dashboard charts, English / Hindi / Spanish shell, dark mode, mobile-friendly layout. |

Not included: general file uploads / storage; the only upload is the optional company logo (below) (receipts and ticket attachments take a reference or link instead; HR documents stay metadata-only).

## Run with Docker

Requires Docker Desktop (Compose v2).

```bash
cp server/.env.example server/.env      # then edit it (see below)
docker compose up --build
# then create the platform Super Admin (see "Creating your own admins" below)
```

- Platform (Super Admin) console: `http://admin.localhost:5173` - company workspaces: `http://<company>.localhost:5173` (browsers resolve `*.localhost` themselves; see [Multi-tenancy](#multi-tenancy-companies-subdomains-and-sso))
- API: http://localhost:5000/api (health check: `/api/health`)

Edit `server/.env`:
- `MONGODB_URI` - your MongoDB / Atlas connection string (URL-encode special characters in the password). On Atlas, allow your IP under Network Access.
- `MONGODB_DB_NAME` - database name (default `yakflow`).
- `JWT_SECRET` - required when `NODE_ENV=production`.
- `DATA_ENCRYPTION_KEY` - required when `NODE_ENV=production`: the master key that protects every company's data key (see [Sensitive data](#sensitive-data-and-super-admin-access)).
- `BASE_DOMAIN` (`localhost` for local use) and, locally, `PUBLIC_PORT=5173`.

### No MongoDB account? Use the bundled one

```bash
docker compose -f docker-compose.yml -f docker-compose.localdb.yml up --build
```

This starts a local MongoDB container (data kept in the `mongo-data` volume; `down -v` wipes it) and overrides `MONGODB_URI` for the API.

### Login codes in development

Login, signup and password reset use emailed one-time codes. By default the stack runs with `NODE_ENV=development` and no SMTP, so codes are printed to the API log:

```bash
docker compose logs -f api
```

For a real deployment set `NODE_ENV=production`, `JWT_SECRET` and the `SMTP_*` variables.

### First run

There is no sample data. Create the platform Super Admin, sign in at `http://admin.localhost:5173`, and onboard a company from **Companies**; its admin gets an emailed invitation (in development the email is printed in the API log). See "Creating your own admins" below.

If an earlier version of this project seeded sample accounts (`@organization.com`, `platform@yakflow.local`, the `demo` company), remove them with `node scripts/remove-demo-data.js` (a dry run) and then `--apply`. Create your own platform admin first.

### Changing ports or hostnames

The web app calls the API on its **own address** (`/api`, forwarded by the web container's nginx with the `Host` header intact), because the company is identified by the subdomain the browser used. Only set `VITE_API_URL` at build time if the API is served somewhere else that understands the same Host-based routing, and set `CLIENT_ORIGIN` to the web app's address for CORS.

### Creating your own admins

Sign-in always asks for an emailed code. In development (no SMTP) that code is printed in the API log (`docker compose logs -f api`), so the address doesn't need a real mailbox. To create or reset an admin in the database your `server/.env` points to:

```bash
# The platform's Super Admin (manages companies)
docker compose run --rm -e ADMIN_PASSWORD='<password>' api node scripts/create-admin.js you@example.com "Your Name"
# A company's admin
docker compose run --rm -e COMPANY_SLUG=acme -e ADMIN_PASSWORD='<password>' api node scripts/create-admin.js boss@acme.com "Their Name"
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

For example `read,payroll:write` is an admin who can see everything but only change payroll. Inside a company, `SUPER_ADMIN` is the **company admin**: it bypasses all permission checks and is the only role that can read the audit log, manage other admins, edit company settings / SSO and grant support access. Edit permissions under **User Management**. The platform's own staff use the separate `PLATFORM_ADMIN` role, which only exists outside companies and only works on the platform console.

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

### Multi-tenancy: companies, subdomains and SSO

**Onboarding (platform Super Admin, `admin.<BASE_DOMAIN>`).** Create a company with its name, primary contact, plan and seat limit, and the modules it has bought. Its workspace address `<slug>.<BASE_DOMAIN>` is created from the name (or chosen) at that moment. Enter a first admin and they receive an email invitation (they set their password with *Forgot password*). Companies can be **activated, suspended or deactivated**; leaving *active* signs everyone out and the workspace shows an explanation instead of the login form.

**Company admins** (`SUPER_ADMIN` inside the workspace) edit their company's details under **Company settings**. Plan, modules, status and subdomain are the platform's. Enabled modules are enforced on both the employee and admin APIs, and the seat limit is enforced when adding people.

**Deleting.** Company admins cannot delete directly. Every delete action under `/api/admin` (employee, department, announcement, checklist, checklist template) and *Request company deletion* files a request with status **Pending** instead. The platform Super Admin **approves** (the deletion is carried out with the same safety checks as before) or **rejects** it with a reason; the status is shown to the company under **Delete requests**, and each step is in the audit log. An approved company deletion closes the workspace and signs everyone out; the records are retained, not purged.

**Optional features.** The platform switches features on per company, when onboarding or later under *Manage*. Today that is **Custom logo**: the company admin can then upload a PNG, JPEG or WebP (up to 256 KB) under *Company settings* to replace our logo in the header, menu and login page. SVG is refused on purpose, the image type is checked from the file contents, and the logo is served with headers that stop browsers treating it as a page. Turning the feature off hides the logo without deleting it.

**Domains.** A subdomain is all a company needs. Production needs wildcard DNS (`*.example.com`) and a wildcard TLS certificate pointing at the web container, with `BASE_DOMAIN`, `PUBLIC_SCHEME` and `TRUST_PROXY` set. Single-company installs without wildcard DNS can set `DEFAULT_TENANT_SLUG` so any other host serves that company. *Custom domains* (e.g. `hr.company.com`) are not built: they would need DNS CNAME and TXT-based ownership verification and certificate provisioning per domain.

**Single sign-on** is configured by each company admin under **Company settings → Single sign-on**: pick OpenID Connect (issuer, client ID and secret) or SAML 2.0 (sign-on URL, entity ID, signing certificate), the allowed email domains, and whether first sign-ins create accounts. The page shows the redirect URI, or the ACS URL / entity ID / metadata URL, to register with the identity provider. SSO is optional: when enabled, the login page offers **Sign in with SSO** and **Sign in with password**. Client secrets are encrypted and write-only; provider URLs must be public https addresses (the server refuses private ranges unless `SSO_ALLOW_PRIVATE_HOSTS=true`, for on-prem providers); SAML responses are only accepted for logins this server started and must carry a valid signature.

### Sensitive data and Super Admin access

- Salary structures and payslip figures, bank details and government / tax IDs are **encrypted at rest** (AES-256-GCM). Each company has its **own random data key**, which is itself wrapped with the master key `DATA_ENCRYPTION_KEY`; ciphertext is also bound to its company, so it cannot be moved between companies. Keep the master key in a secret manager and back it up separately: without it the encrypted data cannot be read. Encrypted fields cannot be sorted, filtered or summed in the database.
- Passwords are stored only as salted scrypt hashes and are never returned by any endpoint.
- By default the platform Super Admin sees **platform-level details only**: company profile, plan, usage and status. The employee list in the console masks salary, bank and ID fields, and the company admin routes are not reachable from the platform host.
- A company admin can grant **temporary support access** (1 hour to 7 days, with a reason; revocable at any time). Only while a grant is active does the console show those fields unmasked; it expires on its own and **every unmasked view is written to the company's own audit log**.
- Company data is isolated in the data layer: every query, aggregate and insert is automatically confined to the company of the request (chosen from the Host header), so a controller that forgets a filter still cannot read or write another company.

### Upgrading an existing single-company install

Back up the database, then assign all existing data to a company (and seal existing salary data):

```bash
docker compose run --rm -e COMPANY_NAME="Acme Corp" -e COMPANY_SLUG=acme api node scripts/migrate-to-multitenant.js
docker compose run --rm -e ADMIN_PASSWORD='<password>' api node scripts/create-admin.js platform@you.com "Platform Admin"
```

The script is safe to run again. Existing company admins keep working at `acme.<BASE_DOMAIN>`. Set `DATA_ENCRYPTION_KEY` before running it in production.

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
cd server && cp .env.example .env && npm install && npm run dev
cd client && npm install && npm run dev
```
