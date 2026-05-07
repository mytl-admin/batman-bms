# Booking Management Service — Phase 1 Stories
**Phase:** 1 — Foundation  
**Version:** 1.0  
**Date:** May 2026  
**Depends On:** booking_service_requirements_v5.md  
**Goal:** Establish the complete technical foundation — repositories, authentication, database schema, environment configuration, and Master Configurations — before any feature is built.

---

## Phase 1 Overview

| Story | Title | Type |
|---|---|---|
| P1-01 | Backend repository setup | Infrastructure |
| P1-02 | Frontend repository setup | Infrastructure |
| P1-03 | Environment configuration | Infrastructure |
| P1-04 | JWT authentication middleware | Backend |
| P1-05 | User invite and management API | Backend |
| P1-06 | Login and auth flow — frontend | Frontend |
| P1-07 | Supabase schema — core tables | Database |
| P1-08 | Supabase schema — Master Configuration tables | Database |
| P1-09 | Master Configurations API | Backend |
| P1-10 | Master Configurations admin UI | Frontend |
| P1-11 | Supplier management API | Backend |
| P1-12 | Supplier management admin UI | Frontend |
| P1-13 | System logs schema and LogService | Backend |
| P1-14 | Role-based access control and route guards | Frontend + Backend |

---

## P1-01 — Backend Repository Setup

**Type:** Infrastructure  
**Priority:** P0 — must be first  
**Reference:** TR-01, TR-02, NFR-03

### Description
Set up the Node.js backend repository with the correct project structure, dependency configuration, Dockerfile, and environment scaffolding. This is the foundation every subsequent backend story builds on.

### Acceptance Criteria

1. Repository created: `booking-erp-backend`
2. Node.js project initialised with `package.json`
3. Express.js installed and configured as the HTTP framework
4. Project folder structure created:
```
booking-erp-backend/
  ├── src/
  │     ├── routes/
  │     ├── controllers/
  │     ├── middleware/
  │     ├── services/
  │     ├── utils/
  │     └── index.js
  ├── .env.dev
  ├── .env.production
  ├── .gitignore          — env files excluded
  ├── Dockerfile
  ├── vercel.json
  └── package.json
```
5. `.env.dev` and `.env.production` files created with the following keys (values blank — to be filled per environment):
```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
JWT_SECRET=
OPENAI_API_KEY=
SENDGRID_API_KEY=
NODE_ENV=
PORT=
```
6. `.gitignore` excludes all `.env*` files — no secrets ever committed
7. `Dockerfile` created:
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["node", "src/index.js"]
```
8. `vercel.json` created for Vercel deployment compatibility
9. Base Express server starts on `process.env.PORT` with a health check route: `GET /health` returns `{ status: "ok", env: process.env.NODE_ENV }`
10. HEAD method blocked globally — middleware added to return 405 on any HEAD request
11. CORS configured to accept requests only from the frontend origin (set in env)
12. `npm run dev` starts the server locally using `.env.dev`
13. `npm run start` starts using `.env.production`

### Notes for Cursor
- Use `dotenv` for env loading, `express` for HTTP, `@supabase/supabase-js` for database client
- Do not hardcode any value that belongs in env
- HEAD block must be global middleware — not per route

---

## P1-02 — Frontend Repository Setup

**Type:** Infrastructure  
**Priority:** P0 — must be first  
**Reference:** TR-01, NFR-02

### Description
Set up the Next.js frontend repository with correct project structure, environment scaffolding, and base routing. No Supabase client in the frontend — all data comes via backend APIs.

### Acceptance Criteria

1. Repository created: `booking-erp-frontend`
2. Next.js 14+ project initialised with App Router
3. TypeScript enabled
4. Tailwind CSS installed and configured
5. Project folder structure:
```
booking-erp-frontend/
  ├── app/
  │     ├── (auth)/
  │     │     └── login/
  │     │           └── page.tsx
  │     ├── (dashboard)/
  │     │     ├── layout.tsx
  │     │     ├── today/
  │     │     ├── bookings/
  │     │     ├── disbursements/
  │     │     ├── suppliers/
  │     │     ├── documents/
  │     │     ├── payments/
  │     │     ├── cancellations/
  │     │     ├── credit-notes/
  │     │     ├── reports/
  │     │     ├── admin/
  │     │     │     ├── approvals/
  │     │     │     ├── master-config/
  │     │     │     ├── suppliers/
  │     │     │     └── users/
  │     │     └── audit-logs/
  │     └── layout.tsx
  ├── components/
  ├── lib/
  │     └── api.ts          — central API client
  ├── hooks/
  ├── types/
  ├── .env.local            — for dev
  ├── .env.production
  └── .gitignore
```
6. `.env.local` and `.env.production` with:
```
NEXT_PUBLIC_API_BASE_URL=
```
7. Central API client at `lib/api.ts`:
   - All requests go through this client
   - Automatically attaches JWT from localStorage to `Authorization` header on every request
   - Automatically attaches `member_code` as custom header `X-Member-Code`
   - Handles 401 responses by redirecting to login
8. No Supabase package installed in frontend — not needed, not used
9. Base layout with sidebar navigation scaffold (links only, no content yet)
10. `npm run dev` runs against `.env.local`

### Notes for Cursor
- Never install `@supabase/supabase-js` in this project
- JWT and member_code storage in localStorage — to be set on login
- All API calls must use the central `lib/api.ts` client — no direct fetch calls in components

---

## P1-03 — Environment Configuration

**Type:** Infrastructure  
**Priority:** P0  
**Reference:** NFR-02, TR-04

### Description
Configure two fully isolated environments — dev and production — with separate Supabase projects and separate Vercel deployment targets. No shared credentials between environments under any circumstance.

### Acceptance Criteria

**Supabase:**
1. Two separate Supabase projects created:
   - `booking-erp-dev`
   - `booking-erp-production`
2. Each project has its own URL and service role key
3. Dev project URL and key stored in backend `.env.dev` and frontend `.env.local`
4. Production project URL and key stored in backend `.env.production` and frontend `.env.production`
5. No credential appears in more than one env file

**Vercel:**
6. Two Vercel projects created per repository (4 total):
   - `booking-erp-backend-dev`
   - `booking-erp-backend-production`
   - `booking-erp-frontend-dev`
   - `booking-erp-frontend-production`
7. Each Vercel project has its own environment variables configured in Vercel dashboard
8. Dev deployments trigger from `dev` branch
9. Production deployments trigger from `main` branch

**Validation:**
10. `GET /health` on backend dev returns `{ env: "dev" }`
11. `GET /health` on backend production returns `{ env: "production" }`
12. Both environments reachable independently with no shared state

### Notes for Cursor
- Document the branch → environment mapping clearly in the repo README
- Production deploy should never happen automatically from a feature branch

---

## P1-04 — JWT Authentication Middleware

**Type:** Backend  
**Priority:** P0  
**Reference:** NFR-01, TR-03

### Description
Build the JWT authentication middleware that validates every incoming API request. This middleware must run on all routes except `/health`. No route is accessible without a valid token.

### Acceptance Criteria

1. Middleware file created at `src/middleware/auth.js`
2. Applied globally to all routes except `GET /health`
3. Middleware performs validation in this exact order:

**Step 1 — Extract token**
- Read `Authorization` header
- Expect format: `Bearer <token>`
- If missing or malformed → return `401 { error: "Missing or malformed authorization header" }`

**Step 2 — Decrypt token**
- Verify JWT using `JWT_SECRET` from env
- If decryption fails (expired, tampered, wrong secret) → return `401 { error: "Invalid token" }`

**Step 3 — Validate member_code**
- Extract `member_code` from JWT payload
- Read `X-Member-Code` custom header from request
- If `X-Member-Code` header missing → return `401 { error: "Missing member code header" }`
- If `member_code` in JWT does not match `X-Member-Code` header → return `401 { error: "Member code mismatch" }`

**Step 4 — Validate access_key**
- Extract `access_key` from JWT payload
- Compute SHA-256 of `member_code`
- If computed hash does not match `access_key` in JWT → return `401 { error: "Invalid access key" }`

**Step 5 — Attach user to request**
- If all validations pass, attach decoded JWT payload to `req.user`
- Call `next()`

4. All 401 responses use consistent JSON format: `{ error: "<message>" }`
5. No route bypasses this middleware except `GET /health`
6. HEAD method blocked before auth middleware runs — returns `405 { error: "Method not allowed" }`

### Token Generation Utility
7. Utility function created at `src/utils/generateToken.js`:
```javascript
// Used during login/invite to generate tokens
generateToken({ member_code, role }) {
  const access_key = sha256(member_code)
  return jwt.sign({ member_code, access_key, role }, JWT_SECRET, { expiresIn: '24h' })
}
```

### Tests
8. Unit tests written for all 5 validation steps covering:
   - Missing header → 401
   - Expired token → 401
   - member_code mismatch → 401
   - Invalid access_key → 401
   - Valid token → passes through

### Notes for Cursor
- Use `jsonwebtoken` for JWT operations
- Use Node's built-in `crypto` module for SHA-256 (`crypto.createHash('sha256')`)
- Never log the raw JWT token — log only member_code and timestamp on auth events

---

## P1-05 — User Invite and Management API

**Type:** Backend  
**Priority:** P1  
**Reference:** F-20, TR-03, NFR-01

### Description
Build the user management API. Users are created by invite only — no self-signup. Two roles: Agent and Admin. Admins can invite, deactivate, and list users.

### Supabase Table
```sql
CREATE TABLE users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email             VARCHAR UNIQUE NOT NULL,
  member_code       VARCHAR UNIQUE NOT NULL,  -- system-generated, used in JWT
  name              VARCHAR NOT NULL,
  role              VARCHAR NOT NULL CHECK (role IN ('agent', 'admin')),
  is_active         BOOLEAN DEFAULT true,
  invited_by        UUID REFERENCES users(id),
  invited_at        TIMESTAMP,
  last_login_at     TIMESTAMP,
  created_at        TIMESTAMP DEFAULT now(),
  updated_at        TIMESTAMP DEFAULT now()
);
```

### API Endpoints

**POST /api/users/invite**
- Auth: Admin only
- Body: `{ email, name, role }`
- Generates unique `member_code` (UUID-based, URL-safe)
- Creates user record with `is_active = true`
- Sends invite email via SendGrid with temporary login link containing member_code
- Returns: `{ id, email, name, role, member_code }`
- Logs: `USER_INVITED` to system_logs

**POST /api/auth/login**
- No auth required
- Body: `{ email, password }` — password is the temporary code from invite email
- Validates credentials against users table
- Generates JWT using `generateToken({ member_code, role })`
- Returns: `{ token, user: { id, name, role, member_code } }`
- Updates `last_login_at`

**GET /api/users**
- Auth: Admin only
- Returns: array of all users with `{ id, name, email, role, is_active, last_login_at }`

**PATCH /api/users/:id**
- Auth: Admin only
- Body: `{ name?, role?, is_active? }`
- Cannot deactivate own account
- Returns: updated user object
- Logs: `USER_UPDATED` to system_logs

**GET /api/users/me**
- Auth: Any authenticated user
- Returns: current user's profile from JWT

**DELETE /api/users/:id**
- Not exposed — users are deactivated not deleted (set `is_active = false` via PATCH)

### Validation Rules
- Email must be unique
- Role must be `agent` or `admin`
- Admin cannot deactivate their own account
- Deactivated users receive 401 on all subsequent requests (middleware checks `is_active`)

### Notes for Cursor
- `member_code` must be generated server-side — never user-supplied
- Add `is_active` check to auth middleware after Step 4 — deactivated users get `401 { error: "Account deactivated" }`
- HEAD not exposed on any of these endpoints

---

## P1-06 — Login and Auth Flow — Frontend

**Type:** Frontend  
**Priority:** P1  
**Reference:** F-20, TR-03

### Description
Build the login page and auth state management on the frontend. After login, JWT and member_code are stored and attached to all subsequent API calls automatically.

### Acceptance Criteria

**Login Page — `/login`**
1. Email and password fields
2. Submit calls `POST /api/auth/login`
3. On success:
   - Store JWT in localStorage as `booking_erp_token`
   - Store member_code in localStorage as `booking_erp_member_code`
   - Store user object (id, name, role) in localStorage as `booking_erp_user`
   - Redirect to `/today` (OPS Command Center)
4. On failure: show inline error message — "Invalid credentials"
5. No self-signup link — login page only

**Auth State**
6. `lib/api.ts` reads JWT and member_code from localStorage on every request
7. If localStorage is empty → redirect to `/login`
8. If API returns 401 → clear localStorage → redirect to `/login`

**Route Protection**
9. All `/dashboard/*` routes check for valid JWT on load
10. Unauthenticated users redirected to `/login`
11. Admin-only routes (`/admin/*`) check role from stored user object — non-admins redirected to `/today`

**Logout**
12. Logout button in nav clears localStorage and redirects to `/login`

**Auth Context**
13. React context (`AuthContext`) provides current user (id, name, role) to all components
14. Components use `useAuth()` hook to access current user and role

### Notes for Cursor
- No Supabase auth — custom JWT only
- Role check on admin routes must happen on the server side too (middleware) — frontend check is UI-only convenience
- Google SSO architecture must not be precluded — design auth context to support future SSO provider

---

## P1-07 — Supabase Schema — Core Tables

**Type:** Database  
**Priority:** P0 — must precede all feature stories  
**Reference:** TR-04, TR-06, all F-0x sections

### Description
Create the complete core database schema in Supabase. This is the single most critical story in Phase 1. Every other story depends on this schema being correct. Take time to get it right.

### Tables to Create

```sql
-- BOOKINGS
CREATE TABLE bookings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_code          VARCHAR UNIQUE NOT NULL,  -- auto-generated: BK-YYYY-NNNN
  crm_lead_id           VARCHAR,                  -- loose reference, not FK
  customer_name         VARCHAR NOT NULL,
  destination           TEXT[] NOT NULL,          -- array of destination names
  date_of_travel        DATE NOT NULL,
  return_date           DATE NOT NULL,
  adults                INTEGER NOT NULL DEFAULT 1,
  children              INTEGER NOT NULL DEFAULT 0,
  children_ages         INTEGER[],                -- array of ages
  status                VARCHAR NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'on_hold', 'cancelled', 'completed')),
  is_nrf                BOOLEAN DEFAULT false,    -- non-refundable flag
  case_owner_id         UUID REFERENCES users(id),
  case_manager_id       UUID REFERENCES users(id),
  margin                NUMERIC(12,2),
  total_cost_price      NUMERIC(12,2),            -- sum of all line item INR equivalents
  subtotal              NUMERIC(12,2),            -- total_cost_price + margin
  gst_amount            NUMERIC(12,2),
  tcs_amount            NUMERIC(12,2),
  total_payable         NUMERIC(12,2),
  financial_confirmed   BOOLEAN DEFAULT false,
  financial_confirmed_by UUID REFERENCES users(id),
  financial_confirmed_at TIMESTAMP,
  created_by            UUID REFERENCES users(id),
  created_at            TIMESTAMP DEFAULT now(),
  updated_at            TIMESTAMP DEFAULT now()
);

-- FLIGHT LINE ITEMS
CREATE TABLE booking_flights (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id                UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  is_self_booked            BOOLEAN DEFAULT false,
  sector_from               VARCHAR,
  sector_to                 VARCHAR,
  supplier_id               UUID REFERENCES suppliers(id),
  travel_date               DATE,
  departure_time            TIME,
  cabin_class               VARCHAR,
  baggage_allowance         VARCHAR,
  cost                      NUMERIC(12,2),
  currency                  VARCHAR DEFAULT 'INR',
  exchange_rate             NUMERIC(10,4) DEFAULT 1,
  inr_equivalent            NUMERIC(12,2),        -- cost × exchange_rate
  is_refundable             BOOLEAN DEFAULT false,
  supplier_full_refund_till DATE,                  -- inclusive
  our_full_refund_till      DATE,                  -- supplier date - 5 days
  partial_refund_pct        NUMERIC(5,2),
  supplier_partial_refund_till DATE,
  our_partial_refund_till   DATE,                  -- supplier date - 5 days
  sort_order                INTEGER DEFAULT 0,
  created_at                TIMESTAMP DEFAULT now(),
  updated_at                TIMESTAMP DEFAULT now()
);

-- HOTEL LINE ITEMS
CREATE TABLE booking_hotels (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id                UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  is_self_booked            BOOLEAN DEFAULT false,
  property_name             VARCHAR,
  supplier_id               UUID REFERENCES suppliers(id),
  city                      VARCHAR,
  check_in_date             DATE,
  check_out_date            DATE,
  nights                    INTEGER,               -- auto-calculated
  room_type                 VARCHAR,
  meal_plan                 VARCHAR,
  cost                      NUMERIC(12,2),
  currency                  VARCHAR DEFAULT 'INR',
  exchange_rate             NUMERIC(10,4) DEFAULT 1,
  inr_equivalent            NUMERIC(12,2),
  is_refundable             BOOLEAN DEFAULT false,
  supplier_full_refund_till DATE,
  our_full_refund_till      DATE,
  partial_refund_pct        NUMERIC(5,2),
  supplier_partial_refund_till DATE,
  our_partial_refund_till   DATE,
  sort_order                INTEGER DEFAULT 0,
  created_at                TIMESTAMP DEFAULT now(),
  updated_at                TIMESTAMP DEFAULT now()
);

-- LAND PACKAGE SUB-ITEMS
CREATE TABLE booking_land_items (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id                UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  sub_item_type             VARCHAR NOT NULL
                            CHECK (sub_item_type IN ('airport_transfer', 'hotel_transfer', 'sightseeing')),
  description               VARCHAR NOT NULL,
  supplier_id               UUID REFERENCES suppliers(id),
  transfer_type             VARCHAR CHECK (transfer_type IN ('private', 'sic')),
  date                      DATE,
  cost                      NUMERIC(12,2),
  currency                  VARCHAR DEFAULT 'INR',
  exchange_rate             NUMERIC(10,4) DEFAULT 1,
  inr_equivalent            NUMERIC(12,2),
  is_refundable             BOOLEAN DEFAULT false,
  supplier_full_refund_till DATE,
  our_full_refund_till      DATE,
  partial_refund_pct        NUMERIC(5,2),
  supplier_partial_refund_till DATE,
  our_partial_refund_till   DATE,
  sort_order                INTEGER DEFAULT 0,
  created_at                TIMESTAMP DEFAULT now(),
  updated_at                TIMESTAMP DEFAULT now()
);

-- VISA LINE ITEMS
CREATE TABLE booking_visas (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id                UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  is_self_arranged          BOOLEAN DEFAULT false,
  country                   VARCHAR,
  visa_type                 VARCHAR,
  supplier_id               UUID REFERENCES suppliers(id),
  cost_per_applicant        NUMERIC(12,2),
  number_of_applicants      INTEGER,
  total_cost                NUMERIC(12,2),         -- cost_per_applicant × applicants
  currency                  VARCHAR DEFAULT 'INR',
  exchange_rate             NUMERIC(10,4) DEFAULT 1,
  inr_equivalent            NUMERIC(12,2),
  is_refundable             BOOLEAN DEFAULT false,
  supplier_full_refund_till DATE,
  our_full_refund_till      DATE,
  sort_order                INTEGER DEFAULT 0,
  created_at                TIMESTAMP DEFAULT now(),
  updated_at                TIMESTAMP DEFAULT now()
);

-- TRAVELLERS
CREATE TABLE booking_travellers (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id                UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  crm_customer_id           VARCHAR,              -- loose reference, not FK
  is_primary                BOOLEAN DEFAULT false,
  full_name                 VARCHAR NOT NULL,
  dob                       DATE NOT NULL,
  nationality               VARCHAR NOT NULL,
  phone                     VARCHAR NOT NULL,
  email                     VARCHAR NOT NULL,
  emergency_contact_name    VARCHAR NOT NULL,
  emergency_contact_phone   VARCHAR NOT NULL,
  travel_document_id        VARCHAR NOT NULL,
  passport_expiry_date      DATE NOT NULL,
  passport_alert_shown      BOOLEAN DEFAULT false,
  passport_alert_acknowledged BOOLEAN DEFAULT false,
  passport_alert_acknowledged_by UUID REFERENCES users(id),
  passport_alert_acknowledged_at TIMESTAMP,
  visa_needed               BOOLEAN NOT NULL,
  visa_exemption_proof_url  VARCHAR,
  sort_order                INTEGER DEFAULT 0,
  created_at                TIMESTAMP DEFAULT now(),
  updated_at                TIMESTAMP DEFAULT now()
);

-- PAN CARDS (multiple per booking)
CREATE TABLE booking_pan_cards (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  pan_number  VARCHAR NOT NULL,
  name        VARCHAR,
  created_at  TIMESTAMP DEFAULT now()
);

-- VISA APPLICANT LINKS (travellers linked to visa line items)
CREATE TABLE booking_visa_applicants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visa_id         UUID NOT NULL REFERENCES booking_visas(id) ON DELETE CASCADE,
  traveller_id    UUID NOT NULL REFERENCES booking_travellers(id) ON DELETE CASCADE
);

-- SUPPLIER PAYMENT TRANCHES
CREATE TABLE supplier_tranches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id      UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  supplier_id     UUID REFERENCES suppliers(id),
  amount          NUMERIC(12,2) NOT NULL,
  currency        VARCHAR DEFAULT 'INR',
  exchange_rate   NUMERIC(10,4) DEFAULT 1,
  inr_equivalent  NUMERIC(12,2),
  payment_date    DATE NOT NULL,
  status          VARCHAR DEFAULT 'pending'
                  CHECK (status IN ('pending', 'paid', 'cancelled')),
  cancelled_at    TIMESTAMP,
  created_at      TIMESTAMP DEFAULT now(),
  updated_at      TIMESTAMP DEFAULT now()
);

-- GUEST PAYMENT TRANCHES
CREATE TABLE guest_tranches (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id              UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  label                   VARCHAR NOT NULL,
  amount                  NUMERIC(12,2) NOT NULL,
  currency                VARCHAR DEFAULT 'INR',
  due_date                DATE NOT NULL,
  status                  VARCHAR DEFAULT 'pending'
                          CHECK (status IN ('pending', 'collected', 'overdue')),
  created_at              TIMESTAMP DEFAULT now(),
  updated_at              TIMESTAMP DEFAULT now()
);

-- GUEST-SUPPLIER TRANCHE LINKS
CREATE TABLE guest_supplier_tranche_links (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_tranche_id    UUID NOT NULL REFERENCES guest_tranches(id) ON DELETE CASCADE,
  supplier_tranche_id UUID NOT NULL REFERENCES supplier_tranches(id) ON DELETE CASCADE
);

-- BUYER PAYMENT RECORDS
CREATE TABLE buyer_payment_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id      UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  guest_tranche_id UUID REFERENCES guest_tranches(id),
  amount          NUMERIC(12,2) NOT NULL,
  currency        VARCHAR DEFAULT 'INR',
  collected_at    TIMESTAMP NOT NULL,
  utr_number      VARCHAR NOT NULL,
  status          VARCHAR DEFAULT 'collected'
                  CHECK (status IN ('collected', 'pending')),
  recorded_by     UUID REFERENCES users(id),
  created_at      TIMESTAMP DEFAULT now()
);

-- SUPPLIER PAYMENT RECORDS
CREATE TABLE supplier_payment_records (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id          UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  supplier_tranche_id UUID REFERENCES supplier_tranches(id),
  supplier_id         UUID REFERENCES suppliers(id),
  amount              NUMERIC(12,2) NOT NULL,
  currency            VARCHAR DEFAULT 'INR',
  paid_at             TIMESTAMP NOT NULL,
  utr_number          VARCHAR NOT NULL,
  supplier_account_details JSONB,
  recorded_by         UUID REFERENCES users(id),
  created_at          TIMESTAMP DEFAULT now()
);

-- SUPPLIER PAYMENT TO BUYER PAYMENT LINKS
CREATE TABLE supplier_buyer_payment_links (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_payment_record_id UUID NOT NULL REFERENCES supplier_payment_records(id) ON DELETE CASCADE,
  buyer_payment_record_id    UUID NOT NULL REFERENCES buyer_payment_records(id) ON DELETE CASCADE
);

-- DOCUMENTS
CREATE TABLE booking_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id      UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  entity_type     VARCHAR,    -- 'booking', 'flight', 'hotel', 'land', 'visa'
  entity_id       UUID,       -- ID of the specific line item (nullable for booking-level docs)
  document_name   VARCHAR NOT NULL,
  document_type   VARCHAR,    -- e.g. 'supplier_invoice', 'voucher', 'visa_doc'
  version         INTEGER NOT NULL DEFAULT 1,
  file_url        VARCHAR NOT NULL,
  is_active       BOOLEAN DEFAULT true,   -- only latest version is active
  uploaded_by     UUID REFERENCES users(id),
  uploaded_at     TIMESTAMP DEFAULT now(),
  description     VARCHAR
);

-- CANCELLATIONS
CREATE TABLE cancellations (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id              UUID NOT NULL REFERENCES bookings(id),
  type                    VARCHAR NOT NULL CHECK (type IN ('full', 'partial')),
  reason                  VARCHAR NOT NULL,
  notes                   VARCHAR,
  affected_component      VARCHAR,          -- for partial cancellations
  affected_monetary_value NUMERIC(12,2),   -- for partial cancellations
  recoverable_from_paid   NUMERIC(12,2),   -- field A — AI recommended
  additional_retention    NUMERIC(12,2) DEFAULT 0,  -- field B — Admin only
  tcs_deduction           NUMERIC(12,2),   -- field D — auto
  margin_retained         NUMERIC(12,2),   -- always 100%
  gst_liability           NUMERIC(12,2),
  refundable_to_guest     NUMERIC(12,2),   -- A - B - D - Margin
  refund_ceiling          NUMERIC(12,2),   -- absolute maximum
  refund_method           VARCHAR DEFAULT 'credit_note'
                          CHECK (refund_method IN ('credit_note', 'source_account')),
  ai_evaluated_at         TIMESTAMP,
  confirmed_by            UUID REFERENCES users(id),
  confirmed_at            TIMESTAMP,
  status                  VARCHAR DEFAULT 'in_review'
                          CHECK (status IN ('in_review', 'confirmed', 'cancelled')),
  initiated_by            UUID REFERENCES users(id),
  created_at              TIMESTAMP DEFAULT now(),
  updated_at              TIMESTAMP DEFAULT now()
);

-- CREDIT NOTES
CREATE TABLE credit_notes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cancellation_id UUID NOT NULL REFERENCES cancellations(id),
  booking_id      UUID NOT NULL REFERENCES bookings(id),
  type            VARCHAR NOT NULL CHECK (type IN ('buyer', 'supplier')),
  value           NUMERIC(12,2) NOT NULL,
  max_redemption_date DATE,
  supplier_id     UUID REFERENCES suppliers(id),   -- for supplier CNs
  customer_name   VARCHAR,                          -- for buyer CNs
  status          VARCHAR DEFAULT 'issued'
                  CHECK (status IN ('issued', 'redeemed', 'expired')),
  created_at      TIMESTAMP DEFAULT now()
);

-- FX RISK FLAGS
CREATE TABLE fx_risk_flags (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id        UUID NOT NULL REFERENCES bookings(id),
  currency          VARCHAR NOT NULL,
  booking_rate      NUMERIC(10,4),
  payment_rate      NUMERIC(10,4),
  variance_pct      NUMERIC(8,4),
  threshold_pct     NUMERIC(8,4),
  affected_tranche  UUID REFERENCES supplier_tranches(id),
  status            VARCHAR DEFAULT 'breach'
                    CHECK (status IN ('breach', 'resolved')),
  flagged_at        TIMESTAMP DEFAULT now()
);

-- ADMIN APPROVALS
CREATE TABLE admin_approvals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id      UUID REFERENCES bookings(id),
  type            VARCHAR NOT NULL
                  CHECK (type IN ('margin_release','refund_override','extension','credit_note','write_off')),
  description     VARCHAR NOT NULL,
  amount          NUMERIC(12,2),
  requested_by    UUID REFERENCES users(id),
  requested_at    TIMESTAMP DEFAULT now(),
  reviewed_by     UUID REFERENCES users(id),
  reviewed_at     TIMESTAMP,
  status          VARCHAR DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected')),
  review_notes    VARCHAR
);
```

### Indexes to Create
```sql
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_dot ON bookings(date_of_travel);
CREATE INDEX idx_bookings_case_owner ON bookings(case_owner_id);
CREATE INDEX idx_guest_tranches_due_date ON guest_tranches(due_date);
CREATE INDEX idx_guest_tranches_status ON guest_tranches(status);
CREATE INDEX idx_supplier_tranches_payment_date ON supplier_tranches(payment_date);
CREATE INDEX idx_supplier_tranches_status ON supplier_tranches(status);
CREATE INDEX idx_booking_documents_booking ON booking_documents(booking_id);
CREATE INDEX idx_system_logs_entity ON system_logs(entity_type, entity_id);
CREATE INDEX idx_system_logs_created ON system_logs(created_at);
```

### Notes for Cursor
- Run all SQL in Supabase SQL editor for dev project first
- Verify all foreign keys resolve correctly before marking done
- `suppliers` table will be created in P1-08 (Master Config) — create it first if needed as a dependency
- Do not use Supabase RLS policies yet — backend enforces all access control via JWT middleware

---

## P1-08 — Supabase Schema — Master Configuration Tables

**Type:** Database  
**Priority:** P0  
**Reference:** TR-08, TR-09, NFR-05

### Description
Create all Master Configuration tables in Supabase following the standard schema. Each config type has its own table. These tables power every dropdown in the system.

### Standard Config Table Structure
Every config table follows this exact pattern:
```sql
CREATE TABLE config_<name> (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR NOT NULL,
  code            VARCHAR UNIQUE NOT NULL,
  is_active       BOOLEAN DEFAULT true,
  sort_order      INTEGER DEFAULT 0,
  used_in_pages   TEXT[],
  used_in_systems TEXT[],
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMP DEFAULT now(),
  updated_at      TIMESTAMP DEFAULT now()
);
```

### Tables to Create

```sql
-- SUPPLIERS (extended schema — has additional fields)
CREATE TABLE suppliers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                VARCHAR NOT NULL,
  code                VARCHAR UNIQUE NOT NULL,
  contact_name        VARCHAR,
  contact_email       VARCHAR,
  contact_phone       VARCHAR,
  bank_name           VARCHAR,
  bank_account_number VARCHAR,
  bank_ifsc           VARCHAR,
  bank_details_complete BOOLEAN DEFAULT false,  -- true only if all bank fields filled
  is_active           BOOLEAN DEFAULT true,
  sort_order          INTEGER DEFAULT 0,
  used_in_pages       TEXT[],
  used_in_systems     TEXT[],
  created_by          UUID REFERENCES users(id),
  created_at          TIMESTAMP DEFAULT now(),
  updated_at          TIMESTAMP DEFAULT now()
);

-- All standard config tables
CREATE TABLE config_currencies (/* standard structure */);
CREATE TABLE config_cabin_classes (/* standard structure */);
CREATE TABLE config_meal_plans (/* standard structure */);
CREATE TABLE config_transfer_types (/* standard structure */);
CREATE TABLE config_visa_types (/* standard structure */);
CREATE TABLE config_destinations (/* standard structure */);
CREATE TABLE config_cancellation_reasons (/* standard structure */);
CREATE TABLE config_margin_retention_pct (/* standard structure */);
CREATE TABLE config_refund_methods (/* standard structure */);
CREATE TABLE config_visa_exemption_types (/* standard structure */);
CREATE TABLE config_alert_types (/* standard structure */);

-- RATE CONFIGS (single-row tables for configurable rates)
CREATE TABLE config_tcs_rate (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rate        NUMERIC(5,4) NOT NULL DEFAULT 0.02,  -- 2%
  effective_from DATE NOT NULL,
  is_active   BOOLEAN DEFAULT true,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMP DEFAULT now()
);

CREATE TABLE config_gst_rate (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rate        NUMERIC(5,4) NOT NULL DEFAULT 0.18,  -- 18%
  effective_from DATE NOT NULL,
  is_active   BOOLEAN DEFAULT true,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMP DEFAULT now()
);

CREATE TABLE config_fx_risk_threshold (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  threshold_pct NUMERIC(5,4) NOT NULL DEFAULT 0.05,  -- 5%
  is_active   BOOLEAN DEFAULT true,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMP DEFAULT now()
);

-- EMAIL TEMPLATES
CREATE TABLE config_email_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR NOT NULL,
  code        VARCHAR UNIQUE NOT NULL,
  subject     VARCHAR NOT NULL,
  body        TEXT NOT NULL,
  variables   TEXT[],     -- list of template variable names e.g. {{supplier_name}}
  is_active   BOOLEAN DEFAULT true,
  used_in_pages TEXT[],
  used_in_systems TEXT[],
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMP DEFAULT now(),
  updated_at  TIMESTAMP DEFAULT now()
);
```

### Seed Data to Insert After Table Creation

```sql
-- Currencies
INSERT INTO config_currencies (name, code, sort_order, used_in_pages, used_in_systems) VALUES
('Indian Rupee', 'INR', 1, ARRAY['all'], ARRAY['Booking ERP']),
('US Dollar', 'USD', 2, ARRAY['all'], ARRAY['Booking ERP']),
('Thai Baht', 'THB', 3, ARRAY['all'], ARRAY['Booking ERP']),
('Euro', 'EUR', 4, ARRAY['all'], ARRAY['Booking ERP']),
('British Pound', 'GBP', 5, ARRAY['all'], ARRAY['Booking ERP']),
('UAE Dirham', 'AED', 6, ARRAY['all'], ARRAY['Booking ERP']);

-- Cabin Classes
INSERT INTO config_cabin_classes (name, code, sort_order, used_in_pages, used_in_systems) VALUES
('Economy', 'economy', 1, ARRAY['booking_flights'], ARRAY['Booking ERP']),
('Premium Economy', 'premium_economy', 2, ARRAY['booking_flights'], ARRAY['Booking ERP']),
('Business', 'business', 3, ARRAY['booking_flights'], ARRAY['Booking ERP']),
('First Class', 'first_class', 4, ARRAY['booking_flights'], ARRAY['Booking ERP']);

-- Meal Plans
INSERT INTO config_meal_plans (name, code, sort_order, used_in_pages, used_in_systems) VALUES
('Room Only', 'ro', 1, ARRAY['booking_hotels'], ARRAY['Booking ERP']),
('Bed & Breakfast', 'bb', 2, ARRAY['booking_hotels'], ARRAY['Booking ERP']),
('Half Board', 'hb', 3, ARRAY['booking_hotels'], ARRAY['Booking ERP']),
('Full Board', 'fb', 4, ARRAY['booking_hotels'], ARRAY['Booking ERP']),
('All Inclusive', 'ai', 5, ARRAY['booking_hotels'], ARRAY['Booking ERP']);

-- Transfer Types
INSERT INTO config_transfer_types (name, code, sort_order, used_in_pages, used_in_systems) VALUES
('Private', 'private', 1, ARRAY['booking_land'], ARRAY['Booking ERP']),
('Shared / SIC', 'sic', 2, ARRAY['booking_land'], ARRAY['Booking ERP']);

-- Cancellation Reasons
INSERT INTO config_cancellation_reasons (name, code, sort_order, used_in_pages, used_in_systems) VALUES
('Medical', 'medical', 1, ARRAY['cancellations'], ARRAY['Booking ERP']),
('Professional', 'professional', 2, ARRAY['cancellations'], ARRAY['Booking ERP']);

-- Refund Methods
INSERT INTO config_refund_methods (name, code, sort_order, used_in_pages, used_in_systems) VALUES
('Credit Note', 'credit_note', 1, ARRAY['cancellations'], ARRAY['Booking ERP']),
('Source Account', 'source_account', 2, ARRAY['cancellations'], ARRAY['Booking ERP']);

-- TCS Rate (initial)
INSERT INTO config_tcs_rate (rate, effective_from) VALUES (0.02, '2024-01-01');

-- GST Rate (initial)
INSERT INTO config_gst_rate (rate, effective_from) VALUES (0.18, '2024-01-01');

-- FX Risk Threshold (initial)
INSERT INTO config_fx_risk_threshold (threshold_pct) VALUES (0.05);
```

### Notes for Cursor
- `suppliers` table is a dependency for P1-07 — create it before core tables if running in order
- Rate config tables use single active row pattern — always query `WHERE is_active = true ORDER BY created_at DESC LIMIT 1`
- `bank_details_complete` on suppliers auto-set to true when all 3 bank fields (name, account, IFSC) are non-null

---

## P1-09 — Master Configurations API

**Type:** Backend  
**Priority:** P1  
**Reference:** TR-09, NFR-05, F-19

### Description
Build the API layer for all Master Configuration tables. Admins manage config entries. All authenticated users can read active configs (needed to populate dropdowns).

### Standard Endpoints Per Config Table
Each config table gets this set of endpoints. Replace `{config}` with the table name (e.g. `currencies`, `cabin-classes`, `suppliers`):

**GET /api/config/{config}**
- Auth: Any authenticated user
- Query params: `?active_only=true` (default true)
- Returns: array of config entries ordered by `sort_order`

**GET /api/config/{config}/:id**
- Auth: Any authenticated user
- Returns: single config entry

**POST /api/config/{config}**
- Auth: Admin only
- Body: `{ name, code, sort_order, used_in_pages, used_in_systems, ...extra fields }`
- Returns: created entry
- Logs: `CONFIG_CREATED`

**PATCH /api/config/{config}/:id**
- Auth: Admin only
- Body: any updatable fields
- Returns: updated entry
- Logs: `CONFIG_UPDATED`

**DELETE /api/config/{config}/:id**
- Not exposed — use PATCH to set `is_active = false`

### Rate Config Endpoints (special — single active record)

**GET /api/config/tcs-rate/current**
- Returns: `{ rate: 0.02 }` — current active TCS rate

**GET /api/config/gst-rate/current**
- Returns: `{ rate: 0.18 }` — current active GST rate

**GET /api/config/fx-threshold/current**
- Returns: `{ threshold_pct: 0.05 }` — current active threshold

**POST /api/config/tcs-rate**
- Auth: Admin only
- Creates new rate record (old rate retained for history — not deleted)
- Body: `{ rate, effective_from }`

**POST /api/config/gst-rate**
- Same pattern as TCS

**POST /api/config/fx-threshold**
- Same pattern

### Supplier-Specific Endpoints

**GET /api/suppliers**
- Returns all active suppliers with bank details completeness flag
- Used for searchable autocomplete across all booking forms

**POST /api/suppliers**
- Auth: Admin only
- Body: `{ name, code, contact_name, contact_email, contact_phone, bank_name, bank_account_number, bank_ifsc }`
- Auto-sets `bank_details_complete` based on bank fields

**PATCH /api/suppliers/:id**
- Auth: Admin only
- Re-evaluates `bank_details_complete` on every save

### Notes for Cursor
- All config GET endpoints are used in dropdown population — response time must be fast
- Consider a `/api/config/all` endpoint that returns all active configs in one call to reduce round trips on page load
- Never expose HEAD on any config endpoint

---

## P1-10 — Master Configurations Admin UI

**Type:** Frontend  
**Priority:** P1  
**Reference:** F-19, F-20, NFR-05

### Description
Build the admin UI for managing all Master Configuration tables. Admin-only screens. Clean table view with add, edit, activate/deactivate per config type.

### Acceptance Criteria

**Route:** `/admin/master-config`

1. Sidebar shows all config categories as tabs or nav items:
   - Currencies, Cabin Classes, Meal Plans, Transfer Types, Visa Types, Destinations, Cancellation Reasons, Refund Methods, Visa Exemption Types, Alert Types, TCS Rate, GST Rate, FX Threshold, Email Templates

2. Each config table shows:
   - List of all entries (active and inactive)
   - Columns: Name, Code, Sort Order, Used In Pages, Active status, Actions
   - Active entries shown normally, inactive shown greyed out
   - Add New button → inline form row or modal
   - Edit action → inline edit
   - Toggle Active / Inactive — no delete

3. Rate configs (TCS, GST, FX Threshold) show:
   - Current active rate prominently
   - History of past rates
   - "Update Rate" button → creates new record, does not edit old

4. Supplier management at `/admin/suppliers`:
   - All supplier fields including bank details
   - Bank details completeness indicator (green tick / orange warning)
   - Warning badge if bank details incomplete — used for alerts

5. All forms validate required fields before submit
6. Success/error toast on save
7. Admin-only route guard — non-admins redirected

### Notes for Cursor
- Use the central `lib/api.ts` for all API calls
- Dropdowns in booking forms will fetch from these config APIs — ensure consistent `code` field used as value

---

## P1-11 — Supplier Management API

**Type:** Backend  
**Priority:** P1  
**Reference:** F-19, TR-09

### Description
Supplier management is handled via the Master Configurations API (P1-09). This story covers the alert trigger for missing bank details — surfaced in OPS Center.

### Acceptance Criteria

**GET /api/suppliers/missing-bank-details**
- Auth: Any authenticated user
- Returns: array of suppliers where `bank_details_complete = false`
- Used by OPS Center alerts bar to show count and list

**Supplier bank details auto-validation on save:**
- `bank_details_complete = true` only when ALL of these are non-null and non-empty:
  - `bank_name`
  - `bank_account_number`
  - `bank_ifsc`
- Set automatically on POST and PATCH — never manually

### Notes for Cursor
- This endpoint is called on OPS Center load — keep it lightweight
- Returns supplier name and id only — no sensitive bank details in list response

---

## P1-12 — Supplier Management Admin UI

**Type:** Frontend  
**Priority:** P1  
**Reference:** F-19

### Description
Standalone supplier management screen under admin panel. Covered as part of P1-10 (Master Config UI). This story is the acceptance sign-off specifically for the supplier bank details warning.

### Acceptance Criteria

1. Supplier list at `/admin/suppliers`
2. Each supplier row shows bank details completeness:
   - Green tick icon if complete
   - Orange warning icon if incomplete
3. Clicking orange warning opens supplier edit form highlighting missing fields
4. Bank details section has fields: Bank Name, Account Number, IFSC Code
5. On save, `bank_details_complete` updates automatically — no manual toggle

---

## P1-13 — System Logs Schema and LogService

**Type:** Backend  
**Priority:** P1  
**Reference:** TR-06, TR-07, NFR-04, NFR-09

### Description
Create the `system_logs` table and the `LogService` abstraction layer. Every critical business event in the system is logged through this service. ELK stack is stubbed for future.

### Supabase Table
```sql
CREATE TABLE system_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type    VARCHAR NOT NULL,
  entity_type   VARCHAR NOT NULL,
  entity_id     UUID,
  actor_id      UUID REFERENCES users(id),
  actor_role    VARCHAR,
  before_state  JSONB,         -- null on create events
  after_state   JSONB,         -- null on delete events
  metadata      JSONB,
  created_at    TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_system_logs_event_type ON system_logs(event_type);
CREATE INDEX idx_system_logs_entity ON system_logs(entity_type, entity_id);
CREATE INDEX idx_system_logs_actor ON system_logs(actor_id);
CREATE INDEX idx_system_logs_created ON system_logs(created_at DESC);
```

### LogService Implementation
File: `src/services/LogService.js`

```javascript
class LogService {
  async log({ event_type, entity_type, entity_id, actor_id, actor_role,
               before_state = null, after_state = null, metadata = {} }) {
    // SupabaseLogger — built v1
    await this.supabaseLogger.insert({ event_type, entity_type, entity_id,
      actor_id, actor_role, before_state, after_state, metadata })
    // ELKLogger — stubbed v1
    await this.elkLogger.log(...)   // no-op for now, logs to console only
  }
}
```

### Before/After State Rules
- **Create events:** `before_state = null`, `after_state = full new record as JSONB`
- **Update events:** `before_state = { only changed fields with old values }`, `after_state = { only changed fields with new values }`
- **Delete events:** `before_state = full record`, `after_state = null`

### LogService must be called for all events in TR-07:
- `BOOKING_CREATED`, `BOOKING_UPDATED`, `FINANCIAL_FIELD_CHANGED`
- `FINANCIAL_CONFIRMED`, `PAYMENT_BUYER_RECORDED`, `PAYMENT_SUPPLIER_RECORDED`
- `SUPPLIER_TRANCHE_CANCELLED`, `NRF_FLAG_SET`, `CANCELLATION_INITIATED`
- `REFUND_VALUE_OVERRIDDEN`, `CN_ISSUED_BUYER`, `CN_ISSUED_SUPPLIER`
- `MARGIN_RELEASE_APPROVED`, `DOCUMENT_UPLOADED`, `PASSPORT_ALERT_ACKNOWLEDGED`
- `SUPPLIER_EMAIL_SENT`, `ADMIN_OVERRIDE`, `ALERT_TRIGGERED`
- `USER_INVITED`, `USER_UPDATED`, `CONFIG_CREATED`, `CONFIG_UPDATED`

### API Endpoint

**GET /api/logs**
- Auth: Admin only
- Query params: `?entity_type=&entity_id=&event_type=&actor_id=&from=&to=&limit=50&offset=0`
- Returns: paginated log entries newest first
- Used by Admin Audit Log screen

**GET /api/logs/booking/:booking_id**
- Auth: Admin + assigned Agent
- Returns: all logs for a specific booking, newest first
- Used by Booking Detail audit log tab

### Notes for Cursor
- LogService must never throw — wrap all logging in try/catch, log failures to console only
- Never log raw JWT tokens or passwords
- `before_state` and `after_state` store only changed fields on update — not full records

---

## P1-14 — Role-Based Access Control and Route Guards

**Type:** Frontend + Backend  
**Priority:** P1  
**Reference:** NFR-01, TR-03, F-20

### Description
Implement role-based access control consistently across both frontend and backend. Two roles: Agent and Admin. Access rules enforced at both layers — frontend for UX, backend as source of truth.

### Backend Middleware
File: `src/middleware/requireRole.js`

```javascript
// Usage: router.get('/admin/users', requireRole('admin'), controller)
const requireRole = (role) => (req, res, next) => {
  if (req.user.role !== role) {
    return res.status(403).json({ error: "Insufficient permissions" })
  }
  next()
}
```

Apply `requireRole('admin')` to:
- All `/api/config/*` POST and PATCH endpoints
- All `/api/users/*` endpoints except `/me`
- All `/api/suppliers` POST and PATCH
- All `/api/logs` GET endpoints
- All admin approval endpoints (Phase 6)

### Agent Data Scoping — Backend
Agents can only access their own bookings:
```javascript
// Booking queries for agents must include:
WHERE case_owner_id = req.user.id OR case_manager_id = req.user.id
// Admins get unfiltered results
```

Apply this scoping to all booking list and detail endpoints when `req.user.role === 'agent'`.

### Frontend Route Guards
Apply to all protected routes in Next.js:

| Route Pattern | Required Role | Redirect if Fail |
|---|---|---|
| `/admin/*` | admin | `/today` |
| `/today`, `/bookings/*`, `/payments/*` | any authenticated | `/login` |
| `/disbursements`, `/suppliers` | any authenticated | `/login` |

### Acceptance Criteria

1. `requireRole` middleware created and applied to all admin endpoints
2. Agent booking scoping applied to all booking list/detail queries
3. Frontend route guards implemented for all routes in screen inventory
4. Non-admin users attempting admin routes get redirected to `/today` with toast: "Access restricted"
5. Unauthenticated users on any route get redirected to `/login`
6. Current user's name and role visible in top navigation bar
7. Admin-only nav items (Admin panel, Master Config, Audit Log) hidden for agents
8. Role stored in AuthContext — accessible via `useAuth()` hook

### Notes for Cursor
- Backend is source of truth for access control — frontend guards are UX convenience only
- Never trust role from frontend request body — always read from `req.user.role` (JWT)
- Agent scoping is critical — an agent must never see another agent's bookings

---

## Phase 1 — Definition of Done

Phase 1 is complete when ALL of the following are true:

| Checkpoint | Verified |
|---|---|
| Both repositories created and running locally | |
| Dev and production environments isolated (separate Supabase, separate Vercel) | |
| `GET /health` returns correct env on both environments | |
| JWT auth middleware rejects all 5 invalid token scenarios | |
| All core Supabase tables created with correct FK relationships | |
| All Master Config tables created with seed data | |
| Admin can invite a user and that user can log in | |
| Agent cannot access admin routes (403 on backend, redirect on frontend) | |
| Agent cannot see another agent's bookings | |
| LogService writes to system_logs on every test event | |
| All config dropdowns return data via API | |
| Supplier with incomplete bank details flagged correctly | |
| Dockerfile builds successfully | |
| No hardcoded credentials anywhere in codebase | |

---

*End of Phase 1 Stories — v1.0*
