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
 * P2-COLLECTIONS-FIX / P2-MARGIN-COLLECTIONS-FIX — read-only preview of guest collection tranches (no DB writes).
 * Invoice totals drive tranche split: Scenario A balance = total_payable − tranche1 (always sums to total_payable).
 */
async function previewCollections(req, res) {
  const body = req.body || {};
  const { date_of_travel: dotRaw, margin: marginRaw, supplier_tranches: supplierTranchesRaw, line_items: lineItemsIn } =
    body;

  let dateOfTravel = dotRaw;
  if (!dateOfTravel || String(dateOfTravel).trim() === '') {
    dateOfTravel = todayUtcYmd();
  }

  const marginNum =
    marginRaw === undefined || marginRaw === null || marginRaw === '' || Number.isNaN(Number(marginRaw))
      ? 0
      : Number(marginRaw);

  const supplierTranchesIn = Array.isArray(supplierTranchesRaw) ? supplierTranchesRaw : [];
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
    const flightHotelRaw =
      flights.filter((f) => !f.is_self_booked).reduce((s, f) => s + (Number(f.inr_equivalent) || 0), 0) +
      hotels.filter((h) => !h.is_self_booked).reduce((s, h) => s + (Number(h.inr_equivalent) || 0), 0);
    const booked_flights_hotels = ceilRupee(flightHotelRaw);
    let tranche1_amount = ceilRupee(booked_flights_hotels + marginNum);
    let balance_amount = Math.ceil(total_payable - tranche1_amount);
    if (balance_amount < 0) {
      tranche1_amount = total_payable;
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

    if (process.env.PREVIEW_COLLECTIONS_DEBUG === '1') {
      const sum = tranche1_amount + balance_amount;
      /* eslint-disable no-console */
      console.log('Tranche check:', {
        tranche1_amount,
        balance_amount,
        total_payable,
        sum,
        matches: sum === total_payable,
      });
      /* eslint-enable no-console */
    }
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
