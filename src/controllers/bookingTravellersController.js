const { getSupabase } = require('../lib/supabase');
const { addMonthsUtc } = require('../utils/dateHelpers');
const { createDocumentVersion } = require('../services/documentService');
const { enrichDocumentsWithSignedUrls } = require('../lib/documentsStorage');

function log(req) {
  return req.app.locals.logService;
}

function isBlank(v) {
  return v == null || String(v).trim() === '';
}

function nullableTrimContact(v) {
  if (v == null || String(v).trim() === '') return null;
  return String(v).trim();
}

/** Single-traveller POST: only explicit `is_primary: true` counts as primary. */
function travellerPayloadErrorSinglePost(t, prefix) {
  const record = {
    ...t,
    is_primary: t.is_primary === true,
  };
  return travellerStatePayloadError(record, prefix);
}

/**
 * PATCH or inline checks: traveller row must satisfy rules for merged `is_primary`.
 */
function travellerStatePayloadError(record, prefix) {
  const isPrimary = record.is_primary === true;
  const coreRequired = [
    ['full_name', record.full_name],
    ['dob', record.dob],
    ['nationality', record.nationality],
    ['travel_document_id', record.travel_document_id],
    ['passport_expiry_date', record.passport_expiry_date],
  ];
  for (const [k, v] of coreRequired) {
    if (isBlank(v)) {
      return `${prefix}.${k} is required`;
    }
  }
  if (isPrimary) {
    const contactReq = [
      ['phone', record.phone],
      ['email', record.email],
      ['emergency_contact_name', record.emergency_contact_name],
      ['emergency_contact_phone', record.emergency_contact_phone],
    ];
    for (const [k, v] of contactReq) {
      if (isBlank(v)) {
        return `${prefix}.${k} is required when is_primary is true`;
      }
    }
  }
  if (typeof record.visa_needed !== 'boolean') {
    return `${prefix}.visa_needed is required`;
  }
  if (record.visa_needed === false && !record.visa_exemption_proof_url) {
    return `${prefix}.visa_exemption_proof_url required when visa_needed is false`;
  }
  return null;
}

function computePassportAlert(dateOfTravel, passportExpiry) {
  const seven = addMonthsUtc(String(dateOfTravel).slice(0, 10), 7);
  return String(passportExpiry).slice(0, 10) < seven;
}

async function list(req, res) {
  const supabase = getSupabase();
  const bid = req.params.id;
  const { data: rows, error } = await supabase
    .from('booking_travellers')
    .select('*')
    .eq('booking_id', bid)
    .order('sort_order', { ascending: true });
  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to list travellers' });
  }
  const { data: docs } = await supabase
    .from('booking_documents')
    .select('*')
    .eq('booking_id', bid)
    .eq('entity_type', 'traveller');
  const enriched = await enrichDocumentsWithSignedUrls(docs || []);
  const byT = {};
  for (const d of enriched) {
    if (!byT[d.entity_id]) {
      byT[d.entity_id] = [];
    }
    byT[d.entity_id].push(d);
  }
  return res.json((rows || []).map((t) => ({ ...t, documents: byT[t.id] || [] })));
}

async function create(req, res) {
  const supabase = getSupabase();
  const bid = req.params.id;
  const t = req.body || {};
  const err = travellerPayloadErrorSinglePost(t, 'body');
  if (err) {
    return res.status(400).json({ error: err });
  }

  const { data: b } = await supabase.from('bookings').select('date_of_travel').eq('id', bid).maybeSingle();
  if (!b) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  const passportExpiry = String(t.passport_expiry_date).slice(0, 10);
  const passport_alert_shown = computePassportAlert(b.date_of_travel, passportExpiry);

  const { count } = await supabase.from('booking_travellers').select('*', { count: 'exact', head: true }).eq('booking_id', bid);

  const isPrimary = t.is_primary === true;

  const row = {
    booking_id: bid,
    crm_customer_id: t.crm_customer_id != null ? String(t.crm_customer_id).trim() || null : null,
    is_primary: isPrimary,
    full_name: String(t.full_name).trim(),
    dob: String(t.dob).slice(0, 10),
    nationality: String(t.nationality).trim(),
    phone: isPrimary ? String(t.phone).trim() : nullableTrimContact(t.phone),
    email: isPrimary ? String(t.email).trim() : nullableTrimContact(t.email),
    emergency_contact_name: isPrimary
      ? String(t.emergency_contact_name).trim()
      : nullableTrimContact(t.emergency_contact_name),
    emergency_contact_phone: isPrimary
      ? String(t.emergency_contact_phone).trim()
      : nullableTrimContact(t.emergency_contact_phone),
    travel_document_id: String(t.travel_document_id).trim(),
    passport_expiry_date: passportExpiry,
    passport_alert_shown,
    passport_alert_acknowledged: t.passport_alert_acknowledged === true,
    visa_needed: t.visa_needed,
    visa_exemption_proof_url: t.visa_exemption_proof_url != null ? String(t.visa_exemption_proof_url) : null,
    sort_order: count || 0,
  };

  const { data: created, error } = await supabase.from('booking_travellers').insert(row).select('*').single();
  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to create traveller' });
  }

  await log(req).log({
    event_type: 'BOOKING_UPDATED',
    entity_type: 'booking',
    entity_id: bid,
    actor_id: req.user.id,
    actor_role: req.user.role,
    before_state: null,
    after_state: { traveller_added: created.id },
    metadata: { section: 'travellers' },
  });

  return res.status(201).json(created);
}

async function patch(req, res) {
  const supabase = getSupabase();
  const bid = req.params.id;
  const tid = req.params.travellerId;
  const body = req.body || {};

  const { data: existing, error: fe } = await supabase.from('booking_travellers').select('*').eq('id', tid).eq('booking_id', bid).maybeSingle();
  if (fe || !existing) {
    return res.status(404).json({ error: 'Not found' });
  }

  const { data: b } = await supabase.from('bookings').select('date_of_travel').eq('id', bid).maybeSingle();
  const patch = {};
  const assign = (k, v) => {
    if (v !== undefined) {
      patch[k] = v;
    }
  };
  if (body.full_name != null) {
    assign('full_name', String(body.full_name).trim());
  }
  if (body.dob != null) {
    assign('dob', String(body.dob).slice(0, 10));
  }
  if (body.nationality != null) {
    assign('nationality', String(body.nationality).trim());
  }
  if (body.phone !== undefined) {
    assign(
      'phone',
      body.phone == null || String(body.phone).trim() === '' ? null : String(body.phone).trim(),
    );
  }
  if (body.email !== undefined) {
    assign(
      'email',
      body.email == null || String(body.email).trim() === '' ? null : String(body.email).trim(),
    );
  }
  if (body.emergency_contact_name !== undefined) {
    assign(
      'emergency_contact_name',
      body.emergency_contact_name == null || String(body.emergency_contact_name).trim() === ''
        ? null
        : String(body.emergency_contact_name).trim(),
    );
  }
  if (body.emergency_contact_phone !== undefined) {
    assign(
      'emergency_contact_phone',
      body.emergency_contact_phone == null || String(body.emergency_contact_phone).trim() === ''
        ? null
        : String(body.emergency_contact_phone).trim(),
    );
  }
  if (body.travel_document_id != null) {
    assign('travel_document_id', String(body.travel_document_id).trim());
  }
  if (body.passport_expiry_date != null) {
    assign('passport_expiry_date', String(body.passport_expiry_date).slice(0, 10));
  }
  if (body.crm_customer_id !== undefined) {
    patch.crm_customer_id = body.crm_customer_id == null ? null : String(body.crm_customer_id).trim() || null;
  }
  if (body.visa_needed != null) {
    patch.visa_needed = Boolean(body.visa_needed);
  }
  if (body.visa_exemption_proof_url !== undefined) {
    patch.visa_exemption_proof_url =
      body.visa_exemption_proof_url == null ? null : String(body.visa_exemption_proof_url);
  }
  if (body.is_primary != null) {
    patch.is_primary = Boolean(body.is_primary);
  }
  if (body.passport_alert_acknowledged != null) {
    patch.passport_alert_acknowledged = Boolean(body.passport_alert_acknowledged);
  }

  const merged = { ...existing, ...patch };
  const mergedErr = travellerStatePayloadError(merged, 'body');
  if (mergedErr) {
    return res.status(400).json({ error: mergedErr });
  }

  const pe = merged.passport_expiry_date;
  patch.passport_alert_shown = computePassportAlert(b.date_of_travel, pe);
  patch.updated_at = new Date().toISOString();

  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  const before_state = {};
  for (const k of Object.keys(patch)) {
    if (existing[k] !== undefined && existing[k] !== patch[k]) {
      before_state[k] = existing[k];
    }
  }

  const { data: updated, error: ue } = await supabase
    .from('booking_travellers')
    .update(patch)
    .eq('id', tid)
    .select('*')
    .single();
  if (ue) {
    console.error(ue);
    return res.status(500).json({ error: 'Failed to update traveller' });
  }

  const after_state = {};
  for (const k of Object.keys(before_state)) {
    after_state[k] = updated[k];
  }

  await log(req).log({
    event_type: 'BOOKING_UPDATED',
    entity_type: 'booking',
    entity_id: bid,
    actor_id: req.user.id,
    actor_role: req.user.role,
    before_state: Object.keys(before_state).length ? before_state : null,
    after_state: Object.keys(after_state).length ? after_state : null,
    metadata: { traveller_id: tid },
  });

  return res.json(updated);
}

async function uploadDoc(req, res) {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'file is required' });
    }
    const documentType = req.body.document_type || 'other';
    const description = req.body.description || null;
    const tid = req.params.travellerId;
    const bid = req.params.id;

    const supabase = getSupabase();
    const { data: tr } = await supabase.from('booking_travellers').select('id').eq('id', tid).eq('booking_id', bid).maybeSingle();
    if (!tr) {
      return res.status(404).json({ error: 'Traveller not found' });
    }

    const row = await createDocumentVersion({
      bookingId: bid,
      entityType: 'traveller',
      entityId: tid,
      documentType,
      description,
      fileBuffer: file.buffer,
      originalName: file.originalname,
      contentType: file.mimetype,
      userId: req.user.id,
      logService: req.app.locals.logService,
      req,
    });
    return res.status(201).json(row);
  } catch (e) {
    if (e.status === 503 || e.status === 502) {
      return res.status(e.status).json({ error: e.message });
    }
    console.error(e);
    return res.status(500).json({ error: 'Upload failed' });
  }
}

async function listDocs(req, res) {
  const supabase = getSupabase();
  const bid = req.params.id;
  const tid = req.params.travellerId;
  const { data, error } = await supabase
    .from('booking_documents')
    .select('*')
    .eq('booking_id', bid)
    .eq('entity_type', 'traveller')
    .eq('entity_id', tid)
    .order('version', { ascending: false });
  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to list documents' });
  }
  const payload = await enrichDocumentsWithSignedUrls(data || []);
  return res.json(payload);
}

async function ackPassport(req, res) {
  const supabase = getSupabase();
  const bid = req.params.id;
  const tid = req.params.travellerId;
  const acknowledgedAt = new Date().toISOString();
  const acknowledgedBy = req.user.id;
  const { data: updated, error } = await supabase
    .from('booking_travellers')
    .update({
      passport_alert_acknowledged: true,
      passport_alert_acknowledged_by: acknowledgedBy,
      passport_alert_acknowledged_at: acknowledgedAt,
      updated_at: acknowledgedAt,
    })
    .eq('id', tid)
    .eq('booking_id', bid)
    .select('*')
    .single();
  if (error) {
    console.error(error);
    return res.status(404).json({ error: 'Not found' });
  }

  await log(req).log({
    event_type: 'PASSPORT_ALERT_ACKNOWLEDGED',
    entity_type: 'traveller',
    entity_id: tid,
    actor_id: req.user.id,
    actor_role: req.user.role,
    before_state: null,
    after_state: {
      acknowledged: true,
      acknowledged_by: acknowledgedBy,
      acknowledged_at: acknowledgedAt,
    },
    metadata: { booking_id: bid },
  });

  return res.json(updated);
}

module.exports = { list, create, patch, uploadDoc, listDocs, ackPassport };
