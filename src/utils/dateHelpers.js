/** Calendar helpers (UTC date-only strings YYYY-MM-DD). Phase 2 — wizard + invoicing. */

function parseDateOnly(isoDateStr) {
  const [y, m, d] = String(isoDateStr).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatDateOnly(d) {
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const da = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

/** Whole days from today (UTC midnight) until travel date (UTC). */
function daysUntilTravel(dateOfTravelStr) {
  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dot = parseDateOnly(dateOfTravelStr);
  const ms = dot.getTime() - todayUtc.getTime();
  return Math.floor(ms / 86400000);
}

function addMonthsUtc(isoDateStr, months) {
  const d = parseDateOnly(isoDateStr);
  d.setUTCMonth(d.getUTCMonth() + months);
  return formatDateOnly(d);
}

function subDaysUtc(isoDateStr, days) {
  const d = parseDateOnly(isoDateStr);
  d.setUTCDate(d.getUTCDate() - days);
  return formatDateOnly(d);
}

function differenceNights(checkInStr, checkOutStr) {
  const a = parseDateOnly(checkInStr);
  const b = parseDateOnly(checkOutStr);
  const ms = b.getTime() - a.getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

module.exports = {
  parseDateOnly,
  formatDateOnly,
  daysUntilTravel,
  addMonthsUtc,
  subDaysUtc,
  differenceNights,
};
