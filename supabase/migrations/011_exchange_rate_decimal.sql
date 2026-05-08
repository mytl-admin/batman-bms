-- Strict decimal exchange rate rollout.
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
