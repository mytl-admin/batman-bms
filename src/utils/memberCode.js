const crypto = require('crypto');

/** URL-safe unique member_code (P1-05: UUID-based, URL-safe) */
function generateMemberCode() {
  const bytes = crypto.randomBytes(16);
  return bytes.toString('base64url');
}

/** One-time temporary login password sent by email (not the member_code). */
function generateInvitePassword() {
  return crypto.randomBytes(12).toString('base64url');
}

module.exports = { generateMemberCode, generateInvitePassword };
