const { getSupabase } = require('../lib/supabase');
const { runBookingRecalc } = require('../services/bookingRecalc');
const { subDaysUtc } = require('../utils/dateHelpers');

function log(req) {
  return req.app.locals.logService;
}

function ceilRupee(x) {
  return Math.ceil(Number(x) || 0);
}

function assertPayBeforeTravel(paymentDate, dateOfTravel) {
  const pay = String(paymentDate).slice(0, 10);
  const dot = String(dateOfTravel).slice(0, 10);
  if (pay >= dot) {
    const e = new Error('supplier_tranche payment_date must be before date_of_travel');
    e.status = 400;
    throw e;
  }
}

async function listSupplier(req, res) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('supplier_tranches')
    .select('*')
    .eq('booking_id', req.params.id)
    .order('payment_date', { ascending: true });
  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to list supplier tranches' });
  }
  return res.json(data || []);
}

async function createSupplier(req, res) {
  try {
    const bid = req.params.id;
    const body = req.body || {};
    if (body.amount == null || body.payment_date == null) {
      return res.status(400).json({ error: 'amount and payment_date are required' });
    }
    assertPayBeforeTravel(body.payment_date, req.bookingScope.date_of_travel);
    const amt = Number(body.amount);
    const ex = body.exchange_rate != null ? Number(body.exchange_rate) : 1;
    const inr = ceilRupee(amt * ex);
    const row = {
      booking_id: bid,
      supplier_id: body.supplier_id || null,
      amount: amt,
      currency: body.currency || 'INR',
      exchange_rate: ex,
      inr_equivalent: inr,
      payment_date: String(body.payment_date).slice(0, 10),
      status: 'pending',
    };
    const supabase = getSupabase();
    const { data: created, error } = await supabase.from('supplier_tranches').insert(row).select('*').single();
    if (error) {
      console.error(error);
      return res.status(500).json({ error: 'Failed to create supplier tranche' });
    }
    try {
      await runBookingRecalc(bid, { regenGuestTranches: true });
    } catch (e) {
      if (e.status === 503) {
        return res.status(503).json({ error: e.message });
      }
      console.error(e);
    }
    await log(req).log({
      event_type: 'BOOKING_UPDATED',
      entity_type: 'booking',
      entity_id: bid,
      actor_id: req.user.id,
      actor_role: req.user.role,
      before_state: null,
      after_state: { supplier_tranche_id: created.id },
      metadata: { section: 'supplier_tranches' },
    });
    return res.status(201).json(created);
  } catch (e) {
    if (e.status === 400) {
      return res.status(400).json({ error: e.message });
    }
    throw e;
  }
}

async function patchSupplier(req, res) {
  try {
    const bid = req.params.id;
    const tid = req.params.trancheId;
    const supabase = getSupabase();
    const { data: existing, error: fe } = await supabase
      .from('supplier_tranches')
      .select('*')
      .eq('id', tid)
      .eq('booking_id', bid)
      .maybeSingle();
    if (fe || !existing) {
      return res.status(404).json({ error: 'Not found' });
    }
    const body = req.body || {};
    const patch = {};
    if (body.amount != null) {
      patch.amount = Number(body.amount);
    }
    if (body.currency != null) {
      patch.currency = String(body.currency);
    }
    if (body.exchange_rate != null) {
      patch.exchange_rate = Number(body.exchange_rate);
    }
    if (body.payment_date != null) {
      patch.payment_date = String(body.payment_date).slice(0, 10);
      assertPayBeforeTravel(patch.payment_date, req.bookingScope.date_of_travel);
    }
    if (body.supplier_id !== undefined) {
      patch.supplier_id = body.supplier_id || null;
    }
    if (body.status != null) {
      patch.status = String(body.status);
    }

    const merged = { ...existing, ...patch };
    if (merged.amount != null && merged.exchange_rate != null) {
      patch.inr_equivalent = ceilRupee(Number(merged.amount) * Number(merged.exchange_rate));
    }
    patch.updated_at = new Date().toISOString();

    if (Object.keys(patch).length === 1 && patch.updated_at) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const { data: updated, error: ue } = await supabase
      .from('supplier_tranches')
      .update(patch)
      .eq('id', tid)
      .select('*')
      .single();
    if (ue) {
      console.error(ue);
      return res.status(500).json({ error: 'Failed to update supplier tranche' });
    }
    try {
      await runBookingRecalc(bid, { regenGuestTranches: true });
    } catch (e) {
      console.error(e);
    }
    await log(req).log({
      event_type: 'BOOKING_UPDATED',
      entity_type: 'booking',
      entity_id: bid,
      actor_id: req.user.id,
      actor_role: req.user.role,
      before_state: { supplier_tranche: existing.id },
      after_state: { supplier_tranche: updated.id },
      metadata: { section: 'supplier_tranches' },
    });
    return res.json(updated);
  } catch (e) {
    if (e.status === 400) {
      return res.status(400).json({ error: e.message });
    }
    throw e;
  }
}

async function deleteSupplier(req, res) {
  const bid = req.params.id;
  const tid = req.params.trancheId;
  const supabase = getSupabase();
  const { error } = await supabase.from('supplier_tranches').delete().eq('id', tid).eq('booking_id', bid);
  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to delete supplier tranche' });
  }
  try {
    await runBookingRecalc(bid, { regenGuestTranches: true });
  } catch (e) {
    console.error(e);
  }
  await log(req).log({
    event_type: 'BOOKING_UPDATED',
    entity_type: 'booking',
    entity_id: bid,
    actor_id: req.user.id,
    actor_role: req.user.role,
    before_state: { supplier_tranche_deleted: tid },
    after_state: null,
    metadata: { section: 'supplier_tranches' },
  });
  return res.status(204).send();
}

async function listGuest(req, res) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('guest_tranches')
    .select('*')
    .eq('booking_id', req.params.id)
    .order('due_date', { ascending: true });
  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to list guest tranches' });
  }
  return res.json(data || []);
}

async function patchGuest(req, res) {
  const bid = req.params.id;
  const gid = req.params.trancheId;
  const body = req.body || {};
  const patch = {};
  if (body.label != null) {
    patch.label = String(body.label);
  }
  if (body.amount != null) {
    patch.amount = Number(body.amount);
  }
  if (body.currency != null) {
    patch.currency = String(body.currency);
  }
  if (body.due_date != null) {
    patch.due_date = String(body.due_date).slice(0, 10);
  }
  if (body.status != null) {
    patch.status = String(body.status);
  }
  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }
  patch.updated_at = new Date().toISOString();
  const supabase = getSupabase();
  const { data: updated, error } = await supabase
    .from('guest_tranches')
    .update(patch)
    .eq('id', gid)
    .eq('booking_id', bid)
    .select('*')
    .single();
  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to update guest tranche' });
  }
  if (!updated) {
    return res.status(404).json({ error: 'Not found' });
  }
  await log(req).log({
    event_type: 'BOOKING_UPDATED',
    entity_type: 'booking',
    entity_id: bid,
    actor_id: req.user.id,
    actor_role: req.user.role,
    before_state: { guest_tranche: gid },
    after_state: { guest_tranche: updated.id },
    metadata: { section: 'guest_tranches' },
  });
  return res.json(updated);
}

async function generateGuest(req, res) {
  const bid = req.params.id;
  try {
    await runBookingRecalc(bid, { regenGuestTranches: true });
  } catch (e) {
    if (e.status === 503) {
      return res.status(503).json({ error: e.message });
    }
    console.error(e);
    return res.status(500).json({ error: 'Failed to regenerate guest tranches' });
  }
  return listGuest(req, res);
}

async function linkGuestToSupplier(req, res) {
  const bid = req.params.id;
  const gid = req.params.trancheId;
  const supplierTrancheId = (req.body || {}).supplier_tranche_id;
  if (!supplierTrancheId) {
    return res.status(400).json({ error: 'supplier_tranche_id is required' });
  }
  const supabase = getSupabase();
  const { data: guest, error: ge } = await supabase
    .from('guest_tranches')
    .select('*')
    .eq('id', gid)
    .eq('booking_id', bid)
    .maybeSingle();
  if (ge || !guest) {
    return res.status(404).json({ error: 'Guest tranche not found' });
  }
  const { data: supRow, error: se } = await supabase
    .from('supplier_tranches')
    .select('*')
    .eq('id', supplierTrancheId)
    .eq('booking_id', bid)
    .maybeSingle();
  if (se || !supRow) {
    return res.status(404).json({ error: 'Supplier tranche not found' });
  }
  const latestDue = subDaysUtc(String(supRow.payment_date).slice(0, 10), 5);
  const due = String(guest.due_date).slice(0, 10);
  if (due > latestDue) {
    return res.status(400).json({
      error: 'Guest tranche due date must be at least 5 days before supplier tranche',
    });
  }

  await supabase.from('guest_supplier_tranche_links').delete().eq('guest_tranche_id', gid);
  const { data: link, error: le } = await supabase
    .from('guest_supplier_tranche_links')
    .insert({ guest_tranche_id: gid, supplier_tranche_id: supplierTrancheId })
    .select('*')
    .single();
  if (le) {
    console.error(le);
    return res.status(500).json({ error: 'Failed to create link' });
  }

  await log(req).log({
    event_type: 'BOOKING_UPDATED',
    entity_type: 'booking',
    entity_id: bid,
    actor_id: req.user.id,
    actor_role: req.user.role,
    before_state: null,
    after_state: { guest_supplier_link: link.id },
    metadata: { section: 'guest_tranches', supplier_tranche_id: supplierTrancheId },
  });
  return res.status(201).json(link);
}

module.exports = {
  listSupplier,
  createSupplier,
  patchSupplier,
  deleteSupplier,
  listGuest,
  patchGuest,
  generateGuest,
  linkGuestToSupplier,
};