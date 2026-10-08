# AJAX Portal (YakFlow)

React + Vite client (`client/`) and Express + MongoDB API (`server/`).

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

Seed accounts: `admin@organization.com` / `Admin@123` (super admin), `jane@organization.com` / `Welcome@123` (user). Change these before using real data.

### Changing ports or hostnames

`VITE_API_URL` is baked into the web bundle at build time and must be the address the **browser** uses for the API. If you change it (or the web port), also set `CLIENT_ORIGIN` to the web app's address, then rebuild:

```bash
VITE_API_URL=https://api.example.com/api CLIENT_ORIGIN=https://app.example.com docker compose up --build
```

## Run without Docker

```bash
cd server && cp .env.example .env && npm install && npm run seed && npm run dev
cd client && npm install && npm run dev
```
