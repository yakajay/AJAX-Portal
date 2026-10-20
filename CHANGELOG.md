# Changelog

Every release gets an entry here, newest first. The version must match `server/package.json`
(a test fails if it doesn't), and the running API reports it at `GET /api/health`
(`version`, `commit`) and in its startup log line, so a production error can be traced to
the exact release and the features that shipped in it.

**How to find the code for a version:** every deploy tags the commit `v<version>`
(`git show v1.6.0`). Entries list the commit range for older, pre-tag releases.

**Releasing:** run `./scripts/release.sh <patch|minor|major>`, fill in the new CHANGELOG section,
commit, and merge to `main`. Use *major* for breaking changes, *minor* for new features,
*patch* for fixes only.

Sections per release: **Added**, **Changed**, **Fixed**, **Security**, **Ops**.

## [Unreleased]

## [1.6.0] - 2026-10-21
### Added
- Authenticator-app (TOTP) two-factor authentication alongside the emailed code.
- Release versioning: this changelog, version + commit in `/api/health` and the startup log, `v<version>` git tags on deploy.
### Ops
- Automatic test-and-deploy on push to `main` (Cloud Run API, Firebase Hosting client) with a post-deploy health check; GCP workload-identity config.

## [1.5.0] - 2026-10-20
### Added
- Payroll checks against the previous run, bank payment CSV, accounting journal export (CSV, Xero, QuickBooks, Tally).
- Compliance rules and filing calendar; employer (legal entity) records with per-entity bank file filter.
- Offboarding with full-and-final settlement, workforce/payroll/leave reports, CSV exports, attendance overtime.
### Changed
- Company super admins can delete employees directly (no delete request).
### Fixed
- Atomic settlement, exit cleanup on employee delete, balanced payroll journal.
- Commits: `26685fe`..`3eeac65`.

## [1.4.0] - 2026-10-16
### Added
- Company letterhead for payslips and HR letters; platform admin can enable a company's own sender mailbox.
- Show/hide toggle on all password fields.
- Commits: `0f6239a`..`efd030a`.

## [1.3.0] - 2026-10-15
### Added
- Recruitment (openings, candidate pipeline, resumes, hire), profile photos, work shifts, bulk employee CSV import.
- Holiday management and configurable leave policy; admin attendance edit with audited reasons.
- Payroll income-tax slabs and itemised deductions; real file uploads for HR documents.
- Company-owned sender mailbox for portal email.
- Commits: `5820854`..`44fd8cf`.

## [1.2.0] - 2026-10-14
### Added
- Onboarding of client companies by the platform Super Admin; removal of demo accounts.
- Commits: `bc4349b`..`6e0aa4a`.

## [1.1.0] - 2026-10-13
### Added
- Company single sign-on via OpenID Connect.
- `create-admin` script for provisioning a Super Admin.
### Changed
- INR is the default currency; attendance is one entry per day (`merge-attendance` script collapses duplicates).
- Commits: `e2b3f11`..`71fb147`.

## [1.0.0] - 2026-10-13
### Added
- Portal expansion: sessions/2FA, RBAC, audit logs, notifications, leave, attendance, payroll and HR modules, tests and CI.
- Commits: `927c16a`, `4df8e6d`.

## [0.2.0] - 2026-10-09
### Added
- Docker setup and UI redesign.
- Commits: `e9789a2`..`608417f`.

## [0.1.0] - 2026-05-25
### Added
- Initial portal: login, user management, UI. Login fixes through 2026-07-13.
- Commits: `7ebdf23`..`4fbb01c`.
