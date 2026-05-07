const { subDaysUtc } = require('./dateHelpers');

/** P2-16 — 5-day buffer (inclusive supplier boundary → stored “our” date). */
function calculateOurPolicyDate(supplierDate) {
  if (!supplierDate) {
    return null;
  }
  return subDaysUtc(String(supplierDate).slice(0, 10), 5);
}

module.exports = { calculateOurPolicyDate };
