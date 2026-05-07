const { generateToken } = require('../utils/generateToken');
const { verifyPassword } = require('../utils/password');
const { getSupabase } = require('../lib/supabase');

async function login(req, res) {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const supabase = getSupabase();
  const { data: user, error } = await supabase
    .from('users')
    .select('id, email, name, role, member_code, password_hash, is_active')
    .eq('email', String(email).trim().toLowerCase())
    .maybeSingle();

  if (error || !user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  if (!user.is_active) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const token = generateToken({ member_code: user.member_code, role: user.role }, secret);

  await supabase
    .from('users')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', user.id);

  return res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
      member_code: user.member_code,
    },
  });
}

module.exports = { login };
