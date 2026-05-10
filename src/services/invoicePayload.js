const { getSupabase } = require('../lib/supabase');

function ceilRupee(x) {
  return Math.ceil(Number(x) || 0);
}

function normalizeTaxRate(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    return 0;
  }
  return n > 1 ? n / 100 : n;
}

async function fetchActiveRate(supabase, table, col) {
  const { data } = await supabase
    .from(table)
    .select(col)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.[col];
}

async function buildInvoicePayload(bookingId) {
  const supabase = getSupabase();
  const { data: booking, error: be } = await supabase.from('bookings').select('*').eq('id', bookingId).maybeSingle();
  if (be || !booking) {
    return null;
  }

  const gstRate = normalizeTaxRate(await fetchActiveRate(supabase, 'config_gst_rate', 'rate'));
  const tcsRate = normalizeTaxRate(await fetchActiveRate(supabase, 'config_tcs_rate', 'rate'));

  const [{ data: flights }, { data: hotels }, { data: lands }, { data: visas }, { data: travellers }] =
    await Promise.all([
      supabase.from('booking_flights').select('*').eq('booking_id', bookingId).eq('is_active', true).order('sort_order'),
      supabase.from('booking_hotels').select('*').eq('booking_id', bookingId).eq('is_active', true).order('sort_order'),
      supabase.from('booking_land_items').select('*').eq('booking_id', bookingId).eq('is_active', true).order('sort_order'),
      supabase.from('booking_visas').select('*').eq('booking_id', bookingId).eq('is_active', true).order('sort_order'),
      supabase.from('booking_travellers').select('id, full_name').eq('booking_id', bookingId),
    ]);

  const travellerNames = Object.fromEntries((travellers || []).map((t) => [t.id, t.full_name]));

  const flightItems = [];
  let flightsTotal = 0;
  for (const f of flights || []) {
    const included = !f.is_self_booked;
    const cost = included ? ceilRupee(f.inr_equivalent) : 0;
    if (included) {
      flightsTotal += cost;
    }
    flightItems.push({
      sector: `${f.sector_from || '—'} → ${f.sector_to || '—'}`,
      cost,
      self_booked: Boolean(f.is_self_booked),
    });
  }

  const hotelItems = [];
  let hotelsTotal = 0;
  for (const h of hotels || []) {
    const included = !h.is_self_booked;
    const cost = included ? ceilRupee(h.inr_equivalent) : 0;
    if (included) {
      hotelsTotal += cost;
    }
    hotelItems.push({
      name: h.property_name || '—',
      nights: h.nights || 0,
      cost,
      self_booked: Boolean(h.is_self_booked),
    });
  }

  const landItems = [];
  let landTotal = 0;
  for (const l of lands || []) {
    const cost = ceilRupee(l.inr_equivalent);
    landTotal += cost;
    landItems.push({ description: l.description, cost });
  }

  const visaIds = (visas || []).map((v) => v.id);
  let allApps = [];
  if (visaIds.length) {
    const { data: apps } = await supabase.from('booking_visa_applicants').select('visa_id, traveller_id').in('visa_id', visaIds);
    allApps = apps || [];
  }
  const appsByVisa = {};
  for (const a of allApps) {
    if (!appsByVisa[a.visa_id]) {
      appsByVisa[a.visa_id] = [];
    }
    appsByVisa[a.visa_id].push(a);
  }

  const visaItems = [];
  let visaTotal = 0;
  for (const v of visas || []) {
    if (v.is_self_arranged) {
      continue;
    }
    visaTotal += ceilRupee(v.inr_equivalent);
    const apps = appsByVisa[v.id] || [];
    const cpp = ceilRupee(Number(v.cost_per_applicant || 0));
    if (apps.length) {
      for (const a of apps) {
        visaItems.push({ traveller: travellerNames[a.traveller_id] || '—', cost: cpp });
      }
    } else {
      visaItems.push({ traveller: '—', cost: ceilRupee(Number(v.total_cost || 0)) });
    }
  }

  const storedTotal = booking.total_cost_price != null ? ceilRupee(booking.total_cost_price) : flightsTotal + hotelsTotal + landTotal + visaTotal;

  return {
    booking_id: bookingId,
    booking_code: booking.booking_code,
    invoice_number: booking.invoice_number,
    total_cost_price: storedTotal,
    cost_breakup: {
      flights: { total: flightsTotal, items: flightItems },
      hotels: { total: hotelsTotal, items: hotelItems },
      land_package: { total: landTotal, items: landItems },
      visa: { total: visaTotal, items: visaItems },
    },
    margin: Number(booking.margin || 0),
    subtotal: ceilRupee(Number(booking.subtotal || 0)),
    gst_rate: gstRate,
    gst_amount: booking.gst_amount != null ? Number(booking.gst_amount) : Math.round(gstRate * Number(booking.margin || 0) * 100) / 100,
    tcs_rate: tcsRate,
    tcs_amount: booking.tcs_amount != null ? ceilRupee(booking.tcs_amount) : 0,
    total_payable: ceilRupee(Number(booking.total_payable || 0)),
  };
}

module.exports = { buildInvoicePayload };
