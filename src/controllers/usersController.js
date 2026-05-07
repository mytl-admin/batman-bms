const sgMail = require('@sendgrid/mail');
const { getSupabase } = require('../lib/supabase');
const { generateMemberCode, generateInvitePassword } = require('../utils/memberCode');
const { hashPassword } = require('../utils/password');

function getLogService(req) {
  return req.app.locals.logService;
}

async function invite(req, res) {
  const { email, name, role } = req.body || {};
  if (!email || !name || !role) {
    return res.status(400).json({ error: 'email, name, and role are required' });
  }
  if (role !== 'agent' && role !== 'admin') {
    return res.status(400).json({ error: 'role must be agent or admin' });
  }

  const supabase = getSupabase();
  const member_code = generateMemberCode();
  const tempPassword = generateInvitePassword();
  const password_hash = await hashPassword(tempPassword);
  const normalizedEmail = String(email).trim().toLowerCase();

  const { data: created, error } = await supabase
    .from('users')
    .insert({
      email: normalizedEmail,
      member_code,
      name: String(name).trim(),
      role,
      password_hash,
      is_active: true,
      invited_by: req.user.id,
      invited_at: new Date().toISOString(),
    })
    .select('id, email, name, role, member_code')
    .single();

  if (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Email or member conflict' });
    }
    console.error(error);
    return res.status(500).json({ error: 'Failed to create user' });
  }

  await getLogService(req).log({
    event_type: 'USER_INVITED',
    entity_type: 'user',
    entity_id: created.id,
    actor_id: req.user.id,
    actor_role: req.user.role,
    before_state: null,
    after_state: {
      id: created.id,
      email: created.email,
      name: created.name,
      role: created.role,
      member_code: created.member_code,
    },
    metadata: {},
  });

  const apiKey = process.env.SENDGRID_API_KEY;
  const from = process.env.SENDGRID_FROM_EMAIL;
  const frontend = process.env.FRONTEND_ORIGIN;

  if (apiKey && from) {
    sgMail.setApiKey(apiKey);
    const loginUrl = frontend ? `${frontend.replace(/\/$/, '')}/login` : '';
    const text = [
      `Hello ${created.name},`,
      '',
      `You've been invited to the Booking ERP.`,
      `Your temporary login password is: ${tempPassword}`,
      `Your member code (for reference): ${created.member_code}`,
      loginUrl ? `Login here: ${loginUrl}` : 'Use the login page your administrator shared.',
      '',
      'Sign in with your email and the temporary password above.',
    ].join('\n');

    try {
      await sgMail.send({
        to: created.email,
        from,
        subject: 'Your Booking ERP invitation',
        text,
      });
    } catch (e) {
      console.error('[invite] Failed to send invite email:', e);
    }
  } else {
    console.warn(`SendGrid not configured — invite email not sent for ${created.email}`);
  }

  return res.status(200).json({
    id: created.id,
    email: created.email,
    name: created.name,
    role: created.role,
    member_code: created.member_code,
  });
}

async function list(req, res) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('users')
    .select('id, name, email, role, is_active, last_login_at')
    .order('created_at', { ascending: true });

  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to list users' });
  }
  return res.json(data || []);
}

async function me(req, res) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('users')
    .select('id, name, email, role, member_code, is_active, last_login_at, created_at')
    .eq('id', req.user.id)
    .maybeSingle();

  if (error || !data) {
    return res.status(404).json({ error: 'User not found' });
  }
  return res.json(data);
}

async function updateUser(req, res) {
  const { id } = req.params;
  const { name, role, is_active } = req.body || {};

  if (role != null && role !== 'agent' && role !== 'admin') {
    return res.status(400).json({ error: 'role must be agent or admin' });
  }

  const supabase = getSupabase();
  const { data: existing, error: fetchErr } = await supabase
    .from('users')
    .select('id, name, role, is_active')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr || !existing) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (is_active === false && id === req.user.id) {
    return res.status(400).json({ error: 'Cannot deactivate your own account' });
  }

  const patch = {};
  if (name != null) patch.name = String(name).trim();
  if (role != null) patch.role = role;
  if (is_active != null) patch.is_active = Boolean(is_active);
  patch.updated_at = new Date().toISOString();

  if (Object.keys(patch).length <= 1) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  const before_state = {};
  if (name != null && existing.name !== patch.name) before_state.name = existing.name;
  if (role != null && existing.role !== patch.role) before_state.role = existing.role;
  if (is_active != null && existing.is_active !== patch.is_active) before_state.is_active = existing.is_active;

  const { data: updated, error: upErr } = await supabase
    .from('users')
    .update(patch)
    .eq('id', id)
    .select('id, name, email, role, is_active, last_login_at')
    .single();

  if (upErr) {
    console.error(upErr);
    return res.status(500).json({ error: 'Failed to update user' });
  }

  const after_state = {};
  if (before_state.name !== undefined) after_state.name = updated.name;
  if (before_state.role !== undefined) after_state.role = updated.role;
  if (before_state.is_active !== undefined) after_state.is_active = updated.is_active;

  await getLogService(req).log({
    event_type: 'USER_UPDATED',
    entity_type: 'user',
    entity_id: updated.id,
    actor_id: req.user.id,
    actor_role: req.user.role,
    before_state: Object.keys(before_state).length ? before_state : null,
    after_state: Object.keys(after_state).length ? after_state : null,
    metadata: {},
  });

  return res.json(updated);
}

module.exports = { invite, list, me, updateUser };
