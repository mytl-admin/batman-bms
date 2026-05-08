const { getSupabase } = require('../lib/supabase');
const { canAgentAccessBooking } = require('../utils/bookingScope');

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function requireBookingAccess(req, res, next) {
  const { id } = req.params;
  const supabase = getSupabase();
  let query = supabase.from('bookings').select('id, case_owner_id, case_manager_id, date_of_travel');
  query = UUID_RE.test(String(id)) ? query.eq('id', id) : query.eq('booking_code', id);
  const { data, error } = await query.maybeSingle();
  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to load booking' });
  }
  if (!data) {
    return res.status(404).json({ error: 'Not found' });
  }
  if (req.user.role === 'agent' && !canAgentAccessBooking(data, req.user.id)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  // Normalize downstream nested routes to canonical booking UUID.
  req.params.id = data.id;
  req.bookingScope = data;
  next();
}

module.exports = { requireBookingAccess };
