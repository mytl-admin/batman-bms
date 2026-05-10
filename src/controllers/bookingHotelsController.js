const { getSupabase } = require('../lib/supabase');
const { createDocumentVersion } = require('../services/documentService');
const { enrichDocumentsWithSignedUrls } = require('../lib/documentsStorage');
const { hotelDerived, lineItemCount, fetchBookingTotalCostPrice } = require('../utils/lineItemShared');
const {
  supabaseErrorMessage,
  omitFareRules,
  isMissingFareRulesColumnError,
  insertBookingLineItemWithFareRulesFallback,
} = require('../utils/supabaseErrors');

function log(req) {
  return req.app.locals.logService;
}

const HOTEL_KEYS = [
  'is_self_booked',
  'property_name',
  'supplier_id',
  'city',
  'check_in_date',
  'check_out_date',
  'nights',
  'room_type',
  'meal_plan',
  'cost',
  'currency',
  'exchange_rate',
  'is_refundable',
  'supplier_full_refund_till',
  'partial_refund_pct',
  'supplier_partial_refund_till',
  'fare_rules',
  'sort_order',
];

function pickHotel(body) {
  const o = {};
  for (const k of HOTEL_KEYS) {
    if (body[k] !== undefined) {
      o[k] = body[k];
    }
  }
  return o;
}

async function list(req, res) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('booking_hotels')
    .select('*')
    .eq('booking_id', req.params.id)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) {
    console.error(error);
    return res.status(500).json({ error: supabaseErrorMessage(error) });
  }
  return res.json(data || []);
}

async function create(req, res) {
  try {
    const supabase = getSupabase();
    const bid = req.params.id;
    const body = pickHotel(req.body || {});
    const cin = body.check_in_date != null ? String(body.check_in_date).slice(0, 10) : null;
    const cout = body.check_out_date != null ? String(body.check_out_date).slice(0, 10) : null;
    const derived = hotelDerived({ ...body, check_in_date: cin, check_out_date: cout });
    const { count } = await supabase
      .from('booking_hotels')
      .select('*', { count: 'exact', head: true })
      .eq('booking_id', bid)
      .eq('is_active', true);
    /* fare_rules: column added in supabase/migrations/006_phase2_fare_rules.sql */
    const row = {
      booking_id: bid,
      is_self_booked: Boolean(body.is_self_booked),
      property_name: body.property_name ?? null,
      supplier_id: body.supplier_id || null,
      city: body.city ?? null,
      check_in_date: cin,
      check_out_date: cout,
      nights: derived.nights,
      room_type: body.room_type ?? null,
      meal_plan: body.meal_plan ?? null,
      cost: body.cost != null ? Number(body.cost) : null,
      currency: body.currency ?? 'INR',
      exchange_rate_decimal: body.exchange_rate != null ? Number(body.exchange_rate) : 1,
      is_refundable: Boolean(body.is_refundable),
      supplier_full_refund_till: body.supplier_full_refund_till != null ? String(body.supplier_full_refund_till).slice(0, 10) : null,
      partial_refund_pct: body.partial_refund_pct != null ? Number(body.partial_refund_pct) : null,
      supplier_partial_refund_till:
        body.supplier_partial_refund_till != null ? String(body.supplier_partial_refund_till).slice(0, 10) : null,
      fare_rules: body.fare_rules != null ? String(body.fare_rules) : null,
      sort_order: count ?? 0,
      is_active: true,
      inr_equivalent: derived.inr_equivalent,
      our_full_refund_till: derived.our_full_refund_till,
      our_partial_refund_till: derived.our_partial_refund_till,
    };

    const { data: created, error } = await insertBookingLineItemWithFareRulesFallback(supabase, 'booking_hotels', row);
    if (error) {
      console.error(error);
      return res.status(500).json({ error: supabaseErrorMessage(error) });
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
      after_state: { hotel_id: created.id },
      metadata: { section: 'hotels' },
    });

    return res.status(201).json(created);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e?.message || String(e) });
  }
}

async function patch(req, res) {
  try {
    const supabase = getSupabase();
    const bid = req.params.id;
    const hid = req.params.hotelId;
    const { data: existing, error: fe } = await supabase
      .from('booking_hotels')
      .select('*')
      .eq('id', hid)
      .eq('booking_id', bid)
      .eq('is_active', true)
      .maybeSingle();
    if (fe) {
      console.error(fe);
      return res.status(500).json({ error: supabaseErrorMessage(fe) });
    }
    if (!existing) {
      return res.status(404).json({ error: 'Not found' });
    }
    const merged = { ...existing, ...pickHotel(req.body || {}) };
    const derived = hotelDerived({ ...merged });
    const patchPayload = {
      ...pickHotel(req.body || {}),
      inr_equivalent: derived.inr_equivalent,
      our_full_refund_till: derived.our_full_refund_till,
      our_partial_refund_till: derived.our_partial_refund_till,
      nights: derived.nights,
      updated_at: new Date().toISOString(),
    };
    for (const k of Object.keys(patchPayload)) {
      if (patchPayload[k] === undefined) {
        delete patchPayload[k];
      }
    }

    let { data: updated, error: ue } = await supabase.from('booking_hotels').update(patchPayload).eq('id', hid).select('*').single();
    if (ue && isMissingFareRulesColumnError(ue)) {
      ({ data: updated, error: ue } = await supabase
        .from('booking_hotels')
        .update(omitFareRules(patchPayload))
        .eq('id', hid)
        .select('*')
        .single());
    }
    if (ue) {
      console.error(ue);
      return res.status(500).json({ error: supabaseErrorMessage(ue) });
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
      before_state: { hotel: existing.id },
      after_state: { hotel: updated.id },
      metadata: { section: 'hotels', patch: Object.keys(patchPayload) },
    });

    return res.json(updated);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e?.message || String(e) });
  }
}

async function remove(req, res) {
  try {
    const supabase = getSupabase();
    const bid = req.params.id;
    const hid = req.params.hotelId;
    if ((await lineItemCount(supabase, bid)) <= 1) {
      return res.status(400).json({ error: 'Cannot remove the only line item on the booking' });
    }

    let beforeTotalCostPrice;
    try {
      beforeTotalCostPrice = await fetchBookingTotalCostPrice(supabase, bid);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: supabaseErrorMessage(e) });
    }

    const { data: deactivated, error } = await supabase
      .from('booking_hotels')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', hid)
      .eq('booking_id', bid)
      .eq('is_active', true)
      .select('id');
    if (error) {
      console.error(error);
      return res.status(500).json({ error: supabaseErrorMessage(error) });
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
      metadata: { section: 'hotels', deactivated_hotel_id: hid },
    });
    return res.status(204).send();
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e?.message || String(e) });
  }
}

async function uploadDoc(req, res) {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'file is required' });
    }
    const bid = req.params.id;
    const hotelId = req.params.hotelId;
    const supabase = getSupabase();
    const { data: h } = await supabase.from('booking_hotels').select('id').eq('id', hotelId).eq('booking_id', bid).maybeSingle();
    if (!h) {
      return res.status(404).json({ error: 'Hotel not found' });
    }
    const row = await createDocumentVersion({
      bookingId: bid,
      entityType: 'hotel',
      entityId: hotelId,
      documentType: req.body.document_type || 'other',
      description: req.body.description || null,
      fileBuffer: file.buffer,
      originalName: file.originalname,
      contentType: file.mimetype,
      userId: req.user.id,
      logService: req.app.locals.logService,
      req,
    });
    return res.status(201).json(row);
  } catch (e) {
    if (e.status === 503 || e.status === 502) {
      return res.status(e.status).json({ error: e.message });
    }
    console.error(e);
    return res.status(500).json({ error: e?.message || String(e) });
  }
}

async function listDocs(req, res) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('booking_documents')
    .select('*')
    .eq('booking_id', req.params.id)
    .eq('entity_type', 'hotel')
    .eq('entity_id', req.params.hotelId)
    .order('version', { ascending: false });
  if (error) {
    console.error(error);
    return res.status(500).json({ error: supabaseErrorMessage(error) });
  }
  const payload = await enrichDocumentsWithSignedUrls(data || []);
  return res.json(payload);
}

module.exports = { list, create, patch, remove, uploadDoc, listDocs };
