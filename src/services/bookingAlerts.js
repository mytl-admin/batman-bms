/** P2-12 — case file alerts derived from booking detail shape (no DB round trip). */
function buildBookingAlerts(row) {
  const alerts = [];
  const today = new Date().toISOString().slice(0, 10);

  if (row.is_nrf) {
    alerts.push({
      type: 'nrf',
      severity: 'warning',
      code: 'NRF',
      message: 'Travel is within the non-refundable (NRF) window.',
    });
  }

  for (const t of row.booking_travellers || []) {
    if (t.passport_alert_shown && !t.passport_alert_acknowledged) {
      alerts.push({
        type: 'passport',
        severity: 'warning',
        entity_type: 'traveller',
        entity_id: t.id,
        message: 'Passport expiry is inside the policy alert window; acknowledgement required.',
      });
    }
  }

  for (const g of row.guest_tranches || []) {
    const dot = g.due_date != null ? String(g.due_date).slice(0, 10) : null;
    const overdue =
      g.status === 'overdue' || (g.status === 'pending' && dot != null && dot < today);
    if (overdue) {
      alerts.push({
        type: 'guest_payment',
        severity: 'error',
        entity_type: 'guest_tranche',
        entity_id: g.id,
        message: 'Guest payment is overdue or past due date.',
      });
    }
  }

  for (const fx of row.fx_risk_flags || []) {
    if (fx.status === 'breach') {
      alerts.push({
        type: 'fx_risk',
        severity: 'warning',
        entity_type: 'fx_risk_flag',
        entity_id: fx.id,
        message: `FX risk breach on ${fx.currency || 'FX'} (variance ${fx.variance_pct ?? '—'}%).`,
      });
    }
  }

  return alerts;
}

module.exports = { buildBookingAlerts };
