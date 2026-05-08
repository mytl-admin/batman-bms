-- P1-05 users + credential storage for invite/login (password_hash holds bcrypt hash of temporary invite code)
CREATE TABLE users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email             VARCHAR UNIQUE NOT NULL,
  member_code       VARCHAR UNIQUE NOT NULL,
  name              VARCHAR NOT NULL,
  role              VARCHAR NOT NULL CHECK (role IN ('agent', 'admin')),
  password_hash     TEXT NOT NULL,
  is_active         BOOLEAN DEFAULT true,
  invited_by        UUID REFERENCES users(id),
  invited_at        TIMESTAMP,
  last_login_at     TIMESTAMP,
  created_at        TIMESTAMP DEFAULT now(),
  updated_at        TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_users_member_code ON users(member_code);
CREATE INDEX idx_users_email ON users(email);
-- P1-08 Master configuration + suppliers (before core booking tables)

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
  bank_details_complete BOOLEAN DEFAULT false,
  is_active           BOOLEAN DEFAULT true,
  sort_order          INTEGER DEFAULT 0,
  used_in_pages       TEXT[],
  used_in_systems     TEXT[],
  created_by          UUID REFERENCES users(id),
  created_at          TIMESTAMP DEFAULT now(),
  updated_at          TIMESTAMP DEFAULT now()
);

-- Standard config tables (TR-08)
CREATE TABLE config_currencies (
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

CREATE TABLE config_cabin_classes (
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

CREATE TABLE config_meal_plans (
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

CREATE TABLE config_transfer_types (
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

CREATE TABLE config_visa_types (
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

CREATE TABLE config_destinations (
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

CREATE TABLE config_cancellation_reasons (
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

CREATE TABLE config_margin_retention_pct (
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

CREATE TABLE config_refund_methods (
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

CREATE TABLE config_visa_exemption_types (
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

CREATE TABLE config_alert_types (
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

CREATE TABLE config_tcs_rate (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rate          NUMERIC(5,4) NOT NULL DEFAULT 0.02,
  effective_from DATE NOT NULL,
  is_active     BOOLEAN DEFAULT true,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMP DEFAULT now()
);

CREATE TABLE config_gst_rate (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rate          NUMERIC(5,4) NOT NULL DEFAULT 0.18,
  effective_from DATE NOT NULL,
  is_active     BOOLEAN DEFAULT true,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMP DEFAULT now()
);

CREATE TABLE config_fx_risk_threshold (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  threshold_pct NUMERIC(5,4) NOT NULL DEFAULT 0.05,
  is_active     BOOLEAN DEFAULT true,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMP DEFAULT now()
);

CREATE TABLE config_default_margin_pct (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rate          NUMERIC(5,4) NOT NULL DEFAULT 0.12,
  is_active     BOOLEAN DEFAULT true,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE config_email_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR NOT NULL,
  code            VARCHAR UNIQUE NOT NULL,
  subject         VARCHAR NOT NULL,
  body            TEXT NOT NULL,
  variables       TEXT[],
  is_active       BOOLEAN DEFAULT true,
  used_in_pages   TEXT[],
  used_in_systems TEXT[],
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMP DEFAULT now(),
  updated_at      TIMESTAMP DEFAULT now()
);

-- Seed data (P1-08)
INSERT INTO config_currencies (name, code, sort_order, used_in_pages, used_in_systems) VALUES
('Indian Rupee', 'INR', 1, ARRAY['all'], ARRAY['Booking ERP']),
('US Dollar', 'USD', 2, ARRAY['all'], ARRAY['Booking ERP']),
('Thai Baht', 'THB', 3, ARRAY['all'], ARRAY['Booking ERP']),
('Euro', 'EUR', 4, ARRAY['all'], ARRAY['Booking ERP']),
('British Pound', 'GBP', 5, ARRAY['all'], ARRAY['Booking ERP']),
('UAE Dirham', 'AED', 6, ARRAY['all'], ARRAY['Booking ERP']);

INSERT INTO config_cabin_classes (name, code, sort_order, used_in_pages, used_in_systems) VALUES
('Economy', 'economy', 1, ARRAY['booking_flights'], ARRAY['Booking ERP']),
('Premium Economy', 'premium_economy', 2, ARRAY['booking_flights'], ARRAY['Booking ERP']),
('Business', 'business', 3, ARRAY['booking_flights'], ARRAY['Booking ERP']),
('First Class', 'first_class', 4, ARRAY['booking_flights'], ARRAY['Booking ERP']);

INSERT INTO config_meal_plans (name, code, sort_order, used_in_pages, used_in_systems) VALUES
('Room Only', 'ro', 1, ARRAY['booking_hotels'], ARRAY['Booking ERP']),
('Bed & Breakfast', 'bb', 2, ARRAY['booking_hotels'], ARRAY['Booking ERP']),
('Half Board', 'hb', 3, ARRAY['booking_hotels'], ARRAY['Booking ERP']),
('Full Board', 'fb', 4, ARRAY['booking_hotels'], ARRAY['Booking ERP']),
('All Inclusive', 'ai', 5, ARRAY['booking_hotels'], ARRAY['Booking ERP']);

INSERT INTO config_transfer_types (name, code, sort_order, used_in_pages, used_in_systems) VALUES
('Private', 'private', 1, ARRAY['booking_land'], ARRAY['Booking ERP']),
('Shared / SIC', 'sic', 2, ARRAY['booking_land'], ARRAY['Booking ERP']);

INSERT INTO config_cancellation_reasons (name, code, sort_order, used_in_pages, used_in_systems) VALUES
('Medical', 'medical', 1, ARRAY['cancellations'], ARRAY['Booking ERP']),
('Professional', 'professional', 2, ARRAY['cancellations'], ARRAY['Booking ERP']);

INSERT INTO config_refund_methods (name, code, sort_order, used_in_pages, used_in_systems) VALUES
('Credit Note', 'credit_note', 1, ARRAY['cancellations'], ARRAY['Booking ERP']),
('Source Account', 'source_account', 2, ARRAY['cancellations'], ARRAY['Booking ERP']);

INSERT INTO config_tcs_rate (rate, effective_from) VALUES (0.02, '2024-01-01');
INSERT INTO config_gst_rate (rate, effective_from) VALUES (0.18, '2024-01-01');
INSERT INTO config_fx_risk_threshold (threshold_pct) VALUES (0.05);
INSERT INTO config_default_margin_pct (rate)
SELECT 0.12 WHERE NOT EXISTS (SELECT 1 FROM config_default_margin_pct LIMIT 1);
-- P1-13 system_logs (before core indexes that reference it)

CREATE TABLE system_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type    VARCHAR NOT NULL,
  entity_type   VARCHAR NOT NULL,
  entity_id     UUID,
  actor_id      UUID REFERENCES users(id),
  actor_role    VARCHAR,
  before_state  JSONB,
  after_state   JSONB,
  metadata      JSONB,
  created_at    TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_system_logs_event_type ON system_logs(event_type);
CREATE INDEX idx_system_logs_entity ON system_logs(entity_type, entity_id);
CREATE INDEX idx_system_logs_actor ON system_logs(actor_id);
CREATE INDEX idx_system_logs_created ON system_logs(created_at DESC);
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

-- --- Phase 2 P2-01: invoice numbers (append after core bookings) ---
CREATE SEQUENCE IF NOT EXISTS bookings_invoice_number_seq
  AS INTEGER
  START WITH 1000001
  INCREMENT BY 1
  MINVALUE 1000001
  NO MAXVALUE
  CACHE 1;

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS invoice_number INTEGER;

UPDATE bookings
SET invoice_number = nextval('bookings_invoice_number_seq')
WHERE invoice_number IS NULL;

DO $$
DECLARE
  m integer;
BEGIN
  SELECT MAX(invoice_number) INTO m FROM bookings;
  IF m IS NULL THEN
    PERFORM setval('bookings_invoice_number_seq', 1000001, false);
  ELSE
    PERFORM setval('bookings_invoice_number_seq', m, true);
  END IF;
END $$;

ALTER TABLE bookings ALTER COLUMN invoice_number SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS bookings_invoice_number_key ON bookings (invoice_number);

CREATE OR REPLACE FUNCTION public.allocate_invoice_number()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT nextval('bookings_invoice_number_seq')::integer;
$$;

REVOKE ALL ON FUNCTION public.allocate_invoice_number() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.allocate_invoice_number() TO service_role;

-- P2-04 / P2-05 — fare rules text
ALTER TABLE booking_flights ADD COLUMN IF NOT EXISTS fare_rules TEXT;
ALTER TABLE booking_hotels ADD COLUMN IF NOT EXISTS fare_rules TEXT;

-- P2-11 — destination substring search for list API
CREATE OR REPLACE FUNCTION public.booking_ids_destination_search(p_term text, p_max integer DEFAULT 500)
RETURNS TABLE (id uuid)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT b.id
  FROM bookings b
  WHERE p_term IS NOT NULL
    AND btrim(p_term) <> ''
    AND EXISTS (
      SELECT 1
      FROM unnest(b.destination) AS d(elem)
      WHERE elem ILIKE '%' || btrim(p_term) || '%'
    )
  ORDER BY b.date_of_travel DESC
  LIMIT LEAST(COALESCE(NULLIF(p_max, 0), 500), 2000);
$$;

REVOKE ALL ON FUNCTION public.booking_ids_destination_search(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.booking_ids_destination_search(text, integer) TO service_role;

-- Non-primary traveller: nullable contact columns (see migration 009)
ALTER TABLE booking_travellers ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE booking_travellers ALTER COLUMN email DROP NOT NULL;
ALTER TABLE booking_travellers ALTER COLUMN emergency_contact_name DROP NOT NULL;
ALTER TABLE booking_travellers ALTER COLUMN emergency_contact_phone DROP NOT NULL;

-- Private storage: persistence uses file_path; signed URLs generated on read only
ALTER TABLE booking_documents ADD COLUMN IF NOT EXISTS file_path VARCHAR;
ALTER TABLE booking_documents ALTER COLUMN file_url DROP NOT NULL;

-- Strict decimal exchange rate rollout
ALTER TABLE booking_flights ADD COLUMN IF NOT EXISTS exchange_rate_decimal NUMERIC(10,4);
ALTER TABLE booking_hotels ADD COLUMN IF NOT EXISTS exchange_rate_decimal NUMERIC(10,4);
ALTER TABLE booking_land_items ADD COLUMN IF NOT EXISTS exchange_rate_decimal NUMERIC(10,4);
ALTER TABLE booking_visas ADD COLUMN IF NOT EXISTS exchange_rate_decimal NUMERIC(10,4);
ALTER TABLE supplier_tranches ADD COLUMN IF NOT EXISTS exchange_rate_decimal NUMERIC(10,4);

UPDATE booking_flights SET exchange_rate_decimal = COALESCE(exchange_rate_decimal, exchange_rate, 1);
UPDATE booking_hotels SET exchange_rate_decimal = COALESCE(exchange_rate_decimal, exchange_rate, 1);
UPDATE booking_land_items SET exchange_rate_decimal = COALESCE(exchange_rate_decimal, exchange_rate, 1);
UPDATE booking_visas SET exchange_rate_decimal = COALESCE(exchange_rate_decimal, exchange_rate, 1);
UPDATE supplier_tranches SET exchange_rate_decimal = COALESCE(exchange_rate_decimal, exchange_rate, 1);

ALTER TABLE booking_flights ALTER COLUMN exchange_rate_decimal SET DEFAULT 1;
ALTER TABLE booking_hotels ALTER COLUMN exchange_rate_decimal SET DEFAULT 1;
ALTER TABLE booking_land_items ALTER COLUMN exchange_rate_decimal SET DEFAULT 1;
ALTER TABLE booking_visas ALTER COLUMN exchange_rate_decimal SET DEFAULT 1;
ALTER TABLE supplier_tranches ALTER COLUMN exchange_rate_decimal SET DEFAULT 1;

ALTER TABLE booking_flights ALTER COLUMN exchange_rate_decimal SET NOT NULL;
ALTER TABLE booking_hotels ALTER COLUMN exchange_rate_decimal SET NOT NULL;
ALTER TABLE booking_land_items ALTER COLUMN exchange_rate_decimal SET NOT NULL;
ALTER TABLE booking_visas ALTER COLUMN exchange_rate_decimal SET NOT NULL;
ALTER TABLE supplier_tranches ALTER COLUMN exchange_rate_decimal SET NOT NULL;
