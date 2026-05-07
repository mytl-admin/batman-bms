-- P2-01 — Sequential invoice numbers + atomic allocation (Phase 2)

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
