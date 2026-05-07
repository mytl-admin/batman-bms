const { Client } = require('pg');
const { recalculateBookingFinancials } = require('./bookingFinancials');
const { replaceGuestTranchesForBooking } = require('./guestTrancheGenerator');

function newClient() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    return null;
  }
  return new Client({
    connectionString: url,
    ssl: url.includes('supabase.co') ? { rejectUnauthorized: false } : undefined,
  });
}

/** Recalculate booking invoice totals (+ optionally regenerate guest tranches). */
async function runBookingRecalc(bookingId, { regenGuestTranches = true } = {}) {
  const client = newClient();
  if (!client) {
    const e = new Error('DATABASE_URL is required for booking financial recalculation');
    e.status = 503;
    throw e;
  }
  await client.connect();
  try {
    const fin = await recalculateBookingFinancials(client, bookingId);
    if (regenGuestTranches) {
      await replaceGuestTranchesForBooking(client, bookingId);
    }
    return fin;
  } finally {
    await client.end();
  }
}

module.exports = { runBookingRecalc };
