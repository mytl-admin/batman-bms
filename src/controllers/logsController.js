const { getSupabase } = require('../lib/supabase');
const { canAgentAccessBooking } = require('../utils/bookingScope');

async function listLogs(req, res) {
  const supabase = getSupabase();
  const {
    entity_type: entityType,
    entity_id: entityId,
    event_type: eventType,
    actor_id: actorId,
    from: fromTs,
    to: toTs,
    limit: limitStr,
    offset: offsetStr,
  } = req.query;

  const limit = Math.min(Number(limitStr) || 50, 200);
  const offset = Number(offsetStr) || 0;

  let q = supabase
    .from('system_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (entityType) q = q.eq('entity_type', entityType);
  if (entityId) q = q.eq('entity_id', entityId);
  if (eventType) q = q.eq('event_type', eventType);
  if (actorId) q = q.eq('actor_id', actorId);
  if (fromTs) q = q.gte('created_at', fromTs);
  if (toTs) q = q.lte('created_at', toTs);

  const { data, error } = await q;
  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to load logs' });
  }
  return res.json({ data: data || [], limit, offset });
}

async function listLogsForBooking(req, res) {
  const { booking_id: bookingId } = req.params;
  const supabase = getSupabase();

  const { data: booking, error: be } = await supabase
    .from('bookings')
    .select('id, case_owner_id, case_manager_id')
    .eq('id', bookingId)
    .maybeSingle();

  if (be) {
    console.error(be);
    return res.status(500).json({ error: 'Failed to load booking' });
  }
  if (!booking) {
    return res.status(404).json({ error: 'Not found' });
  }

  if (req.user.role === 'agent' && !canAgentAccessBooking(booking, req.user.id)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const { data, error } = await supabase
    .from('system_logs')
    .select('*')
    .eq('entity_id', bookingId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to load logs' });
  }

  return res.json(data || []);
}

module.exports = { listLogs, listLogsForBooking };
