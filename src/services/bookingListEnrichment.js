const { getSupabase } = require('../lib/supabase');

function todayYmdUtc() {
  const n = new Date();
  return n.toISOString().slice(0, 10);
}

async function enrichBookingRow(row) {
  const supabase = getSupabase();
  const bid = row.id;
  const t = todayYmdUtc();

  const [{ data: guests }, { data: suppliers }, { data: docs }, { data: travs }] = await Promise.all([
    supabase.from('guest_tranches').select('id, amount, due_date, status').eq('booking_id', bid),
    supabase.from('supplier_tranches').select('id, payment_date, status, amount').eq('booking_id', bid),
    supabase.from('booking_documents').select('id, entity_type, entity_id, is_active').eq('booking_id', bid).eq('is_active', true),
    supabase.from('booking_travellers').select('id').eq('booking_id', bid),
  ]);

  const guestList = guests || [];
  const overdue = guestList.some(
    (g) => g.status === 'overdue' || (g.status === 'pending' && g.due_date && String(g.due_date).slice(0, 10) < t),
  );

  let collection_status = 'Pending';
  if (overdue) {
    collection_status = 'Overdue';
  } else if (guestList.length && guestList.every((g) => g.status === 'collected')) {
    collection_status = 'Paid';
  } else if (guestList.some((g) => g.status === 'collected')) {
    collection_status = 'Partial';
  }

  const supList = suppliers || [];
  let supplier_status = 'Pending';
  if (supList.length && supList.every((s) => s.status === 'paid')) {
    supplier_status = 'Booked';
  } else if (supList.some((s) => s.status === 'paid')) {
    supplier_status = 'Partial';
  }

  const travellerIds = (travs || []).map((x) => x.id);
  let missingTravellerDocs = false;
  if (travellerIds.length) {
    missingTravellerDocs = travellerIds.some(
      (tid) => !(docs || []).some((d) => d.entity_type === 'traveller' && d.entity_id === tid),
    );
  }
  const doc_status = missingTravellerDocs ? 'incomplete' : 'complete';

  let refundability = 'RF';
  if (row.is_nrf) {
    refundability = 'NRF';
  }

  let next_action = 'view';
  if (overdue) {
    next_action = 'record_payment';
  } else {
    const dueToday = supList.filter(
      (s) =>
        s.payment_date &&
        String(s.payment_date).slice(0, 10) === t &&
        s.status !== 'cancelled' &&
        s.status !== 'paid',
    );
    if (dueToday.length) {
      const buyerCollected = collection_status === 'Paid' || collection_status === 'Partial';
      next_action = buyerCollected ? 'pay_supplier' : 'request_extension';
    } else if (missingTravellerDocs) {
      next_action = 'upload_docs';
    }
  }

  let case_owner_name = null;
  if (row.case_owner_id) {
    const { data: u } = await supabase.from('users').select('name').eq('id', row.case_owner_id).maybeSingle();
    case_owner_name = u?.name || null;
  }

  return {
    ...row,
    collection_status,
    supplier_status,
    doc_status,
    refundability,
    next_action,
    case_owner_name,
  };
}

/** P2-11 — filter enriched list rows by derived fields (see GET /api/bookings query params). */
function matchesDerivedListFilters(enrichedRow, { payment_status: paymentStatus, doc_status: docStatus }) {
  if (paymentStatus != null && String(paymentStatus).trim() !== '') {
    const want = String(paymentStatus).trim().toLowerCase();
    const got = String(enrichedRow.collection_status || '').toLowerCase();
    if (got !== want) {
      return false;
    }
  }
  if (docStatus != null && String(docStatus).trim() !== '') {
    if (String(enrichedRow.doc_status) !== String(docStatus).trim()) {
      return false;
    }
  }
  return true;
}

async function enrichBookingListRows(rows) {
  const out = [];
  for (const r of rows) {
    out.push(await enrichBookingRow(r));
  }
  return out;
}

module.exports = { enrichBookingListRows, enrichBookingRow, matchesDerivedListFilters };
