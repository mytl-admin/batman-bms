-- P1-07 core booking schema

CREATE TABLE bookings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_code          VARCHAR UNIQUE NOT NULL,
  crm_lead_id           VARCHAR,
  customer_name         VARCHAR NOT NULL,
  destination           TEXT[] NOT NULL,
  date_of_travel        DATE NOT NULL,
  return_date           DATE NOT NULL,
  adults                INTEGER NOT NULL DEFAULT 1,
  children              INTEGER NOT NULL DEFAULT 0,
  children_ages         INTEGER[],
  status                VARCHAR NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'on_hold', 'cancelled', 'completed')),
  is_nrf                BOOLEAN DEFAULT false,
  case_owner_id         UUID REFERENCES users(id),
  case_manager_id       UUID REFERENCES users(id),
  margin                NUMERIC(12,2),
  total_cost_price      NUMERIC(12,2),
  subtotal              NUMERIC(12,2),
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

CREATE TABLE booking_hotels (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id                UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  is_self_booked            BOOLEAN DEFAULT false,
  property_name             VARCHAR,
  supplier_id               UUID REFERENCES suppliers(id),
  city                      VARCHAR,
  check_in_date             DATE,
  check_out_date            DATE,
  nights                    INTEGER,
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

CREATE TABLE booking_visas (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id                UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  is_self_arranged          BOOLEAN DEFAULT false,
  country                   VARCHAR,
  visa_type                 VARCHAR,
  supplier_id               UUID REFERENCES suppliers(id),
  cost_per_applicant        NUMERIC(12,2),
  number_of_applicants      INTEGER,
  total_cost                NUMERIC(12,2),
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

CREATE TABLE booking_travellers (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id                UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  crm_customer_id           VARCHAR,
  is_primary                BOOLEAN DEFAULT false,
  full_name                 VARCHAR NOT NULL,
  dob                       DATE NOT NULL,
  nationality               VARCHAR NOT NULL,
  phone                     VARCHAR,
  email                     VARCHAR,
  emergency_contact_name    VARCHAR,
  emergency_contact_phone   VARCHAR,
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

CREATE TABLE booking_pan_cards (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  pan_number  VARCHAR NOT NULL,
  name        VARCHAR,
  created_at  TIMESTAMP DEFAULT now()
);

CREATE TABLE booking_visa_applicants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visa_id         UUID NOT NULL REFERENCES booking_visas(id) ON DELETE CASCADE,
  traveller_id    UUID NOT NULL REFERENCES booking_travellers(id) ON DELETE CASCADE
);

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

CREATE TABLE guest_supplier_tranche_links (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_tranche_id    UUID NOT NULL REFERENCES guest_tranches(id) ON DELETE CASCADE,
  supplier_tranche_id UUID NOT NULL REFERENCES supplier_tranches(id) ON DELETE CASCADE
);

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

CREATE TABLE supplier_buyer_payment_links (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_payment_record_id UUID NOT NULL REFERENCES supplier_payment_records(id) ON DELETE CASCADE,
  buyer_payment_record_id    UUID NOT NULL REFERENCES buyer_payment_records(id) ON DELETE CASCADE
);

CREATE TABLE booking_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id      UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  entity_type     VARCHAR,
  entity_id       UUID,
  document_name   VARCHAR NOT NULL,
  document_type   VARCHAR,
  version         INTEGER NOT NULL DEFAULT 1,
  file_path       VARCHAR,
  file_url        VARCHAR,
  is_active       BOOLEAN DEFAULT true,
  uploaded_by     UUID REFERENCES users(id),
  uploaded_at     TIMESTAMP DEFAULT now(),
  description     VARCHAR
);

CREATE TABLE cancellations (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id              UUID NOT NULL REFERENCES bookings(id),
  type                    VARCHAR NOT NULL CHECK (type IN ('full', 'partial')),
  reason                  VARCHAR NOT NULL,
  notes                   VARCHAR,
  affected_component      VARCHAR,
  affected_monetary_value NUMERIC(12,2),
  recoverable_from_paid   NUMERIC(12,2),
  additional_retention    NUMERIC(12,2) DEFAULT 0,
  tcs_deduction           NUMERIC(12,2),
  margin_retained         NUMERIC(12,2),
  gst_liability           NUMERIC(12,2),
  refundable_to_guest     NUMERIC(12,2),
  refund_ceiling          NUMERIC(12,2),
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

CREATE TABLE credit_notes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cancellation_id UUID NOT NULL REFERENCES cancellations(id),
  booking_id      UUID NOT NULL REFERENCES bookings(id),
  type            VARCHAR NOT NULL CHECK (type IN ('buyer', 'supplier')),
  value           NUMERIC(12,2) NOT NULL,
  max_redemption_date DATE,
  supplier_id     UUID REFERENCES suppliers(id),
  customer_name   VARCHAR,
  status          VARCHAR DEFAULT 'issued'
                  CHECK (status IN ('issued', 'redeemed', 'expired')),
  created_at      TIMESTAMP DEFAULT now()
);

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

CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_dot ON bookings(date_of_travel);
CREATE INDEX idx_bookings_case_owner ON bookings(case_owner_id);
CREATE INDEX idx_guest_tranches_due_date ON guest_tranches(due_date);
CREATE INDEX idx_guest_tranches_status ON guest_tranches(status);
CREATE INDEX idx_supplier_tranches_payment_date ON supplier_tranches(payment_date);
CREATE INDEX idx_supplier_tranches_status ON supplier_tranches(status);
CREATE INDEX idx_booking_documents_booking ON booking_documents(booking_id);
