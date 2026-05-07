#!/usr/bin/env node
/**
 * Phase 1 backend tests per phase1_backend_tests_v2.md — writes human-readable HTML report.
 * Usage: npm run test:phase1:html (spawns API on PHASE1_HARNESS_PORT, default 3049)
 * Manual: node --env-file=.env.dev scripts/phase1-v2-html-report.js
 * Set SKIP_SERVER_SPAWN=1 to use an already-running API on PORT (or PHASE1_HARNESS_PORT if set).
 */
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');
const { Client } = require('pg');
const { generateToken } = require('../src/utils/generateToken');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const repoRoot = path.join(__dirname, '..');
const harnessPortRaw = process.env.PHASE1_HARNESS_PORT;
const apiPort = harnessPortRaw ? Number(harnessPortRaw, 10) : Number(process.env.PORT || 3000, 10);
const BASE = `http://127.0.0.1:${apiPort}`;
const results = [];
let serverChild = null;

function esc(s) {
  if (s == null || s === '') return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function r(group, id, name, pass, expected, actual, notes = '') {
  results.push({ group, id, name, pass, expected, actual, notes });
}

function supabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    realtime: { transport: ws },
  });
}

async function seedUsers(sb) {
  await sb.from('users').delete().eq('email', 'newuser@test.com');
  const h = (p) => bcrypt.hashSync(p, 12);
  const rows = [
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
  ];
  const { error } = await sb.from('users').upsert(rows, { onConflict: 'email' });
  if (error) throw new Error(`Seed users: ${error.message}`);
}

async function req(method, pth, { headers = {}, body } = {}) {
  const o = { method, headers: { ...headers } };
  if (body !== undefined) {
    o.headers['Content-Type'] = 'application/json';
    o.body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${pth}`, o);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { _raw: text.slice(0, 500) };
  }
  return { status: res.status, json, text };
}

async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`API not reachable at ${BASE} after ~15s`);
}

async function ensureServer() {
  if (process.env.SKIP_SERVER_SPAWN === '1') {
    await waitForServer();
    return;
  }
  if (harnessPortRaw) {
    serverChild = cp.spawn('node', ['--env-file=.env.dev', path.join(repoRoot, 'src/index.js')], {
      cwd: repoRoot,
      stdio: 'ignore',
      env: { ...process.env, PORT: String(apiPort) },
      detached: false,
    });
    await waitForServer();
    return;
  }
  try {
    const res = await fetch(`${BASE}/health`);
    if (res.ok) return;
  } catch {
    /* start */
  }
  serverChild = cp.spawn('node', ['--env-file=.env.dev', path.join(repoRoot, 'src/index.js')], {
    cwd: repoRoot,
    stdio: 'ignore',
    env: { ...process.env },
    detached: false,
  });
  await waitForServer();
}

function stopServer() {
  if (serverChild) {
    try {
      serverChild.kill('SIGTERM');
    } catch {
      /* ignore */
    }
    serverChild = null;
  }
}

/** v2 checklist T41 (subset only — doc omits some config_* tables that still exist). */
const V2_REQUIRED_TABLES = [
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
  'config_cancellation_reasons',
  'config_currencies',
  'config_fx_risk_threshold',
  'config_gst_rate',
  'config_meal_plans',
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

function scanSecrets() {
  const hits = [];
  const skip = new Set(['phase1-v2-html-report.js', 'run-phase1-harness.js']);
  const scanRoots = [path.join(repoRoot, 'src'), path.join(repoRoot, 'scripts'), path.join(repoRoot, 'test')];
  for (const root of scanRoots) {
    for (const f of walkJs(root)) {
      if (skip.has(path.basename(f))) continue;
      const rel = path.relative(repoRoot, f);
      const c = fs.readFileSync(f, 'utf8');
      if (/https?:\/\/[^\s'"`]+supabase\.co/i.test(c)) hits.push(`${rel}: URL supabase.co`);
      if (/\bsk-[a-zA-Z0-9]{20,}\b/.test(c)) hits.push(`${rel}: sk- pattern`);
      if (/\bSG\.[a-zA-Z0-9._-]{20,}\b/.test(c)) hits.push(`${rel}: SG. pattern`);
      if (/JWT_SECRET\s*=\s*['"][^'"]{8,}['"]/.test(c)) hits.push(`${rel}: JWT literal`);
    }
  }
  return hits;
}

function writeHtml(outPath, summary) {
  const ts = new Date().toISOString();
  const pass = results.filter((x) => x.pass).length;
  const fail = results.filter((x) => !x.pass).length;
  const rows = results
    .map(
      (row) => `
<tr class="${row.pass ? 'pass' : 'fail'}">
  <td><code>${esc(row.id)}</code></td>
  <td>${esc(row.group)}</td>
  <td>${esc(row.name)}</td>
  <td class="status">${row.pass ? 'PASS' : 'FAIL'}</td>
  <td class="small">${esc(row.expected)}</td>
  <td class="small">${esc(row.actual)}</td>
  <td class="small">${esc(row.notes)}</td>
</tr>`,
    )
    .join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Phase 1 Backend Test Report (v2)</title>
  <style>
    :root { font-family: ui-sans-serif, system-ui, sans-serif; --ok:#0d7d4d; --bad:#b42318; --muted:#52525b; --bg:#fafafa; }
    body { margin:0; background:var(--bg); color:#18181b; line-height:1.5; }
    header { background:#18181b; color:#fafafa; padding:1.25rem 2rem; }
    header h1 { margin:0 0 .25rem; font-size:1.35rem; font-weight:600; }
    header p { margin:0; color:#a1a1aa; font-size:.875rem; }
    .wrap { max-width:1200px; margin:0 auto; padding:1.5rem 2rem 3rem; }
    .summary { display:flex; gap:1rem; flex-wrap:wrap; margin-bottom:1.5rem; }
    .card { background:#fff; border:1px solid #e4e4e7; border-radius:10px; padding:1rem 1.25rem; min-width:140px; box-shadow:0 1px 2px rgba(0,0,0,.04); }
    .card strong { display:block; font-size:1.75rem; }
    .card span { color:var(--muted); font-size:.8rem; }
    .pass strong { color:var(--ok); }
    .fail-card strong { color:var(--bad); }
    table { width:100%; border-collapse:collapse; background:#fff; border:1px solid #e4e4e7; border-radius:8px; overflow:hidden; font-size:.875rem; }
    th, td { text-align:left; padding:.65rem .75rem; border-bottom:1px solid #f4f4f5; vertical-align:top; }
    th { background:#f4f4f5; font-weight:600; color:#3f3f46; }
    tr.pass td.status { color:var(--ok); font-weight:600; }
    tr.fail td.status { color:var(--bad); font-weight:600; }
    tr:last-child td { border-bottom:none; }
    .small { max-width:280px; word-break:break-word; font-size:.8rem; color:#52525b; }
    code { font-size:.8em; background:#f4f4f5; padding:.1rem .35rem; border-radius:4px; }
    footer { margin-top:2rem; font-size:.8rem; color:var(--muted); }
  </style>
</head>
<body>
  <header>
    <h1>Phase 1 — Backend test report</h1>
    <p>Spec: phase1_backend_tests_v2.md · Generated ${esc(ts)} · Base URL ${esc(BASE)}</p>
  </header>
  <div class="wrap">
    <div class="summary">
      <div class="card pass"><strong>${pass}</strong><span>Passed</span></div>
      <div class="card fail-card"><strong>${fail}</strong><span>Failed</span></div>
      <div class="card"><strong>${results.length}</strong><span>Total checks</span></div>
    </div>
    <p style="color:var(--muted);font-size:.9rem;margin-bottom:1rem;">${esc(summary)}</p>
    <table>
      <thead>
        <tr><th>ID</th><th>Group</th><th>Description</th><th>Result</th><th>Expected</th><th>Actual</th><th>Notes</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <footer>Open this file in any browser. Re-run: <code>npm run test:phase1:html</code></footer>
  </div>
</body>
</html>`;
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, html, 'utf8');
}

async function cleanup(sb) {
  await sb.from('users').delete().eq('email', 'newuser@test.com');
  await sb.from('suppliers').delete().eq('code', 'travclan_thailand');
  await sb.from('suppliers').delete().eq('code', 'second_no_bank');
  await sb.from('config_destinations').delete().eq('code', 'thailand');
}

async function runSuite(sb) {
  let ADMIN_TOKEN;
  let ADMIN_MEMBER;
  let ADMIN_ID;
  let AGENT_TOKEN;
  let AGENT_MEMBER;
  let NEW_USER_ID;
  let TEST_DESTINATION_ID;
  let TEST_SUPPLIER_ID;
  let SECOND_SUPPLIER_ID;

  try {
    await seedUsers(sb);
    r('Setup', 'TS-00', 'Seed test users', true, '3 users in Supabase', 'insert ok', '');
  } catch (e) {
    r('Setup', 'TS-00', 'Seed test users', false, '3 users', e.message, '');
    throw e;
  }

  let x = await req('GET', '/health');
  const envStrict = x.json.env === 'dev';
  r(
    '1. Health & security',
    'T01',
    'Health check',
    x.status === 200 && x.json.status === 'ok' && envStrict,
    '200 { status: "ok", env: "dev" }',
    `${x.status} ${JSON.stringify(x.json)}`,
    envStrict ? '' : 'Expected env "dev" for non-production NODE_ENV; restart API or use harness port',
  );

  let h = await fetch(`${BASE}/health`, { method: 'HEAD' });
  r(
    '1. Health & security',
    'T02',
    'HEAD blocked on /health',
    h.status === 405,
    '405 { error: "Method not allowed" }',
    String(h.status),
    '',
  );

  h = await fetch(`${BASE}/api/users`, { method: 'HEAD' });
  r(
    '1. Health & security',
    'T03',
    'HEAD blocked on /api/users',
    h.status === 405,
    '405',
    String(h.status),
    '',
  );

  x = await req('GET', '/api/users');
  r(
    '1. Health & security',
    'T04',
    'Unauthenticated rejected',
    x.status === 401 && String(x.json.error).includes('Missing'),
    '401 Missing or malformed…',
    `${x.status} ${x.json.error}`,
    '',
  );

  x = await req('GET', '/api/users', { headers: { Authorization: 'InvalidFormatNoBearer' } });
  r(
    '1. Health & security',
    'T05',
    'Malformed Authorization',
    x.status === 401 && String(x.json.error).includes('Missing'),
    '401 Missing or malformed…',
    `${x.status} ${x.json.error}`,
    '',
  );

  x = await req('GET', '/api/users', { headers: { Authorization: 'Bearer thisisnotavalidjwt' } });
  r(
    '1. Health & security',
    'T06',
    'Invalid JWT',
    x.status === 401 && x.json.error === 'Invalid token',
    '401 Invalid token',
    `${x.status} ${x.json.error}`,
    '',
  );

  const secret = process.env.JWT_SECRET;
  const tmpTok = generateToken({ member_code: 'TESTADMIN001', role: 'admin' }, secret);
  x = await req('GET', '/api/users', { headers: { Authorization: `Bearer ${tmpTok}` } });
  r(
    '1. Health & security',
    'T07',
    'Missing X-Member-Code',
    x.status === 401 && x.json.error === 'Missing member code header',
    '401 Missing member code header',
    `${x.status} ${x.json.error}`,
    '',
  );

  x = await req('GET', '/api/users', {
    headers: { Authorization: `Bearer ${tmpTok}`, 'X-Member-Code': 'WRONGCODE' },
  });
  r(
    '1. Health & security',
    'T08',
    'Member code mismatch',
    x.status === 401 && x.json.error === 'Member code mismatch',
    '401 Member code mismatch',
    `${x.status} ${x.json.error}`,
    '',
  );

  const inactiveTok = generateToken({ member_code: 'TESTINACTIVE001', role: 'agent' }, secret);
  x = await req('GET', '/api/users/me', {
    headers: { Authorization: `Bearer ${inactiveTok}`, 'X-Member-Code': 'TESTINACTIVE001' },
  });
  r(
    '1. Health & security',
    'T09',
    'Deactivated user',
    x.status === 401 && x.json.error === 'Account deactivated',
    '401 Account deactivated',
    `${x.status} ${x.json.error}`,
    '',
  );

  x = await req('POST', '/api/auth/login', {
    body: { email: 'admin@test.com', password: 'TestAdmin123!' },
  });
  const t10 =
    x.status === 200 && x.json.token && x.json.user?.member_code === 'TESTADMIN001' && x.json.user?.role === 'admin';
  ADMIN_TOKEN = x.json.token;
  ADMIN_MEMBER = x.json.user?.member_code;
  ADMIN_ID = x.json.user?.id;
  r(
    '2. Authentication',
    'T10',
    'Admin login',
    t10,
    '200 token + TESTADMIN001',
    `${x.status} ${t10 ? 'ok' : JSON.stringify(x.json).slice(0, 120)}`,
    '',
  );

  x = await req('POST', '/api/auth/login', {
    body: { email: 'agent@test.com', password: 'TestAgent123!' },
  });
  const t11 = x.status === 200 && x.json.user?.role === 'agent';
  AGENT_TOKEN = x.json.token;
  AGENT_MEMBER = x.json.user?.member_code;
  r('2. Authentication', 'T11', 'Agent login', t11, '200 role agent', `${x.status}`, '');

  x = await req('POST', '/api/auth/login', {
    body: { email: 'admin@test.com', password: 'wrongpassword' },
  });
  r('2. Authentication', 'T12', 'Wrong password', x.status === 401, '401 Invalid credentials', String(x.status), '');

  x = await req('POST', '/api/auth/login', {
    body: { email: 'nobody@test.com', password: 'anything' },
  });
  r('2. Authentication', 'T13', 'Unknown email', x.status === 401, '401', String(x.status), '');

  const ah = { Authorization: `Bearer ${ADMIN_TOKEN}`, 'X-Member-Code': ADMIN_MEMBER };
  x = await req('GET', '/api/users/me', { headers: ah });
  r(
    '2. Authentication',
    'T14',
    'GET /users/me',
    x.status === 200 && x.json.email === 'admin@test.com',
    '200 admin email',
    `${x.status}`,
    '',
  );

  x = await req('GET', '/api/users', { headers: ah });
  const t15 =
    x.status === 200 &&
    Array.isArray(x.json) &&
    x.json.some((u) => u.email === 'admin@test.com') &&
    x.json.every((u) => ['id', 'name', 'email', 'role', 'is_active'].every((k) => k in u));
  r('3. User management', 'T15', 'Admin lists users', t15, '200 array with fields', `${x.status}`, '');

  const gah = { Authorization: `Bearer ${AGENT_TOKEN}`, 'X-Member-Code': AGENT_MEMBER };
  x = await req('GET', '/api/users', { headers: gah });
  r('3. User management', 'T16', 'Agent cannot list users', x.status === 403, '403', String(x.status), '');

  x = await req('POST', '/api/users/invite', {
    headers: ah,
    body: { email: 'newuser@test.com', name: 'New User', role: 'agent' },
  });
  const t17 = (x.status === 200 || x.status === 201) && x.json.email === 'newuser@test.com' && x.json.member_code;
  if (t17) NEW_USER_ID = x.json.id;
  r(
    '3. User management',
    'T17',
    'Admin invite user',
    t17,
    '200 + new user',
    `${x.status} ${t17 ? 'ok' : JSON.stringify(x.json.error || x.json).slice(0, 100)}`,
    x.status === 503 ? 'Unexpected 503 after invite decoupling from email' : '',
  );

  x = await req('POST', '/api/users/invite', {
    headers: gah,
    body: { email: 'another@test.com', name: 'Another', role: 'agent' },
  });
  r('3. User management', 'T18', 'Agent cannot invite', x.status === 403, '403', String(x.status), '');

  if (NEW_USER_ID) {
    x = await req('PATCH', `/api/users/${NEW_USER_ID}`, { headers: ah, body: { is_active: false } });
    r('3. User management', 'T19', 'Deactivate user', x.status === 200 && x.json.is_active === false, '200', String(x.status), '');
  } else {
    r('3. User management', 'T19', 'Deactivate user', false, '200', 'skipped', '');
  }

  x = await req('PATCH', `/api/users/${ADMIN_ID}`, { headers: ah, body: { is_active: false } });
  r(
    '3. User management',
    'T20',
    'Cannot deactivate self',
    x.status === 400,
    '400 Cannot deactivate…',
    `${x.status} ${x.json.error || ''}`,
    '',
  );

  x = await req('POST', '/api/users/invite', {
    headers: ah,
    body: { email: 'admin@test.com', name: 'Duplicate', role: 'agent' },
  });
  r(
    '3. User management',
    'T21',
    'Duplicate email invite',
    x.status === 409 || x.status === 400,
    '400 or 409',
    String(x.status),
    '',
  );

  x = await req('GET', '/api/config/currencies', { headers: ah });
  const codes = Array.isArray(x.json) ? x.json.map((c) => c.code) : [];
  const t22 = x.status === 200 && ['INR', 'USD', 'THB', 'EUR', 'GBP', 'AED'].every((c) => codes.includes(c));
  r('4. Master config', 'T22', 'Currencies (6 codes)', t22, 'INR USD THB EUR GBP AED', codes.join(','), '');

  x = await req('GET', '/api/config/cabin-classes', { headers: ah });
  const names = Array.isArray(x.json) ? x.json.map((c) => c.name) : [];
  const t23 = x.status === 200 && ['Economy', 'Premium Economy', 'Business', 'First Class'].every((n) => names.includes(n));
  r('4. Master config', 'T23', 'Cabin classes names', t23, '4 cabin names', names.join('; '), '');

  x = await req('GET', '/api/config/meal-plans', { headers: ah });
  const mnames = Array.isArray(x.json) ? x.json.map((c) => c.name) : [];
  const t24 =
    x.status === 200 &&
    ['Room Only', 'Bed & Breakfast', 'Half Board', 'Full Board', 'All Inclusive'].every((n) => mnames.includes(n));
  r('4. Master config', 'T24', 'Meal plan names', t24, '5 meal names', mnames.join('; '), '');

  x = await req('GET', '/api/config/tcs-rate/current', { headers: ah });
  r('4. Master config', 'T25', 'TCS rate', x.status === 200 && Number(x.json.rate) === 0.02, '{ rate: 0.02 }', JSON.stringify(x.json), '');

  x = await req('GET', '/api/config/gst-rate/current', { headers: ah });
  r('4. Master config', 'T26', 'GST rate', x.status === 200 && Number(x.json.rate) === 0.18, '{ rate: 0.18 }', JSON.stringify(x.json), '');

  x = await req('GET', '/api/config/fx-threshold/current', { headers: ah });
  r(
    '4. Master config',
    'T27',
    'FX threshold',
    x.status === 200 && Number(x.json.threshold_pct) === 0.05,
    '{ threshold_pct: 0.05 }',
    JSON.stringify(x.json),
    '',
  );

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
  r(
    '4. Master config',
    'T28',
    'Create destination',
    (x.status === 200 || x.status === 201) && !!TEST_DESTINATION_ID,
    '200 + id',
    String(x.status),
    '',
  );

  x = await req('POST', '/api/config/destinations', {
    headers: gah,
    body: { name: 'Bali', code: 'bali', sort_order: 2 },
  });
  r('4. Master config', 'T29', 'Agent cannot POST config', x.status === 403, '403', String(x.status), '');

  x = await req('PATCH', `/api/config/destinations/${TEST_DESTINATION_ID}`, {
    headers: ah,
    body: { is_active: false },
  });
  r(
    '4. Master config',
    'T30',
    'Deactivate destination',
    x.status === 200 && x.json.is_active === false,
    'is_active false',
    String(x.status),
    '',
  );

  x = await req('GET', '/api/config/destinations?active_only=true', { headers: ah });
  const t31 = x.status === 200 && Array.isArray(x.json) && !x.json.some((d) => d.code === 'thailand');
  r('4. Master config', 'T31', 'Inactive hidden', t31, 'no thailand', `${x.json?.length} rows`, '');

  x = await req('GET', '/api/suppliers', { headers: ah });
  r('5. Suppliers', 'T32', 'List suppliers', x.status === 200 && Array.isArray(x.json), '200 array', String(x.status), '');

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
    '5. Suppliers',
    'T33',
    'Supplier no bank',
    (x.status === 200 || x.status === 201) && x.json.bank_details_complete === false,
    'bank_details_complete false',
    String(x.status),
    '',
  );

  x = await req('PATCH', `/api/suppliers/${TEST_SUPPLIER_ID}`, {
    headers: ah,
    body: {
      bank_name: 'Bangkok Bank',
      bank_account_number: '1234567890',
      bank_ifsc: 'BKKBTHBK',
    },
  });
  r(
    '5. Suppliers',
    'T34',
    'Supplier bank complete',
    x.status === 200 && x.json.bank_details_complete === true,
    'true',
    String(x.json.bank_details_complete),
    '',
  );

  x = await req('POST', '/api/suppliers', {
    headers: ah,
    body: { name: 'Second Supplier', code: 'second_no_bank' },
  });
  SECOND_SUPPLIER_ID = x.json.id;

  x = await req('GET', '/api/suppliers/missing-bank-details', { headers: ah });
  const ids = Array.isArray(x.json) ? x.json.map((s) => s.id) : [];
  const t35 =
    x.status === 200 &&
    ids.includes(SECOND_SUPPLIER_ID) &&
    !ids.includes(TEST_SUPPLIER_ID) &&
    !x.json.some((s) => 'bank_account_number' in s && s.bank_account_number);
  r(
    '5. Suppliers',
    'T35',
    'Missing bank endpoint',
    t35,
    'only incomplete',
    `count ${ids.length}`,
    '',
  );

  x = await req('POST', '/api/suppliers', { headers: gah, body: { name: 'Test', code: 'test_agent_sup' } });
  r('5. Suppliers', 'T36', 'Agent cannot create supplier', x.status === 403, '403', String(x.status), '');

  const { data: logs, error: le } = await sb
    .from('system_logs')
    .select('id,event_type,entity_type,actor_id,created_at')
    .order('created_at', { ascending: false })
    .limit(10);
  r(
    '6. System logs',
    'T37',
    'system_logs has rows',
    !le && logs && logs.length > 0,
    '>=1 row',
    `count=${logs?.length}`,
    '',
  );

  const { data: inv } = await sb.from('system_logs').select('*').eq('event_type', 'USER_INVITED').limit(1).maybeSingle();
  const t38 =
    inv &&
    (inv.before_state == null) &&
    inv.after_state &&
    String(inv.actor_id) === String(ADMIN_ID);
  r(
    '6. System logs',
    'T38',
    'USER_INVITED structure',
    !!t38,
    'before null, after set, actor=admin',
    inv ? 'found' : 'none',
    '',
  );

  x = await req('GET', '/api/logs?limit=10', { headers: ah });
  r(
    '6. System logs',
    'T39',
    'Admin GET /logs',
    x.status === 200 && x.json.data && Array.isArray(x.json.data),
    '200 paginated',
    String(x.status),
    '',
  );

  x = await req('GET', '/api/logs?limit=10', { headers: gah });
  r('6. System logs', 'T40', 'Agent cannot /logs', x.status === 403, '403', String(x.status), '');

  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    const pg = new Client({
      connectionString: dbUrl,
      ssl: dbUrl.includes('supabase.co') ? { rejectUnauthorized: false } : undefined,
    });
    await pg.connect();
    const { rows } = await pg.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const names = new Set(rows.map((row) => row.table_name));
    const missing = V2_REQUIRED_TABLES.filter((t) => !names.has(t));
    r(
      '7. Database',
      'T41',
      'Core tables (v2 list)',
      missing.length === 0,
      'all v2 tables',
      missing.length ? `missing: ${missing.join(',')}` : 'all present',
      '',
    );

    let t42 = false;
    let a42 = '';
    try {
      await pg.query(
        `INSERT INTO booking_flights (booking_id, sector_from, sector_to) VALUES ('00000000-0000-0000-0000-000000000000', 'DEL', 'BOM')`,
      );
      a42 = 'insert ok (bad)';
    } catch (e) {
      t42 = /foreign key|violates foreign key/i.test(e.message);
      a42 = e.code || 'fk error';
    }
    r('7. Database', 'T42', 'FK booking_flights', t42, 'FK violation', a42, '');

    const dupHash = bcrypt.hashSync('x', 12);
    let t43 = false;
    let a43 = '';
    await pg.query(`DELETE FROM users WHERE email = 't43dup@test.com'`);
    try {
      await pg.query(
        `INSERT INTO users (email, name, role, member_code, password_hash, is_active) VALUES ('t43dup@test.com', 'A', 'agent', 'T43A', $1, true)`,
        [dupHash],
      );
      await pg.query(
        `INSERT INTO users (email, name, role, member_code, password_hash, is_active) VALUES ('t43dup@test.com', 'B', 'agent', 'T43B', $1, true)`,
        [dupHash],
      );
      a43 = 'second insert ok';
    } catch (e) {
      t43 = /unique|duplicate/i.test(e.message);
      a43 = e.code || 'unique ok';
    }
    await pg.query(`DELETE FROM users WHERE email = 't43dup@test.com'`);
    r('7. Database', 'T43', 'Unique email on users', t43, 'unique violation', a43, '');

    await pg.end();
  } else {
    r('7. Database', 'T41', 'Tables', false, 'v2 list', 'no DATABASE_URL', '');
    r('7. Database', 'T42', 'FK', false, '—', 'skipped', '');
    r('7. Database', 'T43', 'Unique', false, '—', 'skipped', '');
  }

  x = await req('GET', '/health');
  r(
    '8. Environment',
    'T44',
    'Health env = dev',
    x.json.env === 'dev',
    '{ env: "dev" }',
    JSON.stringify(x.json),
    x.json.env !== 'dev' ? 'Expected "dev" unless NODE_ENV=production' : '',
  );

  const hits = scanSecrets();
  r('8. Environment', 'T45', 'No hardcoded secrets', hits.length === 0, '0 hits', `${hits.length} hit(s)`, hits.join('; '));
}

async function main() {
  await ensureServer();
  const sb = supabase();
  let summary = '';
  try {
    await runSuite(sb);
  } catch (e) {
    summary = `Suite aborted: ${e.message}`;
    console.error(e);
  } finally {
    try {
      await cleanup(sb);
    } catch {
      /* ignore */
    }
    stopServer();
  }

  const pass = results.filter((x) => x.pass).length;
  const fail = results.filter((x) => !x.pass).length;
  if (!summary) summary = `Automated run per phase1_backend_tests_v2.md · ${pass} passed · ${fail} failed.`;

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.join(repoRoot, 'reports');
  const outFile = path.join(outDir, `phase1-backend-report-${stamp}.html`);
  const latestFile = path.join(outDir, 'phase1-backend-report-latest.html');
  writeHtml(outFile, summary);
  writeHtml(latestFile, summary);

  console.log(`HTML report written:\n  ${outFile}\n  ${latestFile}`);
  console.log(`Summary: ${pass} PASS, ${fail} FAIL (${results.length} total)`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  stopServer();
  process.exit(1);
});
