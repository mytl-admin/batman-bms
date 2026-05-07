const { getSupabase } = require('./supabase');

function signedUrlExpirySeconds() {
  const raw = process.env.DOCUMENTS_SIGNED_URL_TTL_SECONDS;
  if (raw != null && String(raw).trim() !== '') {
    const n = parseInt(String(raw), 10);
    if (!Number.isNaN(n) && n > 0) {
      return n;
    }
  }
  return 3600;
}

/**
 * Upload to private bucket; returns storage path (never a public URL).
 */
async function uploadDocumentBuffer(buffer, objectPath, contentType) {
  const supabase = getSupabase();
  const bucket = process.env.DOCUMENTS_STORAGE_BUCKET;
  if (!bucket) {
    const e = new Error('DOCUMENTS_STORAGE_BUCKET is not configured');
    e.status = 503;
    throw e;
  }
  const { data, error } = await supabase.storage.from(bucket).upload(objectPath, buffer, {
    contentType: contentType || 'application/octet-stream',
    upsert: false,
  });
  if (error) {
    const e = new Error(error.message || 'Storage upload failed');
    e.status = 502;
    throw e;
  }
  return data.path;
}

/**
 * Adds signed_url for each row with file_path. Strips persisted file_url from the payload.
 */
async function enrichDocumentsWithSignedUrls(rows) {
  const isArray = Array.isArray(rows);
  const list = isArray ? rows : rows ? [rows] : [];
  if (list.length === 0) {
    return isArray ? [] : null;
  }

  const bucket = process.env.DOCUMENTS_STORAGE_BUCKET;
  const supabase = getSupabase();
  const ttl = signedUrlExpirySeconds();

  const out = await Promise.all(
    list.map(async (row) => {
      if (!row || typeof row !== 'object') {
        return row;
      }
      const { file_url: _persistedPublicUrlDropped, ...rest } = row;
      let signed_url = null;
      if (bucket && rest.file_path) {
        const { data, error } = await supabase.storage.from(bucket).createSignedUrl(rest.file_path, ttl);
        if (!error && data?.signedUrl) {
          signed_url = data.signedUrl;
        }
      }
      return { ...rest, signed_url };
    }),
  );

  return isArray ? out : out[0] ?? null;
}

module.exports = { uploadDocumentBuffer, enrichDocumentsWithSignedUrls };
