const { getSupabase } = require('../lib/supabase');
const { createDocumentVersion } = require('../services/documentService');
const { enrichDocumentsWithSignedUrls } = require('../lib/documentsStorage');
const { normalizeTime, flightDerived, lineItemCount } = require('../utils/lineItemShared');
const {
  supabaseErrorMessage,
  omitFareRules,
  isMissingFareRulesColumnError,
  insertBookingLineItemWithFareRulesFallback,
} = require('../utils/supabaseErrors');

function log(req) {
  return req.app.locals.logService;
}

const FLIGHT_KEYS = [
  'is_self_booked',
  'sector_from',
  'sector_to',
  'supplier_id',
  'travel_date',
  'departure_time',
  'cabin_class',
  'baggage_allowance',
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

function pickFlight(body) {
  const o = {};
  for (const k of FLIGHT_KEYS) {
    if (body[k] !== undefined) {
      o[k] = body[k];
    }
  }
  return o;
}

async function list(req, res) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('booking_flights')
    .select('*')
    .eq('booking_id', req.params.id)
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
    const body = pickFlight(req.body || {});
    const derived = flightDerived({ ...body });
    const { count } = await supabase.from('booking_flights').select('*', { count: 'exact', head: true }).eq('booking_id', bid);
    /* fare_rules: column added in supabase/migrations/006_phase2_fare_rules.sql */
    const row = {
      booking_id: bid,
      is_self_booked: Boolean(body.is_self_booked),
      sector_from: body.sector_from ?? null,
      sector_to: body.sector_to ?? null,
      supplier_id: body.supplier_id || null,
      travel_date: body.travel_date != null ? String(body.travel_date).slice(0, 10) : null,
      departure_time: normalizeTime(body.departure_time),
      cabin_class: body.cabin_class ?? null,
      baggage_allowance: body.baggage_allowance ?? null,
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
      ...derived,
    };

    const { data: created, error } = await insertBookingLineItemWithFareRulesFallback(supabase, 'booking_flights', row);
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
      after_state: { flight_id: created.id },
      metadata: { section: 'flights' },
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
    const fid = req.params.flightId;
    const { data: existing, error: fe } = await supabase.from('booking_flights').select('*').eq('id', fid).eq('booking_id', bid).maybeSingle();
    if (fe) {
      console.error(fe);
      return res.status(500).json({ error: supabaseErrorMessage(fe) });
    }
    if (!existing) {
      return res.status(404).json({ error: 'Not found' });
    }

    const merged = { ...existing, ...pickFlight(req.body || {}) };
    const derived = flightDerived({ ...merged });
    const patchPayload = {
      ...pickFlight(req.body || {}),
      ...derived,
      departure_time: merged.departure_time != null ? normalizeTime(merged.departure_time) : existing.departure_time,
      updated_at: new Date().toISOString(),
    };
    for (const k of Object.keys(patchPayload)) {
      if (patchPayload[k] === undefined) {
        delete patchPayload[k];
      }
    }

    let { data: updated, error: ue } = await supabase.from('booking_flights').update(patchPayload).eq('id', fid).select('*').single();
    if (ue && isMissingFareRulesColumnError(ue)) {
      ({ data: updated, error: ue } = await supabase
        .from('booking_flights')
        .update(omitFareRules(patchPayload))
        .eq('id', fid)
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
      before_state: { flight: existing.id },
      after_state: { flight: updated.id },
      metadata: { section: 'flights', patch: Object.keys(patchPayload) },
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
    const fid = req.params.flightId;
    const n = await lineItemCount(supabase, bid);
    if (n <= 1) {
      return res.status(400).json({ error: 'Cannot remove the only line item on the booking' });
    }

    const { error } = await supabase.from('booking_flights').delete().eq('id', fid).eq('booking_id', bid);
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
      before_state: { flight_removed: fid },
      after_state: null,
      metadata: { section: 'flights' },
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
    const flightId = req.params.flightId;
    const supabase = getSupabase();
    const { data: fl } = await supabase.from('booking_flights').select('id').eq('id', flightId).eq('booking_id', bid).maybeSingle();
    if (!fl) {
      return res.status(404).json({ error: 'Flight not found' });
    }
    const row = await createDocumentVersion({
      bookingId: bid,
      entityType: 'flight',
      entityId: flightId,
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
    .eq('entity_type', 'flight')
    .eq('entity_id', req.params.flightId)
    .order('version', { ascending: false });
  if (error) {
    console.error(error);
    return res.status(500).json({ error: supabaseErrorMessage(error) });
  }
  const payload = await enrichDocumentsWithSignedUrls(data || []);
  return res.json(payload);
}

module.exports = { list, create, patch, remove, uploadDoc, listDocs };
