const { getSupabase } = require('../lib/supabase');
const { bookingsAgentOrFilter, canAgentAccessBooking } = require('../utils/bookingScope');
const { createBookingFromPayload } = require('../services/bookingCreateService');
const { enrichBookingListRows, matchesDerivedListFilters } = require('../services/bookingListEnrichment');
const { hydrateBookingDetail } = require('../services/bookingDetailExtras');
const { daysUntilTravel } = require('../utils/dateHelpers');

function getLogService(req) {
  return req.app.locals.logService;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Default list: single round-trip, no per-row enrichment (see enrichBookingListRows). */
const LIST_SELECT_SLIM =
  'id, booking_code, lead_pax_full_name, lead_pax_phone, destination, traveller_count, date_of_travel, created_at, is_nrf, status';

/** When payment_status / doc_status filters require derived fields from enrichment. */
const LIST_SELECT_WITH_DERIVED_ENRICHMENT =
  `${LIST_SELECT_SLIM}, invoice_number, customer_name, return_date, case_owner_id, case_manager_id, total_payable, adults, children`;

function shapeBookingListRow(row) {
  if (!row || typeof row !== 'object') {
    return row;
  }
  return row;
}

const DETAIL_SELECT = `
  *,
  booking_travellers (*),
  booking_flights (*),
  booking_hotels (*),
  booking_land_items (*),
  booking_visas (*),
  booking_pan_cards (*),
  booking_documents (*),
  supplier_tranches (*),
  guest_tranches (*),
  fx_risk_flags (*)
`;

function parseLimitOffset(query) {
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  const offset = Math.max(Number(query.offset) || 0, 0);
  return { limit, offset };
}

function escapeOrToken(s) {
  return String(s).trim().replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/,/g, '\\,');
}

/** Set LIST_TIMING=1 for GET /api/bookings diagnostic console.time logs (dev only). */
function listTimingOn() {
  return process.env.LIST_TIMING === '1';
}

function buildBookingListQuery(supabase, req, countMode, listSelect) {
  const selectCols = listSelect || LIST_SELECT_SLIM;
  const {
    status,
    destination,
    from_date: fromDate,
    to_date: toDate,
    travel_from: travelFrom,
    travel_to: travelTo,
    owner_id: ownerId,
  } = req.query;

  let q =
    countMode === 'exact'
      ? supabase.from('bookings').select(selectCols, { count: 'exact' })
      : supabase.from('bookings').select(selectCols);

  const sortAscending = String(req.query.sort_dir || '')
    .toLowerCase()
    .trim() === 'asc';
  q = q.order('created_at', { ascending: sortAscending });

  if (req.user.role === 'agent') {
    const orFilter = bookingsAgentOrFilter(req.user.id);
    if (orFilter) {
      q = q.or(orFilter);
    }
  }

  if (ownerId != null && String(ownerId).trim() !== '') {
    if (!UUID_RE.test(String(ownerId))) {
      const e = new Error('owner_id must be a valid UUID');
      e.status = 400;
      throw e;
    }
    q = q.eq('case_owner_id', String(ownerId));
  }

  if (status) {
    q = q.eq('status', String(status));
  }

  const dotFrom = fromDate || travelFrom;
  const dotTo = toDate || travelTo;
  if (dotFrom) {
    q = q.gte('date_of_travel', String(dotFrom).slice(0, 10));
  }
  if (dotTo) {
    q = q.lte('date_of_travel', String(dotTo).slice(0, 10));
  }

  if (destination) {
    q = q.contains('destination', [String(destination).trim()]);
  }

  return q;
}

/**
 * PostgREST builders are thenable: returning them from an async function causes
 * Promise resolution to run the query early. Always return `{ query }` so callers
 * keep a real builder for `.range()` / further chaining.
 */
async function applySearchOr(supabase, q, searchRaw) {
  if (!searchRaw || !String(searchRaw).trim()) {
    return { query: q };
  }
  const raw = String(searchRaw).trim();
  const p = `%${escapeOrToken(raw)}%`;
  let destIds = [];
  if (listTimingOn()) {
    console.time('GET /api/bookings applySearchOr.rpc');
  }
  try {
    const { data, error } = await supabase.rpc('booking_ids_destination_search', {
      p_term: raw,
      p_max: 500,
    });
    if (!error && data?.length) {
      destIds = data
        .map((row) => (row && typeof row === 'object' && row.id != null ? row.id : row))
        .filter((id) => id != null && UUID_RE.test(String(id)));
    }
  } catch {
    /* migration not applied yet */
  } finally {
    if (listTimingOn()) {
      console.timeEnd('GET /api/bookings applySearchOr.rpc');
    }
  }
  const orParts = [
    `customer_name.ilike.${p}`,
    `booking_code.ilike.${p}`,
    `lead_pax_full_name.ilike.${p}`,
    `lead_pax_phone.ilike.${p}`,
  ];
  if (destIds.length > 0) {
    orParts.push(`id.in.(${destIds.join(',')})`);
  }
  return { query: q.or(orParts.join(',')) };
}

async function list(req, res) {
  const LT = listTimingOn();
  if (LT) {
    console.time('GET /api/bookings total');
  }
  try {
    const supabase = getSupabase();
    const { limit, offset } = parseLimitOffset(req.query);
    const paymentStatus = req.query.payment_status;
    const docStatus = req.query.doc_status;
    const needsDerived =
      (paymentStatus != null && String(paymentStatus).trim() !== '') ||
      (docStatus != null && String(docStatus).trim() !== '');

    if (LT) {
      /* eslint-disable-next-line no-console */
      console.log('[LIST_TIMING]', {
        limit,
        offset,
        needsDerived,
        hasSearch: Boolean(req.query.search && String(req.query.search).trim()),
      });
    }

    if (!needsDerived) {
      let q = buildBookingListQuery(supabase, req, 'exact', LIST_SELECT_SLIM);
      if (LT) {
        console.time('GET /api/bookings applySearchOr');
      }
      ({ query: q } = await applySearchOr(supabase, q, req.query.search));
      if (LT) {
        console.timeEnd('GET /api/bookings applySearchOr');
      }

      q = q.range(offset, offset + limit - 1);
      if (LT) {
        console.time('GET /api/bookings supabase.query');
      }
      const { data, error, count } = await q;
      if (LT) {
        console.timeEnd('GET /api/bookings supabase.query');
      }
      if (error) {
        /* eslint-disable-next-line no-console */
        console.error(error);
        return res.status(500).json({ error: 'Failed to list bookings' });
      }
      const rowCount = (data || []).length;
      if (LT) {
        console.time('GET /api/bookings shapeBookingListRow');
      }
      const shaped = (data || []).map(shapeBookingListRow);
      if (LT) {
        console.timeEnd('GET /api/bookings shapeBookingListRow');
        /* eslint-disable-next-line no-console */
        console.log('[LIST_TIMING] slim list rows', rowCount);
      }
      return res.json({
        data: shaped,
        count: count ?? (data || []).length,
        limit,
        offset,
      });
    }

    const CHUNK = 80;
    const MAX_SCAN = 4000;
    let skipped = offset;
    const page = [];
    let dbOffset = 0;
    let scanned = 0;
    let chunkIdx = 0;

    while (page.length < limit && scanned < MAX_SCAN) {
      let bq = buildBookingListQuery(supabase, req, null, LIST_SELECT_WITH_DERIVED_ENRICHMENT);
      if (LT) {
        console.time(`GET /api/bookings chunk.${chunkIdx}.applySearchOr`);
      }
      ({ query: bq } = await applySearchOr(supabase, bq, req.query.search));
      if (LT) {
        console.timeEnd(`GET /api/bookings chunk.${chunkIdx}.applySearchOr`);
      }

      bq = bq.range(dbOffset, dbOffset + CHUNK - 1);
      if (LT) {
        console.time(`GET /api/bookings chunk.${chunkIdx}.supabaseQuery`);
      }
      const { data: batch, error } = await bq;
      if (LT) {
        console.timeEnd(`GET /api/bookings chunk.${chunkIdx}.supabaseQuery`);
      }
      if (error) {
        console.error(error);
        return res.status(500).json({ error: 'Failed to list bookings' });
      }
      if (!batch?.length) {
        break;
      }
      scanned += batch.length;
      dbOffset += CHUNK;
      if (LT) {
        console.time(`GET /api/bookings chunk.${chunkIdx}.enrichBookingListRows`);
      }
      const enriched = await enrichBookingListRows(batch);
      if (LT) {
        console.timeEnd(`GET /api/bookings chunk.${chunkIdx}.enrichBookingListRows`);
        /* eslint-disable-next-line no-console */
        console.log('[LIST_TIMING] chunk', { chunkIdx, batchLen: batch?.length, scanned });
      }
      chunkIdx += 1;
      for (const row of enriched) {
        if (!matchesDerivedListFilters(row, { payment_status: paymentStatus, doc_status: docStatus })) {
          continue;
        }
        if (skipped > 0) {
          skipped--;
          continue;
        }
        if (page.length < limit) {
          page.push(shapeBookingListRow(row));
        }
        if (page.length >= limit) {
          break;
        }
      }
      if (page.length >= limit) {
        break;
      }
    }

    return res.json({
      data: page,
      count: null,
      limit,
      offset,
      meta: {
        derived_filters_applied: true,
        rows_scanned: scanned,
        capped_at_max_scan: scanned >= MAX_SCAN,
      },
    });
  } catch (e) {
    if (e.status === 400) {
      return res.status(400).json({ error: e.message });
    }
    console.error(e);
    return res.status(500).json({ error: 'Failed to list bookings' });
  } finally {
    if (LT) {
      console.timeEnd('GET /api/bookings total');
    }
  }
}

async function getById(req, res) {
  const { id } = req.params;
  const supabase = getSupabase();
  let query = supabase.from('bookings').select(DETAIL_SELECT);
  query = UUID_RE.test(String(id)) ? query.eq('id', id) : query.eq('booking_code', id);
  const { data: row, error } = await query.maybeSingle();

  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to load booking' });
  }
  if (!row) {
    return res.status(404).json({ error: 'Not found' });
  }

  if (req.user.role === 'agent' && !canAgentAccessBooking(row, req.user.id)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const payload = await hydrateBookingDetail(supabase, row);
  return res.json(payload);
}

async function create(req, res) {
  try {
    const bookingId = await createBookingFromPayload(req.body, req.user, getLogService(req));
    const supabase = getSupabase();
    const { data: row, error } = await supabase.from('bookings').select(DETAIL_SELECT).eq('id', bookingId).maybeSingle();
    if (error || !row) {
      return res.status(201).json({ id: bookingId, message: 'Booking created; reload detail if nested payload missing.' });
    }
    const payload = await hydrateBookingDetail(supabase, row);
    return res.status(201).json(payload);
  } catch (e) {
    if (e.status === 400) {
      return res.status(400).json({ error: e.message });
    }
    if (e.status === 503) {
      return res.status(503).json({ error: e.message });
    }
    if (e.code === '23505') {
      return res.status(409).json({ error: 'Conflict — duplicate code or invoice number' });
    }
    if (e.code === '23503') {
      return res.status(400).json({ error: 'Invalid supplier or reference' });
    }
    console.error('Booking creation error:', e?.message);
    console.error('Stack:', e?.stack);
    return res.status(500).json({ error: 'Failed to create booking' });
  }
}

async function update(req, res) {
  const { id } = req.params;
  const body = req.body || {};
  const supabase = getSupabase();

  const { data: existing, error: fe } = await supabase.from('bookings').select('*').eq('id', id).maybeSingle();
  if (fe || !existing) {
    return res.status(404).json({ error: 'Not found' });
  }

  if (req.user.role === 'agent' && !canAgentAccessBooking(existing, req.user.id)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const patch = {};
  if (body.customer_name != null) {
    patch.customer_name = String(body.customer_name).trim();
  }
  if (body.crm_lead_id !== undefined) {
    patch.crm_lead_id = body.crm_lead_id == null ? null : String(body.crm_lead_id).trim() || null;
  }
  if (Array.isArray(body.destinations)) {
    patch.destination = body.destinations.map((d) => String(d).trim()).filter(Boolean);
  } else if (body.destination != null && Array.isArray(body.destination)) {
    patch.destination = body.destination.map((d) => String(d).trim()).filter(Boolean);
  }
  if (body.date_of_travel != null) {
    patch.date_of_travel = String(body.date_of_travel).slice(0, 10);
    patch.is_nrf = daysUntilTravel(patch.date_of_travel) <= 20;
  }
  if (body.return_date != null) {
    patch.return_date = String(body.return_date).slice(0, 10);
  }
  if (body.adults != null) {
    patch.adults = Number(body.adults);
  }
  if (body.children != null) {
    patch.children = Number(body.children);
  }
  if (Array.isArray(body.children_ages)) {
    patch.children_ages = body.children_ages.map((n) => Number(n));
  }
  if (body.case_manager_id !== undefined) {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admin can set case_manager_id' });
    }
    patch.case_manager_id = body.case_manager_id || null;
  }
  if (body.status != null) {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admin can change status' });
    }
    const s = String(body.status);
    if (!['active', 'on_hold', 'cancelled', 'completed'].includes(s)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    patch.status = s;
  }

  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  patch.updated_at = new Date().toISOString();

  const before_state = {};
  for (const k of Object.keys(patch)) {
    if (k !== 'updated_at' && existing[k] !== undefined && existing[k] !== patch[k]) {
      before_state[k] = existing[k];
    }
  }

  const { data: updated, error: ue } = await supabase.from('bookings').update(patch).eq('id', id).select('*').single();
  if (ue) {
    console.error(ue);
    return res.status(500).json({ error: 'Failed to update booking' });
  }

  const after_state = {};
  for (const k of Object.keys(before_state)) {
    after_state[k] = updated[k];
  }

  await getLogService(req).log({
    event_type: 'BOOKING_UPDATED',
    entity_type: 'booking',
    entity_id: id,
    actor_id: req.user.id,
    actor_role: req.user.role,
    before_state: Object.keys(before_state).length ? before_state : null,
    after_state: Object.keys(after_state).length ? after_state : null,
    metadata: {},
  });

  if (patch.is_nrf === true && !existing.is_nrf) {
    await getLogService(req).log({
      event_type: 'NRF_FLAG_SET',
      entity_type: 'booking',
      entity_id: id,
      actor_id: req.user.id,
      actor_role: req.user.role,
      before_state: null,
      after_state: { is_nrf: true },
      metadata: {},
    });
  }

  return res.json(updated);
}

module.exports = { list, getById, create, update };
