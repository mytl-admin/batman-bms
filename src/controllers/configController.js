const { getSupabase } = require('../lib/supabase');
const {
  CONFIG_SLUG_TO_TABLE,
  RESERVED_CONFIG_SLUGS,
  EMAIL_TEMPLATE_SLUG,
} = require('../config/configSlugs');

function getLogService(req) {
  return req.app.locals.logService;
}

function tableForSlug(slug) {
  if (!slug || RESERVED_CONFIG_SLUGS.has(slug)) return null;
  return CONFIG_SLUG_TO_TABLE[slug] || null;
}

function parseBool(v, defaultVal = true) {
  if (v === undefined || v === null || v === '') return defaultVal;
  if (v === 'false' || v === '0') return false;
  return true;
}

async function listConfig(req, res) {
  const { config: slug } = req.params;
  const table = tableForSlug(slug);
  if (!table) return res.status(404).json({ error: 'Unknown config' });

  const activeOnly = parseBool(req.query.active_only, true);
  const supabase = getSupabase();
  let q = supabase.from(table).select('*').order('sort_order', { ascending: true });
  if (activeOnly) q = q.eq('is_active', true);

  const { data, error } = await q;
  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to load config' });
  }
  return res.json(data || []);
}

async function getConfigOne(req, res) {
  const { config: slug, id } = req.params;
  const table = tableForSlug(slug);
  if (!table) return res.status(404).json({ error: 'Unknown config' });

  const supabase = getSupabase();
  const { data, error } = await supabase.from(table).select('*').eq('id', id).maybeSingle();
  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to load config' });
  }
  if (!data) return res.status(404).json({ error: 'Not found' });
  return res.json(data);
}

function buildStandardInsertBody(body, reqUserId) {
  const row = {
    name: body.name,
    code: body.code,
    sort_order: body.sort_order ?? 0,
    used_in_pages: body.used_in_pages ?? [],
    used_in_systems: body.used_in_systems ?? [],
    is_active: body.is_active !== undefined ? Boolean(body.is_active) : true,
    created_by: reqUserId,
  };
  return row;
}

function validateStandard(body) {
  if (!body.name || !body.code) return 'name and code are required';
  return null;
}

async function createConfig(req, res) {
  const { config: slug } = req.params;
  const table = tableForSlug(slug);
  if (!table) return res.status(404).json({ error: 'Unknown config' });

  const body = req.body || {};
  if (slug === EMAIL_TEMPLATE_SLUG) {
    if (!body.name || !body.code || !body.subject || !body.body) {
      return res.status(400).json({ error: 'name, code, subject, and body are required' });
    }
    const row = {
      name: body.name,
      code: body.code,
      subject: body.subject,
      body: body.body,
      variables: body.variables ?? [],
      sort_order: body.sort_order ?? 0,
      used_in_pages: body.used_in_pages ?? [],
      used_in_systems: body.used_in_systems ?? [],
      is_active: body.is_active !== undefined ? Boolean(body.is_active) : true,
      created_by: req.user.id,
    };
    const supabase = getSupabase();
    const { data, error } = await supabase.from(table).insert(row).select('*').single();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'code must be unique' });
      console.error(error);
      return res.status(500).json({ error: 'Failed to create' });
    }
    await getLogService(req).log({
      event_type: 'CONFIG_CREATED',
      entity_type: table,
      entity_id: data.id,
      actor_id: req.user.id,
      actor_role: req.user.role,
      before_state: null,
      after_state: data,
      metadata: { slug },
    });
    return res.status(201).json(data);
  }

  const err = validateStandard(body);
  if (err) return res.status(400).json({ error: err });

  const row = buildStandardInsertBody(body, req.user.id);
  const supabase = getSupabase();
  const { data, error } = await supabase.from(table).insert(row).select('*').single();
  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'code must be unique' });
    console.error(error);
    return res.status(500).json({ error: 'Failed to create' });
  }
  await getLogService(req).log({
    event_type: 'CONFIG_CREATED',
    entity_type: table,
    entity_id: data.id,
    actor_id: req.user.id,
    actor_role: req.user.role,
    before_state: null,
    after_state: data,
    metadata: { slug },
  });
  return res.status(201).json(data);
}

async function patchConfig(req, res) {
  const { config: slug, id } = req.params;
  const table = tableForSlug(slug);
  if (!table) return res.status(404).json({ error: 'Unknown config' });

  const body = req.body || {};
  const supabase = getSupabase();
  const { data: existing, error: fe } = await supabase.from(table).select('*').eq('id', id).maybeSingle();
  if (fe) {
    console.error(fe);
    return res.status(500).json({ error: 'Failed to load' });
  }
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const patch = { updated_at: new Date().toISOString() };
  const standardKeys = ['name', 'code', 'sort_order', 'used_in_pages', 'used_in_systems', 'is_active'];
  for (const k of standardKeys) {
    if (body[k] !== undefined) patch[k] = body[k];
  }
  if (slug === EMAIL_TEMPLATE_SLUG) {
    ['subject', 'body', 'variables'].forEach((k) => {
      if (body[k] !== undefined) patch[k] = body[k];
    });
  }

  const { data: updated, error } = await supabase.from(table).update(patch).eq('id', id).select('*').single();
  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to update' });
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

  await getLogService(req).log({
    event_type: 'CONFIG_UPDATED',
    entity_type: table,
    entity_id: updated.id,
    actor_id: req.user.id,
    actor_role: req.user.role,
    before_state: Object.keys(before_state).length ? before_state : null,
    after_state: Object.keys(after_state).length ? after_state : null,
    metadata: { slug },
  });

  return res.json(updated);
}

async function getAllActive(req, res) {
  const supabase = getSupabase();
  const keys = Object.keys(CONFIG_SLUG_TO_TABLE);
  const out = {};
  await Promise.all(
    keys.map(async (slug) => {
      const table = CONFIG_SLUG_TO_TABLE[slug];
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (error) {
        out[slug] = { error: error.message };
      } else {
        out[slug] = data || [];
      }
    }),
  );
  return res.json(out);
}

async function getRateCurrent(table, field, res) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from(table)
    .select(field)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to load rate' });
  }
  if (!data) return res.status(404).json({ error: 'No active configuration' });
  return res.json(data);
}

async function postRate(table, body, fieldName, req, slug) {
  const val = body[fieldName];
  const effectiveFrom = body.effective_from;
  if (val === undefined || val === null) {
    return { ok: false, status: 400, body: { error: `${fieldName} is required` } };
  }
  if (table !== 'config_fx_risk_threshold' && !effectiveFrom) {
    return { ok: false, status: 400, body: { error: 'effective_from is required' } };
  }

  const supabase = getSupabase();
  await supabase.from(table).update({ is_active: false }).eq('is_active', true);

  const insert = {
    [fieldName]: val,
    is_active: true,
    created_by: req.user.id,
  };
  if (effectiveFrom) insert.effective_from = effectiveFrom;

  const { data, error } = await supabase.from(table).insert(insert).select('*').single();
  if (error) {
    console.error(error);
    return { ok: false, status: 500, body: { error: 'Failed to save' } };
  }

  await getLogService(req).log({
    event_type: 'CONFIG_CREATED',
    entity_type: table,
    entity_id: data.id,
    actor_id: req.user.id,
    actor_role: req.user.role,
    before_state: null,
    after_state: data,
    metadata: { slug },
  });

  return { ok: true, data };
}

/** TCS rate is stored as decimal (0.02); tolerate legacy rows where rate was stored as percent (2). */
function normalizeTaxRateDecimal(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  if (n > 1) return n / 100;
  return n;
}

async function getTcsCurrent(req, res) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('config_tcs_rate')
    .select('rate')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to load rate' });
  }
  if (!data) return res.status(404).json({ error: 'No active configuration' });
  return res.json({ rate: normalizeTaxRateDecimal(data.rate) });
}
async function getGstCurrent(req, res) {
  return getRateCurrent('config_gst_rate', 'rate', res);
}
async function getFxCurrent(req, res) {
  return getRateCurrent('config_fx_risk_threshold', 'threshold_pct', res);
}

async function postTcs(req, res) {
  const r = await postRate('config_tcs_rate', req.body || {}, 'rate', req, 'tcs-rate');
  if (!r.ok) return res.status(r.status).json(r.body);
  return res.status(201).json(r.data);
}
async function postGst(req, res) {
  const r = await postRate('config_gst_rate', req.body || {}, 'rate', req, 'gst-rate');
  if (!r.ok) return res.status(r.status).json(r.body);
  return res.status(201).json(r.data);
}
async function postFx(req, res) {
  const r = await postRate('config_fx_risk_threshold', req.body || {}, 'threshold_pct', req, 'fx-threshold');
  if (!r.ok) return res.status(r.status).json(r.body);
  return res.status(201).json(r.data);
}

module.exports = {
  listConfig,
  getConfigOne,
  createConfig,
  patchConfig,
  getAllActive,
  getTcsCurrent,
  getGstCurrent,
  getFxCurrent,
  postTcs,
  postGst,
  postFx,
};
