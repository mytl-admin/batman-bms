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
