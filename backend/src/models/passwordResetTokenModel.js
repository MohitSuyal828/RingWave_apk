const pool = require("../config/db");

// ─── createPasswordResetToken ─────────────────────────────────────────────────
//
// Inserts one new row per forgot-password request. tokenHash is the SHA-256
// hash of the raw token (see utils/token.js's hashToken) — the raw token
// itself is never passed to or stored by this function, mirroring how
// refresh tokens are stored.
const createPasswordResetToken = async (userId, tokenHash, expiresAt) => {
  const query = `
    INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
    VALUES ($1, $2, $3)
    RETURNING *;
  `;

  const values = [userId, tokenHash, expiresAt];

  const result = await pool.query(query, values);

  return result.rows[0];
};

// ─── findValidPasswordResetToken ──────────────────────────────────────────────
//
// Used by POST /reset-password. A token is valid only if all three are true:
//   1. token_hash matches exactly (UNIQUE constraint guarantees at most one row)
//   2. used = false (not already consumed)
//   3. expires_at is still in the future (not expired)
//
// Same "found but invalid" vs "not found" ambiguity as findValidRefreshToken
// — the controller responds identically either way, giving an attacker
// probing tokens no information to work with.
const findValidPasswordResetToken = async (tokenHash) => {
  const query = `
    SELECT *
    FROM password_reset_tokens
    WHERE token_hash = $1
      AND used = false
      AND expires_at > NOW()
    LIMIT 1;
  `;

  const result = await pool.query(query, [tokenHash]);

  return result.rows[0];
};

// ─── markPasswordResetTokenUsed ───────────────────────────────────────────────
//
// One-time-use enforcement: once a reset token has been used to actually
// change the password, it must never work again, even before its expiry.
const markPasswordResetTokenUsed = async (id) => {
  const query = `
    UPDATE password_reset_tokens
    SET used = true
    WHERE id = $1
    RETURNING *;
  `;

  const result = await pool.query(query, [id]);

  return result.rows[0];
};

// ─── invalidateActiveResetTokensForUser ───────────────────────────────────────
//
// Called when a new forgot-password request comes in for a user who already
// has an outstanding, unused token — e.g. the user clicked "resend" or
// requested a link twice. Without this, both links would remain valid
// simultaneously, which is unnecessary attack surface (an old, possibly
// leaked-via-email-forwarding link staying live). This keeps at most one
// valid reset token per user at a time.
const invalidateActiveResetTokensForUser = async (userId) => {
  const query = `
    UPDATE password_reset_tokens
    SET used = true
    WHERE user_id = $1
      AND used = false
    RETURNING *;
  `;

  const result = await pool.query(query, [userId]);

  return result.rows;
};

module.exports = {
  createPasswordResetToken,
  findValidPasswordResetToken,
  markPasswordResetTokenUsed,
  invalidateActiveResetTokensForUser,
};
