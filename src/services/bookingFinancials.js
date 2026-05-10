/** P2-08 invoice totals — rates from master config (never hardcoded). */

function normalizeTaxRate(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    return 0;
  }
  return n > 1 ? n / 100 : n;
}

async function fetchActiveScalar(client, table, column) {
  const { rows } = await client.query(
    `SELECT ${column} AS v FROM ${table} WHERE is_active = true ORDER BY created_at DESC LIMIT 1`,
  );
  if (!rows.length) {
    throw new Error(`No active configuration in ${table}`);
  }
  return rows[0].v;
}

function ceilRupee(x) {
  return Math.ceil(Number(x) || 0);
}

async function recalculateBookingFinancials(client, bookingId) {
  const gstRate = normalizeTaxRate(await fetchActiveScalar(client, 'config_gst_rate', 'rate'));
  const tcsRate = normalizeTaxRate(await fetchActiveScalar(client, 'config_tcs_rate', 'rate'));

  const { rows: mRows } = await client.query(
    'SELECT COALESCE(margin, 0) AS margin FROM bookings WHERE id = $1',
    [bookingId],
  );
  const margin = Number(mRows[0]?.margin || 0);

  const { rows: flights } = await client.query(
    'SELECT inr_equivalent, is_self_booked FROM booking_flights WHERE booking_id = $1 AND is_active = true',
    [bookingId],
  );
  const { rows: hotels } = await client.query(
    'SELECT inr_equivalent, is_self_booked FROM booking_hotels WHERE booking_id = $1 AND is_active = true',
    [bookingId],
  );
  const { rows: lands } = await client.query(
    'SELECT inr_equivalent FROM booking_land_items WHERE booking_id = $1 AND is_active = true',
    [bookingId],
  );
  const { rows: visas } = await client.query(
    'SELECT inr_equivalent, is_self_arranged FROM booking_visas WHERE booking_id = $1 AND is_active = true',
    [bookingId],
  );

  let totalCost = 0;
  for (const f of flights) {
    if (!f.is_self_booked) {
      totalCost += ceilRupee(f.inr_equivalent);
    }
  }
  for (const h of hotels) {
    if (!h.is_self_booked) {
      totalCost += ceilRupee(h.inr_equivalent);
    }
  }
  for (const l of lands) {
    totalCost += ceilRupee(l.inr_equivalent);
  }
  for (const v of visas) {
    if (!v.is_self_arranged) {
      totalCost += ceilRupee(v.inr_equivalent);
    }
  }

  totalCost = ceilRupee(totalCost);
  const subtotal = ceilRupee(totalCost + margin);
  const gstAmount = Math.round(gstRate * margin * 100) / 100;
  const tcsAmount = ceilRupee(tcsRate * subtotal);
  const totalPayable = ceilRupee(subtotal + gstAmount + tcsAmount);

  await client.query(
    `UPDATE bookings SET
       total_cost_price = $2,
       subtotal = $3,
       gst_amount = $4,
       tcs_amount = $5,
       total_payable = $6,
       updated_at = now()
     WHERE id = $1`,
    [bookingId, totalCost, subtotal, gstAmount, tcsAmount, totalPayable],
  );

  return {
    total_cost_price: totalCost,
    subtotal,
    gst_rate: gstRate,
    gst_amount: gstAmount,
    tcs_rate: tcsRate,
    tcs_amount: tcsAmount,
    total_payable: totalPayable,
  };
}

module.exports = { recalculateBookingFinancials };
