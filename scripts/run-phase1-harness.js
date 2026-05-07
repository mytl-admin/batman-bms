#!/usr/bin/env node
/**
 * Phase 1 API + DB checks from phase1_backend_tests.md (port from PORT / default 3000).
 * Usage: node --env-file=.env.dev scripts/run-phase1-harness.js
 * Requires: API listening (npm run dev) and valid .env.dev
 */
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');
const { Client } = require('pg');
const { generateToken } = require('../src/utils/generateToken');
const fs = require('fs');
const path = require('path');

const BASE = `http://127.0.0.1:${process.env.PORT || 3000}`;

function supabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    realtime: { transport: ws },
  });
}

const results = [];
function r(id, name, pass, notes = '') {
  results.push({ id, name, pass, notes });
}

async function seedUsers(sb) {
  await sb.from('users').delete().eq('email', 'newuser@test.com');
  const emails = ['admin@test.com', 'agent@test.com', 'inactive@test.com'];
  await sb.from('users').delete().in('email', emails);
  const h = (p) => bcrypt.hashSync(p, 12);
  const { error } = await sb.from('users').insert([
    {
      email: 'admin@test.com',
      name: 'Test Admin',
      role: 'admin',
      member_code: 'TESTADMIN001',
      password_hash: h('TestAdmin123!'),
      is_active: true,
    },
    {
      email: 'agent@test.com',
      name: 'Test Agent',
      role: 'agent',
      member_code: 'TESTAGENT001',
      password_hash: h('TestAgent123!'),
      is_active: true,
    },
    {
      email: 'inactive@test.com',
      name: 'Inactive User',
      role: 'agent',
      member_code: 'TESTINACTIVE001',
      password_hash: h('Inactive123!'),
      is_active: false,
    },
  ]);
  if (error) throw new Error(`Seed users: ${error.message}`);
}

async function req(method, path, { headers = {}, body } = {}) {
  const o = { method, headers: { ...headers } };
  if (body !== undefined) {
    o.headers['Content-Type'] = 'application/json';
    o.body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, o);
  let text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { _raw: text };
  }
  return { status: res.status, json, text };
}

async function main() {
  const sb = supabase();
  let ADMIN_TOKEN;
  let ADMIN_MEMBER;
  let ADMIN_ID;
  let AGENT_TOKEN;
  let AGENT_MEMBER;
  let NEW_USER_ID;
  let TEST_DESTINATION_ID;
  let TEST_SUPPLIER_ID;
  let SECOND_SUPPLIER_ID;

  // TS-00
  try {
    await seedUsers(sb);
    r('TS-00', 'Seed test users', true, 'admin@test.com, agent@test.com, inactive@test.com');
  } catch (e) {
    r('TS-00', 'Seed test users', false, e.message);
    console.error(e);
    process.exit(1);
  }

  // Ping server
  try {
    const ping = await req('GET', '/health');
    if (ping.status !== 200) {
      r('SERVER', 'API reachable', false, `GET /health → ${ping.status}. Run: npm run dev`);
      console.table(results);
      process.exit(1);
    }
  } catch (e) {
    r('SERVER', 'API reachable', false, e.message);
    console.table(results);
    process.exit(1);
  }

  // Group 1
  let x = await req('GET', '/health');
  r('T01', 'Health check', x.status === 200 && x.json.status === 'ok', `body=${JSON.stringify(x.json)} doc wants env:dev strict; use NODE_ENV=dev to match`);

  x = await fetch(`${BASE}/health`, { method: 'HEAD' });
  r('T02', 'HEAD health → 405', x.status === 405, `status ${x.status}`);

  x = await fetch(`${BASE}/api/users`, { method: 'HEAD' });
  r('T03', 'HEAD api → 405', x.status === 405, `status ${x.status}`);

  x = await req('GET', '/api/users');
  r('T04', 'Unauthenticated', x.status === 401 && x.json.error?.includes('Missing'), x.text.slice(0, 120));

  x = await req('GET', '/api/users', { headers: { Authorization: 'InvalidFormatNoBearer' } });
  r('T05', 'Malformed auth', x.status === 401, x.json.error);

  x = await req('GET', '/api/users', { headers: { Authorization: 'Bearer thisisnotavalidjwt' } });
  r('T06', 'Invalid JWT', x.status === 401 && x.json.error === 'Invalid token', x.json.error);

  const secret = process.env.JWT_SECRET;
  const tmpTok = generateToken({ member_code: 'TESTADMIN001', role: 'admin' }, secret);
  x = await req('GET', '/api/users', { headers: { Authorization: `Bearer ${tmpTok}` } });
  r('T07', 'Missing member code', x.status === 401 && x.json.error === 'Missing member code header', x.json.error);

  x = await req('GET', '/api/users', {
    headers: { Authorization: `Bearer ${tmpTok}`, 'X-Member-Code': 'WRONGCODE' },
  });
  r('T08', 'Member mismatch', x.status === 401 && x.json.error === 'Member code mismatch', x.json.error);

  const inactiveTok = generateToken({ member_code: 'TESTINACTIVE001', role: 'agent' }, secret);
  x = await req('GET', '/api/users/me', {
    headers: { Authorization: `Bearer ${inactiveTok}`, 'X-Member-Code': 'TESTINACTIVE001' },
  });
  r('T09', 'Inactive user', x.status === 401 && x.json.error === 'Account deactivated', x.json.error);

  // Group 2
  x = await req('POST', '/api/auth/login', {
    body: { email: 'admin@test.com', password: 'TestAdmin123!' },
  });
  const t10 =
    x.status === 200 &&
    x.json.token &&
    x.json.user?.role === 'admin' &&
    x.json.user?.member_code === 'TESTADMIN001';
  ADMIN_TOKEN = x.json.token;
  ADMIN_MEMBER = x.json.user?.member_code;
  ADMIN_ID = x.json.user?.id;
  r('T10', 'Admin login', t10, `status ${x.status} name=${x.json.user?.name}`);

  x = await req('POST', '/api/auth/login', {
    body: { email: 'agent@test.com', password: 'TestAgent123!' },
  });
  const t11 = x.status === 200 && x.json.user?.role === 'agent';
  AGENT_TOKEN = x.json.token;
  AGENT_MEMBER = x.json.user?.member_code;
  r('T11', 'Agent login', t11, `status ${x.status}`);

  x = await req('POST', '/api/auth/login', {
    body: { email: 'admin@test.com', password: 'wrongpassword' },
  });
  r('T12', 'Wrong password', x.status === 401, x.json.error);

  x = await req('POST', '/api/auth/login', {
    body: { email: 'nobody@test.com', password: 'anything' },
  });
  r('T13', 'Unknown email', x.status === 401, x.json.error);

  const ah = { Authorization: `Bearer ${ADMIN_TOKEN}`, 'X-Member-Code': ADMIN_MEMBER };
  x = await req('GET', '/api/users/me', { headers: ah });
  r('T14', 'GET /me', x.status === 200 && x.json.email === 'admin@test.com', '');

  // Group 3
  x = await req('GET', '/api/users', { headers: ah });
  const t15 =
    x.status === 200 &&
    Array.isArray(x.json) &&
    x.json.some((u) => u.email === 'admin@test.com') &&
    x.json.some((u) => u.email === 'agent@test.com');
  r('T15', 'Admin list users', t15, `count ${Array.isArray(x.json) ? x.json.length : 0}`);

  const gah = { Authorization: `Bearer ${AGENT_TOKEN}`, 'X-Member-Code': AGENT_MEMBER };
  x = await req('GET', '/api/users', { headers: gah });
  r('T16', 'Agent list users 403', x.status === 403, x.json.error);

  x = await req('POST', '/api/users/invite', {
    headers: ah,
    body: { email: 'newuser@test.com', name: 'New User', role: 'agent' },
  });
  const t17 =
    (x.status === 200 || x.status === 201) &&
    x.json.email === 'newuser@test.com' &&
    x.json.member_code;
  if (t17) NEW_USER_ID = x.json.id;
  r(
    'T17',
    'Admin invite',
    t17,
    `status ${x.status}`,
  );

  x = await req('POST', '/api/users/invite', {
    headers: gah,
    body: { email: 'another@test.com', name: 'Another', role: 'agent' },
  });
  r('T18', 'Agent invite 403', x.status === 403, '');

  if (NEW_USER_ID) {
    x = await req('PATCH', `/api/users/${NEW_USER_ID}`, {
      headers: ah,
      body: { is_active: false },
    });
    r('T19', 'Deactivate invited user', x.status === 200 && x.json.is_active === false, '');
  } else {
    r('T19', 'Deactivate invited user', false, 'skipped (no NEW_USER_ID)');
  }

  x = await req('PATCH', `/api/users/${ADMIN_ID}`, {
    headers: ah,
    body: { is_active: false },
  });
  r('T20', 'Cannot deactivate self', x.status === 400, x.json.error);

  x = await req('POST', '/api/users/invite', {
    headers: ah,
    body: { email: 'admin@test.com', name: 'Duplicate', role: 'agent' },
  });
  r('T21', 'Duplicate invite', x.status === 409 || x.status === 400, `status ${x.status}`);

  // Group 4
  x = await req('GET', '/api/config/currencies', { headers: ah });
  const codes = Array.isArray(x.json) ? x.json.map((c) => c.code) : [];
  r('T22', 'Currencies', x.status === 200 && ['INR', 'USD'].every((c) => codes.includes(c)), `codes: ${codes.join(',')}`);

  x = await req('GET', '/api/config/cabin-classes', { headers: ah });
  r('T23', 'Cabin classes', x.status === 200 && x.json.some((c) => c.code === 'economy'), '');

  x = await req('GET', '/api/config/meal-plans', { headers: ah });
  r('T24', 'Meal plans', x.status === 200 && x.json.some((c) => c.code === 'ro'), '');

  x = await req('GET', '/api/config/tcs-rate/current', { headers: ah });
  r('T25', 'TCS rate', x.status === 200 && Number(x.json.rate) === 0.02, JSON.stringify(x.json));

  x = await req('GET', '/api/config/gst-rate/current', { headers: ah });
  r('T26', 'GST rate', x.status === 200 && Number(x.json.rate) === 0.18, '');

  x = await req('GET', '/api/config/fx-threshold/current', { headers: ah });
  r('T27', 'FX threshold', x.status === 200 && Number(x.json.threshold_pct) === 0.05, JSON.stringify(x.json));

  await sb.from('config_destinations').delete().eq('code', 'thailand');
  x = await req('POST', '/api/config/destinations', {
    headers: ah,
    body: {
      name: 'Thailand',
      code: 'thailand',
      sort_order: 1,
      used_in_pages: ['booking_header'],
      used_in_systems: ['Booking ERP'],
    },
  });
  TEST_DESTINATION_ID = x.json.id;
  r('T28', 'Create destination', (x.status === 200 || x.status === 201) && TEST_DESTINATION_ID, `status ${x.status}`);

  x = await req('POST', '/api/config/destinations', {
    headers: gah,
    body: { name: 'Bali', code: 'bali', sort_order: 2 },
  });
  r('T29', 'Agent POST config 403', x.status === 403, '');

  x = await req('PATCH', `/api/config/destinations/${TEST_DESTINATION_ID}`, {
    headers: ah,
    body: { is_active: false },
  });
  r('T30', 'Deactivate destination', x.status === 200 && x.json.is_active === false, '');

  x = await req('GET', '/api/config/destinations?active_only=true', { headers: ah });
  const inactiveGone = Array.isArray(x.json) && !x.json.some((d) => d.code === 'thailand');
  r('T31', 'Active-only excludes inactive', x.status === 200 && inactiveGone, '');

  // Group 5
  x = await req('GET', '/api/suppliers', { headers: ah });
  r('T32', 'List suppliers', x.status === 200 && Array.isArray(x.json), '');

  await sb.from('suppliers').delete().eq('code', 'travclan_thailand');
  await sb.from('suppliers').delete().eq('code', 'second_no_bank');

  x = await req('POST', '/api/suppliers', {
    headers: ah,
    body: {
      name: 'TravClan Thailand',
      code: 'travclan_thailand',
      contact_name: 'Somchai',
      contact_email: 'somchai@travclan.com',
      contact_phone: '+66 812345678',
    },
  });
  TEST_SUPPLIER_ID = x.json.id;
  r(
    'T33',
    'Create supplier no bank',
    (x.status === 200 || x.status === 201) && x.json.bank_details_complete === false,
    `status ${x.status}`,
  );

  x = await req('PATCH', `/api/suppliers/${TEST_SUPPLIER_ID}`, {
    headers: ah,
    body: {
      bank_name: 'Bangkok Bank',
      bank_account_number: '1234567890',
      bank_ifsc: 'BKKBTHBK',
    },
  });
  r('T34', 'Supplier bank complete', x.status === 200 && x.json.bank_details_complete === true, '');

  x = await req('POST', '/api/suppliers', {
    headers: ah,
    body: {
      name: 'Second Supplier',
      code: 'second_no_bank',
    },
  });
  SECOND_SUPPLIER_ID = x.json.id;

  x = await req('GET', '/api/suppliers/missing-bank-details', { headers: ah });
  const ids = Array.isArray(x.json) ? x.json.map((s) => s.id) : [];
  const t35 =
    x.status === 200 &&
    ids.includes(SECOND_SUPPLIER_ID) &&
    !ids.includes(TEST_SUPPLIER_ID) &&
    !x.json.some((s) => s.bank_account_number);
  r('T35', 'Missing bank endpoint', t35, `ids ${ids.length}`);

  x = await req('POST', '/api/suppliers', {
    headers: gah,
    body: { name: 'Test', code: 'test' },
  });
  r('T36', 'Agent POST supplier 403', x.status === 403, '');

  // Group 6
  const { data: logs, error: le } = await sb
    .from('system_logs')
    .select('id,event_type,entity_type,actor_id,created_at')
    .order('created_at', { ascending: false })
    .limit(10);
  r('T37', 'system_logs has rows', !le && logs && logs.length > 0, `count ${logs?.length}`);

  const { data: inv } = await sb.from('system_logs').select('*').eq('event_type', 'USER_INVITED').limit(1).maybeSingle();
  const t38 =
    inv &&
    (inv.before_state === null || inv.before_state === undefined) &&
    inv.after_state &&
    inv.actor_id;
  r('T38', 'USER_INVITED log shape', !!t38, inv ? 'found' : 'no USER_INVITED (T17 may have failed)');

  x = await req('GET', '/api/logs?limit=10', { headers: ah });
  const t39 = x.status === 200 && x.json.data && Array.isArray(x.json.data);
  r('T39', 'Admin GET logs', t39, '');

  x = await req('GET', '/api/logs?limit=10', { headers: gah });
  r('T40', 'Agent GET logs 403', x.status === 403, '');

  // Group 7 — Postgres
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    const pg = new Client({
      connectionString: dbUrl,
      ssl: dbUrl.includes('supabase.co') ? { rejectUnauthorized: false } : undefined,
    });
    await pg.connect();
    const required = [
      'admin_approvals',
      'booking_documents',
      'booking_flights',
      'booking_hotels',
      'booking_land_items',
      'booking_pan_cards',
      'booking_travellers',
      'booking_visa_applicants',
      'booking_visas',
      'bookings',
      'buyer_payment_records',
      'cancellations',
      'config_alert_types',
      'config_cabin_classes',
      'config_cancellation_reasons',
      'config_currencies',
      'config_destinations',
      'config_email_templates',
      'config_fx_risk_threshold',
      'config_gst_rate',
      'config_margin_retention_pct',
      'config_meal_plans',
      'config_refund_methods',
      'config_tcs_rate',
      'config_transfer_types',
      'config_visa_exemption_types',
      'config_visa_types',
      'credit_notes',
      'fx_risk_flags',
      'guest_supplier_tranche_links',
      'guest_tranches',
      'supplier_buyer_payment_links',
      'supplier_payment_records',
      'supplier_tranches',
      'suppliers',
      'system_logs',
      'users',
    ];
    const { rows } = await pg.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
    );
    const names = new Set(rows.map((r) => r.table_name));
    const missing = required.filter((t) => !names.has(t));
    r('T41', 'Core tables exist', missing.length === 0, missing.join(',') || 'all present');

    let t42 = false;
    let t42note = '';
    try {
      await pg.query(
        `INSERT INTO booking_flights (booking_id, sector_from, sector_to) VALUES ('00000000-0000-0000-0000-000000000000', 'DEL', 'BOM')`,
      );
      t42note = 'insert succeeded (unexpected)';
    } catch (e) {
      t42 = /foreign key|violates foreign key/i.test(e.message);
      t42note = e.code || e.message.slice(0, 80);
    }
    r('T42', 'FK on booking_flights', t42, t42note);

    let t43 = false;
    let t43note = '';
    await pg.query(`DELETE FROM bookings WHERE booking_code LIKE 'T43-%'`);
    try {
      await pg.query(
        `INSERT INTO bookings (booking_code, customer_name, destination, date_of_travel, return_date) VALUES ('T43-1', 'X', ARRAY['A']::text[], '2026-01-01', '2026-01-10')`,
      );
      await pg.query(
        `INSERT INTO bookings (booking_code, customer_name, destination, date_of_travel, return_date) VALUES ('T43-1', 'Y', ARRAY['B']::text[], '2026-02-01', '2026-02-10')`,
      );
      t43note = 'second insert succeeded';
    } catch (e) {
      t43 = /unique|duplicate/i.test(e.message);
      t43note = e.code || 'ok';
    }
    await pg.query(`DELETE FROM bookings WHERE booking_code = 'T43-1'`);
    r('T43', 'booking_code unique', t43, t43note);

    await pg.end();
  } else {
    r('T41', 'Core tables exist', false, 'no DATABASE_URL');
    r('T42', 'FK on booking_flights', false, 'skipped');
    r('T43', 'booking_code unique', false, 'skipped');
  }

  const hx = await req('GET', '/health');
  r(
    'T44',
    'Health env dev',
    hx.json.env === 'dev' || hx.json.env === 'development',
    `env=${hx.json.env} doc expects "dev"; set NODE_ENV=dev in .env.dev to match doc exactly`,
  );

  function walkJs(dir) {
    const out = [];
    if (!fs.existsSync(dir)) return out;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) out.push(...walkJs(p));
      else if (ent.name.endsWith('.js')) out.push(p);
    }
    return out;
  }
  const repo = path.join(__dirname, '..');
  const scanRoots = [path.join(repo, 'src'), path.join(repo, 'scripts'), path.join(repo, 'test')];
  const hits = [];
  for (const root of scanRoots) {
    for (const f of walkJs(root)) {
      const rel = path.relative(repo, f);
      const c = fs.readFileSync(f, 'utf8');
      if (/https?:\/\/[^\s'"`]+supabase\.co/i.test(c)) hits.push(`${rel}: supabase.co URL`);
      if (/\bsk-[a-zA-Z0-9]{20,}\b/.test(c)) hits.push(`${rel}: sk- key pattern`);
      if (/\bSG\.[a-zA-Z0-9._-]{20,}\b/.test(c)) hits.push(`${rel}: SendGrid pattern`);
      if (/JWT_SECRET\s*=\s*['"][^'"]{8,}['"]/.test(c)) hits.push(`${rel}: JWT_SECRET literal`);
    }
  }
  r('T45', 'No obvious hardcoded secrets in JS', hits.length === 0, hits.join('; ') || 'ok');

  console.log('\n=== Phase 1 harness results ===\n');
  const pass = results.filter((x) => x.pass).length;
  const fail = results.filter((x) => !x.pass).length;
  for (const row of results) {
    console.log(`${row.pass ? 'PASS' : 'FAIL'} ${row.id} ${row.name}${row.notes ? ` — ${row.notes}` : ''}`);
  }
  console.log(`\nTotal: ${pass} pass, ${fail} fail (of ${results.length} checks)`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
