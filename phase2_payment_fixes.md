# Fix Story — Step 4 Payments + Collections Fixes
**Story ID:** P2-PAYMENT-FIXES  
**Type:** Bug Fix + Enhancement  
**Priority:** P0 — Step 4 currently shows incorrect collection amounts  
**Repos:** booking-erp-backend + booking-erp-frontend  
**Date:** May 2026

---

## Summary of Fixes

| # | Issue | Repo |
|---|---|---|
| FIX-A | Add Margin section to Step 4 with auto-prefill logic | Backend + Frontend |
| FIX-B | Margin carries through to Step 5 Review & Confirm (editable) | Frontend |
| FIX-C | Balance due date in past — show warning | Frontend |
| FIX-D | Margin field — remove stepper arrows, plain input | Frontend |
| FIX-E | Add default margin percentage to Master Configurations | Backend |

---

## FIX-A — Add Margin Section to Step 4

### Backend

**Add `default_margin_pct` to Master Configurations**

```sql
CREATE TABLE config_default_margin_pct (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rate            NUMERIC(5,4) NOT NULL DEFAULT 0.12,  -- 12%
  is_active       BOOLEAN DEFAULT true,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMP DEFAULT now()
);

-- Seed initial value
INSERT INTO config_default_margin_pct (rate) VALUES (0.12);
```

**New endpoint — GET /api/config/default-margin-pct/current**
- Auth: Agent + Admin
- Returns: `{ rate: 0.12 }`
- Used by Step 4 to pre-fill margin

**Update POST /api/bookings/preview-collections**
Already accepts `margin` in body. No change needed.
Verify it uses the margin value passed — not a hardcoded value.

### Frontend — Step 4 Margin Section

Add a Margin section between Supplier Tranches and Collections:

```
Step 4 Layout:

Section 1: Supplier Payment Schedule  (existing)
Section 2: Margin                     (NEW)
Section 3: Collections                (existing — now shows correct amounts)
Section 4: Invoice Preview            (existing)
```

**Margin Section UI:**

```
┌─────────────────────────────────────────────────────┐
│  Margin                                             │
│  MyTripLane margin on this booking                  │
│                                                     │
│  Margin amount (₹)                                  │
│  [        8,000        ]                            │
│                                                     │
│  Auto-suggested: higher of                         │
│  • Fixed: ₹8,000                                   │
│  • 12% of total supplier cost: ₹6,909              │
│  Using: ₹8,000 (fixed minimum)                     │
│                                                     │
│  You can edit this amount.                         │
└─────────────────────────────────────────────────────┘
```

**Auto-prefill logic (frontend):**
```javascript
// On Step 4 mount, after supplier tranches are loaded:
const totalSupplierCost = supplierTranches.reduce(
  (sum, t) => sum + (t.inr_equivalent || 0), 0
)

// Fetch default margin % from config
const { rate } = await api.get('/api/config/default-margin-pct/current')

const pctMargin = Math.ceil(totalSupplierCost * rate)
const fixedMinimum = 8000
const suggestedMargin = Math.max(pctMargin, fixedMinimum)

// Pre-fill margin input with suggestedMargin
setMargin(suggestedMargin)

// Show breakdown:
// "Auto-suggested: higher of ₹8,000 or 12% of ₹XX,XXX = ₹X,XXX"
// "Using: ₹X,XXX"
```

**Margin input field:**
- Type: number input (plain — no stepper arrows, see FIX-D)
- Pre-filled with `suggestedMargin`
- Editable — agent can type any value
- Min: 0
- On change: triggers Collections preview recalculation (debounced 500ms)
- On change: triggers Invoice Preview recalculation (live)

**Re-prefill behaviour:**
- If agent adds/removes/edits a supplier tranche, re-calculate suggested margin
- Show a subtle note: "Suggested margin updated based on supplier costs"
- Do NOT override agent's manually entered value unless agent clicks
  a "Reset to suggested" link

---

## FIX-B — Margin Carries to Step 5 (Editable)

### Frontend

Step 5 Review & Confirm must:

1. **Display margin from Step 4** in the Invoice panel — pre-filled from wizard state
2. **Keep margin editable** — agent can change it in Step 5
3. **On margin change in Step 5:**
   - Invoice recalculates live (GST, TCS, Total Payable)
   - Collections preview recalculates live (call preview-collections again)
   - Both panels update simultaneously

**Step 5 Invoice panel:**
```
Total Cost Price (A)    ₹57,675     [Show breakup]
Margin (B)              [  8,000  ] ← editable, pre-filled from Step 4
Subtotal (C = A+B)      ₹65,675     (auto)
GST (18% of margin)     ₹1,440.00   (auto, 2dp)
TCS (2% of subtotal)    ₹1,314      (auto, ceiling)
Total Payable           ₹68,429     (auto, ceiling, bold)
```

**Step 5 Collections panel (read-only, recalculates when margin changes):**
```
Collections
  Tranche 1       ₹XX,XXX    Due: today
  Balance         ₹XX,XXX    Due: DD Mon YYYY
```

**Data flow:**
```
Step 4 margin value → stored in wizard state
Step 5 mounts → reads margin from wizard state → pre-fills invoice
Step 5 margin changes → updates wizard state → recalculates invoice + collections
Step 5 submit → sends updated margin in booking payload
```

**Financial confirmation checkbox** remains mandatory before submit.
Text: "I have read and confirm all financials are correctly recorded."

---

## FIX-C — Balance Due Date in Past Warning

### Frontend

When the Collections preview returns a balance due date that is before today, show a persistent warning below the Collections table.

```javascript
const today = startOfDay(new Date())
const balanceDueDate = parseISO(collections.find(
  c => c.label === 'Balance Payment'
)?.due_date)

if (balanceDueDate && balanceDueDate < today) {
  // Show warning
}
```

**Warning UI:**
```
⚠ Balance payment due date (4 May 2026) is in the past.
  This is because the earliest supplier tranche date minus
  5 days has already passed. Please review your supplier
  tranche dates or collect the balance immediately.
```

- Warning shown in orange below the Collections table
- Not a hard block — agent can still proceed
- Warning also shown in Step 5 Review & Confirm if still applicable

### Backend

No change needed — the backend correctly calculates the date.
This is purely a frontend display concern.

---

## FIX-D — Remove Stepper from Margin Field

### Frontend

The margin input field must be a plain number input — no stepper arrows.

```
Apply to ALL currency/amount fields across the application:
- Margin input (Step 4 and Step 5)
- Cost fields on line items
- Any other financial amount field

Fix:
Remove type="number" stepper arrows using CSS:
input[type=number]::-webkit-inner-spin-button,
input[type=number]::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
input[type=number] {
  -moz-appearance: textfield;
}

OR use type="text" with inputMode="numeric" and 
pattern="[0-9]*" for currency amount fields.

Keep type="number" with stepper only for:
- Adults count
- Children count
- Pax steppers (already fixed)

Everything else that represents a money amount should
have no stepper arrows.
```

---

## FIX-E — Master Config: Default Margin Percentage

### Backend

```
Add config_default_margin_pct table to Supabase:

CREATE TABLE config_default_margin_pct (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rate            NUMERIC(5,4) NOT NULL DEFAULT 0.12,
  is_active       BOOLEAN DEFAULT true,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMP DEFAULT now()
);

INSERT INTO config_default_margin_pct (rate) VALUES (0.12);

Add to Master Configurations admin UI so Admin can 
update the default margin percentage without a code deploy.

Add endpoint:
GET /api/config/default-margin-pct/current
Returns: { rate: 0.12 }

Add to known Master Configuration tables list.
```

---

## Implementation Order

### Backend first:
1. FIX-E — Create `config_default_margin_pct` table + seed + endpoint

### Frontend after:
1. FIX-D — Remove stepper from all currency fields (quick CSS fix)
2. FIX-A — Add Margin section to Step 4 with auto-prefill
3. FIX-B — Carry margin to Step 5, keep editable
4. FIX-C — Balance due date past warning

---

## Acceptance Criteria

### Backend
- [ ] `config_default_margin_pct` table exists with rate = 0.12
- [ ] `GET /api/config/default-margin-pct/current` returns `{ rate: 0.12 }`
- [ ] Rate is configurable via Admin panel — no code deploy needed
- [ ] `preview-collections` endpoint correctly uses margin from request body

### Frontend
- [ ] Step 4 shows Margin section between Supplier Tranches and Collections
- [ ] Margin pre-filled with: max(8000, 12% of total supplier cost)
- [ ] 12% fetched from config — not hardcoded
- [ ] Margin input has no stepper arrows
- [ ] All other currency amount fields have no stepper arrows
- [ ] Collections recalculate when margin changes (debounced 500ms)
- [ ] Invoice preview recalculates live as margin is typed
- [ ] Margin value carries to Step 5 from wizard state
- [ ] Step 5 margin is editable — changes update invoice and collections
- [ ] Financial confirmation checkbox still required before submit
- [ ] Warning shown when balance due date is in the past
- [ ] Warning visible in both Step 4 and Step 5 if applicable
- [ ] Tranche 1 is no longer ₹0 when margin is entered

---

*End of P2-PAYMENT-FIXES*
