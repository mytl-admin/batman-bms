#!/usr/bin/env node
/**
 * Bootstrap or reset a user for local/dev login (service role).
 * Usage: node --env-file=.env.dev scripts/upsert-login-user.js <email> <password> [role] [name]
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

const email = process.argv[2];
const password = process.argv[3];
const role = process.argv[4] || 'admin';
const name = process.argv[5] || 'Admin';

if (!email || !password) {
  console.error('Usage: node --env-file=.env.dev scripts/upsert-login-user.js <email> <password> [role] [name]');
  process.exit(1);
}

if (role !== 'agent' && role !== 'admin') {
  console.error('role must be agent or admin');
  process.exit(1);
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(url, key, { realtime: { transport: ws } });
  const normalizedEmail = String(email).trim().toLowerCase();
  const password_hash = bcrypt.hashSync(password, 12);

  const { data: existing, error: findErr } = await supabase
    .from('users')
    .select('id, member_code, email')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (findErr) {
    console.error(findErr);
    process.exit(1);
  }

  if (existing) {
    const { error: upErr } = await supabase
      .from('users')
      .update({
        password_hash,
        role,
        name,
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);

    if (upErr) {
      console.error(upErr);
      process.exit(1);
    }
    console.log('Updated user:', { email: normalizedEmail, member_code: existing.member_code, role, name });
    console.log('Login with POST /api/auth/login — use header X-Member-Code:', existing.member_code);
    return;
  }

  const member_code = crypto.randomBytes(16).toString('base64url');
  const { data: created, error: insErr } = await supabase
    .from('users')
    .insert({
      email: normalizedEmail,
      member_code,
      name,
      role,
      password_hash,
      is_active: true,
    })
    .select('id, email, member_code, role, name')
    .single();

  if (insErr) {
    console.error(insErr);
    process.exit(1);
  }
  console.log('Created user:', created);
  console.log('Login with POST /api/auth/login — use header X-Member-Code:', created.member_code);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
