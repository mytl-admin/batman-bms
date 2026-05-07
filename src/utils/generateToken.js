const crypto = require('crypto');
const jwt = require('jsonwebtoken');

function accessKeyForMemberCode(memberCode) {
  return crypto.createHash('sha256').update(memberCode, 'utf8').digest('hex');
}

function generateToken({ member_code, role }, secret) {
  const access_key = accessKeyForMemberCode(member_code);
  return jwt.sign({ member_code, access_key, role }, secret, { expiresIn: '24h' });
}

module.exports = { generateToken, accessKeyForMemberCode };
