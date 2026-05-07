const { getSupabase } = require('../lib/supabase');
const { createDocumentVersion } = require('../services/documentService');
const { enrichDocumentsWithSignedUrls } = require('../lib/documentsStorage');

async function listGrouped(req, res) {
  const { id: bookingId } = req.params;
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('booking_documents')
    .select('*')
    .eq('booking_id', bookingId)
    .order('entity_type', { ascending: true })
    .order('version', { ascending: false });
  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to list documents' });
  }
  const all = await enrichDocumentsWithSignedUrls(data || []);
  const grouped = {};
  for (const d of all) {
    const key = `${d.entity_type || 'booking'}:${d.entity_id || 'none'}`;
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(d);
  }
  return res.json({ grouped, all });
}

async function uploadBookingDocument(req, res) {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'file is required (multipart field: file)' });
    }
    const documentType = req.body.document_type || 'other';
    const description = req.body.description || null;
    const entityType = req.body.entity_type || null;
    const entityId = req.body.entity_id || null;

    const row = await createDocumentVersion({
      bookingId: req.params.id,
      entityType: entityType || undefined,
      entityId: entityId || undefined,
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

async function listVersions(req, res) {
  const { id: bookingId, documentId } = req.params;
  const supabase = getSupabase();
  const { data: doc, error: e1 } = await supabase.from('booking_documents').select('*').eq('id', documentId).maybeSingle();
  if (e1 || !doc || doc.booking_id !== bookingId) {
    return res.status(404).json({ error: 'Not found' });
  }

  let q = supabase
    .from('booking_documents')
    .select('*')
    .eq('booking_id', doc.booking_id)
    .eq('document_type', doc.document_type)
    .eq('document_name', doc.document_name);
  if (doc.entity_type) {
    q = q.eq('entity_type', doc.entity_type);
  } else {
    q = q.is('entity_type', null);
  }
  if (doc.entity_id) {
    q = q.eq('entity_id', doc.entity_id);
  } else {
    q = q.is('entity_id', null);
  }

  const { data: versions, error } = await q.order('version', { ascending: false });
  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to load versions' });
  }
  const payload = await enrichDocumentsWithSignedUrls(versions || []);
  return res.json(payload);
}

module.exports = { listGrouped, uploadBookingDocument, listVersions };
