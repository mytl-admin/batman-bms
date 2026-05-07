/**
 * Build a single human-readable message from a Supabase/PostgREST error object
 * (for API 500 responses when debugging schema or constraint issues).
 */
function supabaseErrorMessage(err) {
  if (err == null) {
    return 'Unknown error';
  }
  if (typeof err === 'object') {
    const parts = [err.message, err.details, err.hint].filter((p) => p && String(p).trim());
    if (parts.length) {
      return parts.join(' — ');
    }
  }
  return String(err);
}

/** Drop fare_rules from a row/patch so inserts work when migration 006 is not applied yet. */
function omitFareRules(obj) {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }
  const { fare_rules: _fr, ...rest } = obj;
  return rest;
}

/**
 * True when the DB/API rejects fare_rules because the column is missing
 * (PostgREST PGRST204 or PostgreSQL 42703).
 */
function isMissingFareRulesColumnError(err) {
  if (err == null || typeof err !== 'object') {
    return false;
  }
  const text = `${err.message || ''} ${err.details || ''} ${err.hint || ''}`;
  if (!/fare_rules/i.test(text)) {
    return false;
  }
  if (err.code === 'PGRST204' || err.code === '42703') {
    return true;
  }
  return /schema cache|could not find|does not exist/i.test(text);
}

async function insertBookingLineItemWithFareRulesFallback(supabase, table, row) {
  let result = await supabase.from(table).insert(row).select('*').single();
  if (result.error && isMissingFareRulesColumnError(result.error)) {
    result = await supabase.from(table).insert(omitFareRules(row)).select('*').single();
  }
  return result;
}

module.exports = {
  supabaseErrorMessage,
  omitFareRules,
  isMissingFareRulesColumnError,
  insertBookingLineItemWithFareRulesFallback,
};
