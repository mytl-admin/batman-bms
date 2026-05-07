const { buildInvoicePayload } = require('../services/invoicePayload');
const { runBookingRecalc } = require('../services/bookingRecalc');
const { getSupabase } = require('../lib/supabase');

const INVOICE_FINANCIAL_FIELDS = [
  'margin',
  'total_payable',
  'subtotal',
  'gst_amount',
  'tcs_amount',
  'total_cost_price',
];

function financialFieldChanged(prevVal, nextVal) {
  const a = Number(prevVal);
  const b = Number(nextVal);
  if (Number.isFinite(a) && Number.isFinite(b)) {
    return a !== b;
  }
  return prevVal !== nextVal;
}

/** Only keys whose values differ between snapshots (invoice / recalc diffs). */
function buildFinancialBeforeAfterStates(beforeRow, afterRow) {
  const before_state = {};
  const after_state = {};
  if (!beforeRow || !afterRow) {
    return { before_state, after_state };
  }
  for (const k of INVOICE_FINANCIAL_FIELDS) {
    if (financialFieldChanged(beforeRow[k], afterRow[k])) {
      before_state[k] = beforeRow[k];
      after_state[k] = afterRow[k];
    }
  }
  return { before_state, after_state };
}

async function getInvoice(req, res) {
  const { id } = req.params;
  const payload = await buildInvoicePayload(id);
  if (!payload) {
    return res.status(404).json({ error: 'Not found' });
  }
  return res.json(payload);
}

async function patchInvoice(req, res) {
  const { id } = req.params;
  const { margin, financial_confirmed: financialConfirmed } = req.body || {};
  if (financialConfirmed !== true) {
    return res.status(400).json({ error: 'financial_confirmed must be true to update invoice' });
  }
  if (margin === undefined || margin === null || Number.isNaN(Number(margin))) {
    return res.status(400).json({ error: 'margin is required' });
  }

  const supabase = getSupabase();
  const { data: beforeRow, error: be } = await supabase
    .from('bookings')
    .select('margin, total_payable, subtotal, gst_amount, tcs_amount, total_cost_price')
    .eq('id', id)
    .maybeSingle();
  if (be) {
    console.error(be);
    return res.status(500).json({ error: 'Failed to load booking' });
  }
  if (!beforeRow) {
    return res.status(404).json({ error: 'Not found' });
  }

  const { error: ue } = await supabase
    .from('bookings')
    .update({ margin: Number(margin), updated_at: new Date().toISOString() })
    .eq('id', id);
  if (ue) {
    console.error(ue);
    return res.status(500).json({ error: 'Failed to update booking' });
  }

  try {
    await runBookingRecalc(id, { regenGuestTranches: true });
  } catch (e) {
    if (e.status === 503) {
      return res.status(503).json({ error: e.message });
    }
    console.error(e);
    return res.status(500).json({ error: 'Failed to recalculate invoice' });
  }

  const { data: afterRow, error: ae } = await supabase
    .from('bookings')
    .select('margin, total_payable, subtotal, gst_amount, tcs_amount, total_cost_price')
    .eq('id', id)
    .maybeSingle();
  if (ae) {
    console.error(ae);
    return res.status(500).json({ error: 'Failed to load booking after recalc' });
  }
  if (!afterRow) {
    return res.status(404).json({ error: 'Not found' });
  }

  const { before_state, after_state } = buildFinancialBeforeAfterStates(beforeRow, afterRow);

  await req.app.locals.logService.log({
    event_type: 'FINANCIAL_FIELD_CHANGED',
    entity_type: 'booking',
    entity_id: id,
    actor_id: req.user.id,
    actor_role: req.user.role,
    before_state,
    after_state,
    metadata: {},
  });

  const payload = await buildInvoicePayload(id);
  return res.json(payload);
}

module.exports = { getInvoice, patchInvoice };
