-- Soft-delete for booking line items: API uses is_active = false; never hard-delete.

ALTER TABLE booking_flights ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE booking_hotels ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE booking_land_items ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE booking_visas ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

UPDATE booking_flights SET is_active = true WHERE is_active IS NULL;
UPDATE booking_hotels SET is_active = true WHERE is_active IS NULL;
UPDATE booking_land_items SET is_active = true WHERE is_active IS NULL;
UPDATE booking_visas SET is_active = true WHERE is_active IS NULL;

ALTER TABLE booking_flights ALTER COLUMN is_active SET DEFAULT true;
ALTER TABLE booking_hotels ALTER COLUMN is_active SET DEFAULT true;
ALTER TABLE booking_land_items ALTER COLUMN is_active SET DEFAULT true;
ALTER TABLE booking_visas ALTER COLUMN is_active SET DEFAULT true;

ALTER TABLE booking_flights ALTER COLUMN is_active SET NOT NULL;
ALTER TABLE booking_hotels ALTER COLUMN is_active SET NOT NULL;
ALTER TABLE booking_land_items ALTER COLUMN is_active SET NOT NULL;
ALTER TABLE booking_visas ALTER COLUMN is_active SET NOT NULL;
