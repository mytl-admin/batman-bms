const { daysUntilTravel, subDaysUtc, formatDateOnly } = require('../utils/dateHelpers');

function ceilRupee(x) {
  return Math.ceil(Number(x) || 0);
}

/**
 * Replace guest tranches per P2-09 (staged vs full upfront).
 */
async function replaceGuestTranchesForBooking(client, bookingId) {
  const { rows: bRows } = await client.query(
    'SELECT date_of_travel::text AS date_of_travel, margin, total_payable FROM bookings WHERE id = $1',
    [bookingId],
  );
  const booking = bRows[0];
  if (!booking) {
    throw new Error('Booking not found');
  }

  await client.query('DELETE FROM guest_tranches WHERE booking_id = $1', [bookingId]);

  /* ::text avoids node-pg DATE → JS Date → toString() breaking YYYY-MM-DD and dtt math. */
  const dotStr = String(booking.date_of_travel).slice(0, 10);
  const dtt = daysUntilTravel(dotStr);
  const margin = Number(booking.margin || 0);
  const totalPayable = Number(booking.total_payable || 0);

  const now = new Date();
  const todayStr = formatDateOnly(
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
  );

  if (dtt > 20) {
    const { rows: flights } = await client.query(
      'SELECT inr_equivalent, is_self_booked FROM booking_flights WHERE booking_id = $1',
      [bookingId],
    );
    const { rows: hotels } = await client.query(
      'SELECT inr_equivalent, is_self_booked FROM booking_hotels WHERE booking_id = $1',
      [bookingId],
    );

    /* Tranche 1 = booked-with-us flights + hotels + margin only (P2-COLLECTIONS-FIX; land/visa in total payable, not in T1). */
    let bookedWithUs = 0;
    for (const f of flights) {
      if (!f.is_self_booked) bookedWithUs += ceilRupee(f.inr_equivalent);
    }
    for (const h of hotels) {
      if (!h.is_self_booked) bookedWithUs += ceilRupee(h.inr_equivalent);
    }
    bookedWithUs = ceilRupee(bookedWithUs);
    const tranche1Amount = ceilRupee(bookedWithUs + margin);
    let tranche2Amount = ceilRupee(totalPayable - tranche1Amount);
    if (tranche2Amount < 0) {
      tranche2Amount = 0;
    }

    const { rows: supRows } = await client.query(
      `SELECT payment_date::text AS payment_date FROM supplier_tranches
       WHERE booking_id = $1 AND status <> 'cancelled'
       ORDER BY payment_date ASC LIMIT 1`,
      [bookingId],
    );

    let tranche2Due = todayStr;
    if (supRows.length) {
      const pay = String(supRows[0].payment_date).slice(0, 10);
      tranche2Due = subDaysUtc(pay, 5);
    }

    await client.query(
      `INSERT INTO guest_tranches (booking_id, label, amount, currency, due_date, status)
       VALUES ($1, 'Tranche 1', $2, 'INR', $3::date, 'pending')`,
      [bookingId, tranche1Amount, todayStr],
    );
    await client.query(
      `INSERT INTO guest_tranches (booking_id, label, amount, currency, due_date, status)
       VALUES ($1, 'Balance Payment', $2, 'INR', $3::date, 'pending')`,
      [bookingId, tranche2Amount, tranche2Due],
    );
  } else {
    await client.query(
      `INSERT INTO guest_tranches (booking_id, label, amount, currency, due_date, status)
       VALUES ($1, 'Full Payment', $2, 'INR', $3::date, 'pending')`,
      [bookingId, ceilRupee(totalPayable), todayStr],
    );
  }
}

module.exports = { replaceGuestTranchesForBooking };
