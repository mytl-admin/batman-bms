# Booking Management Service — Phase 2 Stories
**Phase:** 2 — Booking Core  
**Version:** 2.0  
**Date:** May 2026  
**Depends On:** Phase 1 complete and verified (45/45 tests passing)  
**Reference:** booking_service_requirements_v5.md  
**Goal:** Build the complete booking creation wizard, all four line item types, invoice calculation engine, booking detail view, inline edit, and document management.

---

## Key Decisions — Locked

### Booking Code Format
```
Format: MYTL-XXXXXX
Where XXXXXX = 6 character alphanumeric (uppercase, random)
Examples: MYTL-A3F9K2, MYTL-BX71QP, MYTL-9ZR4KM
```

### Invoice Number Format
```
Format: Sequential 7-digit integer
Starts at: 1000001
Examples: 1000001, 1000002, 1000003
Stored on booking record at creation — used when invoice is generated later
```

### Wizard Step Order
```
Step 1 — Trip Header
Step 2 — Travellers
Step 3 — Line Items (Flights / Hotels / Land Package / Visa)
Step 4 — Payments
Step 5 — Review & Confirm
```

### Rounding Rules
```javascript
// All financial amounts — round UP to next rupee (ceiling)
const roundUp = (amount) => Math.ceil(amount)

// GST amount only — exact 2 decimal precision
const roundGST = (amount) => Math.round(amount * 100) / 100

// Applied everywhere: invoice calc, cancellation, refund formula
```

---

## Phase 2 Story List

| Story | Title | Type |
|---|---|---|
| P2-01 | Booking code + invoice number generation | Backend |
| P2-02 | Booking creation — Step 1 Trip Header | Backend + Frontend |
| P2-03 | Booking creation — Step 2 Travellers | Backend + Frontend |
| P2-04 | Flight line item | Backend + Frontend |
| P2-05 | Hotel line item | Backend + Frontend |
| P2-06 | Land Package line item | Backend + Frontend |
| P2-07 | Visa line item | Backend + Frontend |
| P2-08 | Invoice calculation engine | Backend + Frontend |
| P2-09 | Payment tranches | Backend + Frontend |
| P2-10 | Booking creation — Step 5 Review & Confirm | Backend + Frontend |
| P2-11 | Bookings list with search and filters | Backend + Frontend |
| P2-12 | Booking detail — Case File read view | Backend + Frontend |
| P2-13 | Booking detail — Inline edit | Backend + Frontend |
| P2-14 | Document upload and version management | Backend + Frontend |
| P2-15 | NRF flag auto-set logic | Backend |
| P2-16 | 5-day buffer auto-calculation | Backend |

---

## P2-01 — Booking Code and Invoice Number Generation

**Type:** Backend  
**Priority:** P0 — required before any booking can be saved  
**Reference:** F-04, Section 1.1

### Description
Every booking gets two system-generated identifiers at creation time:
1. A unique human-readable booking code in `MYTL-XXXXXX` format
2. A sequential 7-digit invoice number for future invoice generation

Neither is user-supplied. Both are generated server-side only.

### Booking Code

**Format:** `MYTL-XXXXXX` where XXXXXX = 6 alphanumeric uppercase characters (random)

```javascript
// src/utils/generateBookingCode.js

const generateBookingCode = async (supabase) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  
  let code
  let isUnique = false
  
  while (!isUnique) {
    // Generate random 6-char alphanumeric suffix
    const suffix = Array.from({ length: 6 })
      .map(() => chars[Math.floor(Math.random() * chars.length)])
      .join('')
    code = `MYTL-${suffix}`
    
    // Check uniqueness in database
    const { data } = await supabase
      .from('bookings')
      .select('id')
      .eq('booking_code', code)
      .single()
    
    if (!data) isUnique = true
    // If collision (rare) — loop and generate new code
  }
  
  return code
}
```

### Invoice Number

**Format:** Sequential 7-digit integer starting at 1000001

```javascript
// src/utils/generateInvoiceNumber.js

const generateInvoiceNumber = async (supabase) => {
  // Get current max invoice number
  const { data } = await supabase
    .from('bookings')
    .select('invoice_number')
    .order('invoice_number', { ascending: false })
    .limit(1)
    .single()
  
  const lastNumber = data?.invoice_number ?? 1000000
  return lastNumber + 1
}
```

### Schema Changes Required
Add `invoice_number` column to `bookings` table:
```sql
ALTER TABLE bookings
ADD COLUMN invoice_number INTEGER UNIQUE;

-- Seed starting value via sequence or handle in application
```

### Acceptance Criteria

1. `generateBookingCode()` produces codes in `MYTL-XXXXXX` format
2. Code uniqueness verified against database before returning
3. Collision handled by re-generating (loop until unique)
4. `generateInvoiceNumber()` produces sequential 7-digit integers starting at 1000001
5. Both functions called at booking creation — before any record is inserted
6. Neither code nor invoice number is accepted from client — always overwritten server-side
7. Both stored in `bookings` table with UNIQUE constraints
8. Both returned in booking detail and list API responses

### Notes for Cursor
- Wrap both generators in try/catch — generation failure should fail the booking creation with 500
- Invoice number increment must be atomic — use a database sequence or advisory lock to prevent duplicates on concurrent creates
- Booking code collision probability is extremely low (36^6 = ~2.1 billion combinations) but loop is required for correctness

---

## P2-02 — Booking Creation — Step 1 Trip Header

**Type:** Backend + Frontend  
**Priority:** P0  
**Reference:** F-04 Step 1, TR-02

### Description
Build Step 1 of the 5-step booking creation wizard. Captures core booking metadata. Data is held in wizard state — not saved to backend until Step 5.

### Backend

**POST /api/bookings**
Called at Step 5 submission. Full payload spec in P2-10.
Returns: `{ id, booking_code, invoice_number, ...booking fields }`
Logs: `BOOKING_CREATED`

**GET /api/bookings/:id**
Auth: Agent (own) + Admin
Returns: full booking with all nested data

**GET /api/bookings**
Auth: Agent (own, scoped) + Admin (all)
Query params: `?status=&search=&destination=&from_date=&to_date=&payment_status=&doc_status=&limit=20&offset=0`

**PATCH /api/bookings/:id**
Any updatable header field
Logs: `BOOKING_UPDATED` with before/after diff

### Frontend — Step 1 UI

**Route:** `/bookings/create`

Wizard progress bar at top — 5 steps:
`Trip Header → Travellers → Line Items → Payments → Review & Confirm`

**Left Panel — Form Fields:**

| Field | Type | Rule |
|---|---|---|
| Customer name | Text input | Required |
| CRM lead ID | Text input | Optional |
| Destination(s) | Searchable multi-select | Required, min 1 — from `GET /api/config/destinations` |
| Date of Travel | Calendar widget | Required. Min date = today. No past dates selectable |
| Return date | Calendar widget | Required. Min date = Date of Travel + 1 day |
| Adults | Number input (stepper) | Required, min 1 |
| Children | Number input (stepper) | Default 0 |
| Children ages | Repeating number inputs | Required per child if children > 0 |

**Calendar Widget Rules:**
- Full month calendar popup on click
- Previous dates greyed out and non-selectable
- Today is the minimum selectable date
- Return date calendar disables all dates before Date of Travel
- Both calendars update reactively when either date changes

**Right Panel — Live Trip Summary:**
Updates as fields are filled:
- Destination(s)
- Travel dates (e.g. "21 May – 28 May 2026")
- Duration (e.g. "7 nights")
- Pax (e.g. "2 Adults, 2 Children (Ages: 9, 4)")
- Booking Mode (auto-calculated):
  - DoT > 20 days: `"More than 20 days before travel — Staged Payments"`
  - DoT ≤ 20 days: `"Within 20 days of travel — 100% payment required upfront"`

**Save & Continue** validates all required fields before moving to Step 2.

### Booking Mode Calculation
```javascript
const daysToTravel = differenceInDays(dateOfTravel, startOfDay(new Date()))
const bookingMode = daysToTravel > 20 ? 'staged' : 'full_upfront'
```
Stored in wizard state. Used in Step 4.

### Notes for Cursor
- Use a proper calendar component (e.g. react-day-picker or similar)
- Calendar must visually disable past dates — not just validate on submit
- Wizard state held in React state or Context — not saved to backend until Step 5
- Children ages array length must equal children count before proceeding

---

## P2-03 — Booking Creation — Step 2 Travellers

**Type:** Backend + Frontend  
**Priority:** P0  
**Reference:** F-07, Section 1.11

### Description
Travellers are now Step 2 — immediately after Trip Header. This ensures traveller data exists before visa applicants are linked in Step 3. Each traveller block includes document uploads (passport, visa proof, etc.) directly within the block.

### Backend

**POST /api/bookings/:id/travellers**
Auth: Agent (own) + Admin
Body: single traveller record including document metadata
Auto-checks passport expiry: if `passport_expiry_date < date_of_travel + 7 months` → `passport_alert_shown = true`
Logs: `BOOKING_UPDATED`

**GET /api/bookings/:id/travellers**
Returns: all travellers with their linked documents

**PATCH /api/bookings/:id/travellers/:travellerId**
Re-evaluates passport expiry alert on every save
Logs: `BOOKING_UPDATED`

**POST /api/bookings/:id/travellers/:travellerId/documents**
Auth: Agent + Admin
Body: multipart — `file`, `document_type` (passport / visa / other), `description`
Multiple files allowed per traveller
Each upload creates new version record in `booking_documents`
Logs: `DOCUMENT_UPLOADED`

**GET /api/bookings/:id/travellers/:travellerId/documents**
Returns: all documents for this traveller, newest first

**POST /api/bookings/:id/travellers/:travellerId/acknowledge-passport**
Marks `passport_alert_acknowledged = true`
Records acknowledging user + timestamp
Logs: `PASSPORT_ALERT_ACKNOWLEDGED`

### Schema Addition — Traveller Documents
Traveller documents use the existing `booking_documents` table with:
```
entity_type = 'traveller'
entity_id = traveller_id
```
No new table needed.

### Passport Expiry Rule
```javascript
const sevenMonthsAfterDoT = addMonths(booking.date_of_travel, 7)
const alertTriggered = passport_expiry_date < sevenMonthsAfterDoT
// Not a hard block — booking saves regardless
```

### Visa Logic
```javascript
if (visa_needed === false) {
  // visa_exemption_proof required — block save if missing
}
if (visa_needed === true) {
  // No proof required
}
```

### Frontend — Step 2 Travellers

One traveller block per pax. Number of blocks should match adults + children count from Step 1. Warn if mismatch.

**Traveller Block Header:**
- `Traveller 1 — Primary Contact` (first block)
- `Traveller 2`, `Traveller 3` etc. for subsequent blocks
- Expand/collapse per block

**Per Traveller Fields:**

| Field | Type | Rule |
|---|---|---|
| Full name | Text | Required |
| Date of birth | Date picker | Required |
| Nationality | Dropdown | Required — `GET /api/config/destinations` |
| Phone | Text | Required |
| Email | Email | Required |
| Emergency contact name | Text | Required |
| Emergency contact phone | Text | Required |
| Travel document ID | Text | Required |
| Passport number | Text | Required |
| Passport expiry date | Date picker | Required |
| Visa needed | Boolean toggle | Required |
| Visa exemption proof | File upload | Required if visa needed = false |
| PAN number | Text | Required on Traveller 1 only (min 1 per booking) |
| Add PAN | Link | Adds second PAN field on Traveller 1 block |

**Traveller 1 Extra Field:**
- `CRM Customer ID` — text, optional, pre-populated from Step 1 CRM lead ID if entered

**Passport Expiry Alert (inline):**
```
If passport_expiry_date < date_of_travel + 7 months:

Orange persistent alert box within traveller block:
"⚠ Passport expires [date] — within 7 months of travel.
 Please advise traveller to renew before travel."

Checkbox: "Traveller has been informed" — required before Step 5
```

**Document Uploads (per traveller block):**

Below the traveller fields, a document section:
- Section title: "Traveller Documents"
- Upload button: "Add Document"
- Each upload: file picker + document type dropdown (Passport Copy / Visa / OCI Card / Other) + optional description
- Multiple documents allowed per traveller
- Uploaded documents listed below with: filename, document type, uploaded date, remove option (before booking is saved — post-save use version history)

**Add Traveller button:**
Below all blocks — adds new blank traveller block.

### Notes for Cursor
- In wizard state (before booking saved) — documents are held as File objects in React state
- On Step 5 final submit — all traveller documents uploaded via `POST /api/bookings/:id/travellers/:travellerId/documents` after travellers are created
- "Traveller has been informed" checkbox state stored in wizard state per traveller
- Step 5 is blocked if any passport alert exists and corresponding checkbox is unchecked

---

## P2-04 — Flight Line Item

**Type:** Backend + Frontend  
**Priority:** P0  
**Reference:** F-05.1, TR-10, TR-11

### Description
Build the Flight line item type for Step 3 of the booking wizard. Multiple flight cards for multi-leg and multi-city routes. Each card has its own supplier, cost, refund policy, fare rules text, and multiple document uploads.

### Schema Changes
Add columns to `booking_flights`:
```sql
ALTER TABLE booking_flights
ADD COLUMN fare_rules TEXT,          -- long text, supplier fare rules
ADD COLUMN fare_rules_documents JSONB DEFAULT '[]'; -- array of file URLs
```

Or use a separate table for flight documents (preferred — consistent with document versioning):
```sql
-- booking_documents table already handles this via entity_type='flight', entity_id=flight_id
-- No schema change needed if using existing document table
-- fare_rules TEXT column still needed on booking_flights
ALTER TABLE booking_flights ADD COLUMN fare_rules TEXT;
```

### Backend

**POST /api/bookings/:id/flights**
**GET /api/bookings/:id/flights**
**PATCH /api/bookings/:id/flights/:flightId**
**DELETE /api/bookings/:id/flights/:flightId**

**POST /api/bookings/:id/flights/:flightId/documents**
- Multipart upload — multiple files allowed per call
- `document_type`: fare_rule_screenshot / ticket / other
- Creates records in `booking_documents` with `entity_type = 'flight'`, `entity_id = flight_id`
- Multiple documents per flight allowed — no limit
- Logs: `DOCUMENT_UPLOADED`

**GET /api/bookings/:id/flights/:flightId/documents**
Returns: all documents for this flight

#### Business Logic on Save
```javascript
// INR equivalent
inr_equivalent = Math.ceil(cost * exchange_rate)

// Our policy dates (5-day buffer)
our_full_refund_till = subDays(supplier_full_refund_till, 5)
our_partial_refund_till = supplier_partial_refund_till
  ? subDays(supplier_partial_refund_till, 5)
  : null
```

### Frontend — Step 3 Flight Card

Step 3 header: `+ Flight` `+ Hotel` `+ Land item` `+ Visa`

**Flight Card Fields:**

| Field | Type | Rule |
|---|---|---|
| Self-booked toggle | Boolean | Default off. If on: cost/supplier/refund/fare fields hidden |
| Sector from | Text | Required |
| Sector to | Text | Required |
| Airline / Supplier | Searchable autocomplete | Required if not self-booked |
| Travel date | Date picker | Required |
| Departure time | Time picker | Required |
| Cabin class | Dropdown | Required — `GET /api/config/cabin-classes` |
| Baggage allowance | Text | Optional |
| Cost | Number | Required if not self-booked |
| Currency | Dropdown | Required — `GET /api/config/currencies` |
| Exchange rate | Number | Shown only if currency ≠ INR. Required if non-INR |
| INR equivalent | Read-only | Math.ceil(cost × exchange_rate). Updates live |
| Is refundable | Boolean toggle | Required |
| Full refund till (supplier) | Date picker | Required if refundable. Inclusive boundary |
| Our policy — full refund till | Read-only | Supplier date - 5 days. Label: "5-day buffer applied" |
| Partial refund % | Number | Optional |
| Partial refund till (supplier) | Date picker | Required if partial % entered |
| Our policy — partial till | Read-only | Supplier date - 5 days |
| Fare Rules | Text area (expandable) | Optional. Long text. Label: "Supplier fare rules (paste full text)" |
| Upload fare rule screenshots / documents | Multi-file upload | Optional. Multiple files. Types: PDF, JPG, PNG |
| Remove flight | Button (top right) | Cannot remove if only 1 total line item |

**Multi-leg support:**
`+ Add another flight` link appends new blank flight card below.
No limit on number of flight cards.
Each card is independent — different suppliers, costs, refund policies.

**Refundability Badge (per card header):**
- `RF` green — fully refundable within window
- `Partial RF` blue — within partial refund window
- `NRF` red — not refundable

**Document Upload Section (per flight card):**
- "Add documents" button opens file picker — multiple file selection allowed
- Uploaded files shown as list: filename, type badge, remove button
- Description field per file (optional)
- Before booking saved: held in wizard state as File objects
- After booking saved (inline edit): uploaded via `POST /api/bookings/:id/flights/:flightId/documents`

### Notes for Cursor
- Fare rules text area should be collapsible — collapsed by default, expands on click
- INR equivalent recalculates live on cost or exchange rate change
- Our policy dates recalculate live on supplier date change
- Multi-file upload: use `<input type="file" multiple>` or a drag-drop zone

---

## P2-05 — Hotel Line Item

**Type:** Backend + Frontend  
**Priority:** P0  
**Reference:** F-05.2

### Description
Build the Hotel line item. Multiple hotel cards for multi-city packages. Each hotel has its own supplier, cost, refund policy, fare/cancellation rules text, and multiple document uploads. Nights auto-calculated from dates.

### Schema Changes
```sql
ALTER TABLE booking_hotels ADD COLUMN fare_rules TEXT;
-- Documents handled via booking_documents (entity_type='hotel')
```

### Backend

**POST /api/bookings/:id/hotels**
**GET /api/bookings/:id/hotels**
**PATCH /api/bookings/:id/hotels/:hotelId**
**DELETE /api/bookings/:id/hotels/:hotelId**

**POST /api/bookings/:id/hotels/:hotelId/documents**
Multi-file upload. `entity_type = 'hotel'`, `entity_id = hotel_id`.
Logs: `DOCUMENT_UPLOADED`

**GET /api/bookings/:id/hotels/:hotelId/documents**

#### Business Logic on Save
```javascript
nights = differenceInDays(check_out_date, check_in_date)
inr_equivalent = Math.ceil(cost * exchange_rate)
our_full_refund_till = subDays(supplier_full_refund_till, 5)
our_partial_refund_till = supplier_partial_refund_till
  ? subDays(supplier_partial_refund_till, 5)
  : null
```

### Frontend — Hotel Card

| Field | Type | Rule |
|---|---|---|
| Self-booked toggle | Boolean | Default off |
| Property name | Text | Required |
| Supplier | Searchable autocomplete | Required if not self-booked |
| City / Location | Text | Required |
| Check-in date | Date picker | Required |
| Check-out date | Date picker | Required, min = check-in + 1 day |
| Nights | Read-only | Auto-calculated live: check-out - check-in |
| Room type | Text | Optional |
| Meal plan | Dropdown | Optional — `GET /api/config/meal-plans` |
| Cost | Number | Required if not self-booked |
| Currency | Dropdown | Required |
| Exchange rate | Number | Shown if non-INR |
| INR equivalent | Read-only | Math.ceil(cost × rate). Live |
| Is refundable | Boolean | Required |
| Full refund till (supplier) | Date picker | Required if refundable. Inclusive |
| Our policy — full refund till | Read-only | Supplier - 5 days. "5-day buffer applied" |
| Partial refund % | Number | Optional |
| Partial refund till (supplier) | Date picker | Required if partial % entered |
| Our policy — partial till | Read-only | Supplier - 5 days |
| Cancellation / Fare Rules | Text area (expandable) | Optional. Long text. Label: "Supplier cancellation policy (paste full text)" |
| Upload documents / screenshots | Multi-file upload | Optional. Multiple files. PDF, JPG, PNG |
| Remove hotel | Button | Cannot remove if only 1 total line item |

**Multi-city support:**
`+ Add another hotel` appends new blank hotel card. No limit.

**Document Upload Section (per hotel card):**
Same pattern as flights — multiple files, description per file, held in wizard state until booking saved.

### Notes for Cursor
- Check-out date calendar minimum = check-in + 1 day (enforce visually)
- Nights field live-updates as either date changes
- Fare rules text area collapsed by default

---

## P2-06 — Land Package Line Item

**Type:** Backend + Frontend  
**Priority:** P1  
**Reference:** F-05.3

### Description
Build the Land Package line item. Contains sub-items (airport transfer, hotel transfer, sightseeing). Each sub-item has its own supplier, cost, and refund policy. Shown as a single expandable section with individual sub-item rows.

### Backend

**POST /api/bookings/:id/land-items**
**GET /api/bookings/:id/land-items**
**PATCH /api/bookings/:id/land-items/:itemId**
**DELETE /api/bookings/:id/land-items/:itemId**

#### Business Logic on Save
```javascript
inr_equivalent = Math.ceil(cost * exchange_rate)
our_full_refund_till = subDays(supplier_full_refund_till, 5)
our_partial_refund_till = supplier_partial_refund_till
  ? subDays(supplier_partial_refund_till, 5)
  : null
```

### Frontend — Land Package Section

Single expandable section. `+ Land item` in Step 3 header expands section and adds first row.

**Per Sub-Item Row:**

| Field | Type | Rule |
|---|---|---|
| Sub-item type | Dropdown | Airport Transfer / Hotel Transfer / Sightseeing |
| Description | Text | Required |
| Supplier | Searchable autocomplete | Required |
| Transfer type | Toggle | Private / Shared (SIC) |
| Date | Date picker | Required |
| Cost | Number | Required |
| Currency | Dropdown | Required |
| Exchange rate | Number | Shown if non-INR |
| INR equivalent | Read-only | Math.ceil(cost × rate). Live |
| Is refundable | Boolean | Required |
| Full refund till (supplier) | Date picker | Required if refundable. Inclusive |
| Our policy date | Read-only | Supplier - 5 days |
| Partial refund % | Number | Optional |
| Partial refund till (supplier) | Date picker | Required if partial % entered |
| Our policy partial date | Read-only | Supplier - 5 days |
| Remove | Icon button | Removes sub-item row |

`+ Add item` button appends new blank sub-item row.

### Notes for Cursor
- Land Package rows are compact — condensed grid layout, not full cards like flights/hotels
- No fare rules or document upload per land sub-item in v1

---

## P2-07 — Visa Line Item

**Type:** Backend + Frontend  
**Priority:** P1  
**Reference:** F-05.4

### Description
Build the Visa line item. Travellers now exist in Step 2 before this step — applicant selection is always available in Step 3. Cost is per-applicant, total auto-calculated.

### Backend

**POST /api/bookings/:id/visas**
**GET /api/bookings/:id/visas**
**PATCH /api/bookings/:id/visas/:visaId**
**DELETE /api/bookings/:id/visas/:visaId**

**POST /api/bookings/:id/visas/:visaId/applicants**
Body: `{ traveller_id }`

**DELETE /api/bookings/:id/visas/:visaId/applicants/:travellerId**

#### Business Logic on Save
```javascript
number_of_applicants = linked travellers count
total_cost = Math.ceil(cost_per_applicant * number_of_applicants)
inr_equivalent = Math.ceil(total_cost * exchange_rate)
our_full_refund_till = subDays(supplier_full_refund_till, 5)
```

### Frontend — Visa Card

| Field | Type | Rule |
|---|---|---|
| Self-arranged toggle | Boolean | Default off |
| Country | Searchable dropdown | Required — `GET /api/config/destinations` |
| Visa type | Dropdown | Required — `GET /api/config/visa-types` |
| Applicant(s) | Multi-select checkbox list | Required — populated from Step 2 travellers in wizard state |
| Supplier / Agency | Searchable autocomplete | Required if not self-arranged |
| Cost per applicant | Number | Required if not self-arranged |
| Number of applicants | Read-only | Count of selected applicants. Live |
| Total visa cost | Read-only | Math.ceil(cost × applicants). Live |
| Currency | Dropdown | Required |
| Exchange rate | Number | Shown if non-INR |
| INR equivalent | Read-only | Math.ceil(total × rate). Live |
| Is refundable | Boolean | Required |
| Full refund till (supplier) | Date picker | Required if refundable. Inclusive |
| Our policy date | Read-only | Supplier - 5 days |
| Upload visa docs | File | Optional |
| Remove visa | Button | |

`+ Add another visa line` appends new blank visa card (e.g. different country).

**Applicant selection:**
Since travellers are now Step 2, the applicant multi-select is always populated with traveller names from wizard state. No "add travellers first" message needed.

### Notes for Cursor
- Applicant list pulled directly from wizard state (Step 2 travellers)
- Total cost and INR equivalent update live on applicant selection or cost change

---

## P2-08 — Invoice Calculation Engine

**Type:** Backend + Frontend  
**Priority:** P0  
**Reference:** F-03, F-06, Section 1.4

### Description
Build the invoice calculation engine with correct rounding rules. GST and TCS rates always from Master Configurations. All amounts rounded UP to next rupee except GST which is exact to 2 decimal places.

### Backend

**GET /api/bookings/:id/invoice**
Returns full calculated invoice with cost breakup.

**PATCH /api/bookings/:id/invoice**
Auth: Agent (own) + Admin
Body: `{ margin }`
Recalculates all derived fields. Updates booking record.
Logs: `FINANCIAL_FIELD_CHANGED`

#### Calculation Rules (strict)
```javascript
const gst_rate = await getActiveGSTRate()   // from config_gst_rate — never hardcoded
const tcs_rate = await getActiveTCSRate()   // from config_tcs_rate — never hardcoded

// Sum only non-self-booked line items
total_cost_price = Math.ceil(
  sum(flights.inr_equivalent where !is_self_booked) +
  sum(hotels.inr_equivalent where !is_self_booked) +
  sum(land_items.inr_equivalent) +
  sum(visas.inr_equivalent where !is_self_arranged)
)

subtotal = Math.ceil(total_cost_price + margin)

// GST — exact 2 decimal precision
gst_amount = Math.round((gst_rate * margin) * 100) / 100

// TCS — round up
tcs_amount = Math.ceil(tcs_rate * subtotal)

// Total — round up
total_payable = Math.ceil(subtotal + gst_amount + tcs_amount)
```

#### Invoice Response Shape
```json
{
  "total_cost_price": 167606,
  "cost_breakup": {
    "flights": {
      "total": 75660,
      "items": [{ "sector": "DEL → Phuket", "supplier": "Air Akasa", "cost": 75660 }]
    },
    "hotels": {
      "total": 60234,
      "items": [
        { "name": "Thavorn Palm Beach", "nights": 4, "cost": 33345 },
        { "name": "Holiday Ao Nang", "nights": 3, "cost": 26889 }
      ]
    },
    "land_package": {
      "total": 28740,
      "items": [
        { "description": "Airport transfer", "cost": 4200 },
        { "description": "Phi Phi Island", "cost": 18600 },
        { "description": "Hotel transfer", "cost": 5940 }
      ]
    },
    "visa": {
      "total": 2972,
      "items": [
        { "traveller": "Rahul Saxena", "cost": 743 },
        { "traveller": "Priya Saxena", "cost": 743 },
        { "traveller": "Aryan Saxena", "cost": 743 },
        { "traveller": "Kavya Saxena", "cost": 743 }
      ]
    }
  },
  "margin": 8030,
  "subtotal": 175636,
  "gst_rate": 0.18,
  "gst_amount": 1445.40,
  "tcs_rate": 0.02,
  "tcs_amount": 3513,
  "total_payable": 180594
}
```

### Frontend — Invoice Display

Appears in Step 5 and Booking Detail → Financials tab.

```
Total Cost Price (A)           ₹1,67,606    [Show breakup ▼]
  ├── Flights                  ₹75,660
  ├── Hotels                   ₹60,234
  │     ├── Thavorn (4N)       ₹33,345
  │     └── Ao Nang (3N)       ₹26,889
  ├── Land Package             ₹28,740
  │     ├── Airport transfer    ₹4,200
  │     ├── Phi Phi Island      ₹18,600
  │     └── Hotel transfer      ₹5,940
  └── Visa                     ₹2,972
        ├── Rahul Saxena        ₹743
        ├── Priya Saxena        ₹743
        ├── Aryan Saxena        ₹743
        └── Kavya Saxena        ₹743

Margin (B)                    [editable input field]
Subtotal (C = A + B)          ₹1,75,636    (auto)
GST (18% of margin)           ₹1,445.40    (auto — 2 decimal)
TCS (2% of subtotal)          ₹3,513       (auto — rounded up)
Total Payable by Guest        ₹1,80,594    (auto — bold)
```

**Behaviour:**
- Cost breakup collapsed by default. "Show breakup" expands all sections.
- Each section independently expandable.
- Margin is the only editable field.
- All other fields recalculate live as margin is typed.
- GST displayed with 2 decimal places always (e.g. ₹1,445.40 not ₹1,446).
- All other amounts displayed as whole rupees (ceiling applied).

### Notes for Cursor
- Never hardcode 0.18 or 0.02 anywhere
- GST display must always show 2 decimal places — use `.toFixed(2)`
- Self-booked items excluded from Total Cost Price but shown in breakup as "Self-booked — not included"
- Invoice number also displayed here as "Invoice No: 1000001"

---

## P2-09 — Payment Tranches — Backend + Frontend

**Type:** Backend + Frontend  
**Priority:** P0  
**Reference:** F-06, F-08, Section 1.6, Section 1.7

### Description
Build payment tranche management — Step 4. System auto-generates guest tranches from rules. Supplier tranches manually entered. All amounts use ceiling rounding except GST.

### Backend

**POST /api/bookings/:id/supplier-tranches**
Auth: Agent (own) + Admin
Body: `{ supplier_id, amount, currency, exchange_rate, payment_date }`
Validates: `payment_date < date_of_travel`
`inr_equivalent = Math.ceil(amount * exchange_rate)`
Logs: `BOOKING_UPDATED`

**GET /api/bookings/:id/supplier-tranches**
**PATCH /api/bookings/:id/supplier-tranches/:trancheId**
**DELETE /api/bookings/:id/supplier-tranches/:trancheId**

**POST /api/bookings/:id/generate-guest-tranches**
Applies payment term rules. Replaces existing auto-generated tranches.

#### Guest Tranche Auto-Generation Rules
```javascript
const daysToTravel = differenceInDays(booking.date_of_travel, startOfDay(new Date()))

if (daysToTravel > 20) {
  // Scenario A — Staged payments
  const bookedWithUsCosts = Math.ceil(
    sum(flights.inr_equivalent where !is_self_booked) +
    sum(hotels.inr_equivalent where !is_self_booked)
  )
  const tranche1Amount = Math.ceil(bookedWithUsCosts + booking.margin)
  const tranche2Amount = Math.ceil(booking.total_payable - tranche1Amount)
  const earliestSupplierDate = min(supplier_tranches.payment_date)
  const tranche2DueDate = subDays(earliestSupplierDate, 5)

  // Create 2 guest tranches
  { label: "Tranche 1", amount: tranche1Amount, due_date: today }
  { label: "Balance Payment", amount: tranche2Amount, due_date: tranche2DueDate }

} else {
  // Scenario B — Full upfront
  { label: "Full Payment", amount: booking.total_payable, due_date: today }
  booking.is_nrf = true
  log: NRF_FLAG_SET
}
```

**GET /api/bookings/:id/guest-tranches**
**PATCH /api/bookings/:id/guest-tranches/:trancheId** — Admin only

**POST /api/bookings/:id/guest-tranches/:trancheId/link-supplier**
Body: `{ supplier_tranche_id }`

#### Validation
```javascript
// Guest tranche date ≥ linked supplier tranche date - 5 days
if (guest_tranche.due_date > subDays(linked_supplier_tranche.payment_date, 5)) {
  throw: "Guest tranche due date must be at least 5 days before supplier tranche"
}
```

### Frontend — Step 4 Payment Tranches

**Supplier Tranches Section:**

| Field | Type | Rule |
|---|---|---|
| Supplier | Searchable autocomplete | Required |
| Amount | Number | Required |
| Currency | Dropdown | Required |
| Exchange rate | Number | Shown if non-INR |
| INR equivalent | Read-only | Math.ceil(amount × rate). Live |
| Payment date | Date picker | Required. Must be before DoT |
| Remove | Button | Cannot remove last tranche for supplier |

`+ Add supplier tranche` appends new row.

**Guest Tranches Section (auto-generated):**
Label: *"Guest payment tranches are auto-calculated based on booking terms."*
Agent: read-only view. Admin: Edit button per row.

| Column | Notes |
|---|---|
| Label | Tranche 1 / Balance / Full Payment |
| Amount | Auto-calculated (ceiling applied) |
| Due Date | Auto-calculated |
| Linked Supplier Tranche | Multi-select (admin only) |
| Status | Pending |

**NRF Notice (DoT within 20 days):**
```
Orange banner:
"⚠ This booking is within 20 days of travel.
 100% payment required upfront. Booking is non-refundable."
```

**Generate Tranches button:**
Appears after supplier tranches are entered.
On click: calls `POST /api/bookings/:id/generate-guest-tranches` and refreshes guest tranche display.

---

## P2-10 — Booking Creation — Step 5 Review & Confirm

**Type:** Backend + Frontend  
**Priority:** P0  
**Reference:** F-04 Step 5, NFR-04, Section 5.7

### Description
Final wizard step. Full summary displayed. Booking saved to database only on this step. Financial confirmation checkbox mandatory.

### Backend

**POST /api/bookings** — full payload:
```json
{
  "customer_name": "Rahul Saxena",
  "crm_lead_id": "LD002",
  "destinations": ["Thailand"],
  "date_of_travel": "2026-05-21",
  "return_date": "2026-05-28",
  "adults": 2,
  "children": 2,
  "children_ages": [9, 4],
  "margin": 8030,
  "financial_confirmed": true,
  "travellers": [...],
  "flights": [...],
  "hotels": [...],
  "land_items": [...],
  "visas": [...],
  "supplier_tranches": [...],
  "pan_cards": [...]
}
```

**Server-side on receipt (in order):**
1. Validate all required fields
2. Generate booking code: `MYTL-XXXXXX`
3. Generate invoice number: next sequential 7-digit integer
4. Calculate `is_nrf` from DoT
5. Insert `bookings` record
6. Insert all line items
7. Insert travellers + PAN cards
8. Upload traveller documents
9. Insert supplier tranches
10. Run guest tranche auto-generation
11. Set `financial_confirmed_by = req.user.id`, `financial_confirmed_at = now()`
12. Log `BOOKING_CREATED`
13. Log `FINANCIAL_CONFIRMED` with user + timestamp
14. If `is_nrf = true` → log `NRF_FLAG_SET`
15. Return full booking record

**All as a single database transaction — if any step fails, nothing is saved.**

### Frontend — Step 5 UI

**Left Panel — Summary:**
- Trip header summary
- Travellers summary (names + passport alert indicators)
- Line items summary (type + count + total per type)
- Payment tranches summary

**Right Panel — Invoice:**
- Full invoice from P2-08
- Margin field still editable — recalculates live
- Invoice number displayed: "Invoice No: [generated on confirm]"
- Cost breakup expandable

**Financial Confirmation Checkbox:**
```
Mandatory. Cannot be pre-checked.

[ ] "I have read and confirm all financials are correctly recorded.
    This action will be logged with your name and timestamp."

Create Booking button DISABLED until checked.
```

**Pre-submit Validation:**
```
□ At least 1 line item
□ All required line item fields filled
□ At least 1 traveller
□ All required traveller fields filled
□ All passport alerts acknowledged
□ At least 1 supplier tranche per supplier
□ Guest tranches generated
□ Margin entered (0 is valid but must be explicitly set)
□ Financial confirmation checkbox checked
```

**On Success:** Redirect to `/bookings/MYTL-XXXXXX`
**On Error:** Stay on Step 5, show inline error

---

## P2-11 — Bookings List with Search and Filters

**Type:** Backend + Frontend  
**Priority:** P1  
**Reference:** F-02

### Description
Main bookings list page. Searchable, filterable, paginated. Agent scoping enforced. Booking codes now in `MYTL-XXXXXX` format.

### Backend

**GET /api/bookings**
Query params: `?status=&search=&destination=&travel_from=&travel_to=&payment_status=&doc_status=&owner_id=&limit=20&offset=0`
Search covers: `booking_code`, `customer_name`, `destinations`
Agent scoping: `WHERE case_owner_id = req.user.id OR case_manager_id = req.user.id`

Response per booking includes: `booking_code` (MYTL format), `invoice_number`, `is_nrf`, `collection_status`, `supplier_status`, `doc_status`, `refundability`, `next_action`

#### Next Action Logic
```javascript
if (guest_tranche overdue) → "record_payment"
else if (supplier_tranche due today AND buyer not collected) → "request_extension"
else if (supplier_tranche due today AND buyer collected) → "pay_supplier"
else if (missing traveller documents) → "upload_docs"
else → "view"
```

### Frontend — Bookings List

**Route:** `/bookings`

Search bar + filter dropdowns + `+ New Booking` button (top right)

**Table Columns:**

| Column | Notes |
|---|---|
| Booking Code | `MYTL-XXXXXX` — clickable |
| Customer | Name |
| Destination / Dates | Destinations + date range + nights |
| Date of Travel | Sortable |
| NRF | Red badge if `is_nrf = true` |
| Owner | Case owner name |
| Status | Active / On Hold / Cancelled / Completed |
| Collection Status | Paid / Partial / Overdue / Pending |
| Supplier Status | Booked / Partial / Pending |
| Docs | Complete / count missing |
| Refundability | RF / Partial RF / NRF badge |
| Next Action | Contextual button |

Pagination: 20 per page.

---

## P2-12 — Booking Detail — Case File Read View

**Type:** Backend + Frontend  
**Priority:** P1  
**Reference:** F-03

### Description
Full booking case file — tabbed read-only view. Header always visible. All data from single API call.

### Backend

**GET /api/bookings/:id**
Returns full nested payload including all line items, travellers, tranches, documents, invoice, alerts.

### Frontend — Booking Detail

**Route:** `/bookings/:id`

**Header:** Booking code (`MYTL-XXXXXX`), Invoice No, customer, destination, dates, pax, owner, status badge. Action buttons: `Record Payment` / `Upload Document` / `Request Extension` / `More Actions`

**Tabs:** Case Summary / Financials / Disbursements / Documents / Audit Log

**Case Summary — Left (Itinerary Tree):**
Expandable sections: Trip Summary, Flights, Hotels, Land Package, Visa, Travellers (+ alert count), Guest Payments (per-tranche rows with status), Supplier Tranches, Documents.

**Case Summary — Right (Financial Snapshot):**
Total Cost Price with expandable breakup, Margin, GST (2 decimal), TCS, Total Payable.
Payment Overview: Collected, Balance, Paid to Suppliers, Next Due.
Margin Status, FX Risk, Refund Exposure.
Per-tranche status rows: label, amount, due date, status badge.

**FX Risk Panel (when breach exists):**
Currency, Booking Rate, Payment Rate, Variance %, Threshold, Status.

---

## P2-13 — Booking Detail — Inline Edit

**Type:** Backend + Frontend  
**Priority:** P1  
**Reference:** F-04 Section Update, Section 5.2

### Description
Inline edit for all booking sections. No modals. Financial confirmation checkbox on financial field changes.

### Backend
All PATCH endpoints from P2-02 through P2-09. No new endpoints.

### Frontend

**Per section:**
1. Collapsed read-only by default with key summary in header
2. `Edit` button expands section in place
3. Save → PATCH to relevant endpoint
4. If financial field changed → financial confirmation checkbox appears before save completes
5. Cancel → reverts, no changes
6. Success → collapses, shows updated summary, toast shown

**Financial confirmation checkbox (on financial edits only):**
*"I have read and confirm all financials are correctly recorded. This action will be logged with your name and timestamp."*

**Sections with inline edit:**
Trip Header, Flights, Hotels, Land Package, Visa, Invoice (margin only), Travellers, Supplier Tranches.

---

## P2-14 — Document Upload and Version Management

**Type:** Backend + Frontend  
**Priority:** P1  
**Reference:** F-11, TR-11

### Description
Document upload at booking level and per line item. Multiple documents per slot. Each upload creates a new version. Old versions never deleted.

### Backend

**POST /api/bookings/:id/documents**
Multipart: `file`, `document_type`, `entity_type`, `entity_id` (optional), `description`
Auto-increments version per slot. Sets previous `is_active = false`. New version `is_active = true`.
Stores file to Supabase Storage.
Logs: `DOCUMENT_UPLOADED` with version number.

**GET /api/bookings/:id/documents**
Returns all documents grouped by entity type.

**GET /api/bookings/:id/documents/:documentId/versions**
All versions newest first: version, file_url, uploaded_by, uploaded_at, description, is_active.

### Frontend — Documents Tab

**Route:** Booking Detail → Documents tab

- Booking-level voucher section at top
- Per line item sections: Flights, Hotels, Land Package, Visa, Travellers

**Per document slot:**
- Active version shown: filename, uploaded by, date
- `Upload New Version` button
- `View Version History` expands version list

**Version History Table:**

| Version | Uploaded On | Uploaded By | Description | Status | Actions |
|---|---|---|---|---|---|
| v3 | 1 May · 01:37 | Akshat | Final hotel voucher | Active | View |
| v2 | 28 Apr · 15:30 | Riya | Updated check-in | Read-only | View |
| v1 | 25 Apr · 14:40 | Akshat | Initial upload | Read-only | View |

---

## P2-15 — NRF Flag Auto-Set Logic

**Type:** Backend  
**Priority:** P1  
**Reference:** Section 1.6, Section 5.9

### Acceptance Criteria

1. On `POST /api/bookings`:
```javascript
const daysToTravel = differenceInDays(date_of_travel, startOfDay(new Date()))
if (daysToTravel <= 20) booking.is_nrf = true
```
2. If `is_nrf = true` → log `NRF_FLAG_SET`
3. `is_nrf` never user-settable
4. Returned in all booking list and detail responses
5. Bookings list shows red `NRF` badge for `is_nrf = true`

---

## P2-16 — 5-Day Buffer Auto-Calculation

**Type:** Backend  
**Priority:** P0 — critical business rule  
**Reference:** Section 1.5, F-05.1–F-05.4

### Acceptance Criteria

1. Utility at `src/utils/calculateOurPolicyDate.js`:
```javascript
const calculateOurPolicyDate = (supplierDate) => {
  if (!supplierDate) return null
  return subDays(new Date(supplierDate), 5)
}
```

2. Applied on every POST and PATCH for all line item types:

| Line Item | Supplier Field | Our Policy Field |
|---|---|---|
| Flights | `supplier_full_refund_till` | `our_full_refund_till` |
| Flights | `supplier_partial_refund_till` | `our_partial_refund_till` |
| Hotels | `supplier_full_refund_till` | `our_full_refund_till` |
| Hotels | `supplier_partial_refund_till` | `our_partial_refund_till` |
| Land Items | `supplier_full_refund_till` | `our_full_refund_till` |
| Land Items | `supplier_partial_refund_till` | `our_partial_refund_till` |
| Visas | `supplier_full_refund_till` | `our_full_refund_till` |

3. Always stored in DB — never calculated at read time
4. Frontend never sends `our_*` fields — always overwritten server-side
5. Boundary dates inclusive — stored date is last refundable day
6. Null supplier date → null our policy date

---

## Phase 2 — Definition of Done

| Checkpoint | Verified |
|---|---|
| Booking code generates in MYTL-XXXXXX format | |
| Invoice number generates as sequential 7-digit integer | |
| Booking creation wizard completes all 5 steps | |
| New step order: Header → Travellers → Line Items → Payments → Review | |
| Calendar widget enforces no past date selection on DoT and return date | |
| All 4 line item types save with correct INR equivalents (ceiling rounding) | |
| GST displayed and stored to exactly 2 decimal places | |
| All other amounts rounded up to next rupee (ceiling) | |
| Flight fare rules text area saves correctly | |
| Multiple documents uploadable per flight card | |
| Hotel cancellation policy text saves correctly | |
| Multiple documents uploadable per hotel card | |
| Multiple flight cards supported for multi-leg routes | |
| Multiple hotel cards supported for multi-city packages | |
| 5-day buffer auto-calculates on all line items server-side | |
| Traveller documents uploadable directly on traveller block | |
| Visa applicant selection populated from Step 2 travellers | |
| Invoice calculation uses live GST and TCS rates from config | |
| Cost breakup shows per-item and per-traveller detail | |
| Self-booked items excluded from Total Cost Price | |
| Guest tranches auto-generate correctly for both scenarios | |
| NRF flag auto-set for within-20-day bookings | |
| Financial confirmation checkbox logs FINANCIAL_CONFIRMED | |
| Booking detail shows all sections in read-only view | |
| Inline edit expands in place — no modals | |
| Document upload creates new version, old versions retained | |
| Bookings list shows MYTL codes, NRF badges, correct next actions | |
| Agent cannot see other agents bookings | |
| All financial changes logged with before/after diff | |

---

*End of Phase 2 Stories — v2.0*
