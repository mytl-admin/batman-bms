# booking-erp-backend

Node.js (Express) API for the Booking Management Service ERP. See [phase1_stories.md](phase1_stories.md) and [booking_service_requirements_v5.md](booking_service_requirements_v5.md).

## New machine (`command not found: npm`)

1. **Install Node.js 20 LTS** (includes `npm`): [https://nodejs.org/en/download](https://nodejs.org/en/download)  
   **macOS (Homebrew):** `brew install node@20` then follow `brew`’s instructions to link it and ensure your shell `PATH` includes the install (open a **new** terminal after installing).

2. **Optional one-shot setup** (checks Node/npm, copies `.env.example` → `.env.dev` if missing, runs `npm ci`):

   ```bash
   cd booking-erp-backend
   npm run setup
   ```

3. **If you refuse to install Node locally:** use **Docker Desktop** and a filled-in **`.env.dev`**:

   ```bash
   docker compose up --build
   ```

4. **Cursor / VS Code:** open the repo in a [**Dev Container**](https://code.visualstudio.com/docs/devcontainers/containers) (folder **`.devcontainer/`**); the container has Node 20 and `npm`.

This repo also includes **`.nvmrc`** (`20`) if you use **nvm** / **fnm**: `nvm install` then `nvm use`.

## Prerequisites

- Node.js 20+
- Supabase project (dev and production kept separate per P1-03)

## Setup

```bash
npm install
```

Copy environment templates and fill in values (never commit real secrets):

- **Local dev:** `.env.dev` (already scaffolded with keys; paste your values)
- **Production:** `.env.production` for `npm run start`

### Required environment variables

| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` | Supabase project URL — **paste when you have it** |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (backend only) |
| `JWT_SECRET` | Secret for signing JWTs |
| `FRONTEND_ORIGIN` | CORS allowlist (e.g. `http://localhost:3001`) |
| `NODE_ENV` | `development` or `production` (surfaced on `GET /health`) |
| `PORT` | Listen port (default `3000`) |
| `DATABASE_URL` | *(Optional)* Postgres URI — only for `npm run db:apply` (DB password from Supabase → Database) |

**Later (when you need them):** `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL` (user invites), `OPENAI_API_KEY`.

## Database

### Option A — Supabase SQL Editor (no extra tools)

Paste once: [supabase/migrations/_RUN_ALL_IN_ORDER.sql](supabase/migrations/_RUN_ALL_IN_ORDER.sql) (or run files `001` → `004` in order).

### Option B — from your machine (`npm run db:apply`)

1. In Supabase: **Project Settings → Database**, copy the **URI** connection string and set **`DATABASE_URL`** in `.env.dev` (replace `[YOUR-PASSWORD]` with the database password).
2. Prefer **direct** (`:5432`) or **session pooler** if the default pooler rejects DDL.

```bash
npm install
npm run db:apply
npm run db:probe
```

### Verify database without starting the API

```bash
node --env-file=.env.dev scripts/probe-supabase.js
```

You should see `GET /rest/v1/users → 200` after migrations succeed.

### Bootstrap first admin

Invites require an existing admin. After migrations, insert the first admin (generate `password_hash` with bcrypt, e.g.):

```bash
node -e "console.log(require('bcryptjs').hashSync('YourTemporaryPassword', 12))"
```

Then in SQL (replace hash and email):

```sql
INSERT INTO users (email, member_code, name, role, password_hash, is_active)
VALUES (
  'admin@yourcompany.com',
  'bootstrap-admin-member-code',
  'Bootstrap Admin',
  'admin',
  '<paste bcrypt hash>',
  true
);
```

Use `POST /api/auth/login` with that email and temporary password, then store JWT + `X-Member-Code` for subsequent requests.

## Run

```bash
npm run dev     # loads .env.dev
npm run start   # loads .env.production
```

- `GET /health` — no auth (returns `{ status, env }`).
- All other routes expect `Authorization: Bearer <jwt>` and `X-Member-Code` matching the JWT, except `POST /api/auth/login`.

## Branch → environment (P1-03)

- **`dev`** branch → dev Supabase + dev Vercel project for this repo.
- **`main`** branch → production Supabase + production Vercel.
- Do not deploy production from feature branches.

## Test

```bash
npm test
```

Re-run Phase 1 backend checks and regenerate the HTML report: `npm run test:phase1:html` — then open `reports/phase1-backend-report-latest.html`.

## Docker

```bash
docker build -t booking-erp-backend .
```

**Note:** After implementation, configure real `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in your local `.env.dev` / hosting provider; values are not committed.
