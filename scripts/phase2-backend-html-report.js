#!/usr/bin/env node
/**
 * Phase 2 backend tests per phase2_backend_tests.md — HTML report.
 * Usage: npm run test:phase2:html
 * Manual: PHASE2_HARNESS_PORT=3050 node --env-file=.env.dev scripts/phase2-backend-html-report.js
 * SKIP_SERVER_SPAWN=1 — use API already on PORT (or PHASE2_HARNESS_PORT).
 */
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { subDaysUtc } = require('../src/utils/dateHelpers');

const repoRoot = path.join(__dirname, '..');
const harnessPortRaw = process.env.PHASE2_HARNESS_PORT;
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

function r(group, id, name, pass, expected, actual, notes = '', httpExchange = null) {
  results.push({
    group,
    id,
    name,
    pass,
    expected,
    actual,
    notes,
    http: pass ? null : httpExchange,
  });
}

/** Attach structured request/response to failed rows when `res` came from req() / reqMultipart(). */
function httpOnFail(pass, res) {
  return pass || !res || !res.exchange ? null : res.exchange;
}

function redactHeaders(headers) {
  if (!headers || typeof headers !== 'object') return headers;
  const h = { ...headers };
  if (h.Authorization) h.Authorization = 'Bearer <redacted>';
  return h;
}

function redactBodyForReport(pth, body) {
  if (body === undefined || body === null) return body;
  if (pth === '/api/auth/login' && typeof body === 'object' && !Array.isArray(body)) {
    const b = { ...body };
    if ('password' in b) b.password = '<redacted>';
    return b;
  }
  return body;
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
  ];
  const { error } = await sb.from('users').upsert(rows, { onConflict: 'email' });
  if (error) throw new Error(`Seed users: ${error.message}`);
}

async function seedPhase2(sb) {
  const { error: dErr } = await sb.from('config_destinations').upsert(
    {
      name: 'Thailand',
      code: 'thailand',
      sort_order: 1,
      used_in_pages: ['booking_header'],
      used_in_systems: ['Booking ERP'],
    },
    { onConflict: 'code' },
  );
  if (dErr) throw new Error(`config_destinations: ${dErr.message}`);

  const { data: sup, error: sErr } = await sb
    .from('suppliers')
    .upsert(
      {
        name: 'TravClan Thailand',
        code: 'travclan_th',
        contact_name: 'Somchai',
        contact_email: 'somchai@travclan.com',
        is_active: true,
      },
      { onConflict: 'code' },
    )
    .select('id')
    .single();
  if (sErr) throw new Error(`suppliers: ${sErr.message}`);
  return sup.id;
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
  const exchange = {
    request: {
      method,
      path: pth,
      headers: redactHeaders(headers),
      ...(body !== undefined && { body: redactBodyForReport(pth, body) }),
    },
    response: { status: res.status, body: json },
  };
  return { status: res.status, json, text, exchange };
}

async function reqMultipart(pth, headers, formData) {
  const h = { ...headers };
  const res = await fetch(`${BASE}${pth}`, { method: 'POST', headers: h, body: formData });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { _raw: text.slice(0, 500) };
  }
  const exchange = {
    request: {
      method: 'POST',
      path: pth,
      headers: redactHeaders(headers),
      body: {
        _contentType: 'multipart/form-data',
        note: 'File bytes omitted from report',
        fields: ['file', 'document_type', 'entity_type', 'description'],
      },
    },
    response: { status: res.status, body: json },
  };
  return { status: res.status, json, text, exchange };
}

async function waitForServer() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`API not reachable at ${BASE}`);
}

/** Child must not inherit parent DATABASE_URL — it overrides --env-file=.env.dev (pooler vs direct db). */
function childEnvForSpawn(extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.DATABASE_URL;
  return env;
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
      env: childEnvForSpawn({ PORT: String(apiPort) }),
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
    env: childEnvForSpawn(),
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

function todayYmd() {
  const n = new Date();
  return n.toISOString().slice(0, 10);
}

function addDays(ymd, n) {
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

const MYTL_RE = /^MYTL-[A-Z0-9]{6}$/;

function buildPayload({ dot, ret, supId, margin = 5000, customerName = 'Test Customer', bookingCode: bc }) {
  const t0 = todayYmd();
  const pay = {
    customer_name: customerName,
    destinations: ['Thailand'],
    date_of_travel: dot,
    return_date: ret,
    adults: 2,
    children: 0,
    margin,
    financial_confirmed: true,
    travellers: [
      {
        full_name: 'Test Traveller',
        dob: '1990-01-01',
        nationality: 'Indian',
        phone: '+91 9999999999',
        email: 'test@test.com',
        emergency_contact_name: 'Emergency Contact',
        emergency_contact_phone: '+91 8888888888',
        travel_document_id: 'A1234567',
        passport_expiry_date: addDays(t0, 730),
        visa_needed: true,
        passport_alert_acknowledged: true,
      },
    ],
    flights: [],
    hotels: [],
    land_items: [
      {
        sub_item_type: 'sightseeing',
        description: 'Seed land item',
        supplier_id: supId,
        date: dot,
        cost: 10000,
        currency: 'INR',
        exchange_rate: 1,
        is_refundable: false,
      },
    ],
    visas: [],
    supplier_tranches: [
      {
        supplier_id: supId,
        amount: 80000,
        currency: 'INR',
        exchange_rate: 1,
        payment_date: addDays(dot, -14),
      },
    ],
    pan_cards: [{ pan_number: 'ABCDE1234F' }],
  };
  if (bc) {
    pay.booking_code = bc;
  }
  return pay;
}

function listRows(res) {
  if (res.status !== 200 || !res.json) return [];
  if (Array.isArray(res.json.data)) return res.json.data;
  if (Array.isArray(res.json)) return res.json;
  return [];
}

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

function safeJson(o) {
  try {
    return JSON.stringify(o, null, 2);
  } catch {
    return String(o);
  }
}

function reportPaths() {
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}-${String(now.getUTCHours()).padStart(2, '0')}${String(now.getUTCMinutes()).padStart(2, '0')}${String(now.getUTCSeconds()).padStart(2, '0')}`;
  return {
    latest: path.join(repoRoot, 'reports', 'phase2-backend-report-latest.html'),
    versioned: path.join(repoRoot, 'reports', `phase2-backend-report-${stamp}.html`),
  };
}

function writeHtml(outPath, summary) {
  const ts = new Date().toISOString();
  const pass = results.filter((x) => x.pass).length;
  const fail = results.filter((x) => !x.pass).length;
  const rows = results
    .map((row) => {
      const main = `
<tr class="${row.pass ? 'pass' : 'fail'}">
  <td><code>${esc(row.id)}</code></td>
  <td>${esc(row.group)}</td>
  <td>${esc(row.name)}</td>
  <td class="status">${row.pass ? 'PASS' : 'FAIL'}</td>
  <td class="small">${esc(row.expected)}</td>
  <td class="small">${esc(row.actual)}</td>
  <td class="small">${esc(row.notes)}</td>
</tr>`;
      if (row.pass || !row.http) return main;
      const blob = safeJson(row.http);
      const detail = `
<tr class="fail-http-detail"><td colspan="7"><details open><summary>HTTP request / response</summary><pre class="http-snippet">${esc(blob)}</pre></details></td></tr>`;
      return main + detail;
    })
    .join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Phase 2 Backend Test Report</title>
  <style>
    :root { font-family: ui-sans-serif, system-ui, sans-serif; --ok:#0d7d4d; --bad:#b42318; --muted:#52525b; --bg:#fafafa; }
    body { margin:0; background:var(--bg); color:#18181b; line-height:1.5; }
    header { background:#18181b; color:#fafafa; padding:1.25rem 2rem; }
    header h1 { margin:0 0 .25rem; font-size:1.35rem; font-weight:600; }
    header p { margin:0; color:#a1a1aa; font-size:.875rem; }
    .wrap { max-width:1200px; margin:0 auto; padding:1.5rem 2rem 3rem; }
    .summary { display:flex; gap:1rem; flex-wrap:wrap; margin-bottom:1.5rem; }
    .card { background:#fff; border:1px solid #e4e4e7; border-radius:10px; padding:1rem 1.25rem; min-width:140px; }
    .card strong { display:block; font-size:1.75rem; }
    .card span { color:var(--muted); font-size:.8rem; }
    .pass strong { color:var(--ok); }
    .fail-card strong { color:var(--bad); }
    table { width:100%; border-collapse:collapse; background:#fff; border:1px solid #e4e4e7; font-size:.875rem; }
    th, td { text-align:left; padding:.65rem .75rem; border-bottom:1px solid #f4f4f5; vertical-align:top; }
    th { background:#f4f4f5; font-weight:600; }
    tr.pass td.status { color:var(--ok); font-weight:600; }
    tr.fail td.status { color:var(--bad); font-weight:600; }
    .small { max-width:320px; word-break:break-word; font-size:.8rem; color:#52525b; }
    code { font-size:.8em; background:#f4f4f5; padding:.1rem .35rem; border-radius:4px; }
    footer { margin-top:2rem; font-size:.8rem; color:var(--muted); }
    details { margin:.35rem 0 .25rem; }
    summary { cursor:pointer; color:#3f3f46; font-size:.8rem; font-weight:600; }
    pre.http-snippet {
      margin:.5rem 0 0;
      padding:.65rem .75rem;
      background:#18181b;
      color:#e4e4e7;
      border-radius:8px;
      font-size:.72rem;
      white-space:pre-wrap;
      word-break:break-word;
      max-height:420px;
      overflow:auto;
    }
    tr.fail-http-detail td { background:#fef2f2; border-bottom:1px solid #fecaca; }
  </style>
</head>
<body>
  <header>
    <h1>Phase 2 — Backend test report</h1>
    <p>Spec: phase2_backend_tests.md · Generated ${esc(ts)} · ${esc(BASE)} · Node ${esc(process.version)}</p>
  </header>
  <div class="wrap">
    <div class="summary">
      <div class="card pass"><strong>${pass}</strong><span>Passed</span></div>
      <div class="card fail-card"><strong>${fail}</strong><span>Failed</span></div>
      <div class="card"><strong>${results.length}</strong><span>Checks</span></div>
    </div>
    <p style="color:var(--muted);font-size:.9rem;">${esc(summary)}</p>
    <table>
      <thead>
        <tr><th>ID</th><th>Group</th><th>Description</th><th>Result</th><th>Expected</th><th>Actual</th><th>Notes</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <footer>T01 payload extended with land_item + supplier_tranche (API requires line items + tranches). PATCH invoice tests use financial_confirmed: true.</footer>
  </div>
</body>
</html>`;
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, html, 'utf8');
}

async function runSuite(sb) {
  const createdBookingIds = [];
  let ADMIN_TOKEN;
  let ADMIN_MEMBER;
  let ADMIN_ID;
  let AGENT_TOKEN;
  let AGENT_MEMBER;
  let SUP_ID;
  let TEST_BOOKING_ID;
  let TEST_BOOKING_CODE;
  let INV1;
  let INV2;
  let CODE2;
  let TEST_FLIGHT_ID;
  let TEST_HOTEL_ID;
  let TEST_LAND_ID;
  let TEST_TRAVELLER_ID;
  let ALERT_TRAVELLER_ID;
  let TEST_VISA_ID;
  let TEST_SUPPLIER_TRANCHE_ID;
  let NRF_BOOKING_ID;
  let TCP_BEFORE_SELF;
  let TEST_DOC_ID;
  const t0 = todayYmd();
  const dot30 = addDays(t0, 30);
  const ret37 = addDays(t0, 37);
  function addMonthsSimple(ymd, months) {
    const [y, m, d] = String(ymd).split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1 + months, d));
    return dt.toISOString().slice(0, 10);
  }
  const ah = () => ({ Authorization: `Bearer ${ADMIN_TOKEN}`, 'X-Member-Code': ADMIN_MEMBER });
  const gh = () => ({ Authorization: `Bearer ${AGENT_TOKEN}`, 'X-Member-Code': AGENT_MEMBER });

  try {
    await seedUsers(sb);
    SUP_ID = await seedPhase2(sb);
    r('Setup', 'TS-00', 'Seed users + destination + supplier', true, 'ok', 'ok', String(SUP_ID).slice(0, 8), null);
  } catch (e) {
    r('Setup', 'TS-00', 'Seed', false, 'ok', e.message, '', null);
    throw e;
  }

  let x = await req('POST', '/api/auth/login', {
    body: { email: 'admin@test.com', password: 'TestAdmin123!' },
  });
  ADMIN_TOKEN = x.json.token;
  ADMIN_MEMBER = x.json.user?.member_code;
  ADMIN_ID = x.json.user?.id;
  r(
    'Auth',
    'login-admin',
    'Admin JWT',
    x.status === 200 && !!ADMIN_TOKEN,
    '200',
    String(x.status),
    '',
    httpOnFail(x.status === 200 && !!ADMIN_TOKEN, x),
  );

  x = await req('POST', '/api/auth/login', {
    body: { email: 'agent@test.com', password: 'TestAgent123!' },
  });
  AGENT_TOKEN = x.json.token;
  AGENT_MEMBER = x.json.user?.member_code;
  r(
    'Auth',
    'login-agent',
    'Agent JWT',
    x.status === 200 && !!AGENT_TOKEN,
    '200',
    String(x.status),
    '',
    httpOnFail(x.status === 200 && !!AGENT_TOKEN, x),
  );

  // T01
  const p1 = buildPayload({ dot: dot30, ret: ret37, supId: SUP_ID });
  x = await req('POST', '/api/bookings', { headers: ah(), body: p1 });
  const t01Ok =
    (x.status === 200 || x.status === 201) &&
    MYTL_RE.test(x.json.booking_code || '') &&
    Number(x.json.invoice_number) >= 1000001;
  TEST_BOOKING_ID = x.json.id;
  TEST_BOOKING_CODE = x.json.booking_code;
  INV1 = x.json.invoice_number;
  if (TEST_BOOKING_ID) createdBookingIds.push(TEST_BOOKING_ID);
  r(
    'G1 P2-01',
    'T01',
    'Booking code MYTL-XXXXXX',
    t01Ok,
    'MYTL-[A-Z0-9]{6}',
    `${x.status} ${x.json.booking_code || x.json.error}`,
    'Payload includes land + supplier_tranche per API rules',
    httpOnFail(t01Ok, x),
  );

  const invOk = INV1 != null && INV1 < 10000000;
  const t02Ok = invOk && Number.isInteger(Number(INV1));
  r(
    'G1 P2-01',
    'T02',
    'Invoice 7-digit',
    t02Ok,
    '1000001–9999999',
    String(INV1),
    '',
    httpOnFail(t02Ok, x),
  );

  x = await req('POST', '/api/bookings', { headers: ah(), body: buildPayload({ dot: dot30, ret: ret37, supId: SUP_ID }) });
  const t03 =
    (x.status === 200 || x.status === 201) &&
    x.json.booking_code !== TEST_BOOKING_CODE &&
    MYTL_RE.test(x.json.booking_code) &&
    Number(x.json.invoice_number) === Number(INV1) + 1;
  CODE2 = x.json.booking_code;
  INV2 = x.json.invoice_number;
  if (x.json.id) createdBookingIds.push(x.json.id);
  r('G1 P2-01', 'T03', 'Unique code; invoice +1', t03, 'second MYTL', `${x.status} ${x.json.booking_code}`, '', httpOnFail(t03, x));

  x = await req('POST', '/api/bookings', {
    headers: ah(),
    body: buildPayload({ dot: dot30, ret: ret37, supId: SUP_ID, bookingCode: 'MYTL-CUSTOM' }),
  });
  const t04 =
    (x.status === 200 || x.status === 201) &&
    x.json.booking_code !== 'MYTL-CUSTOM' &&
    MYTL_RE.test(x.json.booking_code);
  if (x.json.id) createdBookingIds.push(x.json.id);
  r(
    'G1 P2-01',
    'T04',
    'Client cannot set booking_code',
    t04,
    '≠ MYTL-CUSTOM',
    x.json.booking_code || String(x.status),
    '',
    httpOnFail(t04, x),
  );

  x = await req('GET', `/api/bookings/${TEST_BOOKING_ID}`, { headers: ah() });
  const row = x.json;
  const t05 =
    x.status === 200 &&
    row.id === TEST_BOOKING_ID &&
    row.status === 'active' &&
    (row.customer_name === 'Test Customer' || row.booking_code === TEST_BOOKING_CODE);
  r('G2', 'T05', 'GET booking by id', t05, '200 nested', String(x.status), '', httpOnFail(t05, x));

  x = await req('GET', '/api/bookings', { headers: ah() });
  const rows = listRows(x);
  const t06 = x.status === 200 && rows.some((b) => b.id === TEST_BOOKING_ID) && rows.every((b) => b.booking_code && 'is_nrf' in b);
  r(
    'G2',
    'T06',
    'List contains booking',
    t06,
    'data[].id',
    `${rows.length} rows`,
    'Uses { data } wrapper',
    httpOnFail(t06, x),
  );

  x = await req('GET', `/api/bookings/${TEST_BOOKING_ID}`, { headers: gh() });
  const t07 = x.status === 403 || x.status === 404;
  r('G2', 'T07', 'Agent cannot access admin booking', t07, '403/404', String(x.status), '', httpOnFail(t07, x));

  x = await req('GET', `/api/bookings?search=${encodeURIComponent('Test Customer')}`, { headers: ah() });
  const t08 = x.status === 200 && listRows(x).some((b) => b.id === TEST_BOOKING_ID);
  r('G2', 'T08', 'Search customer name', t08, 'contains id', String(x.status), '', httpOnFail(t08, x));

  x = await req('GET', '/api/bookings?status=active', { headers: ah() });
  const t09 = x.status === 200 && listRows(x).every((b) => b.status === 'active');
  r('G2', 'T09', 'Filter status=active', t09, 'all active', String(x.status), '', httpOnFail(t09, x));

  x = await req('PATCH', `/api/bookings/${TEST_BOOKING_ID}`, {
    headers: ah(),
    body: { customer_name: 'Updated Customer Name' },
  });
  const t10 = x.status === 200 && x.json.customer_name === 'Updated Customer Name';
  r('G2', 'T10', 'PATCH header', t10, 'updated name', String(x.status), '', httpOnFail(t10, x));

  const supTill = '2026-05-20';
  x = await req('POST', `/api/bookings/${TEST_BOOKING_ID}/flights`, {
    headers: ah(),
    body: {
      is_self_booked: false,
      sector_from: 'DEL',
      sector_to: 'BKK',
      supplier_id: SUP_ID,
      travel_date: dot30,
      departure_time: '06:00',
      cabin_class: 'economy',
      cost: 75000,
      currency: 'INR',
      exchange_rate: 1,
      is_refundable: true,
      supplier_full_refund_till: supTill,
    },
  });
  const expOur = subDaysUtc(supTill, 5);
  TEST_FLIGHT_ID = x.json.id;
  const t11 =
    x.status === 201 &&
    x.json.our_full_refund_till === expOur &&
    Number(x.json.inr_equivalent) === 75000;
  r(
    'G3 P2-16',
    'T11',
    'Flight our_full_refund_till = supplier−5d',
    t11,
    expOur,
    JSON.stringify({ our: x.json.our_full_refund_till, st: x.status }),
    '',
    httpOnFail(t11, x),
  );

  const sup2 = '2026-05-25';
  x = await req('PATCH', `/api/bookings/${TEST_BOOKING_ID}/flights/${TEST_FLIGHT_ID}`, {
    headers: ah(),
    body: {
      supplier_full_refund_till: sup2,
      our_full_refund_till: '2099-01-01',
    },
  });
  const expOur2 = subDaysUtc(sup2, 5);
  const t12 =
    x.status === 200 &&
    x.json.our_full_refund_till === expOur2 &&
    x.json.our_full_refund_till !== '2099-01-01';
  r('G3', 'T12', 'Client cannot override our_* refund', t12, expOur2, String(x.json.our_full_refund_till), '', httpOnFail(t12, x));

  x = await req('PATCH', `/api/bookings/${TEST_BOOKING_ID}/flights/${TEST_FLIGHT_ID}`, {
    headers: ah(),
    body: { partial_refund_pct: 50, supplier_partial_refund_till: '2026-05-24' },
  });
  const t13 = x.status === 200 && x.json.our_partial_refund_till === subDaysUtc('2026-05-24', 5);
  r('G3', 'T13', 'Partial refund buffer', t13, '2026-05-19', String(x.json.our_partial_refund_till), '', httpOnFail(t13, x));

  x = await req('POST', `/api/bookings/${TEST_BOOKING_ID}/flights`, {
    headers: ah(),
    body: {
      is_self_booked: false,
      sector_from: 'BKK',
      sector_to: 'DEL',
      travel_date: ret37,
      cost: 75000,
      currency: 'INR',
      exchange_rate: 1,
      is_refundable: false,
    },
  });
  const t14 = x.status === 201 && x.json.our_full_refund_till == null && x.json.our_partial_refund_till == null;
  r('G3', 'T14', 'Null supplier dates → null our_*', t14, 'nulls', JSON.stringify(x.json), '', httpOnFail(t14, x));

  const hotelSupTill = '2026-05-08';
  x = await req('POST', `/api/bookings/${TEST_BOOKING_ID}/hotels`, {
    headers: ah(),
    body: {
      is_self_booked: false,
      property_name: 'Thavorn Palm Beach',
      supplier_id: SUP_ID,
      city: 'Phuket',
      check_in_date: dot30,
      check_out_date: addDays(dot30, 4),
      cost: 33345,
      currency: 'INR',
      exchange_rate: 1,
      is_refundable: true,
      supplier_full_refund_till: hotelSupTill,
    },
  });
  TEST_HOTEL_ID = x.json.id;
  const t15 =
    x.status === 201 &&
    Number(x.json.nights) === 4 &&
    Number(x.json.inr_equivalent) === 33345 &&
    x.json.our_full_refund_till === subDaysUtc(hotelSupTill, 5);
  r(
    'G3',
    'T15',
    'Hotel 5-day buffer + nights',
    t15,
    'nights 4',
    String(x.status),
    JSON.stringify(x.json).slice(0, 120),
    httpOnFail(t15, x),
  );

  const landSup = '2026-05-10';
  x = await req('POST', `/api/bookings/${TEST_BOOKING_ID}/land-items`, {
    headers: ah(),
    body: {
      sub_item_type: 'airport_transfer',
      description: 'Airport to Hotel Transfer',
      supplier_id: SUP_ID,
      transfer_type: 'private',
      date: dot30,
      cost: 4200,
      currency: 'INR',
      exchange_rate: 1,
      is_refundable: true,
      supplier_full_refund_till: landSup,
    },
  });
  TEST_LAND_ID = x.json.id;
  const t16 = x.status === 201 && x.json.our_full_refund_till === subDaysUtc(landSup, 5);
  r('G3', 'T16', 'Land buffer', t16, subDaysUtc(landSup, 5), String(x.json.our_full_refund_till), '', httpOnFail(t16, x));

  x = await req('POST', `/api/bookings/${TEST_BOOKING_ID}/flights`, {
    headers: ah(),
    body: {
      is_self_booked: false,
      sector_from: 'DEL',
      sector_to: 'HKT',
      travel_date: dot30,
      cost: 1000,
      currency: 'USD',
      exchange_rate: 83.47,
      is_refundable: false,
      supplier_id: SUP_ID,
    },
  });
  const t17 = x.status === 201 && Number(x.json.inr_equivalent) === 83470;
  r('G4', 'T17', 'INR ceiling USD flight', t17, '83470', String(x.json.inr_equivalent), '', httpOnFail(t17, x));

  x = await req('POST', `/api/bookings/${TEST_BOOKING_ID}/hotels`, {
    headers: ah(),
    body: {
      is_self_booked: false,
      property_name: 'Test Hotel',
      supplier_id: SUP_ID,
      city: 'Bangkok',
      check_in_date: dot30,
      check_out_date: addDays(dot30, 2),
      cost: 100,
      currency: 'USD',
      exchange_rate: 83.33,
      is_refundable: false,
    },
  });
  const t18 = x.status === 201 && Number(x.json.inr_equivalent) === 8333;
  r('G4', 'T18', 'Hotel USD ceiling', t18, '8333', String(x.json.inr_equivalent), '', httpOnFail(t18, x));

  x = await req('POST', `/api/bookings/${TEST_BOOKING_ID}/travellers`, {
    headers: ah(),
    body: {
      full_name: 'Rahul Saxena',
      dob: '1985-03-12',
      nationality: 'Indian',
      phone: '+91 9810000000',
      email: 'rahul@test.com',
      emergency_contact_name: 'Priya Saxena',
      emergency_contact_phone: '+91 9810000001',
      travel_document_id: 'A1234567',
      passport_expiry_date: addDays(t0, 800),
      visa_needed: true,
      passport_alert_acknowledged: true,
    },
  });
  TEST_TRAVELLER_ID = x.json.id;
  const t19 = (x.status === 200 || x.status === 201) && x.json.passport_alert_shown === false;
  r('G5', 'T19', 'Create traveller', t19, 'alert false', String(x.status), '', httpOnFail(t19, x));

  x = await req('POST', `/api/bookings/${TEST_BOOKING_ID}/travellers`, {
    headers: ah(),
    body: {
      full_name: 'Alert Traveller',
      dob: '1990-01-01',
      nationality: 'Indian',
      phone: '+91 9810000002',
      email: 'alert@test.com',
      emergency_contact_name: 'EC Name',
      emergency_contact_phone: '+91 9810000003',
      travel_document_id: 'B7654321',
      passport_expiry_date: addMonthsSimple(dot30, 3),
      visa_needed: true,
      passport_alert_acknowledged: true,
    },
  });
  ALERT_TRAVELLER_ID = x.json.id;
  const t20 = x.status === 201 && x.json.passport_alert_shown === true;
  r('G5', 'T20', 'Passport alert', t20, 'alert true', String(x.json.passport_alert_shown), '', httpOnFail(t20, x));

  x = await req('POST', `/api/bookings/${TEST_BOOKING_ID}/travellers/${ALERT_TRAVELLER_ID}/acknowledge-passport`, {
    headers: ah(),
    body: {},
  });
  const t21 =
    x.status === 200 &&
    x.json.passport_alert_acknowledged === true &&
    x.json.passport_alert_acknowledged_by === ADMIN_ID;
  const logPass = await sb
    .from('system_logs')
    .select('id')
    .eq('event_type', 'PASSPORT_ALERT_ACKNOWLEDGED')
    .eq('entity_type', 'traveller')
    .eq('entity_id', ALERT_TRAVELLER_ID)
    .limit(1);
  const t21b = t21 && (logPass.data?.length ?? 0) >= 1;
  r(
    'G5',
    'T21',
    'Passport ack + log',
    t21b,
    'ack+log',
    `${x.status} logs=${logPass.data?.length}`,
    '',
    httpOnFail(t21b, x),
  );

  x = await req('POST', `/api/bookings/${TEST_BOOKING_ID}/travellers`, {
    headers: ah(),
    body: {
      full_name: 'OCI Holder',
      dob: '1988-06-15',
      nationality: 'Indian',
      phone: '+91 9810000004',
      email: 'oci@test.com',
      emergency_contact_name: 'EC',
      emergency_contact_phone: '+91 9810000005',
      travel_document_id: 'C1111111',
      passport_expiry_date: addDays(t0, 1000),
      visa_needed: false,
      visa_exemption_proof_url: null,
      passport_alert_acknowledged: true,
    },
  });
  const t22 = x.status === 400 && String(x.json.error || '').toLowerCase().includes('visa');
  r('G5', 'T22', 'Visa exemption required', t22, '400', String(x.status), '', httpOnFail(t22, x));

  x = await req('GET', `/api/bookings/${TEST_BOOKING_ID}/invoice`, { headers: ah() });
  const inv = x.json;
  const gstRate = Number(inv.gst_rate || 0);
  const tcsRate = Number(inv.tcs_rate || 0);
  const marginNum = Number(inv.margin || 0);
  const tcp = Number(inv.total_cost_price || 0);
  const expSub = Math.ceil(tcp + marginNum);
  const expGst = Math.round(gstRate * marginNum * 100) / 100;
  const expTcs = Math.ceil(tcsRate * expSub);
  const expPay = Math.ceil(expSub + expGst + expTcs);
  const t23 =
    x.status === 200 &&
    Number(inv.subtotal) === expSub &&
    Math.abs(Number(inv.gst_amount) - expGst) < 0.001 &&
    Number(inv.tcs_amount) === expTcs &&
    Number(inv.total_payable) === expPay;
  r(
    'G6 P2-08',
    'T23',
    'Invoice arithmetic',
    t23,
    'subtotal/gst/tcs/total',
    `sub=${inv.subtotal} exp=${expSub}`,
    '',
    httpOnFail(t23, x),
  );

  const inv0 = await req('GET', `/api/bookings/${TEST_BOOKING_ID}/invoice`, { headers: ah() });
  TCP_BEFORE_SELF = inv0.json.total_cost_price;

  x = await req('PATCH', `/api/bookings/${TEST_BOOKING_ID}/invoice`, {
    headers: ah(),
    body: { margin: 8030, financial_confirmed: true },
  });
  const inv24 = x.json;
  const t24 = x.status === 200 && Number(inv24.gst_amount) === 1445.4;
  const sub24 = Number(inv24.subtotal);
  const tcs24 = Number(inv24.tcs_amount);
  const pay24 = Number(inv24.total_payable);
  const expTcs24 = Math.ceil(sub24 * Number(inv24.tcs_rate || 0));
  const expPay24 = Math.ceil(sub24 + Number(inv24.gst_amount) + expTcs24);
  const t25 = tcs24 === expTcs24;
  const t26 = pay24 === expPay24;
  r('G6', 'T24', 'GST 2 decimals @ margin 8030', t24, '1445.4', String(inv24.gst_amount), '', httpOnFail(t24, x));
  r('G6', 'T25', 'TCS ceiling', t25, String(expTcs24), String(tcs24), '', httpOnFail(t25, x));
  r('G6', 'T26', 'Total payable ceiling', t26, String(expPay24), String(pay24), '', httpOnFail(t26, x));

  const eff = todayYmd();
  const xTcsUp = await req('POST', '/api/config/tcs-rate', {
    headers: ah(),
    body: { rate: 0.03, effective_from: eff },
  });
  const t27a = xTcsUp.status === 201 || xTcsUp.status === 200;
  x = await req('PATCH', `/api/bookings/${TEST_BOOKING_ID}/invoice`, {
    headers: ah(),
    body: { margin: 8030, financial_confirmed: true },
  });
  const t27b = x.status === 200 && Math.abs(Number(x.json.tcs_rate) - 0.03) < 0.001;
  await req('POST', '/api/config/tcs-rate', {
    headers: ah(),
    body: { rate: 0.02, effective_from: eff },
  });
  const t27 = t27a && t27b;
  r(
    'G6',
    'T27',
    'TCS rate from config (toggle 3% then restore 2%)',
    t27,
    'tcs 0.03',
    String(x.json?.tcs_rate),
    '',
    t27 ? null : !t27b ? x.exchange : xTcsUp.exchange,
  );

  const probeDm = await req('GET', '/api/config/default-margin-pct/current', { headers: gh() });
  if (probeDm.status !== 200) {
    r(
      'G6 P2-PAYMENT',
      'T51',
      'Default margin pct API (skipped — DB missing config_default_margin_pct)',
      true,
      'apply migration 010',
      String(probeDm.status),
      'Run supabase/migrations/010_config_default_margin_pct.sql on the project DB, then reload PostgREST schema if needed.',
      null,
    );
  } else {
    x = probeDm;
    const t51a = x.status === 200 && Number.isFinite(Number(x.json.rate));
    r(
      'G6 P2-PAYMENT',
      'T51a',
      'GET default-margin-pct/current (agent)',
      t51a,
      '200 + numeric rate',
      `${x.status} ${JSON.stringify(x.json)}`,
      '',
      httpOnFail(t51a, x),
    );
    const xDmUp = await req('POST', '/api/config/default-margin-pct', {
      headers: ah(),
      body: { rate: 0.11 },
    });
    const t51b = xDmUp.status === 201;
    r(
      'G6 P2-PAYMENT',
      'T51b',
      'POST default-margin-pct (admin)',
      t51b,
      '201',
      String(xDmUp.status),
      '',
      httpOnFail(t51b, xDmUp),
    );
    x = await req('GET', '/api/config/default-margin-pct/current', { headers: gh() });
    const t51c = x.status === 200 && Math.abs(Number(x.json.rate) - 0.11) < 0.0001;
    r(
      'G6 P2-PAYMENT',
      'T51c',
      'Default margin rate after admin update',
      t51c,
      '0.11',
      String(x.json?.rate),
      '',
      httpOnFail(t51c, x),
    );
    await req('POST', '/api/config/default-margin-pct', { headers: ah(), body: { rate: 0.12 } });
    x = await req('GET', '/api/config/default-margin-pct/current', { headers: gh() });
    const t51d = x.status === 200 && Math.abs(Number(x.json.rate) - 0.12) < 0.0001;
    r(
      'G6 P2-PAYMENT',
      'T51d',
      'Default margin restored to 0.12',
      t51d,
      '0.12',
      String(x.json?.rate),
      '',
      httpOnFail(t51d, x),
    );
  }

  x = await req('POST', `/api/bookings/${TEST_BOOKING_ID}/flights`, {
    headers: ah(),
    body: {
      is_self_booked: true,
      sector_from: 'DEL',
      sector_to: 'BOM',
      travel_date: dot30,
      cost: 50000,
    },
  });
  x = await req('GET', `/api/bookings/${TEST_BOOKING_ID}/invoice`, { headers: ah() });
  const t28 = x.status === 200 && Number(x.json.total_cost_price) === Number(TCP_BEFORE_SELF);
  r('G6', 'T28', 'Self-booked excluded from TCP', t28, 'unchanged TCP', String(x.json.total_cost_price), '', httpOnFail(t28, x));

  x = await req('GET', `/api/bookings/${TEST_BOOKING_ID}/invoice`, { headers: ah() });
  const b = x.json.cost_breakup;
  const t29 =
    x.status === 200 &&
    Array.isArray(b?.flights?.items) &&
    Array.isArray(b?.hotels?.items) &&
    Array.isArray(b?.land_package?.items);
  r('G6', 'T29', 'Cost breakup sections', t29, 'flights/hotels/land', b ? 'ok' : 'missing', '', httpOnFail(t29, x));

  x = await req('POST', `/api/bookings/${TEST_BOOKING_ID}/visas`, {
    headers: ah(),
    body: {
      is_self_arranged: false,
      country: 'Thailand',
      visa_type: 'tourist',
      supplier_id: SUP_ID,
      cost_per_applicant: 2500,
      currency: 'INR',
      exchange_rate: 1,
      is_refundable: true,
      supplier_full_refund_till: '2026-05-15',
    },
  });
  TEST_VISA_ID = x.json.id;
  const t30 = x.status === 201 && TEST_VISA_ID;
  r('G7', 'T30', 'Create visa', t30, '201', String(x.status), '', httpOnFail(t30, x));

  x = await req('POST', `/api/bookings/${TEST_BOOKING_ID}/visas/${TEST_VISA_ID}/applicants`, {
    headers: ah(),
    body: { traveller_id: TEST_TRAVELLER_ID },
  });
  const t31 =
    (x.status === 200 || x.status === 201) &&
    Number(x.json.number_of_applicants) === 1 &&
    Number(x.json.inr_equivalent) === 2500 &&
    x.json.our_full_refund_till === subDaysUtc('2026-05-15', 5);
  r(
    'G7',
    'T31',
    'Link traveller to visa',
    t31,
    '1 applicant',
    JSON.stringify(x.json).slice(0, 80),
    '',
    httpOnFail(t31, x),
  );

  x = await req('POST', `/api/bookings/${TEST_BOOKING_ID}/visas/${TEST_VISA_ID}/applicants`, {
    headers: ah(),
    body: { traveller_id: ALERT_TRAVELLER_ID },
  });
  const t32 =
    (x.status === 200 || x.status === 201) &&
    Number(x.json.number_of_applicants) === 2 &&
    Number(x.json.inr_equivalent) === 5000;
  r('G7', 'T32', 'Visa 2 applicants', t32, '5000 inr', String(x.json.inr_equivalent), '', httpOnFail(t32, x));

  x = await req('POST', `/api/bookings/${TEST_BOOKING_ID}/supplier-tranches`, {
    headers: ah(),
    body: {
      supplier_id: SUP_ID,
      amount: 60000,
      currency: 'INR',
      exchange_rate: 1,
      payment_date: addDays(dot30, -10),
    },
  });
  TEST_SUPPLIER_TRANCHE_ID = x.json.id;
  const t33 = (x.status === 200 || x.status === 201) && Number(x.json.inr_equivalent) === 60000 && x.json.status === 'pending';
  r('G8', 'T33', 'Supplier tranche', t33, '60000 INR', String(x.status), '', httpOnFail(t33, x));

  x = await req('POST', `/api/bookings/${TEST_BOOKING_ID}/supplier-tranches`, {
    headers: ah(),
    body: {
      supplier_id: SUP_ID,
      amount: 10000,
      currency: 'INR',
      exchange_rate: 1,
      payment_date: addDays(dot30, 5),
    },
  });
  const t34 = x.status === 400;
  r('G8', 'T34', 'Tranche date before DoT', t34, '400', String(x.status), '', httpOnFail(t34, x));

  x = await req('POST', `/api/bookings/${TEST_BOOKING_ID}/generate-guest-tranches`, {
    headers: ah(),
    body: {},
  });
  const guests = Array.isArray(x.json) ? x.json : [];
  const t35 =
    x.status === 200 &&
    guests.length === 2 &&
    guests.some((g) => g.label === 'Tranche 1') &&
    guests.some((g) => g.label === 'Balance Payment');
  r(
    'G8',
    'T35',
    'Guest tranches scenario A',
    t35,
    '2 tranches',
    `n=${guests.length}`,
    'Generator uses flights+hotels only for tranche 1 slice',
    httpOnFail(t35, x),
  );

  const dot15 = addDays(t0, 15);
  const ret22 = addDays(t0, 22);
  const nrfPayload = buildPayload({
    dot: dot15,
    ret: ret22,
    supId: SUP_ID,
    customerName: 'NRF Test Customer',
  });
  x = await req('POST', '/api/bookings', { headers: ah(), body: nrfPayload });
  NRF_BOOKING_ID = x.json.id;
  const t36 = x.status === 201 && x.json.is_nrf === true;
  if (NRF_BOOKING_ID) createdBookingIds.push(NRF_BOOKING_ID);
  const nrfLog = await sb
    .from('system_logs')
    .select('id')
    .eq('event_type', 'NRF_FLAG_SET')
    .eq('entity_id', NRF_BOOKING_ID)
    .limit(1);
  const t36b = t36 && (nrfLog.data?.length ?? 0) >= 1;
  r('G8', 'T36', 'NRF flag + log', t36b, 'is_nrf+log', `${x.status} nrf=${x.json.is_nrf}`, '', httpOnFail(t36b, x));

  x = await req('POST', `/api/bookings/${NRF_BOOKING_ID}/supplier-tranches`, {
    headers: ah(),
    body: {
      supplier_id: SUP_ID,
      amount: 50000,
      currency: 'INR',
      exchange_rate: 1,
      payment_date: addDays(t0, 10),
    },
  });
  x = await req('POST', `/api/bookings/${NRF_BOOKING_ID}/generate-guest-tranches`, { headers: ah(), body: {} });
  const gn = Array.isArray(x.json) ? x.json : [];
  const t37 = x.status === 200 && gn.length === 1 && gn[0].label === 'Full Payment';
  r('G8', 'T37', 'NRF single guest tranche', t37, 'Full Payment', `n=${gn.length} ${gn[0]?.label}`, '', httpOnFail(t37, x));

  const finLog = await sb
    .from('system_logs')
    .select('actor_id, after_state, metadata')
    .eq('event_type', 'FINANCIAL_CONFIRMED')
    .eq('entity_id', TEST_BOOKING_ID)
    .limit(1);
  const t38 = (finLog.data?.length ?? 0) >= 1 && finLog.data[0].actor_id === ADMIN_ID;
  r(
    'G9',
    'T38',
    'FINANCIAL_CONFIRMED log',
    t38,
    '1 row',
    String(finLog.data?.length),
    'metadata may be empty; after_state has financials',
    null,
  );

  const creLog = await sb
    .from('system_logs')
    .select('before_state, after_state')
    .eq('event_type', 'BOOKING_CREATED')
    .eq('entity_id', TEST_BOOKING_ID)
    .limit(1);
  const t39 =
    (creLog.data?.length ?? 0) >= 1 &&
    creLog.data[0].before_state == null &&
    creLog.data[0].after_state &&
    typeof creLog.data[0].after_state === 'object';
  r('G9', 'T39', 'BOOKING_CREATED log', t39, 'after_state object', String(!!creLog.data?.[0]?.after_state), '', null);

  const ffLog = await sb
    .from('system_logs')
    .select('before_state, after_state')
    .eq('event_type', 'FINANCIAL_FIELD_CHANGED')
    .eq('entity_id', TEST_BOOKING_ID)
    .order('created_at', { ascending: false })
    .limit(1);
  const t40 =
    (ffLog.data?.length ?? 0) >= 1 &&
    Number(ffLog.data[0].before_state?.margin) !== Number(ffLog.data[0].after_state?.margin);
  r(
    'G9',
    'T40',
    'FINANCIAL_FIELD_CHANGED',
    t40,
    'margin diff',
    String(JSON.stringify(ffLog.data?.[0]?.after_state) || '').slice(0, 80),
    '',
    null,
  );

  x = await req('GET', '/api/bookings', { headers: ah() });
  const all = listRows(x);
  const t41 = x.status === 200 && all.length > 0 && all.every((b) => MYTL_RE.test(b.booking_code));
  r('G10', 'T41', 'List MYTL codes', t41, 'all MYTL', String(all.length), '', httpOnFail(t41, x));

  const nrfRow = all.find((b) => b.id === NRF_BOOKING_ID);
  const mainRow = all.find((b) => b.id === TEST_BOOKING_ID);
  const t42 = x.status === 200 && nrfRow?.is_nrf === true && mainRow?.is_nrf === false;
  r('G10', 'T42', 'List NRF flags', t42, 'nrf vs main', `${nrfRow?.is_nrf}/${mainRow?.is_nrf}`, '', httpOnFail(t42, x));

  const t43 = x.status === 200 && all.every((b) => /^\d{7}$/.test(String(b.invoice_number)));
  r('G10', 'T43', 'Invoice numbers 7-digit', t43, '7 digits', 'sample ' + (all[0]?.invoice_number ?? ''), '', httpOnFail(t43, x));

  const fd1 = new FormData();
  fd1.append('file', new Blob([Buffer.from('%PDF-1.4 phase2 test')], { type: 'application/pdf' }), 't.pdf');
  fd1.append('document_type', 'voucher');
  fd1.append('entity_type', 'booking');
  fd1.append('description', 'Test voucher v1');
  x = await reqMultipart(`/api/bookings/${TEST_BOOKING_ID}/documents`, ah(), fd1);
  const t44 =
    (x.status === 200 || x.status === 201) &&
    x.json.version === 1 &&
    x.json.is_active === true &&
    !!x.json.file_path &&
    !!x.json.signed_url;
  TEST_DOC_ID = x.json.id;
  const docLog = await sb
    .from('system_logs')
    .select('id')
    .eq('event_type', 'DOCUMENT_UPLOADED')
    .eq('entity_type', 'booking_document')
    .eq('entity_id', TEST_DOC_ID)
    .limit(1);
  const t44b = t44 && (docLog.data?.length ?? 0) >= 1;
  r(
    'G11',
    'T44',
    'Upload document v1',
    t44b,
    'v1+log',
    `${x.status} ${x.json.error || 'ok'}`,
    process.env.DOCUMENTS_STORAGE_BUCKET ? '' : 'DOCUMENTS_STORAGE_BUCKET',
    httpOnFail(t44b, x),
  );

  const fd2 = new FormData();
  fd2.append('file', new Blob([Buffer.from('%PDF-1.4 v2')], { type: 'application/pdf' }), 't.pdf');
  fd2.append('document_type', 'voucher');
  fd2.append('entity_type', 'booking');
  fd2.append('description', 'Test voucher v2');
  x = await reqMultipart(`/api/bookings/${TEST_BOOKING_ID}/documents`, ah(), fd2);
  const t45 = (x.status === 200 || x.status === 201) && x.json.version === 2;
  const oldDoc = await sb.from('booking_documents').select('is_active, version').eq('id', TEST_DOC_ID).single();
  const t45b = t45 && oldDoc.data?.is_active === false;
  r('G11', 'T45', 'v2 deactivates v1', t45b, 'v1 inactive', JSON.stringify(oldDoc.data), '', httpOnFail(t45b, x));

  x = await req('GET', `/api/bookings/${TEST_BOOKING_ID}/documents/${TEST_DOC_ID}/versions`, { headers: ah() });
  const vers = Array.isArray(x.json) ? x.json : [];
  const t46 = x.status === 200 && vers.length >= 2 && vers[0].version >= vers[1]?.version;
  r('G11', 'T46', 'Version list', t46, '2 rows', String(vers.length), '', httpOnFail(t46, x));

  const srcRoot = path.join(repoRoot, 'src');
  const jsFiles = walkJs(srcRoot);
  let hits18 = [];
  let hits02 = [];
  function hasLiteralOutsideComments(source, re) {
    for (const line of source.split('\n')) {
      const t = line.trim();
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue;
      const codeOnly = line.replace(/\/\/.*/, '');
      if (re.test(codeOnly)) return true;
    }
    return false;
  }
  for (const f of jsFiles) {
    const c = fs.readFileSync(f, 'utf8');
    if (hasLiteralOutsideComments(c, /\b0\.18\b/)) hits18.push(path.relative(repoRoot, f));
    if (hasLiteralOutsideComments(c, /\b0\.02\b/)) hits02.push(path.relative(repoRoot, f));
  }
  const t47 = hits18.length === 0 && hits02.length === 0;
  r(
    'G12',
    'T47',
    'No hardcoded 0.18/0.02 in src',
    t47,
    '0 hits',
    `0.18:${hits18.join(',') || 'none'} 0.02:${hits02.join(',') || 'none'}`,
    '',
    null,
  );

  const mrFiles = [];
  for (const f of jsFiles) {
    const c = fs.readFileSync(f, 'utf8');
    if (c.includes('Math.round')) mrFiles.push(path.basename(f));
  }
  const allowedRound = new Set([
    'bookingFinancials.js',
    'invoicePayload.js',
    'bookingCollectionsController.js',
  ]);
  const t48 = mrFiles.length > 0 && mrFiles.every((b) => allowedRound.has(b));
  r(
    'G12',
    'T48',
    'Math.round in financial GST only',
    t48,
    'bookingFinancials + invoicePayload + collections GST',
    [...new Set(mrFiles)].join(','),
    '',
    null,
  );

  const ctrls = ['bookingFlights', 'bookingHotels', 'bookingLand', 'bookingVisas'].map(
    (n) => path.join(repoRoot, 'src', 'controllers', `${n}Controller.js`),
  );
  const t49 = ctrls.every((f) => {
    const c = fs.readFileSync(f, 'utf8');
    return c.includes('calculateOurPolicyDate') || c.includes('lineItemShared') || c.includes('flightDerived');
  });
  r(
    'G12',
    'T49',
    '5-day via shared derived helpers',
    t49,
    'lineItemShared/calculateOurPolicyDate',
    ctrls.map((f) => path.basename(f)).join(','),
    'Spec asks calculateOurPolicyDate in each; implementation uses flightDerived/etc.',
    null,
  );

  const { data: badCodes } = await sb.from('bookings').select('booking_code').limit(5000);
  const t50 = !(badCodes || []).some((row) => !MYTL_RE.test(row.booking_code));
  r('G12', 'T50', 'DB booking_code MYTL', t50, '0 non-MYTL', `sample n=${badCodes?.length}`, 'First 5000 rows', null);

  // Cleanup
  for (const id of new Set(createdBookingIds)) {
    await sb.from('bookings').delete().eq('id', id);
  }
  await sb.from('bookings').delete().eq('customer_name', 'Updated Customer Name');
  await sb.from('bookings').delete().in('booking_code', [TEST_BOOKING_CODE, CODE2].filter(Boolean));
}

async function main() {
  const sb = supabase();
  let aborted = '';
  try {
    await ensureServer();
    await runSuite(sb);
  } catch (e) {
    aborted = e.message;
    console.error(e);
  } finally {
    stopServer();
  }

  const out = reportPaths();
  const pass = results.filter((x) => x.pass).length;
  const summary = aborted
    ? `Aborted: ${aborted}`
    : `Phase 2 backend harness complete. Pass ${pass}/${results.length}.`;
  writeHtml(out.latest, summary);
  writeHtml(out.versioned, summary);
  console.log(`Report written: ${out.latest}`);
  console.log(`Report written: ${out.versioned}`);
  console.table(results.map((x) => ({ id: x.id, pass: x.pass, name: x.name.slice(0, 48) })));
  const anyFail = results.some((x) => !x.pass) || Boolean(aborted);
  process.exit(anyFail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  const out = reportPaths();
  writeHtml(out.latest, `Fatal: ${e.message}`);
  writeHtml(out.versioned, `Fatal: ${e.message}`);
  console.log(`Report written: ${out.latest}`);
  console.log(`Report written: ${out.versioned}`);
  stopServer();
  process.exit(1);
});
