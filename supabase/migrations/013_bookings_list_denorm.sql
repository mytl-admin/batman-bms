-- Denormalized list fields: lead pax contact/name + traveller row count.
-- Kept in sync from booking_travellers via trigger (prod parity: same file on all envs).

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS lead_pax_phone VARCHAR;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS lead_pax_full_name VARCHAR;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS traveller_count INTEGER NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION sync_booking_denorm_for_booking(p_booking_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cnt INT;
BEGIN
  SELECT COUNT(*)::int INTO cnt FROM booking_travellers WHERE booking_id = p_booking_id;

  IF cnt = 0 THEN
    UPDATE bookings
    SET traveller_count = 0,
        lead_pax_phone = NULL,
        lead_pax_full_name = NULL,
        updated_at = now()
    WHERE id = p_booking_id;
    RETURN;
  END IF;

  UPDATE bookings b
  SET traveller_count = cnt,
      lead_pax_phone = lt.phone,
      lead_pax_full_name = lt.full_name,
      updated_at = now()
  FROM (
    SELECT t.phone, t.full_name
    FROM booking_travellers t
    WHERE t.booking_id = p_booking_id
    ORDER BY t.is_primary DESC NULLS LAST, t.sort_order ASC NULLS LAST, t.created_at ASC
    LIMIT 1
  ) lt
  WHERE b.id = p_booking_id;
END;
$$;

CREATE OR REPLACE FUNCTION sync_booking_lead_and_traveller_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bids UUID[];
  x UUID;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.booking_id IS DISTINCT FROM NEW.booking_id THEN
    bids := ARRAY[OLD.booking_id, NEW.booking_id];
  ELSIF TG_OP = 'DELETE' THEN
    bids := ARRAY[OLD.booking_id];
  ELSE
    bids := ARRAY[NEW.booking_id];
  END IF;

  FOREACH x IN ARRAY bids
  LOOP
    PERFORM sync_booking_denorm_for_booking(x);
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_booking_travellers_sync_booking ON booking_travellers;
CREATE TRIGGER trg_booking_travellers_sync_booking
AFTER INSERT OR UPDATE OR DELETE ON booking_travellers
FOR EACH ROW EXECUTE PROCEDURE sync_booking_lead_and_traveller_count();

-- Backfill existing rows
WITH agg AS (
  SELECT booking_id,
         COUNT(*)::int AS cnt
  FROM booking_travellers
  GROUP BY booking_id
),
lead_pick AS (
  SELECT DISTINCT ON (booking_id)
    booking_id,
    phone,
    full_name
  FROM booking_travellers
  ORDER BY booking_id, is_primary DESC NULLS LAST, sort_order ASC NULLS LAST, created_at ASC
)
UPDATE bookings b
SET traveller_count = agg.cnt,
    lead_pax_phone = lp.phone,
    lead_pax_full_name = lp.full_name,
    updated_at = now()
FROM agg
JOIN lead_pick lp ON lp.booking_id = agg.booking_id
WHERE b.id = agg.booking_id;

UPDATE bookings b
SET traveller_count = 0,
    lead_pax_phone = NULL,
    lead_pax_full_name = NULL,
    updated_at = now()
WHERE NOT EXISTS (SELECT 1 FROM booking_travellers t WHERE t.booking_id = b.id);
