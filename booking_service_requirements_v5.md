# Booking Management Service — Requirements Document
**Version:** 5.0  
**Date:** May 2026  
**Status:** Product Definition Complete — Ready for Story Writing  
**Prepared By:** Product Definition Session

---

## Table of Contents
1. [Business Analysis](#1-business-analysis)
2. [Non-Functional Requirements](#2-non-functional-requirements)
3. [Purely Technical Requirements](#3-purely-technical-requirements)
4. [Functional Product Requirements](#4-functional-product-requirements)
5. [UI & Interaction Patterns](#5-ui--interaction-patterns)
6. [Screen Inventory](#6-screen-inventory)
7. [Deferred Items](#7-deferred-items)

---

## 1. Business Analysis

### 1.1 What This System Is
The Booking Management Service is an internal operations ERP for a bootstrapped Online Travel Agency (OTA). It activates when a lead converts to a booking in the CRM and manages the entire lifecycle of that booking through to completion or cancellation.

It is a distinct system from the CRM. The CRM hands off a conversion event via a booking reference ID. From that point, the Booking Service owns the record.

### 1.2 Core Business Problem It Solves
The business currently operates booking operations over Slack — costs, supplier names, hotel changes, payment tokens, and cancellation terms communicated in chat threads with no structured record. This creates:

- No single source of truth for what was booked, at what cost, with which supplier
- No automated refund policy enforcement — agents manually track cancellation windows
- No visibility into GST and TCS liabilities until month end
- No FX risk tracking when suppliers quote in foreign currency
- No audit trail on who confirmed financial figures and when
- No structured payment tranche tracking — token payments and balances managed ad hoc
- No traveller document completeness checks before travel

### 1.3 Who Uses It

| User | Role |
|---|---|
| Agent | Creates bookings, records costs, uploads documents, manages tranches, manages traveller details |
| Admin | Full visibility, approves margin releases, overrides refund values, manages CN registers, reviews and dispatches supplier emails, approves all admin actions |

### 1.4 Revenue & Financial Logic

#### Pricing Stack
```
Sum of all line item costs (INR equivalent)   = Total Cost Price (A)
+ Margin (manually entered, ~10% of cost)     = Subtotal (C)
+ GST (18% of margin only)                    = GST Amount
+ TCS (2% of subtotal)                        = TCS Amount
= Total Payable by Guest
```

#### Key Financial Rules
- GST is levied only on margin — not on total package value
- TCS is collected on gross package value (cost + margin), excluding GST
- Both GST and TCS are government liabilities — paid at calendar month end
- 100% margin recovery is always the target — any release requires Admin approval
- Org absorbs FX risk up to configured threshold (default 5% of margin) — AI flags breaches
- GST rate, TCS rate, and FX threshold all configurable via Master Configurations — never hardcoded

#### Cost Price Breakup Rule
Wherever Total Cost Price is displayed — OPS Center, booking detail, invoice, cancellation module, audit log, dashboards — it must show a per-section breakup with expandable per-item detail. Collapsed by default, expandable per section:

```
Total Cost Price                          ₹1,67,606
  ├── Flights                             ₹75,660
  ├── Hotels                              ₹60,234
  │     ├── Thavorn Palm Beach (4N)       ₹33,345
  │     └── Holiday Ao Nang (3N)          ₹26,889
  ├── Land Package                        ₹28,740
  │     ├── Airport transfer (private)    ₹4,200
  │     ├── Phi Phi Island day trip (SIC) ₹18,600
  │     └── Hotel transfer (private)      ₹5,940
  └── Visa                                ₹2,972
        ├── Rahul Saxena                  ₹743
        ├── Priya Saxena                  ₹743
        ├── Aryan Saxena                  ₹743
        └── Kavya Saxena                  ₹743
```

### 1.5 Refund Policy Architecture

#### 5-Day Stricter Buffer
Our policy = Supplier policy date - 5 days. Auto-calculated on save. Boundary dates always inclusive.

#### Refund Tiers Per Line Item
- 100% refundable until date X (our policy)
- Partial % refundable from X until date Y (our policy)
- 100% non-refundable after date Y

#### Refund Formula
```
Refundable to Guest = A - B - D - Margin

A = Recoverable from paid supplier tranches (AI recommended, Admin overridable)
  + Full value of pending tranches (auto-cancelled, never disbursed)
B = Additional retention approved by Admin (default 0, editable by Admin only)
D = TCS (always deducted — govt liability, no override ever)
Margin = 100% retained (Admin approval required to release any portion)
GST = NOT a separate deduction — paid from within retained margin
```

#### Absolute Ceiling
```
Maximum refundable = A + Margin - TCS - GST liability
Cannot be exceeded under any circumstance — no Admin override above this
```

#### Hard Rules
- DoT minus 7 days → zero refund floor. Admin can approve above but never at net org loss
- When refund = 0: *"Net refund amount is zero. Please talk to Admin if more needs to be processed."*
- Agent never sees breakdown when refund is zero — Admin sees full breakdown

### 1.6 Guest Payment Terms

#### Scenario A — Booking confirmed more than 20 days before DoT

**Tranche 1 — Due at booking confirmation:**
```
Sum of booked-with-us component costs (not self-booked/self-arranged)
+ Full margin of package
```

**Tranche 2 — Balance:**
```
Total Payable - Tranche 1
Due date = Earliest supplier tranche date - 5 days
```

#### Scenario B — Within 20 days of DoT
```
100% Total Payable upfront — single tranche
NRF flag auto-set on booking record
Logged as NRF_FLAG_SET
```

System auto-generates tranches on booking creation. Agent views only — Admin override only.

### 1.7 Supplier Tranche Behaviour on Cancellation

System displays tranche status at cancellation initiation:
- **Paid tranches:** AI reads supplier docs, recommends recoverable amount. Admin overridable.
- **Pending tranches:** Auto-cancelled. Full value recovered. Logged as `SUPPLIER_TRANCHE_CANCELLED`.

### 1.8 AI Role in the System
AI is a **time-saving pre-fill assistant. Humans always own the data.**

```
AI reads documents → Pre-fills fields → Agent reviews → Agent confirms → Data logged
```

AI is used for:
- Pre-filling booking financial fields from uploaded supplier documents
- Pre-filling cancellation recoverable amounts (field A)
- FX risk flagging (advisory only)
- Generating supplier extension draft emails

AI never auto-saves. The audit trail records the human who accepted — not the AI that suggested.

### 1.9 Cancellation as an Accounting Event
All cancellations generate Credit Notes. Original invoice is immutable.
Net position = Total Invoices - Sum of all Credit Notes.

Two CN registers:
- **Buyer CN Register** — org owes guests
- **Supplier CN Register** — suppliers owe org

### 1.10 Payment Record Rule
```
Sum of linked buyer payment amounts ≥ Supplier payment amount
```
Supplier payment cannot be created until linked buyer payment exists and is collected.

### 1.11 Alerts & Operational Signals
The system surfaces the following operational alerts:

| Alert | Trigger | Visibility |
|---|---|---|
| Visa appointment due | Within 2 days of visa appointment | OPS Center, Booking Detail |
| Passport expiring soon | Passport expiry < DoT + 7 months | OPS Center, Traveller card |
| Supplier lacking bank details | Supplier record missing account info | OPS Center, Supplier Management |
| FX Breach | FX variance > threshold | OPS Center, Booking Detail |
| Missing traveller documents | Visa proof or passport not uploaded | OPS Center, Bookings List |
| NRF Auto-Set | Booking created within 20 days of DoT | Bookings List badge |
| Collection overdue | Guest tranche past due date | OPS Center, Collection Dashboard |
| Supplier payment due today | Supplier tranche due date = today | Disbursement Dashboard |

---

## 2. Non-Functional Requirements

### NFR-01: Security
- All API communication over HTTPS only
- JWT-based authentication on every API call
- JWT validation: decryptability, member_code presence, access_key (SHA-256 of member_code)
- member_code also sent as separate custom request header on every call
- No sensitive keys hardcoded — all from environment variables
- HEAD method never exposed on any API endpoint

### NFR-02: Environment Isolation
- Two environments: dev and production
- Separate `.env.dev` and `.env.production`
- Separate Supabase project instances per environment
- Separate Vercel deployment targets per environment
- No shared credentials between environments
- Only tested features promoted to production
- First deployment to production — dev stood up immediately after

### NFR-03: Deployability
- Backend includes Dockerfile from day one
- Primary: Vercel. Fallback: Docker / self-hosted

### NFR-04: Auditability
- All critical business events logged to `system_logs` Supabase table
- Financial field changes: full before/after field-level diff stored
- Original invoices immutable
- Cancellations always separate records
- Credit Notes never mutate original invoice
- All Admin overrides attributable to user + timestamp
- Passport alert acknowledgements logged
- AI financial confirmation checkbox records user + timestamp
- Document version history retained — old versions never deleted

### NFR-05: Configurability
- All dropdowns from Master Configurations — nothing hardcoded
- Each config type has its own independent Supabase table
- Each table includes: used_in_pages, used_in_systems metadata
- TCS rate, GST rate, FX threshold all configurable
- Email templates configurable — no code deploy to update

### NFR-06: AI Integration
- OpenAI API key per environment in env variables
- AI triggered on form submission — never on upload
- AI reads latest version of all booking documents at evaluation time
- AI output = pre-populated fields only — never auto-saved
- FX flagging advisory — no hard block
- Supplier extension emails: AI draft → human review → Send to Supplier

### NFR-07: Data Integrity
- Min 1 line item per booking
- Hotels and Flights tranches compulsory if present and not self-booked
- Guest tranche date ≥ earliest linked supplier tranche date - 5 days
- Within 20 days of DoT: single 100% upfront tranche, NRF flag set
- Supplier tranche date < DoT always
- Supplier payment ≤ linked collected buyer payments
- Passport expiry alert at < DoT + 7 months — not hard block
- All refund boundary dates stored and displayed as inclusive

### NFR-08: Notification Architecture
```
NotificationService.send(channel, recipient, template, payload)
  ├── SlackChannel        (built — v1)
  ├── EmailChannel        (built — v1 via SendGrid)
  └── WhatsAppChannel     (stubbed — future)
```

### NFR-09: Logging Architecture
```
LogService.log(level, event, payload)
  ├── SupabaseLogger      (built — v1)
  └── ELKLogger           (stubbed — future)
```

---

## 3. Purely Technical Requirements

### TR-01: Project Architecture
- Two repos: `booking-erp-frontend` (Next.js) and `booking-erp-backend` (Node.js)
- Build tool: Cursor
- Both deploy to Vercel
- Dockerfile in backend from day one
- Frontend never talks to Supabase directly

### TR-02: API Design
- HTTPS only, JSON bodies
- Min CRUD: GET / POST / PATCH / DELETE per resource
- HEAD never exposed
- JWT + member_code header validated on every request

### TR-03: Authentication
- JWT in `Authorization` header
- Payload: `member_code`, `access_key` (SHA-256 of member_code)
- member_code also in custom request header
- Validation: decryptability + member_code match + access_key integrity
- Google SSO planned — architecture must not preclude it
- Invite-based user creation only — no self-signup

### TR-04: Data Layer
- Supabase (PostgreSQL)
- Backend ↔ Supabase directly or via Edge Functions
- Separate Supabase projects per environment

### TR-05: Email Service
- Provider: SendGrid
- Separate API keys per environment
- Templates in Master Configurations — configurable without code deploy
- Supplier extension: AI draft → review queue → Send to Supplier → SendGrid dispatch

### TR-06: System Logs Schema
```sql
system_logs
  id            UUID PRIMARY KEY
  event_type    VARCHAR
  entity_type   VARCHAR
  entity_id     UUID
  actor_id      UUID
  actor_role    VARCHAR
  before_state  JSONB    -- null on create
  after_state   JSONB    -- null on delete
  metadata      JSONB
  created_at    TIMESTAMP
```

Before/after: only changed fields stored per event.

### TR-07: Mandatory Logged Events

| Event Type | Trigger |
|---|---|
| `BOOKING_CREATED` | New booking saved |
| `BOOKING_UPDATED` | Any booking field changed |
| `FINANCIAL_FIELD_CHANGED` | Any cost, margin, tax, TCS modified |
| `FINANCIAL_CONFIRMED` | Audit checkbox clicked |
| `PAYMENT_BUYER_RECORDED` | Buyer payment created |
| `PAYMENT_SUPPLIER_RECORDED` | Supplier payment created |
| `SUPPLIER_TRANCHE_CANCELLED` | Pending tranche auto-cancelled on cancellation |
| `NRF_FLAG_SET` | Booking marked NRF (within 20-day window) |
| `CANCELLATION_INITIATED` | Cancellation record created |
| `REFUND_VALUE_OVERRIDDEN` | Admin changes AI refund recommendation |
| `CN_ISSUED_BUYER` | Buyer CN generated |
| `CN_ISSUED_SUPPLIER` | Supplier CN generated |
| `MARGIN_RELEASE_APPROVED` | Admin approves margin release |
| `DOCUMENT_UPLOADED` | Document uploaded — version number included |
| `PASSPORT_ALERT_ACKNOWLEDGED` | Agent confirms traveller notified |
| `SUPPLIER_EMAIL_SENT` | Extension email dispatched via SendGrid |
| `ADMIN_OVERRIDE` | Any Admin override on financial values |
| `ALERT_TRIGGERED` | Any system alert raised |

### TR-08: Master Configurations Schema
```sql
id              UUID PRIMARY KEY
name            VARCHAR
code            VARCHAR UNIQUE
is_active       BOOLEAN
sort_order      INTEGER
used_in_pages   TEXT[]
used_in_systems TEXT[]
created_by      UUID
created_at      TIMESTAMP
updated_at      TIMESTAMP
```

### TR-09: Known Master Configuration Tables

| Table | Used In | Pages / Sections |
|---|---|---|
| `cancellation_reasons` | Booking ERP | Cancellation Module |
| `margin_retention_pct` | Booking ERP | Cancellation Module |
| `refund_methods` | Booking ERP | Cancellation Module |
| `suppliers` | Booking ERP | All line item sections |
| `currencies` | Booking ERP | Payment Tranches, all Line Items |
| `cabin_classes` | Booking ERP | Flight section |
| `meal_plans` | Booking ERP | Hotel section |
| `transfer_types` | Booking ERP | Land Package |
| `visa_types` | Booking ERP | Visa section |
| `destinations` | Booking ERP | Booking Header, Visa |
| `tcs_rate` | Booking ERP | Invoice Section |
| `gst_rate` | Booking ERP | Invoice Section |
| `fx_risk_threshold` | Booking ERP | FX Risk Flagging |
| `visa_exemption_types` | Booking ERP | Traveller Module |
| `email_templates` | Booking ERP | Supplier Extension Email |
| `alert_types` | Booking ERP | OPS Center, Alerts |

### TR-10: Currency & FX Handling
- INR equivalent = Amount × Rate at time of entry
- FX risk = variance between booking rate and payment rate
- Threshold in Master Configurations (default 5% of margin)
- AI flags breach — advisory, no hard block
- FX detail shown: currency, booking rate, payment rate, variance %, affected tranche

### TR-11: Document Versioning
- Each upload = new version record, auto-incremented
- Latest version = active (AI always reads this)
- All previous versions retained, read-only
- Any Agent or Admin can upload new version
- No version limit
- Document slots: per line item + booking-level voucher
- Documents linked at booking level only — not to specific tranches

---

## 4. Functional Product Requirements

### F-01: OPS Command Center (Today Dashboard)

Landing page for all users. Personalised greeting with date.

#### Summary Metrics Bar
| Metric | Rule |
|---|---|
| Guest Collections Overdue | Sum of all guest tranches past due date |
| Supplier Payments Due Today | Sum of supplier tranches due today |
| Blocked Supplier Payments | Supplier tranches due but buyer collection pending |
| Admin Approvals Pending | Count of items in Admin approvals inbox |
| Cancellation / Refund Processing | Active cancellation cases |
| Missing Traveller Documents | Bookings with incomplete traveller docs |

#### Work Queues
Three queues shown side by side:

**Collect from Guests**
- Filter tabs: 5 days before due / 2 days before due / Due today
- Per row: Customer name, Booking code, Amount, Status badge (Overdue / Due today / Due in X days)

**Pay Suppliers**
- Filter: Due today / Overdue
- Per row: Supplier name, Booking code, Amount, Due date, Next action button

**Fix Risks & Exceptions**
- Passport Expiring Soon (count)
- Visa Proof Missing (count)
- FX Window Closing (count)
- FX Risk Breach (count)
- NRF Risk (count)
- Each item links to relevant booking

#### Upcoming Travel (Next 7 Days)
- Bookings with DoT in next 7 days
- Per row: Booking code, Customer, Date, Pax, Amount, Document status alert if any

#### Alerts Bar
- Visa appointments in X days
- Passport expiring in X days
- Suppliers lacking bank details
- FX Breach Alerts
- Each alert type shows count and links to filtered view

---

### F-02: Bookings List

Searchable, filterable list of all bookings.

#### Search
Full-text search: booking code, customer name, destination.

#### Filters
All Status / All Owners / All Destinations / Travel Dates / Payment Status / Document Status / More Filters / Clear

#### Columns
| Column | Notes |
|---|---|
| Booking Code | Clickable → Booking Detail |
| Customer | Name |
| Destination / Dates | Multi-destination + date range + nights |
| Date of Travel | Sortable |
| NRF | Badge if NRF Auto-Set |
| Owner | Assigned agent |
| Status | Active / On Hold / Cancelled / Completed |
| Collection Status | Paid / Partial / Overdue / Pending / Balance Due |
| Supplier Status | Booked / Partial / Pending |
| Docs | Complete / count missing |
| Refundability | RF / Partial RF / NRF badge |
| Next Action | Contextual action button |

#### Next Action Buttons (contextual)
- Record Payment
- Request Extension
- Pay Supplier
- Upload Docs
- Verify Docs
- View

---

### F-03: Booking Detail — Case File

Tabbed layout. Header always visible.

#### Header
Booking code, Customer name, Destination, Dates, Pax, Case Owner, Case Manager.
Action buttons: More Actions / Upload Document / Request Extension / Print.

#### Tabs
- Case Summary
- Financials
- Disbursements
- Documents
- Admin / Audit Log

#### Case Summary Tab — Left Panel (Itinerary Tree)
Expandable line items:
- Trip Summary (destination, dates, pax, adults, supplier tranches count)
- Flights (sectors count) — RF/NRF badge + our policy date
- Hotels (count) — RF/NRF badge + our policy date
- Land Package (items count) — RF/NRF badge
- Visa (applicants count) — RF/NRF badge
- Travellers (count + alert count)
- Guest Payments (collected + pending amounts + status)
- Supplier Tranches (paid + due in X days)
- Documents (uploaded count + missing count)

#### Case Summary Tab — Right Panel (Financial Snapshot)
```
Total Cost Price (A)        ₹1,67,606  [Edit Financials button]
  └── Expandable breakup per section
Margin                      ₹20,000
GST on Margin (18%)         ₹3,600
TCS (2%)                    ₹3,752
Total Payable by Guest      ₹1,94,958
```

Payment Overview:
- Collected from Guest
- Balance to Collect
- Paid to Suppliers
- Supplier Due Next (amount + days)
- Margin Status (Protected / At Risk / Released)
- FX Risk (No breach / High Breach)
- Refund Exposure (AI estimate)

Per-tranche payment status (individual rows):
- Tranche label, amount, due date, status (Pending / Collected / Overdue)

#### FX Risk Details Panel (shown when FX breach exists)
- Currency
- Booking Rate
- Payment Rate
- Variance %
- Affected Tranche
- Threshold
- Status (No Breach / High Breach)

---

### F-04: Booking Creation — 5-Step Wizard

#### Step 1 — Trip Header

| Field | Type | Rule |
|---|---|---|
| Customer name | Text | Required |
| CRM lead ID | Text | Optional — loose reference |
| Destination(s) | Searchable multi-select | Required, min 1 |
| Date of Travel | Date picker | Required |
| Return date | Date picker | Required, after DoT |
| Adults | Number | Required, min 1 |
| Children | Number | Default 0 |
| Children ages | Repeating inputs | Required if children > 0 |

Right panel shows live Trip Summary as fields are filled.
Booking Mode auto-displayed: "More than 20 days before travel" or "Within 20 days — 100% payment required"
Payment Mode auto-displayed: "Staged Payments" or "Full Payment Upfront"

#### Step 2 — Line Items
Min 1 required. Add buttons: `+ Flight` `+ Hotel` `+ Land item` `+ Visa`
See F-05 for full field spec per type.

#### Step 3 — Travellers
One block per pax. See F-07 for field spec.

#### Step 4 — Payment Tranches
System auto-generates per payment term rules.
See F-08 for spec.

#### Step 5 — Review & Confirm
- Live invoice with editable margin
- Cost price breakup expandable per section
- GST, TCS, Total Payable recalculate live
- Financial confirmation checkbox — mandatory, cannot be pre-checked
- Checkbox text: *"I have read and confirm all financials are correctly recorded. This action will be logged with your name and timestamp."*

---

### F-05: Line Item Types

#### F-05.1: Flights

| Field | Type | Rule |
|---|---|---|
| Self-booked | Toggle | Default off — cost hidden if on |
| Sector from / to | Text | Required |
| Supplier | Searchable autocomplete | Required if not self-booked |
| Travel date | Date picker | Required |
| Departure time | Time picker | Required |
| Cabin class | Dropdown (Master Config) | Required |
| Baggage allowance | Text | Optional |
| Cost | Number | Required if not self-booked |
| Currency | Dropdown (Master Config) | Required |
| Exchange rate | Number | Required if non-INR |
| INR equivalent | Auto-calculated read-only | Cost × Rate |
| Is refundable | Toggle | Required |
| Full refund till — supplier | Date picker | Required if refundable — inclusive |
| Full refund till — our policy | Auto-calculated read-only | Supplier date - 5 days |
| Partial refund % | Number | Optional |
| Partial refund till — supplier | Date picker | Required if partial % entered |
| Partial refund till — our policy | Auto-calculated read-only | Supplier date - 5 days |
| Supplier doc upload | File | Optional |
| Add another flight | Button | New card |

#### F-05.2: Hotels

| Field | Type | Rule |
|---|---|---|
| Self-booked | Toggle | Default off |
| Property name | Text | Required |
| Supplier | Searchable autocomplete | Required if not self-booked |
| City / Location | Text | Required |
| Check-in date | Date picker | Required |
| Check-out date | Date picker | Required, after check-in |
| Nights | Auto-calculated read-only | Check-out - check-in |
| Room type | Text | Optional |
| Meal plan | Dropdown (Master Config) | Optional |
| Cost | Number | Required if not self-booked |
| Currency | Dropdown (Master Config) | Required |
| Exchange rate | Number | Required if non-INR |
| INR equivalent | Auto-calculated read-only | |
| Is refundable | Toggle | Required |
| Full refund till — supplier | Date picker | Inclusive |
| Full refund till — our policy | Auto-calculated read-only | Supplier - 5 days |
| Partial refund % | Number | Optional |
| Partial refund till — supplier | Date picker | Optional |
| Partial refund till — our policy | Auto-calculated read-only | Supplier - 5 days |
| Supplier doc upload | File | Optional |
| Add another hotel | Button | New card |

#### F-05.3: Land Package

| Field | Type | Rule |
|---|---|---|
| Sub-item type | Dropdown | Airport Transfer / Hotel Transfer / Sightseeing |
| Description | Text | Required |
| Supplier | Searchable autocomplete | Required |
| Transfer type | Toggle | Private / Shared (SIC) |
| Date | Date picker | Required |
| Cost | Number | Required |
| Currency | Dropdown (Master Config) | Required |
| Exchange rate | Number | Required if non-INR |
| INR equivalent | Auto-calculated read-only | |
| Is refundable | Toggle | Required |
| Full refund till — supplier | Date picker | Inclusive |
| Full refund till — our policy | Auto-calculated read-only | Supplier - 5 days |
| Partial refund % | Number | Optional |
| Partial refund till — our policy | Auto-calculated read-only | Supplier - 5 days |
| Add sub-item | Button | New row |

#### F-05.4: Visa

| Field | Type | Rule |
|---|---|---|
| Self-arranged | Toggle | Default off — cost hidden if on |
| Country | Searchable dropdown | Required |
| Visa type | Dropdown (Master Config) | Required |
| Applicant(s) | Multi-select from travellers | Required |
| Supplier / Agency | Searchable autocomplete | Required if not self-arranged |
| Cost per applicant | Number | Required if not self-arranged |
| Number of applicants | Auto-pulled | Read-only |
| Total visa cost | Auto-calculated | Cost × applicants |
| Currency | Dropdown (Master Config) | Required |
| Exchange rate | Number | Required if non-INR |
| INR equivalent | Auto-calculated read-only | |
| Is refundable | Toggle | Required |
| Full refund till — supplier | Date picker | Inclusive |
| Full refund till — our policy | Auto-calculated read-only | Supplier - 5 days |
| Upload visa docs | File | Optional |
| Add another visa line | Button | |

---

### F-06: Invoice Section

```
Total Cost Price (A)   = Sum of all line item INR equivalents
                         Expandable per-section breakup
Margin (B)             = Agent-entered
Subtotal (C)           = A + B
GST                    = GST Rate × B
TCS                    = TCS Rate × C
Total Payable          = C + GST + TCS
```

- Live recalculation as margin edited
- Financial confirmation checkbox required on every save with financial changes

---

### F-07: Traveller Module

#### Per Traveller Fields

| Field | Rule |
|---|---|
| Full name | Required |
| Date of birth | Required |
| Nationality | Required |
| Phone | Required |
| Email | Required |
| Emergency contact name | Required |
| Emergency contact phone | Required |
| Travel document ID | Required |
| Passport expiry date | Required — alert if < DoT + 7 months |
| Visa needed | Boolean per pax |
| Visa exemption proof | Required if visa needed = false |
| PAN number | Required — min 1 per booking |

#### Passport Expiry Alert
- Persistent on traveller card — not a toast
- Agent must check "Traveller has been informed"
- Acknowledgement logged: `PASSPORT_ALERT_ACKNOWLEDGED` + user + timestamp
- Alert also surfaces in OPS Center alerts bar

#### Visa Logic
```
Visa needed = YES  → No proof required
Visa needed = NO   → Exemption proof upload required (OCI, PR etc.)
```

#### Traveller 1 — CRM Link
- `crm_customer_id` stored as loose reference — not FK
- Traveller details always entered fresh — point-in-time snapshot

#### PAN Cards
- Multiple PANs per booking (min 1)
- Multi-PAN TCS split: data model supports it — logic deferred to v2

---

### F-08: Payment Tranches

#### Supplier Tranches

| Field | Rule |
|---|---|
| Supplier | Required |
| Amount | Required |
| Currency | Required |
| Exchange rate | Required if non-INR |
| INR equivalent | Auto-calculated |
| Payment date | Required — must be before DoT |

Min 1 per supplier on booking.

#### Guest Tranches
Auto-generated by system per rules in Section 1.6.
Agent views only. Admin can override.

| Field | Rule |
|---|---|
| Label | Auto-generated |
| Amount | Auto-calculated |
| Currency | Required |
| Due date | Auto-calculated |
| Linked supplier tranche(s) | Required |
| Status | Pending / Collected / Overdue |

---

### F-09: Payment Records

#### Buyer Payment Records

| Field | Rule |
|---|---|
| Amount | Required |
| Collection date and time | Required |
| UTR number | Required |
| Currency | Required |
| Status | Collected / Pending |

#### Supplier Payment Records

| Field | Rule |
|---|---|
| Amount | Required |
| Payment date and time | Required |
| UTR number | Required |
| Supplier account details | Required |
| Linked buyer record(s) | Required — min 1 |

System enforces: supplier payment ≤ sum of linked collected buyer payments.

---

### F-10: Section Update — Inline Edit

- All sections collapsed read-only by default
- Section header always shows key summary
- Edit expands in place — no modal, no separate page
- Save → audit log with before/after diff
- Financial changes → financial confirmation checkbox required
- Cancel → reverts, no changes saved

---

### F-11: Document Management

- Upload at booking level and per line item
- Each upload = new version, auto-incremented
- Latest version = active (AI reads this)
- All versions retained, read-only in version history
- Any Agent or Admin can upload
- Version history tab on document view: Version, Uploaded On, Uploaded By, Description, Status, Actions
- Documents linked at booking level only — not to specific tranches

---

### F-12: Daily Disbursement Dashboard

Standalone screen. Visible to Agent and Admin.

#### Summary Bar
- Total Due Today (amount + count)
- Buyer Collection Pending (amount + count)
- Ready to Pay (amount + count)
- Need Extension (amount + count)

#### Table
| Column | Notes |
|---|---|
| Booking Code | Clickable |
| Supplier / Tranche | Supplier name + tranche label |
| Amount | INR |
| Due Date | Date |
| Buyer Collection Status | Collected / Pending (%) |
| Next Action | Pay Now / Request Extension |

#### Supplier Extension Flow
- Pending buyer + due supplier → "Request Extension" action
- AI generates draft email per supplier
- Draft appears in Supplier Extension Email Queue
- Agent/Admin reviews → clicks Send to Supplier → dispatched via SendGrid
- Logged as `SUPPLIER_EMAIL_SENT`

---

### F-13: Supplier Extension Email Queue

Standalone screen.

#### Tabs
- Drafts for Review (count)
- Sent (count)
- All Extensions (count)

#### Table
| Column | Notes |
|---|---|
| Booking Code | Clickable |
| Supplier | Name |
| Subject | Email subject |
| Summary Preview | First line of AI draft |
| Actions | Review / Edit / Send to Supplier |

#### Footer Note
*"All drafts are AI-generated based on buyer collection status and supplier due dates. Please review before sending."*

---

### F-14: Cancellation Module

#### Trigger
Employee-initiated. Available only after booking created.

#### Step 1 — Cancellation Type
- Full / Partial checkbox
- Reason dropdown (Master Config)
- Notes field
- If partial: affected component (text) + monetary value (text)

#### Step 2 — Tranche Status
System displays:

| Supplier / Tranche | Amount | Status | Recoverability |
|---|---|---|---|
| TravClan (Thailand) — Flights | ₹75,660 | PAID | AI evaluating |
| TravClan (Thailand) — Hotels | ₹30,234 | PAID | AI evaluating |
| Go Global DMC — Land Package | ₹28,740 | PENDING | Auto-cancel on submission |

Summary: Total Tranches, Paid (amount), Pending (amount)
Note: *"Pending tranches will be auto-cancelled on submission"*

#### Step 3 — AI Financial Review
AI pre-populates on Submit. Agent reviews all fields.

| Field | Editable By |
|---|---|
| A — Recoverable from paid tranches (AI) | Admin only |
| B — Additional retention | Admin only — default 0 |
| D — TCS (2%) | Not editable — auto |
| Margin (100% retained) | Not editable — auto |
| GST liability (from margin) | Not editable — auto |
| Refundable to Guest (A - B - D - Margin) | Auto-calculated |
| Maximum Refund Ceiling | Auto-calculated — absolute |

Admin note displayed: *"Admin can approve above zero but never at net org loss"*

Refund method: Credit Note (default) / Source Account (Admin only)

#### Step 4 — Confirmation
Financial confirmation checkbox — user + timestamp logged.

#### Step 5 — Credit Notes
- Buyer CN generated: value + max redemption date
- Supplier CN generated: value + supplier tagged + booking reference
- Both visible in respective CN registers

---

### F-15: Credit Note Registers (Admin Panel)

| Register | Columns |
|---|---|
| Buyer CN Register | CN value, redemption date, booking code, customer, status |
| Supplier CN Register | CN value, supplier name, booking code, status |

---

### F-16: Daily Collection Dashboard (within OPS Center)

Embedded in OPS Command Center Work Queue — Collect from Guests.
Also accessible as standalone filtered view.

- Filter tabs: 5 days before due / 2 days before due / Due today
- Per row: Customer, Booking code, Amount, Status, Next action
- Collection reminders: Slack (v1), SendGrid email (v1), WhatsApp stubbed

---

### F-17: FX Risk Flagging

- AI flags when FX variance > threshold
- Threshold in Master Configurations (default 5% of margin)
- Advisory — no hard block
- Shown on booking detail: currency, booking rate, payment rate, variance %, affected tranche, status
- Surfaced in OPS Center alerts bar with count

---

### F-18: Admin Approvals Inbox

Tabs: Approvals Inbox / Audit Log / System Events

#### Approvals Inbox
| Column | Notes |
|---|---|
| Date & Time | |
| Type | Margin Release / Refund Override / Extension / Credit Note / Write-off |
| Booking | Code + link |
| Description | What is being approved |
| Amount | |
| User | Requester |
| Status | Pending / Approved / Rejected |
| Action | Review link |

#### Audit Log Tab
Full system audit log with filters: date range, booking, event type, user.
Same before/after diff format as booking-level audit log.

#### System Events Tab
System-generated events: NRF flags set, auto-cancellations, AI evaluations run, alerts triggered.

---

### F-19: Supplier Management (Admin Panel)

- Configured via Master Configurations
- Per supplier: name, account details, contact information, bank details
- Searchable autocomplete on all supplier fields across booking
- Alert triggered if supplier record missing bank details

---

### F-20: User Management (Admin Panel)

- Invite-based only — no self-signup
- Two roles: Agent / Admin
- Google SSO planned — architecture must not preclude it
- Admin can deactivate users

---

## 5. UI & Interaction Patterns

### 5.1 Booking Creation Wizard
- 5 steps: Trip Header → Line Items → Travellers → Payments → Review & Confirm
- Step validated before proceeding
- Back navigation allowed
- Live Trip Summary panel on right throughout wizard
- Booking Mode and Payment Mode auto-displayed based on DoT
- Booking code generated only on final save at Step 5

### 5.2 Inline Edit (Post-Creation)
- Sections collapsed read-only by default
- Section header always shows key summary
- Edit expands in place — no modal, no separate page
- Financial confirmation checkbox on any financial field save
- Cancel reverts with no changes

### 5.3 Invoice Cost Price Breakup
- Section totals shown by default
- Show breakup expands per-item detail
- Live recalculation on margin edit
- Applies everywhere cost price is shown

### 5.4 Refundability Display
- Three badge states: RF (green) / Partial RF (blue) / NRF (red)
- Both supplier date and our policy date shown per line item
- "5-day buffer applied" label on our policy date
- Boundary dates shown as inclusive everywhere including PDFs

### 5.5 Audit Log Display
- Chronological, newest first, grouped by day
- Event type badge colour-coded by category
- Full before/after field diff per event
- Summary count bar at top
- Filterable by event category, date range, booking, user

### 5.6 Passport Alert
- Persistent on traveller card
- Remains until agent checks "Traveller has been informed"
- Also surfaced in OPS Center alerts bar

### 5.7 Financial Confirmation Checkbox
- Appears on: Step 5 wizard / any section save with financial changes / cancellation Step 4
- Cannot be pre-checked — actively checked each time
- Records user identity + timestamp
- Text: *"I have read and confirm all financials are correctly recorded. This action will be logged with your name and timestamp."*

### 5.8 Tranche Status on Cancellation
- Summary bar: total, paid (amount), pending (amount)
- Per tranche row: supplier, amount, status badge, recoverability label
- PENDING clearly labelled "Auto-cancel on submission"
- PAID labelled "AI evaluating recoverability"

### 5.9 NRF Badge
- Auto-set on booking when created within 20 days of DoT
- Visible in Bookings List as red NRF badge
- Logged as `NRF_FLAG_SET`

### 5.10 Work Queue Filters (OPS Center)
- Collect from Guests: tabs for 5 days before / 2 days before / Due today
- Pay Suppliers: tabs for Due today / Overdue
- Each tab shows count badge

---

## 6. Screen Inventory

| Screen | Access | Notes |
|---|---|---|
| OPS Command Center (Today) | Agent + Admin | Landing page |
| Bookings List | Agent (own) + Admin (all) | |
| Booking Detail — Case File | Agent (own) + Admin (all) | Tabbed |
| Create Booking Wizard | Agent + Admin | 5 steps |
| Daily Disbursement Dashboard | Agent + Admin | Standalone |
| Supplier Extension Email Queue | Agent + Admin | Standalone |
| Document / Voucher Version History | Agent + Admin | Within booking detail |
| Cancellation — Financial Review | Agent + Admin | 5-step wizard |
| Admin Approvals / Audit Log | Admin only | Tabbed |
| Credit Note Registers | Admin only | Buyer + Supplier tabs |
| Supplier Management | Admin only | |
| User Management | Admin only | |
| Master Configurations | Admin only | Per config table |

---

## 7. Deferred Items

| # | Item | Reason |
|---|---|---|
| 1 | Invoice generation trigger + template | Requires full system context — post go-live |
| 2 | Multi-PAN TCS split logic | Data model supports it — v2 |
| 3 | WhatsApp notification channel | Stubbed — future version |
| 4 | ELK stack | Stubbed — when scale requires |
| 5 | Google SSO | Architecture supports it — future version |
| 6 | Supplier extension email template content | Alongside invoice template post go-live |
| 7 | Post-booking leisure add-ons | Future ERP iteration |
| 8 | AI Confidence Score on cancellation | No rules defined — future |
| 9 | Communications tab on Booking Detail | Out of scope v1 |

---

*End of Document — Version 5.0*
