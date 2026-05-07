const jwt = require('jsonwebtoken');
const { accessKeyForMemberCode } = require('../utils/generateToken');

function createAuthMiddleware(supabase) {
  return async function authMiddleware(req, res, next) {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or malformed authorization header' });
    }
    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
      return res.status(401).json({ error: 'Missing or malformed authorization header' });
    }

    let payload;
    try {
      payload = jwt.verify(token, secret);
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const memberCodeJwt = payload.member_code;
    const memberCodeHeader = req.headers['x-member-code'];
    if (!memberCodeHeader || String(memberCodeHeader).trim() === '') {
      return res.status(401).json({ error: 'Missing member code header' });
    }
    if (memberCodeJwt !== memberCodeHeader) {
      return res.status(401).json({ error: 'Member code mismatch' });
    }

    const expectedAccess = accessKeyForMemberCode(memberCodeJwt);
    if (payload.access_key !== expectedAccess) {
      return res.status(401).json({ error: 'Invalid access key' });
    }

    const { data: userRow, error } = await supabase
      .from('users')
      .select('id, member_code, role, email, name, is_active')
      .eq('member_code', memberCodeJwt)
      .maybeSingle();

    if (error || !userRow) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    if (!userRow.is_active) {
      return res.status(401).json({ error: 'Account deactivated' });
    }

    req.user = {
      id: userRow.id,
      member_code: userRow.member_code,
      role: userRow.role,
      email: userRow.email,
      name: userRow.name,
      access_key: payload.access_key,
    };

    next();
  };
}

module.exports = { createAuthMiddleware };
