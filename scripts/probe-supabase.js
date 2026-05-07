#!/usr/bin/env node
/**
 * Smoke-check Supabase from .env.dev (no extra deps).
 * Usage: node --env-file=.env.dev scripts/probe-supabase.js
 */
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const endpoint = `${url.replace(/\/$/, '')}/rest/v1/users?select=id&limit=1`;
fetch(endpoint, {
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
  },
})
  .then(async (r) => {
    const text = await r.text();
    console.log('GET /rest/v1/users →', r.status);
    if (text.length < 500) console.log(text);
    else console.log(text.slice(0, 200) + '…');
    if (r.status === 200) {
      console.log('OK: public.users exists (migrations likely applied).');
    } else if (r.status === 404 || text.includes('does not exist') || text.includes('PGRST')) {
      console.log('Hint: run supabase/migrations/_RUN_ALL_IN_ORDER.sql in Supabase SQL Editor.');
    }
  })
  .catch((e) => {
    console.error('Request failed:', e.message);
    process.exit(1);
  });
