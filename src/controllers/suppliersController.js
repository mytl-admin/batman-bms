const { getSupabase } = require('../lib/supabase');

function computeBankComplete(row) {
  const b =
    row.bank_name &&
    String(row.bank_name).trim() &&
    row.bank_account_number &&
    String(row.bank_account_number).trim() &&
    row.bank_ifsc &&
    String(row.bank_ifsc).trim();
  return Boolean(b);
}

function getLog(req) {
  return req.app.locals.logService;
}

async function list(req, res) {
  const supabase = getSupabase();
  const activeOnly = req.query.active_only !== 'false';
  let q = supabase
    .from('suppliers')
    .select(
      'id, name, code, contact_name, contact_email, contact_phone, bank_details_complete, is_active, sort_order, used_in_pages, used_in_systems, created_at',
    )
    .order('sort_order', { ascending: true });
  if (activeOnly) q = q.eq('is_active', true);

  const { data, error } = await q;
  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to list suppliers' });
  }
  return res.json(data || []);
}

async function createSupplier(req, res) {
  const body = req.body || {};
  const row = {
    name: body.name,
    code: body.code,
    contact_name: body.contact_name ?? null,
    contact_email: body.contact_email ?? null,
    contact_phone: body.contact_phone ?? null,
    bank_name: body.bank_name ?? null,
    bank_account_number: body.bank_account_number ?? null,
    bank_ifsc: body.bank_ifsc ?? null,
    sort_order: body.sort_order ?? 0,
    used_in_pages: body.used_in_pages ?? [],
    used_in_systems: body.used_in_systems ?? [],
    is_active: body.is_active !== undefined ? Boolean(body.is_active) : true,
    created_by: req.user.id,
  };

  if (!row.name || !row.code) {
    return res.status(400).json({ error: 'name and code are required' });
  }

  row.bank_details_complete = computeBankComplete(row);

  const supabase = getSupabase();
  const { data, error } = await supabase.from('suppliers').insert(row).select('*').single();
  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'code must be unique' });
    console.error(error);
    return res.status(500).json({ error: 'Failed to create supplier' });
  }

  await getLog(req).log({
    event_type: 'CONFIG_CREATED',
    entity_type: 'suppliers',
    entity_id: data.id,
    actor_id: req.user.id,
    actor_role: req.user.role,
    before_state: null,
    after_state: data,
    metadata: {},
  });

  return res.status(201).json(data);
}

async function patchSupplier(req, res) {
  const { id } = req.params;
  const body = req.body || {};
  const supabase = getSupabase();
  const { data: existing, error: fe } = await supabase.from('suppliers').select('*').eq('id', id).maybeSingle();
  if (fe) {
    console.error(fe);
    return res.status(500).json({ error: 'Failed to load supplier' });
  }
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const updatable = [
    'name',
    'code',
    'contact_name',
    'contact_email',
    'contact_phone',
    'bank_name',
    'bank_account_number',
    'bank_ifsc',
    'sort_order',
    'used_in_pages',
    'used_in_systems',
    'is_active',
  ];
  const patch = { updated_at: new Date().toISOString() };
  for (const k of updatable) {
    if (body[k] !== undefined) patch[k] = body[k];
  }

  const merged = { ...existing, ...patch };
  patch.bank_details_complete = computeBankComplete(merged);

  const { data: updated, error } = await supabase.from('suppliers').update(patch).eq('id', id).select('*').single();
  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to update supplier' });
  }

  const before_state = {};
  const after_state = {};
  for (const k of Object.keys(patch)) {
    if (k === 'updated_at') continue;
    if (existing[k] !== updated[k]) {
      before_state[k] = existing[k];
      after_state[k] = updated[k];
    }
  }

  await getLog(req).log({
    event_type: 'CONFIG_UPDATED',
    entity_type: 'suppliers',
    entity_id: updated.id,
    actor_id: req.user.id,
    actor_role: req.user.role,
    before_state: Object.keys(before_state).length ? before_state : null,
    after_state: Object.keys(after_state).length ? after_state : null,
    metadata: {},
  });

  return res.json(updated);
}

/** P1-11 — id and name only */
async function missingBankDetails(req, res) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('suppliers')
    .select('id, name')
    .eq('bank_details_complete', false)
    .eq('is_active', true);

  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to load suppliers' });
  }
  return res.json(data || []);
}

module.exports = {
  list,
  createSupplier,
  patchSupplier,
  missingBankDetails,
  computeBankComplete,
};
