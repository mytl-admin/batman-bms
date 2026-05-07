const { getSupabase } = require('../lib/supabase');
const { canAgentAccessBooking } = require('../utils/bookingScope');

async function requireBookingAccess(req, res, next) {
  const { id } = req.params;
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('bookings')
    .select('id, case_owner_id, case_manager_id, date_of_travel')
    .eq('id', id)
    .maybeSingle();
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
  req.bookingScope = data;
  next();
}

module.exports = { requireBookingAccess };
