/**
 * P1-14 — booking visibility for agents vs admins (Supabase PostgREST filter helpers).
 * Admins: no extra filter. Agents: bookings where they are case owner or case manager.
 */
function bookingsAgentOrFilter(agentUserId) {
  if (!agentUserId) return null;
  return `case_owner_id.eq.${agentUserId},case_manager_id.eq.${agentUserId}`;
}

function canAgentAccessBooking(booking, agentUserId) {
  if (!booking || !agentUserId) return false;
  return booking.case_owner_id === agentUserId || booking.case_manager_id === agentUserId;
}

module.exports = { bookingsAgentOrFilter, canAgentAccessBooking };
