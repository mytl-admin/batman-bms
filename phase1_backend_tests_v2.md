# Phase 1 — Backend Test Suite
**Version:** 2.0  
**Date:** May 2026  
**Purpose:** Cursor executes all test cases to verify Phase 1 backend implementation  
**Run In:** `booking-erp-backend` Cursor window  
**Backend URL:** http://localhost:3000  
**Frontend URL:** http://localhost:3001

---

## Instructions for Cursor

```
@booking_service_requirements_v5.md @phase1_stories.md

Please execute all test cases in this document in order.
For each test:
1. Run the test
2. State PASS or FAIL
3. If FAIL — show the actual response and the expected response
4. Do not fix failures yet — just report them
5. At the end produce a summary table of all results

Use the dev environment (.env.dev) for all tests.
Seed any required test data before running tests that need it.
Clean up test data after the suite completes.
```

---

## Test Suite Setup

### TS-00 — Seed Test Data
Before running any tests, ensure these records exist in the dev Supabase:

```sql
-- Admin user (if not already exists)
INSERT INTO users (email, name, role, member_code, is_active)
VALUES ('admin@test.com', 'Test Admin', 'admin', 'TESTADMIN001', true)
ON CONFLICT (email) DO NOTHING;

-- Agent user
INSERT INTO users (email, name, role, member_code, is_active)
VALUES ('agent@test.com', 'Test Agent', 'agent', 'TESTAGENT001', true)
ON CONFLICT (email) DO NOTHING;

-- Inactive user
INSERT INTO users (email, name, role, member_code, is_active)
VALUES ('inactive@test.com', 'Inactive User', 'agent', 'TESTINACTIVE001', false)
ON CONFLICT (email) DO NOTHING;
```

---

## Group 1 — Health & Security

### T01 — Health Check Returns OK
```
Method:   GET
URL:      http://localhost:3000/health
Expected: 200 { status: "ok", env: "dev" }
```

### T02 — HEAD Method Blocked Globally
```
Method:   HEAD
URL:      http://localhost:3000/health
Expected: 405 { error: "Method not allowed" }
```

### T03 — HEAD Blocked on API Routes Too
```
Method:   HEAD
URL:      http://localhost:3000/api/users
Expected: 405 { error: "Method not allowed" }
```

### T04 — Unauthenticated Request Rejected
```
Method:   GET
URL:      http://localhost:3000/api/users
Headers:  (none)
Expected: 401 { error: "Missing or malformed authorization header" }
```

### T05 — Malformed Authorization Header Rejected
```
Method:   GET
URL:      http://localhost:3000/api/users
Headers:  Authorization: InvalidFormatNoBearer
Expected: 401 { error: "Missing or malformed authorization header" }
```

### T06 — Invalid JWT Token Rejected
```
Method:   GET
URL:      http://localhost:3000/api/users
Headers:  Authorization: Bearer thisisnotavalidjwt
Expected: 401 { error: "Invalid token" }
```

### T07 — Missing Member Code Header Rejected
```
Method:   GET
URL:      http://localhost:3000/api/users
Headers:  Authorization: Bearer <valid_token>
          X-Member-Code: (omitted)
Expected: 401 { error: "Missing member code header" }
```

### T08 — Mismatched Member Code Rejected
```
Method:   GET
URL:      http://localhost:3000/api/users
Headers:  Authorization: Bearer <valid_admin_token>
          X-Member-Code: WRONGCODE
Expected: 401 { error: "Member code mismatch" }
```

### T09 — Deactivated User Rejected
```
Method:   GET
URL:      http://localhost:3000/api/users/me
Headers:  Authorization: Bearer <inactive_user_token>
          X-Member-Code: TESTINACTIVE001
Expected: 401 { error: "Account deactivated" }
```

---

## Group 2 — Authentication

### T10 — Admin Login Returns Token
```
Method:   POST
URL:      http://localhost:3000/api/auth/login
Body:     { "email": "admin@test.com", "password": "<admin_password>" }
Expected: 200 {
            token: <jwt_string>,
            user: {
              id: <uuid>,
              name: "Test Admin",
              role: "admin",
              member_code: "TESTADMIN001"
            }
          }
Store:    Save token as ADMIN_TOKEN
Store:    Save member_code as ADMIN_MEMBER_CODE
```

### T11 — Agent Login Returns Token
```
Method:   POST
URL:      http://localhost:3000/api/auth/login
Body:     { "email": "agent@test.com", "password": "<agent_password>" }
Expected: 200 { token, user: { role: "agent" } }
Store:    Save token as AGENT_TOKEN
Store:    Save member_code as AGENT_MEMBER_CODE
```

### T12 — Login with Wrong Password Fails
```
Method:   POST
URL:      http://localhost:3000/api/auth/login
Body:     { "email": "admin@test.com", "password": "wrongpassword" }
Expected: 401 { error: "Invalid credentials" }
```

### T13 — Login with Unknown Email Fails
```
Method:   POST
URL:      http://localhost:3000/api/auth/login
Body:     { "email": "nobody@test.com", "password": "anything" }
Expected: 401 { error: "Invalid credentials" }
```

### T14 — Get Current User (Me)
```
Method:   GET
URL:      http://localhost:3000/api/users/me
Headers:  Authorization: Bearer <ADMIN_TOKEN>
          X-Member-Code: <ADMIN_MEMBER_CODE>
Expected: 200 { id, name, email, role: "admin", member_code }
```

---

## Group 3 — User Management

### T15 — Admin Can List All Users
```
Method:   GET
URL:      http://localhost:3000/api/users
Headers:  Authorization: Bearer <ADMIN_TOKEN>
          X-Member-Code: <ADMIN_MEMBER_CODE>
Expected: 200 — array containing at least admin and agent test users
          Each user has: id, name, email, role, is_active, last_login_at
```

### T16 — Agent Cannot List Users (403)
```
Method:   GET
URL:      http://localhost:3000/api/users
Headers:  Authorization: Bearer <AGENT_TOKEN>
          X-Member-Code: <AGENT_MEMBER_CODE>
Expected: 403 { error: "Insufficient permissions" }
```

### T17 — Admin Can Invite New User
```
Method:   POST
URL:      http://localhost:3000/api/users/invite
Headers:  Authorization: Bearer <ADMIN_TOKEN>
          X-Member-Code: <ADMIN_MEMBER_CODE>
Body:     { "email": "newuser@test.com", "name": "New User", "role": "agent" }
Expected: 200 { id, email, name, role: "agent", member_code }
          member_code is auto-generated (not user-supplied)
Store:    Save new user id as NEW_USER_ID
```

### T18 — Agent Cannot Invite Users (403)
```
Method:   POST
URL:      http://localhost:3000/api/users/invite
Headers:  Authorization: Bearer <AGENT_TOKEN>
          X-Member-Code: <AGENT_MEMBER_CODE>
Body:     { "email": "another@test.com", "name": "Another", "role": "agent" }
Expected: 403 { error: "Insufficient permissions" }
```

### T19 — Admin Can Deactivate a User
```
Method:   PATCH
URL:      http://localhost:3000/api/users/<NEW_USER_ID>
Headers:  Authorization: Bearer <ADMIN_TOKEN>
          X-Member-Code: <ADMIN_MEMBER_CODE>
Body:     { "is_active": false }
Expected: 200 — user object with is_active: false
```

### T20 — Admin Cannot Deactivate Own Account
```
Method:   PATCH
URL:      http://localhost:3000/api/users/<ADMIN_USER_ID>
Headers:  Authorization: Bearer <ADMIN_TOKEN>
          X-Member-Code: <ADMIN_MEMBER_CODE>
Body:     { "is_active": false }
Expected: 400 { error: "Cannot deactivate your own account" }
```

### T21 — Duplicate Email Invite Rejected
```
Method:   POST
URL:      http://localhost:3000/api/users/invite
Headers:  Authorization: Bearer <ADMIN_TOKEN>
          X-Member-Code: <ADMIN_MEMBER_CODE>
Body:     { "email": "admin@test.com", "name": "Duplicate", "role": "agent" }
Expected: 400 or 409 { error: <duplicate email message> }
```

---

## Group 4 — Master Configurations

### T22 — Get Active Currencies
```
Method:   GET
URL:      http://localhost:3000/api/config/currencies
Headers:  Authorization: Bearer <ADMIN_TOKEN>
          X-Member-Code: <ADMIN_MEMBER_CODE>
Expected: 200 — array containing at minimum: INR, USD, THB, EUR, GBP, AED
```

### T23 — Get Cabin Classes
```
Method:   GET
URL:      http://localhost:3000/api/config/cabin-classes
Headers:  Authorization: Bearer <ADMIN_TOKEN>
          X-Member-Code: <ADMIN_MEMBER_CODE>
Expected: 200 — array containing: Economy, Premium Economy, Business, First Class
```

### T24 — Get Meal Plans
```
Method:   GET
URL:      http://localhost:3000/api/config/meal-plans
Headers:  Authorization: Bearer <ADMIN_TOKEN>
          X-Member-Code: <ADMIN_MEMBER_CODE>
Expected: 200 — array containing: Room Only, Bed & Breakfast, Half Board, Full Board, All Inclusive
```

### T25 — Get Current TCS Rate
```
Method:   GET
URL:      http://localhost:3000/api/config/tcs-rate/current
Headers:  Authorization: Bearer <ADMIN_TOKEN>
          X-Member-Code: <ADMIN_MEMBER_CODE>
Expected: 200 { rate: 0.02 }
```

### T26 — Get Current GST Rate
```
Method:   GET
URL:      http://localhost:3000/api/config/gst-rate/current
Headers:  Authorization: Bearer <ADMIN_TOKEN>
          X-Member-Code: <ADMIN_MEMBER_CODE>
Expected: 200 { rate: 0.18 }
```

### T27 — Get Current FX Threshold
```
Method:   GET
URL:      http://localhost:3000/api/config/fx-threshold/current
Headers:  Authorization: Bearer <ADMIN_TOKEN>
          X-Member-Code: <ADMIN_MEMBER_CODE>
Expected: 200 { threshold_pct: 0.05 }
```

### T28 — Admin Can Create Config Entry
```
Method:   POST
URL:      http://localhost:3000/api/config/destinations
Headers:  Authorization: Bearer <ADMIN_TOKEN>
          X-Member-Code: <ADMIN_MEMBER_CODE>
Body:     {
            "name": "Thailand",
            "code": "thailand",
            "sort_order": 1,
            "used_in_pages": ["booking_header"],
            "used_in_systems": ["Booking ERP"]
          }
Expected: 200 — created destination entry with id
Store:    Save id as TEST_DESTINATION_ID
```

### T29 — Agent Can Read Config (Not Write)
```
Method:   POST
URL:      http://localhost:3000/api/config/destinations
Headers:  Authorization: Bearer <AGENT_TOKEN>
          X-Member-Code: <AGENT_MEMBER_CODE>
Body:     { "name": "Bali", "code": "bali", "sort_order": 2 }
Expected: 403 { error: "Insufficient permissions" }
```

### T30 — Admin Can Deactivate Config Entry
```
Method:   PATCH
URL:      http://localhost:3000/api/config/destinations/<TEST_DESTINATION_ID>
Headers:  Authorization: Bearer <ADMIN_TOKEN>
          X-Member-Code: <ADMIN_MEMBER_CODE>
Body:     { "is_active": false }
Expected: 200 — entry with is_active: false
```

### T31 — Inactive Config Excluded from Active-Only Query
```
Method:   GET
URL:      http://localhost:3000/api/config/destinations?active_only=true
Headers:  Authorization: Bearer <ADMIN_TOKEN>
          X-Member-Code: <ADMIN_MEMBER_CODE>
Expected: 200 — array does NOT contain the deactivated Thailand entry
```

---

## Group 5 — Suppliers

### T32 — Get All Suppliers
```
Method:   GET
URL:      http://localhost:3000/api/suppliers
Headers:  Authorization: Bearer <ADMIN_TOKEN>
          X-Member-Code: <ADMIN_MEMBER_CODE>
Expected: 200 — array (may be empty at this stage)
```

### T33 — Create Supplier Without Bank Details
```
Method:   POST
URL:      http://localhost:3000/api/suppliers
Headers:  Authorization: Bearer <ADMIN_TOKEN>
          X-Member-Code: <ADMIN_MEMBER_CODE>
Body:     {
            "name": "TravClan Thailand",
            "code": "travclan_thailand",
            "contact_name": "Somchai",
            "contact_email": "somchai@travclan.com",
            "contact_phone": "+66 812345678"
          }
Expected: 200 — supplier with bank_details_complete: false
Store:    Save id as TEST_SUPPLIER_ID
```

### T34 — Update Supplier With Full Bank Details
```
Method:   PATCH
URL:      http://localhost:3000/api/suppliers/<TEST_SUPPLIER_ID>
Headers:  Authorization: Bearer <ADMIN_TOKEN>
          X-Member-Code: <ADMIN_MEMBER_CODE>
Body:     {
            "bank_name": "Bangkok Bank",
            "bank_account_number": "1234567890",
            "bank_ifsc": "BKKBTHBK"
          }
Expected: 200 — supplier with bank_details_complete: true
```

### T35 — Missing Bank Details Endpoint Returns Correct Suppliers
```
Method:   GET
URL:      http://localhost:3000/api/suppliers/missing-bank-details
Headers:  Authorization: Bearer <ADMIN_TOKEN>
          X-Member-Code: <ADMIN_MEMBER_CODE>
Expected: 200 — array of suppliers with bank_details_complete: false
          TEST_SUPPLIER_ID must NOT appear (now complete)
```

### T36 — Agent Cannot Create Supplier
```
Method:   POST
URL:      http://localhost:3000/api/suppliers
Headers:  Authorization: Bearer <AGENT_TOKEN>
          X-Member-Code: <AGENT_MEMBER_CODE>
Body:     { "name": "Test", "code": "test" }
Expected: 403 { error: "Insufficient permissions" }
```

---

## Group 6 — System Logs

### T37 — System Logs Table Has Entries
```
Action:   Query Supabase directly:
          SELECT * FROM system_logs ORDER BY created_at DESC LIMIT 10;
Expected: At least some log entries from operations above
          Each entry has: id, event_type, entity_type, actor_id, created_at
```

### T38 — Log Entry Has Correct Structure on Create
```
Action:   SELECT * FROM system_logs WHERE event_type = 'USER_INVITED' LIMIT 1;
Expected: before_state IS NULL
          after_state contains the new user's fields
          actor_id matches the admin user's id
```

### T39 — Log API Returns Entries for Admin
```
Method:   GET
URL:      http://localhost:3000/api/logs?limit=10
Headers:  Authorization: Bearer <ADMIN_TOKEN>
          X-Member-Code: <ADMIN_MEMBER_CODE>
Expected: 200 — paginated array of log entries, newest first
```

### T40 — Agent Cannot Access System Logs
```
Method:   GET
URL:      http://localhost:3000/api/logs
Headers:  Authorization: Bearer <AGENT_TOKEN>
          X-Member-Code: <AGENT_MEMBER_CODE>
Expected: 403 { error: "Insufficient permissions" }
```

---

## Group 7 — Database Schema Verification

### T41 — All Core Tables Exist
```
Action:   Run in Supabase SQL editor:
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

Expected tables:
□ admin_approvals          □ booking_documents
□ booking_flights          □ booking_hotels
□ booking_land_items       □ booking_pan_cards
□ booking_travellers       □ booking_visa_applicants
□ booking_visas            □ bookings
□ buyer_payment_records    □ cancellations
□ config_cancellation_reasons  □ config_currencies
□ config_fx_risk_threshold □ config_gst_rate
□ config_meal_plans        □ config_tcs_rate
□ config_transfer_types    □ config_visa_exemption_types
□ config_visa_types        □ credit_notes
□ fx_risk_flags            □ guest_supplier_tranche_links
□ guest_tranches           □ supplier_buyer_payment_links
□ supplier_payment_records □ supplier_tranches
□ suppliers                □ system_logs
□ users
```

### T42 — Foreign Key Constraints Enforced
```
Action:   Run in Supabase SQL editor:
INSERT INTO booking_flights (booking_id, sector_from, sector_to)
VALUES ('00000000-0000-0000-0000-000000000000', 'DEL', 'BOM');
Expected: ERROR — foreign key violation on booking_id
```

### T43 — Unique Constraints Enforced
```
Action:   Attempt to insert two users with same email
Expected: ERROR — unique constraint violation on email
```

---

## Group 8 — Environment Isolation

### T44 — Dev Environment Confirmed
```
Method:   GET
URL:      http://localhost:3000/health
Expected: { env: "dev" }
          SUPABASE_URL in .env.dev points to dev project only
```

### T45 — No Hardcoded Secrets in Codebase
```
Action:   Cursor searches entire backend codebase for:
          - Any .supabase.co URL string
          - Any JWT secret value
          - Any API key patterns (sk-, SG.)
Expected: Zero matches in any source file
          All values from process.env only
```

---

## Test Cleanup

```sql
DELETE FROM users WHERE email IN ('newuser@test.com');
DELETE FROM suppliers WHERE code = 'travclan_thailand';
DELETE FROM config_destinations WHERE code = 'thailand';
```

---

## Results Summary Template

| Test | Description | Result | Notes |
|---|---|---|---|
| T01 | Health check | PASS/FAIL | |
| T02 | HEAD blocked on health | PASS/FAIL | |
| T03 | HEAD blocked on API | PASS/FAIL | |
| T04 | Unauthenticated rejected | PASS/FAIL | |
| T05 | Malformed header rejected | PASS/FAIL | |
| T06 | Invalid JWT rejected | PASS/FAIL | |
| T07 | Missing member code rejected | PASS/FAIL | |
| T08 | Mismatched member code rejected | PASS/FAIL | |
| T09 | Deactivated user rejected | PASS/FAIL | |
| T10 | Admin login | PASS/FAIL | |
| T11 | Agent login | PASS/FAIL | |
| T12 | Wrong password rejected | PASS/FAIL | |
| T13 | Unknown email rejected | PASS/FAIL | |
| T14 | Get current user | PASS/FAIL | |
| T15 | Admin lists users | PASS/FAIL | |
| T16 | Agent cannot list users | PASS/FAIL | |
| T17 | Admin invites user | PASS/FAIL | |
| T18 | Agent cannot invite | PASS/FAIL | |
| T19 | Admin deactivates user | PASS/FAIL | |
| T20 | Cannot deactivate self | PASS/FAIL | |
| T21 | Duplicate email rejected | PASS/FAIL | |
| T22 | Get currencies | PASS/FAIL | |
| T23 | Get cabin classes | PASS/FAIL | |
| T24 | Get meal plans | PASS/FAIL | |
| T25 | Get TCS rate | PASS/FAIL | |
| T26 | Get GST rate | PASS/FAIL | |
| T27 | Get FX threshold | PASS/FAIL | |
| T28 | Admin creates config | PASS/FAIL | |
| T29 | Agent cannot create config | PASS/FAIL | |
| T30 | Admin deactivates config | PASS/FAIL | |
| T31 | Inactive config excluded | PASS/FAIL | |
| T32 | Get suppliers | PASS/FAIL | |
| T33 | Create supplier no bank | PASS/FAIL | |
| T34 | Update supplier bank details | PASS/FAIL | |
| T35 | Missing bank details endpoint | PASS/FAIL | |
| T36 | Agent cannot create supplier | PASS/FAIL | |
| T37 | System logs exist | PASS/FAIL | |
| T38 | Log structure on create | PASS/FAIL | |
| T39 | Admin reads logs | PASS/FAIL | |
| T40 | Agent cannot read logs | PASS/FAIL | |
| T41 | All tables exist | PASS/FAIL | |
| T42 | FK constraints enforced | PASS/FAIL | |
| T43 | Unique constraints enforced | PASS/FAIL | |
| T44 | Dev env confirmed | PASS/FAIL | |
| T45 | No hardcoded secrets | PASS/FAIL | |
| **Total** | | **/45** | |

---

*End of Phase 1 Backend Test Suite — v2.0*
