-- P2-04 / P2-05 — fare / cancellation policy text on line items
ALTER TABLE booking_flights ADD COLUMN IF NOT EXISTS fare_rules TEXT;
ALTER TABLE booking_hotels ADD COLUMN IF NOT EXISTS fare_rules TEXT;
