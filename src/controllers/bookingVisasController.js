const { getSupabase } = require('../lib/supabase');
const { visaDerived, lineItemCount, refreshVisaApplicantTotals } = require('../utils/lineItemShared');

function log(req) {
  return req.app.locals.logService;
}

const VISA_KEYS = [
  'is_self_arranged',
  'country',
  'visa_type',
  'supplier_id',
  'cost_per_applicant',
  'currency',
  'exchange_rate',
  'is_refundable',
  'supplier_full_refund_till',
  'sort_order',
];

function pickVisa(body) {
  const o = {};
  for (const k of VISA_KEYS) {
    if (body[k] !== undefined) {
      o[k] = body[k];
    }
  }
  return o;
}

async function list(req, res) {
  const supabase = getSupabase();
  const bid = req.params.id;
  const { data: visas, error } = await supabase
    .from('booking_visas')
    .select('*')
    .eq('booking_id', bid)
    .order('sort_order', { ascending: true });
  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to list visas' });
  }
  const ids = (visas || []).map((v) => v.id);
  let apps = [];
  if (ids.length) {
    const { data: a } = await supabase.from('booking_visa_applicants').select('*').in('visa_id', ids);
    apps = a || [];
  }
  const byVisa = {};
  for (const x of apps) {
    if (!byVisa[x.visa_id]) {
      byVisa[x.visa_id] = [];
    }
    byVisa[x.visa_id].push(x);
  }
  return res.json((visas || []).map((v) => ({ ...v, applicants: byVisa[v.id] || [] })));
}

async function create(req, res) {
  const supabase = getSupabase();
  const bid = req.params.id;
  const body = pickVisa(req.body || {});
  const derived = visaDerived({ ...body, number_of_applicants: 0 });
  const { count } = await supabase.from('booking_visas').select('*', { count: 'exact', head: true }).eq('booking_id', bid);
  const row = {
    booking_id: bid,
    is_self_arranged: Boolean(body.is_self_arranged),
    country: body.country ?? null,
    visa_type: body.visa_type ?? null,
    supplier_id: body.supplier_id || null,
    cost_per_applicant: body.cost_per_applicant != null ? Number(body.cost_per_applicant) : 0,
    number_of_applicants: 0,
    total_cost: 0,
    currency: body.currency ?? 'INR',
    exchange_rate_decimal: body.exchange_rate != null ? Number(body.exchange_rate) : 1,
    is_refundable: Boolean(body.is_refundable),
    supplier_full_refund_till: body.supplier_full_refund_till != null ? String(body.supplier_full_refund_till).slice(0, 10) : null,
    our_full_refund_till: derived.our_full_refund_till,
    inr_equivalent: derived.inr_equivalent,
    sort_order: body.sort_order != null ? Number(body.sort_order) : count || 0,
  };

  const { data: created, error } = await supabase.from('booking_visas').insert(row).select('*').single();
  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to create visa' });
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
    after_state: { visa_id: created.id },
    metadata: { section: 'visas' },
  });

  return res.status(201).json(created);
}

async function patch(req, res) {
  const supabase = getSupabase();
  const bid = req.params.id;
  const vid = req.params.visaId;
  const { data: existing, error: fe } = await supabase.from('booking_visas').select('*').eq('id', vid).eq('booking_id', bid).maybeSingle();
  if (fe || !existing) {
    return res.status(404).json({ error: 'Not found' });
  }
  const merged = { ...existing, ...pickVisa(req.body || {}) };
  const { count } = await supabase.from('booking_visa_applicants').select('*', { count: 'exact', head: true }).eq('visa_id', vid);
  const n = count || 0;
  const derived = visaDerived({ ...merged, number_of_applicants: n });
  const patch = {
    ...pickVisa(req.body || {}),
    number_of_applicants: n,
    total_cost: derived.total_cost,
    inr_equivalent: derived.inr_equivalent,
    our_full_refund_till: derived.our_full_refund_till,
    updated_at: new Date().toISOString(),
  };
  for (const k of Object.keys(patch)) {
    if (patch[k] === undefined) {
      delete patch[k];
    }
  }

  const { data: updated, error: ue } = await supabase.from('booking_visas').update(patch).eq('id', vid).select('*').single();
  if (ue) {
    console.error(ue);
    return res.status(500).json({ error: 'Failed to update visa' });
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
    before_state: { visa: existing.id },
    after_state: { visa: updated.id },
    metadata: { section: 'visas' },
  });

  return res.json(updated);
}

async function remove(req, res) {
  const supabase = getSupabase();
  const bid = req.params.id;
  const vid = req.params.visaId;
  if ((await lineItemCount(supabase, bid)) <= 1) {
    return res.status(400).json({ error: 'Cannot remove the only line item on the booking' });
  }
  const { error } = await supabase.from('booking_visas').delete().eq('id', vid).eq('booking_id', bid);
  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to delete visa' });
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
    before_state: { visa_removed: vid },
    after_state: null,
    metadata: { section: 'visas' },
  });
  return res.status(204).send();
}

async function addApplicant(req, res) {
  const supabase = getSupabase();
  const bid = req.params.id;
  const vid = req.params.visaId;
  const { traveller_id: travellerId } = req.body || {};
  if (!travellerId) {
    return res.status(400).json({ error: 'traveller_id is required' });
  }

  const { data: visa } = await supabase.from('booking_visas').select('id').eq('id', vid).eq('booking_id', bid).maybeSingle();
  if (!visa) {
    return res.status(404).json({ error: 'Visa not found' });
  }
  const { data: tr } = await supabase.from('booking_travellers').select('id').eq('id', travellerId).eq('booking_id', bid).maybeSingle();
  if (!tr) {
    return res.status(400).json({ error: 'Traveller not on this booking' });
  }

  const { error } = await supabase.from('booking_visa_applicants').insert({ visa_id: vid, traveller_id: travellerId });
  if (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Applicant already linked' });
    }
    console.error(error);
    return res.status(500).json({ error: 'Failed to link applicant' });
  }

  await refreshVisaApplicantTotals(supabase, vid);
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
    after_state: { visa_applicant: { visa_id: vid, traveller_id: travellerId } },
    metadata: { section: 'visas' },
  });

  const { data: row } = await supabase.from('booking_visas').select('*').eq('id', vid).single();
  return res.status(201).json(row);
}

async function removeApplicant(req, res) {
  const supabase = getSupabase();
  const bid = req.params.id;
  const vid = req.params.visaId;
  const tid = req.params.travellerId;

  const { error } = await supabase
    .from('booking_visa_applicants')
    .delete()
    .eq('visa_id', vid)
    .eq('traveller_id', tid);
  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to remove applicant' });
  }

  await refreshVisaApplicantTotals(supabase, vid);
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
    before_state: { visa_applicant_removed: { visa_id: vid, traveller_id: tid } },
    after_state: null,
    metadata: { section: 'visas' },
  });

  const { data: row } = await supabase.from('booking_visas').select('*').eq('id', vid).single();
  return res.json(row);
}

module.exports = { list, create, patch, remove, addApplicant, removeApplicant };
