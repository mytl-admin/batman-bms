const { getSupabase } = require('../lib/supabase');
const { landDerived, lineItemCount, fetchBookingTotalCostPrice } = require('../utils/lineItemShared');

function log(req) {
  return req.app.locals.logService;
}

const LAND_KEYS = [
  'sub_item_type',
  'description',
  'supplier_id',
  'transfer_type',
  'date',
  'cost',
  'currency',
  'exchange_rate',
  'is_refundable',
  'supplier_full_refund_till',
  'partial_refund_pct',
  'supplier_partial_refund_till',
  'sort_order',
];

function normalizeTransferType(v) {
  if (v == null || String(v).trim() === '') return null;
  const s = String(v).trim().toLowerCase();
  if (s === 'shared') return 'sic';
  return s;
}

function pickLand(body) {
  const o = {};
  for (const k of LAND_KEYS) {
    if (body[k] !== undefined) {
      o[k] = body[k];
    }
  }
  return o;
}

async function list(req, res) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('booking_land_items')
    .select('*')
    .eq('booking_id', req.params.id)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to list land items' });
  }
  return res.json(data || []);
}

async function create(req, res) {
  const supabase = getSupabase();
  const bid = req.params.id;
  const body = pickLand(req.body || {});
  if (!body.sub_item_type || !body.description) {
    return res.status(400).json({ error: 'sub_item_type and description are required' });
  }
  const validTypes = ['airport_transfer', 'hotel_transfer', 'sightseeing'];
  if (!validTypes.includes(String(body.sub_item_type))) {
    return res.status(400).json({ error: 'invalid sub_item_type' });
  }
  const derived = landDerived({ ...body });
  const { count } = await supabase
    .from('booking_land_items')
    .select('*', { count: 'exact', head: true })
    .eq('booking_id', bid)
    .eq('is_active', true);
  const row = {
    booking_id: bid,
    sub_item_type: body.sub_item_type,
    description: String(body.description).trim(),
    supplier_id: body.supplier_id || null,
    transfer_type: normalizeTransferType(body.transfer_type),
    date: body.date != null ? String(body.date).slice(0, 10) : null,
    cost: body.cost != null ? Number(body.cost) : 0,
    currency: body.currency ?? 'INR',
    exchange_rate_decimal: body.exchange_rate != null ? Number(body.exchange_rate) : 1,
    is_refundable: Boolean(body.is_refundable),
    supplier_full_refund_till: body.supplier_full_refund_till != null ? String(body.supplier_full_refund_till).slice(0, 10) : null,
    partial_refund_pct: body.partial_refund_pct != null ? Number(body.partial_refund_pct) : null,
    supplier_partial_refund_till:
      body.supplier_partial_refund_till != null ? String(body.supplier_partial_refund_till).slice(0, 10) : null,
    sort_order: body.sort_order != null ? Number(body.sort_order) : count || 0,
    is_active: true,
    ...derived,
  };

  const { data: created, error } = await supabase.from('booking_land_items').insert(row).select('*').single();
  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to create land item' });
  }

  try {
    const { runBookingRecalc } = require('../services/bookingRecalc');
    await runBookingRecalc(bid, { regenGuestTranches: true });
  } catch (e) {
    console.error(e);
  }

  await log(req).log({
    event_type: 'BOOKING_UPDATED',
    entity_type: 'booking',
    entity_id: bid,
    actor_id: req.user.id,
    actor_role: req.user.role,
    before_state: null,
    after_state: { land_item_id: created.id },
    metadata: { section: 'land' },
  });

  return res.status(201).json(created);
}

async function patch(req, res) {
  const supabase = getSupabase();
  const bid = req.params.id;
  const iid = req.params.itemId;
  const { data: existing, error: fe } = await supabase
    .from('booking_land_items')
    .select('*')
    .eq('id', iid)
    .eq('booking_id', bid)
    .eq('is_active', true)
    .maybeSingle();
  if (fe || !existing) {
    return res.status(404).json({ error: 'Not found' });
  }
  const merged = { ...existing, ...pickLand(req.body || {}) };
  const derived = landDerived({ ...merged });
  const patch = {
    ...pickLand(req.body || {}),
    ...derived,
    updated_at: new Date().toISOString(),
  };
  if (patch.transfer_type !== undefined) {
    patch.transfer_type = normalizeTransferType(patch.transfer_type);
  }
  for (const k of Object.keys(patch)) {
    if (patch[k] === undefined) {
      delete patch[k];
    }
  }

  const { data: updated, error: ue } = await supabase.from('booking_land_items').update(patch).eq('id', iid).select('*').single();
  if (ue) {
    console.error(ue);
    return res.status(500).json({ error: 'Failed to update land item' });
  }

  try {
    const { runBookingRecalc } = require('../services/bookingRecalc');
    await runBookingRecalc(bid, { regenGuestTranches: true });
  } catch (e) {
    console.error(e);
  }

  await log(req).log({
    event_type: 'BOOKING_UPDATED',
    entity_type: 'booking',
    entity_id: bid,
    actor_id: req.user.id,
    actor_role: req.user.role,
    before_state: { land_item: existing.id },
    after_state: { land_item: updated.id },
    metadata: { section: 'land' },
  });

  return res.json(updated);
}

async function remove(req, res) {
  const supabase = getSupabase();
  const bid = req.params.id;
  const iid = req.params.itemId;
  if ((await lineItemCount(supabase, bid)) <= 1) {
    return res.status(400).json({ error: 'Cannot remove the only line item on the booking' });
  }

  let beforeTotalCostPrice;
  try {
    beforeTotalCostPrice = await fetchBookingTotalCostPrice(supabase, bid);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e?.message || String(e) });
  }

  const { data: deactivated, error } = await supabase
    .from('booking_land_items')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', iid)
    .eq('booking_id', bid)
    .eq('is_active', true)
    .select('id');
  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to deactivate land item' });
  }
  if (!deactivated?.length) {
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    const { runBookingRecalc } = require('../services/bookingRecalc');
    await runBookingRecalc(bid, { regenGuestTranches: true });
  } catch (e) {
    console.error(e);
  }

  let afterTotalCostPrice;
  try {
    afterTotalCostPrice = await fetchBookingTotalCostPrice(supabase, bid);
  } catch (e) {
    console.error(e);
    afterTotalCostPrice = null;
  }

  await log(req).log({
    event_type: 'BOOKING_UPDATED',
    entity_type: 'booking',
    entity_id: bid,
    actor_id: req.user.id,
    actor_role: req.user.role,
    before_state: { total_cost_price: beforeTotalCostPrice },
    after_state: { total_cost_price: afterTotalCostPrice },
    metadata: { section: 'land', deactivated_land_item_id: iid },
  });
  return res.status(204).send();
}

module.exports = { list, create, patch, remove };
