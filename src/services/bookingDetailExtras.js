const { buildInvoicePayload } = require('./invoicePayload');
const { buildBookingAlerts } = require('./bookingAlerts');
const { enrichDocumentsWithSignedUrls } = require('../lib/documentsStorage');

async function mergeVisaApplicants(supabase, row) {
  const visaIds = (row.booking_visas || []).map((v) => v.id).filter(Boolean);
  if (visaIds.length === 0) {
    return;
  }
  const { data: applicants, error: aErr } = await supabase
    .from('booking_visa_applicants')
    .select('id, visa_id, traveller_id')
    .in('visa_id', visaIds);

  if (aErr || !applicants?.length) {
    return;
  }
  const byVisa = {};
  for (const a of applicants) {
    if (!byVisa[a.visa_id]) {
      byVisa[a.visa_id] = [];
    }
    byVisa[a.visa_id].push(a);
  }
  for (const v of row.booking_visas || []) {
    v.booking_visa_applicants = byVisa[v.id] || [];
  }
}

async function loadGuestSupplierLinks(supabase, row) {
  const gids = (row.guest_tranches || []).map((g) => g.id).filter(Boolean);
  if (gids.length === 0) {
    return [];
  }
  const { data, error } = await supabase
    .from('guest_supplier_tranche_links')
    .select('*')
    .in('guest_tranche_id', gids);
  if (error) {
    /* eslint-disable-next-line no-console */
    console.error(error);
    return [];
  }
  return data || [];
}

function filterInactiveLineItems(row) {
  for (const key of ['booking_flights', 'booking_hotels', 'booking_land_items', 'booking_visas']) {
    if (Array.isArray(row[key])) {
      row[key] = row[key].filter((item) => item && item.is_active !== false);
    }
  }
}

/**
 * P2-12 — full case-file extras: visa applicants, tranche links, invoice, alerts.
 */
async function hydrateBookingDetail(supabase, row) {
  filterInactiveLineItems(row);
  await mergeVisaApplicants(supabase, row);
  if (Array.isArray(row.booking_documents) && row.booking_documents.length > 0) {
    row.booking_documents = await enrichDocumentsWithSignedUrls(row.booking_documents);
  }
  const guest_supplier_tranche_links = await loadGuestSupplierLinks(supabase, row);
  const invoice = await buildInvoicePayload(row.id);
  const alerts = buildBookingAlerts(row);
  return {
    ...row,
    guest_supplier_tranche_links,
    invoice: invoice || null,
    alerts,
  };
}

module.exports = { hydrateBookingDetail, mergeVisaApplicants, loadGuestSupplierLinks };
