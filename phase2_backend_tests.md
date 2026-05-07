# Phase 2 — Backend Test Suite
**Version:** 1.0  
**Date:** May 2026  
**Purpose:** Cursor executes all test cases to verify Phase 2 backend implementation  
**Run In:** `booking-erp-backend` Cursor window  
**Backend URL:** http://localhost:3000  
**Depends On:** Phase 1 passing (45/45)

---

## Instructions for Cursor

```
@booking_service_requirements_v5.md @phase2_stories_v2.md

Please execute all test cases in this document in order.
For each test:
1. Run the test
2. State PASS or FAIL
3. If FAIL — show actual response and expected response
4. Do not fix failures — just report them
5. Produce a summary table at the end

Use dev environment (.env.dev) for all tests.
Seed required test data before running.
Clean up test data after suite completes.
Admin token and member code from Phase 1 tests still valid.
```

---

## Test Suite Setup

### TS-00 — Seed Test Data
```sql
-- Ensure admin and agent users exist from Phase 1
-- Seed a destination config if not already present
INSERT INTO config_destinations (name, code, sort_order, used_in_pages, used_in_systems)
VALUES ('Thailand', 'thailand', 1, ARRAY['booking_header'], ARRAY['Booking ERP'])
ON CONFLICT (code) DO NOTHING;

-- Seed a supplier
INSERT INTO suppliers (name, code, contact_name, contact_email, is_active)
VALUES ('TravClan Thailand', 'travclan_th', 'Somchai', 'somchai@travclan.com', true)
ON CONFLICT (code) DO NOTHING;
```

---

## Group 1 — Booking Code Generation (P2-01)

### T01 — Booking Code Format is MYTL-XXXXXX
```
Action:   Create a booking via POST /api/bookings (minimal valid payload)
Method:   POST
URL:      http://localhost:3000/api/bookings
Headers:  Authorization: Bearer <ADMIN_TOKEN>
          X-Member-Code: <ADMIN_MEMBER_CODE>
Body:     {
            "customer_name": "Test Customer",
            "destinations": ["Thailand"],
            "date_of_travel": "<date 30 days from today>",
            "return_date": "<date 37 days from today>",
            "adults": 2,
            "children": 0,
            "margin": 5000,
            "financial_confirmed": true,
            "travellers": [{
              "full_name": "Test Traveller",
              "dob": "1990-01-01",
              "nationality": "Indian",
              "phone": "+91 9999999999",
              "email": "test@test.com",
              "emergency_contact_name": "Emergency Contact",
              "emergency_contact_phone": "+91 8888888888",
              "travel_document_id": "A1234567",
              "passport_expiry_date": "<date 2 years from today>",
              "visa_needed": true,
              "is_primary": true
            }],
            "flights": [],
            "hotels": [],
            "land_items": [],
            "visas": [],
            "supplier_tranches": [],
            "pan_cards": [{ "pan_number": "ABCDE1234F" }]
          }
Expected: 200 — booking record with:
          booking_code matching pattern MYTL-[A-Z0-9]{6}
          e.g. MYTL-A3F9K2 (never BK-YYYY-NNNN format)
Store:    Save booking_code as TEST_BOOKING_CODE
Store:    Save booking id as TEST_BOOKING_ID
```

### T02 — Invoice Number is 7-Digit Integer
```
Action:   Use booking created in T01
Expected: invoice_number is an integer between 1000001 and 9999999
          e.g. 1000001
Store:    Save invoice_number as TEST_INVOICE_NUMBER
```

### T03 — Booking Code is Unique on Second Create
```
Action:   Create another booking with same payload as T01
Expected: 200 — new booking with DIFFERENT booking_code than T01
          Both codes match MYTL-XXXXXX pattern
          invoice_number = TEST_INVOICE_NUMBER + 1
```

### T04 — Booking Code Cannot Be Set by Client
```
Action:   POST /api/bookings with booking_code: "MYTL-CUSTOM" in body
Expected: 200 — booking created but booking_code is system-generated
          booking_code in response does NOT equal "MYTL-CUSTOM"
```

---

## Group 2 — Booking CRUD (P2-02)

### T05 — Get Booking by ID
```
Method:   GET
URL:      http://localhost:3000/api/bookings/<TEST_BOOKING_ID>
Headers:  Authorization: Bearer <ADMIN_TOKEN>
          X-Member-Code: <ADMIN_MEMBER_CODE>
Expected: 200 — full booking object with:
          id, booking_code, invoice_number, customer_name,
          destinations, date_of_travel, return_date, adults,
          status: "active"
```

### T06 — Get Booking List Returns Bookings
```
Method:   GET
URL:      http://localhost:3000/api/bookings
Headers:  Authorization: Bearer <ADMIN_TOKEN>
          X-Member-Code: <ADMIN_MEMBER_CODE>
Expected: 200 — array containing at least TEST_BOOKING_ID
          Each item has: booking_code, customer_name, status, is_nrf
```

### T07 — Agent Cannot See Other Agent Bookings
```
Action:   Create booking as admin (T01 booking is admin-owned)
          Log in as agent, attempt to get that booking
Method:   GET
URL:      http://localhost:3000/api/bookings/<TEST_BOOKING_ID>
Headers:  Authorization: Bearer <AGENT_TOKEN>
          X-Member-Code: <AGENT_MEMBER_CODE>
Expected: 403 or 404 — agent cannot access admin's booking
```

### T08 — Search Bookings by Customer Name
```
Method:   GET
URL:      http://localhost:3000/api/bookings?search=Test Customer
Headers:  Authorization: Bearer <ADMIN_TOKEN>
          X-Member-Code: <ADMIN_MEMBER_CODE>
Expected: 200 — array containing TEST_BOOKING_ID booking
```

### T09 — Filter Bookings by Status
```
Method:   GET
URL:      http://localhost:3000/api/bookings?status=active
Headers:  Authorization: Bearer <ADMIN_TOKEN>
          X-Member-Code: <ADMIN_MEMBER_CODE>
Expected: 200 — array where all items have status: "active"
```

### T10 — Update Booking Header
```
Method:   PATCH
URL:      http://localhost:3000/api/bookings/<TEST_BOOKING_ID>
Headers:  Authorization: Bearer <ADMIN_TOKEN>
          X-Member-Code: <ADMIN_MEMBER_CODE>
Body:     { "customer_name": "Updated Customer Name" }
Expected: 200 — booking with customer_name: "Updated Customer Name"
          system_logs has BOOKING_UPDATED entry with before/after diff
```

---

## Group 3 — 5-Day Buffer Auto-Calculation (P2-16)

### T11 — Flight Our Policy Date Auto-Calculated
```
Method:   POST
URL:      http://localhost:3000/api/bookings/<TEST_BOOKING_ID>/flights
Headers:  Authorization: Bearer <ADMIN_TOKEN>
          X-Member-Code: <ADMIN_MEMBER_CODE>
Body:     {
            "is_self_booked": false,
            "sector_from": "DEL",
            "sector_to": "BKK",
            "supplier_id": "<TEST_SUPPLIER_ID>",
            "travel_date": "<date_of_travel>",
            "departure_time": "06:00",
            "cabin_class": "economy",
            "cost": 75000,
            "currency": "INR",
            "exchange_rate": 1,
            "is_refundable": true,
            "supplier_full_refund_till": "2026-05-20"
          }
Expected: 200 — flight record with:
          our_full_refund_till: "2026-05-15" (supplier - 5 days)
          inr_equivalent: 75000
Store:    Save flight id as TEST_FLIGHT_ID
```

### T12 — Our Policy Date Not Overridable by Client
```
Action:   Send PATCH with our_full_refund_till: "2099-01-01"
Method:   PATCH
URL:      http://localhost:3000/api/bookings/<TEST_BOOKING_ID>/flights/<TEST_FLIGHT_ID>
Headers:  Authorization: Bearer <ADMIN_TOKEN>
          X-Member-Code: <ADMIN_MEMBER_CODE>
Body:     {
            "supplier_full_refund_till": "2026-05-25",
            "our_full_refund_till": "2099-01-01"
          }
Expected: 200 — our_full_refund_till = "2026-05-20" (supplier - 5 days)
          NOT "2099-01-01" (client value ignored)
```

### T13 — Partial Refund Buffer Calculated Correctly
```
Method:   PATCH
URL:      http://localhost:3000/api/bookings/<TEST_BOOKING_ID>/flights/<TEST_FLIGHT_ID>
Headers:  Authorization: Bearer <ADMIN_TOKEN>
          X-Member-Code: <ADMIN_MEMBER_CODE>
Body:     {
            "partial_refund_pct": 50,
            "supplier_partial_refund_till": "2026-05-24"
          }
Expected: 200 — our_partial_refund_till: "2026-05-19" (supplier - 5 days)
```

### T14 — Null Supplier Date Returns Null Our Policy Date
```
Method:   POST
URL:      http://localhost:3000/api/bookings/<TEST_BOOKING_ID>/flights
Headers:  Authorization: Bearer <ADMIN_TOKEN>
          X-Member-Code: <ADMIN_MEMBER_CODE>
Body:     {
            "is_self_booked": false,
            "sector_from": "BKK",
            "sector_to": "DEL",
            "travel_date": "<return_date>",
            "cost": 75000,
            "currency": "INR",
            "exchange_rate": 1,
            "is_refundable": false
          }
Expected: 200 — our_full_refund_till: null
          our_partial_refund_till: null
```

### T15 — Hotel 5-Day Buffer Applied
```
Method:   POST
URL:      http://localhost:3000/api/bookings/<TEST_BOOKING_ID>/hotels
Headers:  Authorization: Bearer <ADMIN_TOKEN>
          X-Member-Code: <ADMIN_MEMBER_CODE>
Body:     {
            "is_self_booked": false,
            "property_name": "Thavorn Palm Beach",
            "supplier_id": "<TEST_SUPPLIER_ID>",
            "city": "Phuket",
            "check_in_date": "<date_of_travel>",
            "check_out_date": "<date_of_travel + 4 days>",
            "cost": 33345,
            "currency": "INR",
            "exchange_rate": 1,
            "is_refundable": true,
            "supplier_full_refund_till": "2026-05-08"
          }
Expected: 200 — hotel record with:
          nights: 4 (auto-calculated)
          inr_equivalent: 33345
          our_full_refund_till: "2026-05-03" (supplier - 5 days)
Store:    Save hotel id as TEST_HOTEL_ID
```

### T16 — Land Item Buffer Applied
```
Method:   POST
URL:      http://localhost:3000/api/bookings/<TEST_BOOKING_ID>/land-items
Headers:  Authorization: Bearer <ADMIN_TOKEN>
          X-Member-Code: <ADMIN_MEMBER_CODE>
Body:     {
            "sub_item_type": "airport_transfer",
            "description": "Airport to Hotel Transfer",
            "supplier_id": "<TEST_SUPPLIER_ID>",
            "transfer_type": "private",
            "date": "<date_of_travel>",
            "cost": 4200,
            "currency": "INR",
            "exchange_rate": 1,
            "is_refundable": true,
            "supplier_full_refund_till": "2026-05-10"
          }
Expected: 200 — our_full_refund_till: "2026-05-05"
Store:    Save land item id as TEST_LAND_ID
```

---

## Group 4 — INR Equivalent + Rounding (P2-04, P2-05)

### T17 — INR Equivalent Calculated with Ceiling Rounding
```
Method:   POST
URL:      http://localhost:3000/api/bookings/<TEST_BOOKING_ID>/flights
Headers:  Authorization: Bearer <ADMIN_TOKEN>
          X-Member-Code: <ADMIN_MEMBER_CODE>
Body:     {
            "is_self_booked": false,
            "sector_from": "DEL",
            "sector_to": "HKT",
            "travel_date": "<date_of_travel>",
            "cost": 1000,
            "currency": "USD",
            "exchange_rate": 83.47,
            "is_refundable": false
          }
Expected: 200 — inr_equivalent: 83470
          Math.ceil(1000 × 83.47) = Math.ceil(83470) = 83470
          (Verify ceiling: cost=1000.5, rate=83.47 → Math.ceil(83512.35) = 83513)
```

### T18 — Ceiling Rounding on Fractional Result
```
Method:   POST
URL:      http://localhost:3000/api/bookings/<TEST_BOOKING_ID>/hotels
Headers:  Authorization: Bearer <ADMIN_TOKEN>
          X-Member-Code: <ADMIN_MEMBER_CODE>
Body:     {
            "is_self_booked": false,
            "property_name": "Test Hotel",
            "city": "Bangkok",
            "check_in_date": "<date_of_travel>",
            "check_out_date": "<date_of_travel + 2 days>",
            "cost": 100,
            "currency": "USD",
            "exchange_rate": 83.33,
            "is_refundable": false
          }
Expected: 200 — inr_equivalent: 8333
          Math.ceil(100 × 83.33) = Math.ceil(8333.0) = 8333
          If cost=100, rate=83.339 → Math.ceil(8333.9) = 8334
```

---

## Group 5 — Traveller Module (P2-03)

### T19 — Create Traveller Against Booking
```
Method:   POST
URL:      http://localhost:3000/api/bookings/<TEST_BOOKING_ID>/travellers
Headers:  Authorization: Bearer <ADMIN_TOKEN>
          X-Member-Code: <ADMIN_MEMBER_CODE>
Body:     {
            "full_name": "Rahul Saxena",
            "dob": "1985-03-12",
            "nationality": "Indian",
            "phone": "+91 9810000000",
            "email": "rahul@test.com",
            "emergency_contact_name": "Priya Saxena",
            "emergency_contact_phone": "+91 9810000001",
            "travel_document_id": "A1234567",
            "passport_expiry_date": "<date 2 years from today>",
            "visa_needed": true,
            "is_primary": true
          }
Expected: 200 — traveller record with:
          id, full_name, passport_alert_shown: false
          (passport not expiring within 7 months)
Store:    Save traveller id as TEST_TRAVELLER_ID
```

### T20 — Passport Expiry Alert Triggered
```
Action:   Create traveller with passport expiring within 7 months of DoT
Method:   POST
URL:      http://localhost:3000/api/bookings/<TEST_BOOKING_ID>/travellers
Headers:  Authorization: Bearer <ADMIN_TOKEN>
          X-Member-Code: <ADMIN_MEMBER_CODE>
Body:     {
            "full_name": "Alert Traveller",
            "dob": "1990-01-01",
            "nationality": "Indian",
            "phone": "+91 9810000002",
            "email": "alert@test.com",
            "emergency_contact_name": "EC Name",
            "emergency_contact_phone": "+91 9810000003",
            "travel_document_id": "B7654321",
            "passport_expiry_date": "<date_of_travel + 3 months>",
            "visa_needed": true,
            "is_primary": false
          }
Expected: 200 — traveller record with:
          passport_alert_shown: true
          (passport expires within 7 months of travel)
Store:    Save alert traveller id as ALERT_TRAVELLER_ID
```

### T21 — Passport Alert Acknowledgement Logged
```
Method:   POST
URL:      http://localhost:3000/api/bookings/<TEST_BOOKING_ID>/travellers/<ALERT_TRAVELLER_ID>/acknowledge-passport
Headers:  Authorization: Bearer <ADMIN_TOKEN>
          X-Member-Code: <ADMIN_MEMBER_CODE>
Expected: 200 — traveller with:
          passport_alert_acknowledged: true
          passport_alert_acknowledged_by: <admin user id>
          passport_alert_acknowledged_at: <timestamp>
          system_logs has PASSPORT_ALERT_ACKNOWLEDGED entry
```

### T22 — Visa Exemption Proof Required When Visa Not Needed
```
Method:   POST
URL:      http://localhost:3000/api/bookings/<TEST_BOOKING_ID>/travellers
Headers:  Authorization: Bearer <ADMIN_TOKEN>
          X-Member-Code: <ADMIN_MEMBER_CODE>
Body:     {
            "full_name": "OCI Holder",
            "dob": "1988-06-15",
            "nationality": "Indian",
            "phone": "+91 9810000004",
            "email": "oci@test.com",
            "emergency_contact_name": "EC",
            "emergency_contact_phone": "+91 9810000005",
            "travel_document_id": "C1111111",
            "passport_expiry_date": "<date 3 years from today>",
            "visa_needed": false,
            "visa_exemption_proof_url": null,
            "is_primary": false
          }
Expected: 400 — error: visa exemption proof required when visa_needed is false
```

---

## Group 6 — Invoice Calculation Engine (P2-08)

### T23 — Invoice Calculates Correctly
```
Method:   GET
URL:      http://localhost:3000/api/bookings/<TEST_BOOKING_ID>/invoice
Headers:  Authorization: Bearer <ADMIN_TOKEN>
          X-Member-Code: <ADMIN_MEMBER_CODE>
Expected: 200 — invoice with:
          total_cost_price = sum of all non-self-booked line item inr_equivalents
          margin = value set on booking
          subtotal = Math.ceil(total_cost_price + margin)
          gst_amount = GST rate × margin (2 decimal places)
          tcs_amount = Math.ceil(TCS rate × subtotal)
          total_payable = Math.ceil(subtotal + gst_amount + tcs_amount)
```

### T24 — GST Calculated to 2 Decimal Places
```
Action:   Set margin to a value that produces fractional GST
Method:   PATCH
URL:      http://localhost:3000/api/bookings/<TEST_BOOKING_ID>/invoice
Headers:  Authorization: Bearer <ADMIN_TOKEN>
          X-Member-Code: <ADMIN_MEMBER_CODE>
Body:     { "margin": 8030 }
Expected: 200 — gst_amount: 1445.40
          (8030 × 0.18 = 1445.40 — exact 2 decimal places)
          NOT 1445 or 1446 (not rounded to rupee)
```

### T25 — TCS Uses Ceiling Rounding
```
Action:   Verify TCS on invoice from T24
          total_cost_price (from line items) + 8030 margin = subtotal
          TCS = Math.ceil(subtotal × 0.02)
Expected: tcs_amount is a whole integer (ceiling applied)
          If subtotal × 0.02 = 3512.72 → tcs_amount: 3513
```

### T26 — Total Payable Uses Ceiling Rounding
```
Action:   Verify total_payable on invoice from T24
          total_payable = Math.ceil(subtotal + gst_amount + tcs_amount)
Expected: total_payable is a whole integer
          gst_amount decimal preserved in sum before ceiling applied to total
```

### T27 — GST and TCS Rates From Config (Not Hardcoded)
```
Action:   1. Update TCS rate in config to 0.03
          POST http://localhost:3000/api/config/tcs-rate
          Body: { "rate": 0.03, "effective_from": "<today>" }

          2. Recalculate invoice
          PATCH http://localhost:3000/api/bookings/<TEST_BOOKING_ID>/invoice
          Body: { "margin": 8030 }

Expected: tcs_amount now uses 0.03 rate (not 0.02)
          Proves rates are fetched live from config

          3. Restore TCS rate to 0.02 after test
```

### T28 — Self-Booked Items Excluded from Total Cost Price
```
Action:   Add a self-booked flight to the booking
Method:   POST
URL:      http://localhost:3000/api/bookings/<TEST_BOOKING_ID>/flights
Body:     { "is_self_booked": true, "sector_from": "DEL", "sector_to": "BOM",
            "travel_date": "<date_of_travel>", "cost": 50000 }
Expected: self-booked flight does NOT increase total_cost_price
          GET /invoice shows same total_cost_price as before
          Cost breakup shows self-booked item as excluded
```

### T29 — Cost Breakup Shows Per-Item Detail
```
Method:   GET
URL:      http://localhost:3000/api/bookings/<TEST_BOOKING_ID>/invoice
Headers:  Authorization: Bearer <ADMIN_TOKEN>
          X-Member-Code: <ADMIN_MEMBER_CODE>
Expected: 200 — cost_breakup contains:
          flights.items array with per-flight detail
          hotels.items array with per-hotel detail (includes nights)
          land_package.items array with per-item detail
          Each item has cost and description/name
```

---

## Group 7 — Visa Line Item (P2-07)

### T30 — Create Visa Line Item with Applicants
```
Method:   POST
URL:      http://localhost:3000/api/bookings/<TEST_BOOKING_ID>/visas
Headers:  Authorization: Bearer <ADMIN_TOKEN>
          X-Member-Code: <ADMIN_MEMBER_CODE>
Body:     {
            "is_self_arranged": false,
            "country": "Thailand",
            "visa_type": "tourist",
            "supplier_id": "<TEST_SUPPLIER_ID>",
            "cost_per_applicant": 2500,
            "currency": "INR",
            "exchange_rate": 1,
            "is_refundable": true,
            "supplier_full_refund_till": "2026-05-15"
          }
Expected: 200 — visa record
Store:    Save visa id as TEST_VISA_ID
```

### T31 — Link Traveller to Visa
```
Method:   POST
URL:      http://localhost:3000/api/bookings/<TEST_BOOKING_ID>/visas/<TEST_VISA_ID>/applicants
Headers:  Authorization: Bearer <ADMIN_TOKEN>
          X-Member-Code: <ADMIN_MEMBER_CODE>
Body:     { "traveller_id": "<TEST_TRAVELLER_ID>" }
Expected: 200 — applicant linked
          visa record now shows number_of_applicants: 1
          total_cost: Math.ceil(2500 × 1) = 2500
          inr_equivalent: 2500
          our_full_refund_till: "2026-05-10" (supplier - 5 days)
```

### T32 — Visa Total Cost Updates with Multiple Applicants
```
Action:   Link second traveller to same visa
Method:   POST
URL:      http://localhost:3000/api/bookings/<TEST_BOOKING_ID>/visas/<TEST_VISA_ID>/applicants
Body:     { "traveller_id": "<ALERT_TRAVELLER_ID>" }
Expected: 200 — visa record with:
          number_of_applicants: 2
          total_cost: Math.ceil(2500 × 2) = 5000
          inr_equivalent: 5000
```

---

## Group 8 — Payment Tranches (P2-09)

### T33 — Create Supplier Tranche
```
Method:   POST
URL:      http://localhost:3000/api/bookings/<TEST_BOOKING_ID>/supplier-tranches
Headers:  Authorization: Bearer <ADMIN_TOKEN>
          X-Member-Code: <ADMIN_MEMBER_CODE>
Body:     {
            "supplier_id": "<TEST_SUPPLIER_ID>",
            "amount": 60000,
            "currency": "INR",
            "exchange_rate": 1,
            "payment_date": "<date_of_travel - 10 days>"
          }
Expected: 200 — tranche with:
          inr_equivalent: 60000
          status: "pending"
Store:    Save tranche id as TEST_SUPPLIER_TRANCHE_ID
```

### T34 — Supplier Tranche Date Must Be Before DoT
```
Method:   POST
URL:      http://localhost:3000/api/bookings/<TEST_BOOKING_ID>/supplier-tranches
Headers:  Authorization: Bearer <ADMIN_TOKEN>
          X-Member-Code: <ADMIN_MEMBER_CODE>
Body:     {
            "supplier_id": "<TEST_SUPPLIER_ID>",
            "amount": 10000,
            "currency": "INR",
            "exchange_rate": 1,
            "payment_date": "<date_of_travel + 5 days>"
          }
Expected: 400 — error: supplier tranche payment date must be before date of travel
```

### T35 — Guest Tranches Auto-Generated for Scenario A (>20 days)
```
Method:   POST
URL:      http://localhost:3000/api/bookings/<TEST_BOOKING_ID>/generate-guest-tranches
Headers:  Authorization: Bearer <ADMIN_TOKEN>
          X-Member-Code: <ADMIN_MEMBER_CODE>
Expected: 200 — array of 2 guest tranches:
          Tranche 1: label "Tranche 1", amount = booked-with-us costs + margin
          Balance: label "Balance Payment", amount = remaining
          Balance due_date = earliest supplier tranche date - 5 days
```

### T36 — NRF Flag Set for Within-20-Day Booking (P2-15)
```
Action:   Create a booking with date_of_travel = today + 15 days
Method:   POST
URL:      http://localhost:3000/api/bookings
Headers:  Authorization: Bearer <ADMIN_TOKEN>
          X-Member-Code: <ADMIN_MEMBER_CODE>
Body:     { ...same as T01 but date_of_travel = <today + 15 days> }
Expected: 200 — booking with:
          is_nrf: true
          system_logs has NRF_FLAG_SET entry
Store:    Save as NRF_BOOKING_ID
```

### T37 — NRF Booking Gets Single Full-Payment Tranche
```
Method:   POST
URL:      http://localhost:3000/api/bookings/<NRF_BOOKING_ID>/supplier-tranches
Body:     { "supplier_id": "<TEST_SUPPLIER_ID>", "amount": 50000,
            "currency": "INR", "exchange_rate": 1,
            "payment_date": "<today + 10 days>" }
Then:
Method:   POST
URL:      http://localhost:3000/api/bookings/<NRF_BOOKING_ID>/generate-guest-tranches
Expected: 200 — array of 1 guest tranche:
          label: "Full Payment"
          amount: booking.total_payable
          due_date: today
```

---

## Group 9 — Financial Confirmation Logging (P2-10)

### T38 — Financial Confirmation Logged on Booking Create
```
Action:   Check system_logs after T01 booking creation
          SELECT * FROM system_logs
          WHERE event_type = 'FINANCIAL_CONFIRMED'
          AND entity_id = '<TEST_BOOKING_ID>';
Expected: 1 row with:
          actor_id = admin user id
          created_at = timestamp of booking creation
          metadata contains financial_confirmed: true
```

### T39 — BOOKING_CREATED Logged with Full After State
```
Action:   Check system_logs after T01 booking creation
          SELECT * FROM system_logs
          WHERE event_type = 'BOOKING_CREATED'
          AND entity_id = '<TEST_BOOKING_ID>';
Expected: 1 row with:
          before_state: null
          after_state: contains booking fields (customer_name, destinations, etc.)
```

### T40 — FINANCIAL_FIELD_CHANGED Logged on Invoice Update
```
Action:   Check system_logs after T24 invoice update
          SELECT * FROM system_logs
          WHERE event_type = 'FINANCIAL_FIELD_CHANGED'
          AND entity_id = '<TEST_BOOKING_ID>'
          ORDER BY created_at DESC LIMIT 1;
Expected: 1 row with:
          before_state: contains old margin value
          after_state: contains new margin value (8030)
```

---

## Group 10 — Bookings List (P2-11)

### T41 — Bookings List Returns MYTL Codes
```
Method:   GET
URL:      http://localhost:3000/api/bookings
Headers:  Authorization: Bearer <ADMIN_TOKEN>
          X-Member-Code: <ADMIN_MEMBER_CODE>
Expected: 200 — all booking_code values match MYTL-XXXXXX pattern
          No BK- format codes anywhere
```

### T42 — Bookings List Includes NRF Flag
```
Method:   GET
URL:      http://localhost:3000/api/bookings
Headers:  Authorization: Bearer <ADMIN_TOKEN>
          X-Member-Code: <ADMIN_MEMBER_CODE>
Expected: 200 — NRF_BOOKING_ID booking has is_nrf: true
          Regular TEST_BOOKING_ID has is_nrf: false
```

### T43 — Bookings List Includes Invoice Number
```
Method:   GET
URL:      http://localhost:3000/api/bookings
Headers:  Authorization: Bearer <ADMIN_TOKEN>
          X-Member-Code: <ADMIN_MEMBER_CODE>
Expected: 200 — each booking has invoice_number as 7-digit integer
```

---

## Group 11 — Document Management (P2-14)

### T44 — Upload Document to Booking
```
Method:   POST (multipart)
URL:      http://localhost:3000/api/bookings/<TEST_BOOKING_ID>/documents
Headers:  Authorization: Bearer <ADMIN_TOKEN>
          X-Member-Code: <ADMIN_MEMBER_CODE>
Body:     file: <any small PDF or image>
          document_type: "voucher"
          entity_type: "booking"
          description: "Test voucher v1"
Expected: 200 — document record with:
          version: 1
          is_active: true
          file_url: non-null URL
          uploaded_by: admin user id
Logs:     DOCUMENT_UPLOADED in system_logs with version: 1 in metadata
Store:    Save document id as TEST_DOC_ID
```

### T45 — Upload New Version Sets Old to Inactive
```
Method:   POST (multipart)
URL:      http://localhost:3000/api/bookings/<TEST_BOOKING_ID>/documents
Headers:  Authorization: Bearer <ADMIN_TOKEN>
          X-Member-Code: <ADMIN_MEMBER_CODE>
Body:     file: <any small PDF or image>
          document_type: "voucher"
          entity_type: "booking"
          description: "Test voucher v2"
Expected: 200 — new document record with:
          version: 2
          is_active: true
          Previous version (TEST_DOC_ID) now has is_active: false
```

### T46 — Version History Returns All Versions
```
Method:   GET
URL:      http://localhost:3000/api/bookings/<TEST_BOOKING_ID>/documents/<TEST_DOC_ID>/versions
Headers:  Authorization: Bearer <ADMIN_TOKEN>
          X-Member-Code: <ADMIN_MEMBER_CODE>
Expected: 200 — array of 2 versions:
          v2: is_active: true
          v1: is_active: false
          Newest first
```

---

## Group 12 — Code Quality Checks

### T47 — No Hardcoded GST or TCS Rates
```
Action:   Cursor searches entire backend src/ folder:
          grep -r "0.18" src/
          grep -r "0.02" src/
Expected: Zero matches in any controller, service, or utility file
          Rates only fetched from config tables
```

### T48 — No Math.round on Non-GST Calculations
```
Action:   Cursor searches src/ for Math.round usage:
          grep -r "Math.round" src/
Expected: Math.round appears ONLY in GST calculation
          All other financial calculations use Math.ceil
```

### T49 — 5-Day Buffer Utility Used Consistently
```
Action:   Cursor checks that calculateOurPolicyDate is called in:
          - flight controller (POST and PATCH)
          - hotel controller (POST and PATCH)
          - land item controller (POST and PATCH)
          - visa controller (POST and PATCH)
Expected: calculateOurPolicyDate import/call found in all 4 controllers
```

### T50 — Booking Code Format Verified in DB
```
Action:   Run in Supabase SQL editor:
          SELECT booking_code FROM bookings
          WHERE booking_code NOT LIKE 'MYTL-%';
Expected: Zero rows — all booking codes are MYTL format
```

---

## Test Cleanup
```sql
-- Remove test bookings (cascades to all line items, travellers, tranches)
DELETE FROM bookings WHERE customer_name = 'Test Customer';
DELETE FROM bookings WHERE customer_name = 'Updated Customer Name';
-- NRF test booking
DELETE FROM bookings WHERE is_nrf = true AND created_at > now() - interval '1 hour';
-- Restore TCS rate if changed in T27
INSERT INTO config_tcs_rate (rate, effective_from)
VALUES (0.02, '<today>');
```

---

## Results Summary Template

| Test | Description | Result | Notes |
|---|---|---|---|
| T01 | Booking code MYTL format | PASS/FAIL | |
| T02 | Invoice number 7-digit | PASS/FAIL | |
| T03 | Booking codes unique | PASS/FAIL | |
| T04 | Client cannot set booking code | PASS/FAIL | |
| T05 | Get booking by ID | PASS/FAIL | |
| T06 | Booking list returns bookings | PASS/FAIL | |
| T07 | Agent scoping enforced | PASS/FAIL | |
| T08 | Search by customer name | PASS/FAIL | |
| T09 | Filter by status | PASS/FAIL | |
| T10 | Update booking header | PASS/FAIL | |
| T11 | Flight our policy date | PASS/FAIL | |
| T12 | Client cannot override our policy | PASS/FAIL | |
| T13 | Partial refund buffer | PASS/FAIL | |
| T14 | Null supplier date = null policy | PASS/FAIL | |
| T15 | Hotel 5-day buffer | PASS/FAIL | |
| T16 | Land item buffer | PASS/FAIL | |
| T17 | INR equivalent ceiling rounding | PASS/FAIL | |
| T18 | Fractional ceiling rounding | PASS/FAIL | |
| T19 | Create traveller | PASS/FAIL | |
| T20 | Passport alert triggered | PASS/FAIL | |
| T21 | Passport acknowledgement logged | PASS/FAIL | |
| T22 | Visa exemption required | PASS/FAIL | |
| T23 | Invoice calculates correctly | PASS/FAIL | |
| T24 | GST to 2 decimal places | PASS/FAIL | |
| T25 | TCS ceiling rounding | PASS/FAIL | |
| T26 | Total payable ceiling | PASS/FAIL | |
| T27 | Rates from config not hardcoded | PASS/FAIL | |
| T28 | Self-booked excluded from TCP | PASS/FAIL | |
| T29 | Cost breakup per-item detail | PASS/FAIL | |
| T30 | Create visa line item | PASS/FAIL | |
| T31 | Link traveller to visa | PASS/FAIL | |
| T32 | Visa total updates with applicants | PASS/FAIL | |
| T33 | Create supplier tranche | PASS/FAIL | |
| T34 | Tranche date before DoT | PASS/FAIL | |
| T35 | Guest tranches Scenario A | PASS/FAIL | |
| T36 | NRF flag auto-set | PASS/FAIL | |
| T37 | NRF single full payment tranche | PASS/FAIL | |
| T38 | Financial confirmation logged | PASS/FAIL | |
| T39 | Booking created log structure | PASS/FAIL | |
| T40 | Financial field change logged | PASS/FAIL | |
| T41 | List returns MYTL codes | PASS/FAIL | |
| T42 | List includes NRF flag | PASS/FAIL | |
| T43 | List includes invoice number | PASS/FAIL | |
| T44 | Upload document v1 | PASS/FAIL | |
| T45 | Upload v2 deactivates v1 | PASS/FAIL | |
| T46 | Version history returns all | PASS/FAIL | |
| T47 | No hardcoded rates | PASS/FAIL | |
| T48 | Math.round only for GST | PASS/FAIL | |
| T49 | 5-day buffer used in all controllers | PASS/FAIL | |
| T50 | All booking codes MYTL format in DB | PASS/FAIL | |
| **Total** | | **/50** | |

---

*End of Phase 2 Backend Test Suite — v1.0*
