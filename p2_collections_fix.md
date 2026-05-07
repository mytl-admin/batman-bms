# Fix Story — Collections Preview (Step 4)
**Story ID:** P2-COLLECTIONS-FIX  
**Type:** Bug Fix + New Feature  
**Priority:** P0 — Step 4 currently shows incorrect data  
**Repos:** booking-erp-backend + booking-erp-frontend  
**Date:** May 2026

---

## Problem

Step 4 currently shows a "Guest tranches (preview)" section with incorrect calculations — amounts are wrong, a phantom ₹1,100 balance appears, and calculation logic incorrectly lives in the frontend. Guest tranche calculation must live entirely in the backend.

---

## Backend Fix

### New Endpoint — POST /api/bookings/preview-collections

**File:** `src/routes/bookings.js` + `src/controllers/bookingCollectionsController.js`

**Auth:** Agent + Admin (JWT required)  
**No database writes — pure calculation only**

#### Request Body
```json
{
  "date_of_travel": "2026-06-05",
  "margin": 8030,
  "supplier_tranches": [
    { "inr_equivalent": 55000, "payment_date": "2026-05-26" },
    { "inr_equivalent": 20000, "payment_date": "2026-05-26" },
    { "inr_equivalent": 21000, "payment_date": "2026-05-20" }
  ],
  "line_items": {
    "flights": [
      { "inr_equivalent": 75000, "is_self_booked": false }
    ],
    "hotels": [
      { "inr_equivalent": 33345, "is_self_booked": false },
      { "inr_equivalent": 26889, "is_self_booked": false }
    ],
    "land_items": [
      { "inr_equivalent": 28740 }
    ],
    "visas": [
      { "inr_equivalent": 2972, "is_self_arranged": false }
    ]
  }
}
```

#### Calculation Logic (strict — do not deviate)

```javascript
// Step 1 — Fetch live rates from config (never hardcode)
const gst_rate = await getActiveGSTRate()   // e.g. 0.18
const tcs_rate = await getActiveTCSRate()   // e.g. 0.02

// Step 2 — Total cost price (exclude self-booked/self-arranged)
const total_cost_price = Math.ceil(
  flights.filter(f => !f.is_self_booked)
    .reduce((s, f) => s + f.inr_equivalent, 0) +
  hotels.filter(h => !h.is_self_booked)
    .reduce((s, h) => s + h.inr_equivalent, 0) +
  land_items.reduce((s, l) => s + l.inr_equivalent, 0) +
  visas.filter(v => !v.is_self_arranged)
    .reduce((s, v) => s + v.inr_equivalent, 0)
)

// Step 3 — Invoice
const subtotal      = Math.ceil(total_cost_price + margin)
const gst_amount    = Math.round(gst_rate * margin * 100) / 100  // 2 decimal
const tcs_amount    = Math.ceil(tcs_rate * subtotal)
const total_payable = Math.ceil(subtotal + gst_amount + tcs_amount)

// Step 4 — Determine scenario
const daysToTravel  = differenceInDays(
  new Date(date_of_travel), 
  startOfDay(new Date())
)
const is_nrf        = daysToTravel <= 20

// Step 5 — Generate collection tranches
let collections = []

if (!is_nrf) {
  // Scenario A — more than 20 days before travel — 2 tranches

  // Tranche 1 = booked-with-us flights + hotels + margin
  const booked_flights_hotels = Math.ceil(
    flights.filter(f => !f.is_self_booked)
      .reduce((s, f) => s + f.inr_equivalent, 0) +
    hotels.filter(h => !h.is_self_booked)
      .reduce((s, h) => s + h.inr_equivalent, 0)
  )
  const tranche1_amount = Math.ceil(booked_flights_hotels + margin)

  // Balance = total_payable - tranche1
  const balance_amount = Math.ceil(total_payable - tranche1_amount)

  // Balance due date = earliest supplier tranche date - 5 days
  const supplier_dates = supplier_tranches
    .map(t => new Date(t.payment_date))
    .filter(d => !isNaN(d))
  const earliest_supplier_date = supplier_dates.length > 0
    ? new Date(Math.min(...supplier_dates))
    : new Date(date_of_travel)
  const balance_due = subDays(earliest_supplier_date, 5)

  collections = [
    {
      label: "Tranche 1",
      amount: tranche1_amount,
      due_date: format(startOfDay(new Date()), 'yyyy-MM-dd')
    },
    {
      label: "Balance Payment",
      amount: balance_amount,
      due_date: format(balance_due, 'yyyy-MM-dd')
    }
  ]

} else {
  // Scenario B — within 20 days — single full payment
  collections = [
    {
      label: "Full Payment",
      amount: total_payable,
      due_date: format(startOfDay(new Date()), 'yyyy-MM-dd')
    }
  ]
}
```

#### Response
```json
{
  "scenario": "A",
  "is_nrf": false,
  "collections": [
    {
      "label": "Tranche 1",
      "amount": 117375,
      "due_date": "2026-05-06"
    },
    {
      "label": "Balance Payment",
      "amount": 63219,
      "due_date": "2026-05-15"
    }
  ],
  "invoice": {
    "total_cost_price": 167606,
    "margin": 8030,
    "subtotal": 175636,
    "gst_rate": 0.18,
    "gst_amount": 1445.40,
    "tcs_rate": 0.02,
    "tcs_amount": 3513,
    "total_payable": 180594
  }
}
```

#### Validation
```javascript
// Required fields
if (!date_of_travel) return 400 { error: "date_of_travel is required" }
if (margin === undefined || margin === null) return 400 { error: "margin is required" }
if (!supplier_tranches || !Array.isArray(supplier_tranches)) return 400 { error: "supplier_tranches array is required" }

// supplier_tranches can be empty array — handle gracefully
// line_items sections can be empty arrays — handle gracefully
```

#### Notes
- Use `date-fns` functions: `differenceInDays`, `subDays`, `startOfDay`, `format`
- Never hardcode 0.18 or 0.02 — always fetch from config tables
- HEAD method not exposed on this endpoint
- No Supabase reads or writes except fetching GST/TCS rates from config

---

## Frontend Fix

### Step 4 — Remove Guest Tranches Preview, Add Collections Section

**File:** The Step 4 wizard component (Payments step)

#### What to Remove
- Delete the entire "Guest tranches (preview)" section and all its calculation logic
- Remove any frontend calculation of tranche amounts
- Remove any hardcoded tranche logic in the component

#### What to Add — Collections Section

Add a new read-only "Collections" section below the Margin section.

**Trigger:** Call `POST /api/bookings/preview-collections` whenever:
1. Any supplier tranche is added, edited, or removed
2. The margin value changes
3. Use debounce of 500ms on margin input to avoid excessive calls

**Loading state:** Show a subtle loading indicator in the Collections section while the API call is in flight.

**Error state:** If the API call fails, show: `"Could not calculate collections. Please check supplier tranches and margin."`

#### Collections Section UI

```
┌─────────────────────────────────────────────────────────┐
│  Collections                                             │
│  What MyTripLane will collect from the guest            │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Label            │ Amount      │ Due Date        │   │
│  │──────────────────│─────────────│─────────────────│   │
│  │ Tranche 1        │ ₹1,17,375   │ 6 May 2026      │   │
│  │ Balance Payment  │ ₹63,219     │ 15 May 2026     │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  Note: Collections are auto-calculated from supplier    │
│  costs, margin, GST and TCS.                           │
└─────────────────────────────────────────────────────────┘
```

**NRF scenario banner (show only when is_nrf = true):**
```
┌─────────────────────────────────────────────────────────┐
│  ⚠ This booking is within 20 days of travel.            │
│  100% payment required upfront. Non-refundable.         │
└─────────────────────────────────────────────────────────┘
```

**Rules:**
- All rows are read-only — no edit, no remove buttons
- Amount column always shows whole rupees (Math.ceil applied server-side)
- Table style matches the supplier tranche table layout
- Section is visually distinct from supplier tranches (different background or border)

#### API Call Implementation

```javascript
// In Step 4 component

const fetchCollectionsPreview = async () => {
  if (!margin && margin !== 0) return  // wait for margin input
  if (!supplierTranches.length) return  // wait for at least 1 tranche

  setCollectionsLoading(true)
  
  try {
    const response = await api.post('/api/bookings/preview-collections', {
      date_of_travel: wizardState.date_of_travel,
      margin: parseFloat(margin) || 0,
      supplier_tranches: supplierTranches.map(t => ({
        inr_equivalent: t.inr_equivalent,
        payment_date: t.payment_date
      })),
      line_items: {
        flights: wizardState.flights.map(f => ({
          inr_equivalent: f.inr_equivalent,
          is_self_booked: f.is_self_booked
        })),
        hotels: wizardState.hotels.map(h => ({
          inr_equivalent: h.inr_equivalent,
          is_self_booked: h.is_self_booked
        })),
        land_items: wizardState.land_items.map(l => ({
          inr_equivalent: l.inr_equivalent
        })),
        visas: wizardState.visas.map(v => ({
          inr_equivalent: v.inr_equivalent,
          is_self_arranged: v.is_self_arranged
        }))
      }
    })

    setCollectionsPreview(response.data)
    setIsNrf(response.data.is_nrf)
    
  } catch (err) {
    setCollectionsError(true)
  } finally {
    setCollectionsLoading(false)
  }
}

// Call on supplier tranche change or margin change (debounced)
useEffect(() => {
  const timer = setTimeout(fetchCollectionsPreview, 500)
  return () => clearTimeout(timer)
}, [supplierTranches, margin])
```

#### Step 4 Final Section Order

```
1. Supplier Tranches      ← agent enters (existing)
   └── Total supplier cost: ₹XX,XXX (sum of all tranches)

2. Margin                 ← agent enters (existing)
   └── Invoice preview: Cost + Margin + GST + TCS + Total

3. Collections            ← read-only, from backend (new)
   └── Tranche rows with amounts and due dates
```

---

## Acceptance Criteria

### Backend
- [ ] `POST /api/bookings/preview-collections` returns 200 with correct collections
- [ ] Scenario A (DoT > 20 days) returns exactly 2 collection tranches
- [ ] Scenario B (DoT ≤ 20 days) returns exactly 1 collection tranche + `is_nrf: true`
- [ ] All 3 supplier tranches summed correctly (not just first one)
- [ ] Balance due date = earliest supplier tranche date - 5 days
- [ ] GST calculated to exactly 2 decimal places
- [ ] All other amounts use Math.ceil
- [ ] Rates fetched from config — 0.18 and 0.02 never hardcoded
- [ ] No database writes on this endpoint
- [ ] HEAD method not exposed

### Frontend
- [ ] "Guest tranches (preview)" section removed entirely
- [ ] No tranche calculation logic remains in frontend components
- [ ] Collections section renders rows from backend response
- [ ] Collections recalculates when supplier tranches change
- [ ] Collections recalculates when margin changes (500ms debounce)
- [ ] Loading state shown during API call
- [ ] Error state shown if API call fails
- [ ] NRF banner shown when `is_nrf: true`
- [ ] All amounts display as whole rupees
- [ ] Section is read-only — no edit or remove buttons

---

*End of P2-COLLECTIONS-FIX*
