const { getSupabase } = require('../lib/supabase');
const { calculateOurPolicyDate } = require('../utils/calculateOurPolicyDate');
const { differenceNights } = require('../utils/dateHelpers');

function ceilRupee(x) {
  return Math.ceil(Number(x) || 0);
}

function normalizeTime(t) {
  if (t == null || t === '') {
    return null;
  }
  const s = String(t);
  if (/^\d{2}:\d{2}$/.test(s)) {
    return `${s}:00`;
  }
  return s;
}

function readExchangeRate(body) {
  if (body?.exchange_rate_decimal != null) return Number(body.exchange_rate_decimal);
  if (body?.exchange_rate != null) return Number(body.exchange_rate);
  return 1;
}

/** Strip client-submitted our_* refund dates (P2-16). */
function omitOurRefundFields(body) {
  if (!body || typeof body !== 'object') {
    return;
  }
  delete body.our_full_refund_till;
  delete body.our_partial_refund_till;
}

function flightDerived(body) {
  omitOurRefundFields(body);
  const self = Boolean(body.is_self_booked);
  const cost = body.cost != null ? Number(body.cost) : null;
  const ex = readExchangeRate(body);
  const inr = self ? null : ceilRupee((cost || 0) * ex);
  const ref = Boolean(body.is_refundable);
  const supFull = body.supplier_full_refund_till;
  const supPart = body.supplier_partial_refund_till;
  return {
    inr_equivalent: inr,
    our_full_refund_till: ref && supFull ? calculateOurPolicyDate(supFull) : null,
    our_partial_refund_till: supPart ? calculateOurPolicyDate(supPart) : null,
  };
}

function hotelDerived(body) {
  omitOurRefundFields(body);
  const self = Boolean(body.is_self_booked);
  const cost = body.cost != null ? Number(body.cost) : null;
  const ex = readExchangeRate(body);
  const inr = self ? null : ceilRupee((cost || 0) * ex);
  const ref = Boolean(body.is_refundable);
  const supFull = body.supplier_full_refund_till;
  const supPart = body.supplier_partial_refund_till;
  const cin = body.check_in_date != null ? String(body.check_in_date).slice(0, 10) : null;
  const cout = body.check_out_date != null ? String(body.check_out_date).slice(0, 10) : null;
  const nights =
    cin && cout ? differenceNights(cin, cout) : body.nights != null ? Number(body.nights) : null;
  return {
    inr_equivalent: inr,
    our_full_refund_till: ref && supFull ? calculateOurPolicyDate(supFull) : null,
    our_partial_refund_till: supPart ? calculateOurPolicyDate(supPart) : null,
    nights,
  };
}

function landDerived(body) {
  omitOurRefundFields(body);
  const cost = body.cost != null ? Number(body.cost) : 0;
  const ex = readExchangeRate(body);
  const inr = ceilRupee(cost * ex);
  const ref = Boolean(body.is_refundable);
  const supFull = body.supplier_full_refund_till;
  const supPart = body.supplier_partial_refund_till;
  return {
    inr_equivalent: inr,
    our_full_refund_till: ref && supFull ? calculateOurPolicyDate(supFull) : null,
    our_partial_refund_till: supPart ? calculateOurPolicyDate(supPart) : null,
  };
}

function visaDerived(body) {
  omitOurRefundFields(body);
  const selfArr = Boolean(body.is_self_arranged);
  const cpp = body.cost_per_applicant != null ? Number(body.cost_per_applicant) : 0;
  const n = body.number_of_applicants != null ? Number(body.number_of_applicants) : 0;
  const total = ceilRupee(cpp * n);
  const ex = readExchangeRate(body);
  const inr = selfArr ? null : ceilRupee(total * ex);
  let ourFull = null;
  if (!selfArr && body.is_refundable && body.supplier_full_refund_till) {
    ourFull = calculateOurPolicyDate(body.supplier_full_refund_till);
  }
  return {
    total_cost: total,
    inr_equivalent: inr,
    our_full_refund_till: ourFull,
  };
}

async function lineItemCount(supabase, bookingId) {
  let total = 0;
  for (const table of ['booking_flights', 'booking_hotels', 'booking_land_items', 'booking_visas']) {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq('booking_id', bookingId)
      .eq('is_active', true);
    if (error) {
      throw error;
    }
    total += count || 0;
  }
  return total;
}

async function fetchBookingTotalCostPrice(supabase, bookingId) {
  const { data, error } = await supabase.from('bookings').select('total_cost_price').eq('id', bookingId).maybeSingle();
  if (error) {
    throw error;
  }
  if (!data || data.total_cost_price == null) {
    return null;
  }
  return Number(data.total_cost_price);
}

async function refreshVisaApplicantTotals(supabase, visaId) {
  const { data: visa, error: ve } = await supabase.from('booking_visas').select('*').eq('id', visaId).maybeSingle();
  if (ve || !visa) {
    return;
  }
  const { count } = await supabase.from('booking_visa_applicants').select('*', { count: 'exact', head: true }).eq('visa_id', visaId);
  const n = count || 0;
  const cpp = Number(visa.cost_per_applicant || 0);
  const total = ceilRupee(cpp * n);
  const ex = readExchangeRate(visa);
  const inr = visa.is_self_arranged ? null : ceilRupee(total * ex);
  await supabase
    .from('booking_visas')
    .update({
      number_of_applicants: n,
      total_cost: total,
      inr_equivalent: inr,
      updated_at: new Date().toISOString(),
    })
    .eq('id', visaId);
}

module.exports = {
  ceilRupee,
  normalizeTime,
  flightDerived,
  hotelDerived,
  landDerived,
  visaDerived,
  lineItemCount,
  fetchBookingTotalCostPrice,
  refreshVisaApplicantTotals,
};
