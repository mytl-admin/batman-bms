const { getSupabase } = require('../lib/supabase');
const { daysUntilTravel, subDaysUtc, formatDateOnly } = require('../utils/dateHelpers');

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

function todayUtcYmd() {
  const now = new Date();
  return formatDateOnly(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())));
}

/**
 * P2-COLLECTIONS-FIX — read-only preview of guest collection tranches (no DB writes).
 */
async function previewCollections(req, res) {
  const body = req.body || {};
  const { date_of_travel: dateOfTravel, margin, supplier_tranches: supplierTranchesIn, line_items: lineItemsIn } = body;

  if (!dateOfTravel || String(dateOfTravel).trim() === '') {
    return res.status(400).json({ error: 'date_of_travel is required' });
  }
  if (margin === undefined || margin === null || Number.isNaN(Number(margin))) {
    return res.status(400).json({ error: 'margin is required' });
  }
  if (!Array.isArray(supplierTranchesIn)) {
    return res.status(400).json({ error: 'supplier_tranches array is required' });
  }

  const marginNum = Number(margin);
  const li = lineItemsIn && typeof lineItemsIn === 'object' ? lineItemsIn : {};
  const flights = Array.isArray(li.flights) ? li.flights : [];
  const hotels = Array.isArray(li.hotels) ? li.hotels : [];
  const landItems = Array.isArray(li.land_items) ? li.land_items : [];
  const visas = Array.isArray(li.visas) ? li.visas : [];

  const supabase = getSupabase();
  const gstRate = normalizeTaxRate(await fetchActiveRate(supabase, 'config_gst_rate', 'rate'));
  const tcsRate = normalizeTaxRate(await fetchActiveRate(supabase, 'config_tcs_rate', 'rate'));

  const flightSum = flights
    .filter((f) => !f.is_self_booked)
    .reduce((s, f) => s + (Number(f.inr_equivalent) || 0), 0);
  const hotelSum = hotels
    .filter((h) => !h.is_self_booked)
    .reduce((s, h) => s + (Number(h.inr_equivalent) || 0), 0);
  const landSum = landItems.reduce((s, l) => s + (Number(l.inr_equivalent) || 0), 0);
  const visaSum = visas
    .filter((v) => !v.is_self_arranged)
    .reduce((s, v) => s + (Number(v.inr_equivalent) || 0), 0);

  const total_cost_price = ceilRupee(flightSum + hotelSum + landSum + visaSum);
  const subtotal = ceilRupee(total_cost_price + marginNum);
  const gst_amount = Math.round(gstRate * marginNum * 100) / 100;
  const tcs_amount = ceilRupee(tcsRate * subtotal);
  const total_payable = ceilRupee(subtotal + gst_amount + tcs_amount);

  const dotStr = String(dateOfTravel).slice(0, 10);
  const dtt = daysUntilTravel(dotStr);
  const is_nrf = dtt <= 20;
  const todayStr = todayUtcYmd();

  let collections;
  let scenario;
  if (!is_nrf) {
    const booked_flights_hotels = ceilRupee(
      flights.filter((f) => !f.is_self_booked).reduce((s, f) => s + (Number(f.inr_equivalent) || 0), 0) +
        hotels.filter((h) => !h.is_self_booked).reduce((s, h) => s + (Number(h.inr_equivalent) || 0), 0),
    );
    const tranche1_amount = ceilRupee(booked_flights_hotels + marginNum);
    let balance_amount = ceilRupee(total_payable - tranche1_amount);
    if (balance_amount < 0) {
      balance_amount = 0;
    }

    const paymentDates = supplierTranchesIn.map((t) => String(t.payment_date || '').slice(0, 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
    const earliest =
      paymentDates.length > 0 ? paymentDates.reduce((a, b) => (a < b ? a : b)) : dotStr;
    const balance_due = subDaysUtc(earliest, 5);

    collections = [
      { label: 'Tranche 1', amount: tranche1_amount, due_date: todayStr },
      { label: 'Balance Payment', amount: balance_amount, due_date: balance_due },
    ];
    scenario = 'A';
  } else {
    collections = [{ label: 'Full Payment', amount: total_payable, due_date: todayStr }];
    scenario = 'B';
  }

  return res.json({
    scenario,
    is_nrf,
    collections,
    invoice: {
      total_cost_price,
      margin: marginNum,
      subtotal,
      gst_rate: gstRate,
      gst_amount,
      tcs_rate: tcsRate,
      tcs_amount,
      total_payable,
    },
  });
}

module.exports = { previewCollections };
