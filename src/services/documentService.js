const { getSupabase } = require('../lib/supabase');
const { uploadDocumentBuffer, enrichDocumentsWithSignedUrls } = require('../lib/documentsStorage');

function sanitizeFilename(name) {
  return String(name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180);
}

function hasValue(v) {
  return v != null && String(v).trim() !== '';
}

async function deactivateSlot(supabase, bookingId, entityType, entityId, documentType, documentName) {
  let q = supabase
    .from('booking_documents')
    .update({ is_active: false })
    .eq('booking_id', bookingId)
    .eq('document_type', documentType)
    .eq('document_name', documentName);
  if (hasValue(entityType)) {
    q = q.eq('entity_type', entityType);
  } else {
    q = q.is('entity_type', null);
  }
  if (hasValue(entityId)) {
    q = q.eq('entity_id', entityId);
  } else {
    q = q.is('entity_id', null);
  }
  const { error } = await q;
  return error;
}

async function nextVersion(supabase, bookingId, entityType, entityId, documentType, documentName) {
  let q = supabase
    .from('booking_documents')
    .select('version')
    .eq('booking_id', bookingId)
    .eq('document_type', documentType)
    .eq('document_name', documentName);
  if (hasValue(entityType)) {
    q = q.eq('entity_type', entityType);
  } else {
    q = q.is('entity_type', null);
  }
  if (hasValue(entityId)) {
    q = q.eq('entity_id', entityId);
  } else {
    q = q.is('entity_id', null);
  }
  const { data, error } = await q.order('version', { ascending: false }).limit(1).maybeSingle();
  if (error) {
    throw error;
  }
  return (data?.version || 0) + 1;
}

async function createDocumentVersion({
  bookingId,
  entityType,
  entityId,
  documentType,
  description,
  fileBuffer,
  originalName,
  contentType,
  userId,
  logService,
  req,
}) {
  const supabase = getSupabase();
  const documentName = sanitizeFilename(originalName);

  const deErr = await deactivateSlot(supabase, bookingId, entityType, entityId, documentType, documentName);
  if (deErr) {
    throw deErr;
  }

  const version = await nextVersion(supabase, bookingId, entityType, entityId, documentType, documentName);

  const safeEnt = entityType || 'booking';
  const safeEid = entityId || 'root';
  const objectPath = `${bookingId}/${safeEnt}/${safeEid}/${Date.now()}-${documentName}`;
  const filePath = await uploadDocumentBuffer(fileBuffer, objectPath, contentType);

  const { data: row, error: insErr } = await supabase
    .from('booking_documents')
    .insert({
      booking_id: bookingId,
      entity_type: entityType || null,
      entity_id: entityId || null,
      document_name: documentName,
      document_type: documentType,
      version,
      file_path: filePath,
      file_url: null,
      is_active: true,
      uploaded_by: userId,
      description: description || null,
    })
    .select('*')
    .single();
  if (insErr) {
    throw insErr;
  }

  const enriched = await enrichDocumentsWithSignedUrls(row);

  if (logService) {
    await logService.log({
      event_type: 'DOCUMENT_UPLOADED',
      entity_type: 'booking_document',
      entity_id: row.id,
      actor_id: userId,
      actor_role: req?.user?.role,
      before_state: null,
      after_state: {
        booking_id: row.booking_id,
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        document_name: row.document_name,
        document_type: row.document_type,
        version: row.version,
        file_path: row.file_path,
        is_active: row.is_active,
      },
      metadata: { booking_id: bookingId, version },
    });
  }

  return enriched;
}

module.exports = { createDocumentVersion, sanitizeFilename };
