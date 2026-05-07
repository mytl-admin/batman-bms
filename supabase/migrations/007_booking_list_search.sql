-- P2-11 — include destination text in bookings list search (ilike on any destination element).
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
