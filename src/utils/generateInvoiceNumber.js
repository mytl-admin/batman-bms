/**
 * Next sequential invoice number (atomic via allocate_invoice_number RPC).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
async function generateInvoiceNumber(supabase) {
  const { data, error } = await supabase.rpc('allocate_invoice_number');
  if (error) {
    throw error;
  }
  const n = typeof data === 'number' ? data : Number(data);
  if (!Number.isFinite(n)) {
    throw new Error('allocate_invoice_number returned invalid value');
  }
  return n;
}

/** Same sequence, callable inside a Postgres transaction (no Supabase client). */
async function allocateInvoiceNumberPg(client) {
  const { rows } = await client.query('SELECT allocate_invoice_number() AS n');
  return Number(rows[0].n);
}

module.exports = { generateInvoiceNumber, allocateInvoiceNumberPg };
