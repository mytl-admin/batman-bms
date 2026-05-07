const CODE_PREFIX = 'MYTL-';
const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const SUFFIX_LEN = 6;
const MAX_ATTEMPTS = 48;

function randomSuffix() {
  let s = '';
  for (let i = 0; i < SUFFIX_LEN; i += 1) {
    s += CHARSET[Math.floor(Math.random() * CHARSET.length)];
  }
  return s;
}

/**
 * MYTL-XXXXXX — unique against bookings.booking_code (Supabase/PostgREST).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
async function generateBookingCode(supabase) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const code = `${CODE_PREFIX}${randomSuffix()}`;
    const { data, error } = await supabase.from('bookings').select('id').eq('booking_code', code).maybeSingle();
    if (error && error.code !== 'PGRST116') {
      throw error;
    }
    if (!data) {
      return code;
    }
  }
  throw new Error('Failed to allocate unique booking code');
}

/** Allocate inside a SQL transaction (avoids race with insert). */
async function allocateBookingCodePg(client) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const code = `${CODE_PREFIX}${randomSuffix()}`;
    const { rows } = await client.query('SELECT 1 FROM bookings WHERE booking_code = $1', [code]);
    if (rows.length === 0) {
      return code;
    }
  }
  throw new Error('Failed to allocate unique booking code');
}

module.exports = { generateBookingCode, allocateBookingCodePg };
