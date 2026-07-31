const pool = require("../config/db");

// ─── createRefreshToken ───────────────────────────────────────────────────────
//
// Inserts one new row per login. Concurrent sessions are supported by design:
// each call to this function creates an independent row, so a user logging
// in from a phone and a laptop ends up with two separate, equally valid
// refresh_tokens rows — neither login affects the other.
//
// tokenHash is the SHA-256 hash of the raw token (see utils/token.js).
// The raw token itself is never passed to or stored by this function.
const createRefreshToken = async (userId, tokenHash, expiresAt) => {
  const query = `
    INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
    VALUES ($1, $2, $3)
    RETURNING *;
  `;

  const values = [userId, tokenHash, expiresAt];

  const result = await pool.query(query, values);

  return result.rows[0];
};

// ─── findValidRefreshToken ────────────────────────────────────────────────────
//
// Used by POST /refresh. A token is valid only if all three are true:
//   1. token_hash matches exactly (UNIQUE constraint guarantees at most one row)
//   2. revoked = false (not logged out)
//   3. expires_at is still in the future (not expired)
//
// If any condition fails, this returns undefined — the controller treats
// "not found" and "found but invalid" identically: both produce the same
// 401 response, so a client can't distinguish "expired" from "revoked" from
// "never existed". That's intentional — it gives an attacker probing tokens
// no information to work with.
const findValidRefreshToken = async (tokenHash) => {
  const query = `
    SELECT *
    FROM refresh_tokens
    WHERE token_hash = $1
      AND revoked = false
      AND expires_at > NOW()
    LIMIT 1;
  `;

  const result = await pool.query(query, [tokenHash]);

  return result.rows[0];
};

// ─── revokeRefreshToken ───────────────────────────────────────────────────────
//
// Used by POST /logout. Marks exactly one row — the one matching this
// specific token's hash — as revoked. Because each login created its own
// row, this naturally scopes logout to a single session/device without
// touching any other active session for the same user.
//
// Returns the updated row (or undefined if no row matched the hash at all).
// The controller does not treat "no row matched" as an error — logout is
// idempotent: calling it on an already-revoked or unknown token still
// returns a success response to the client.
const revokeRefreshToken = async (tokenHash) => {
  const query = `
    UPDATE refresh_tokens
    SET revoked = true
    WHERE token_hash = $1
    RETURNING *;
  `;

  const result = await pool.query(query, [tokenHash]);

  return result.rows[0];
};

// ─── revokeAllUserTokens ──────────────────────────────────────────────────────
//
// NOT called anywhere in this implementation. Included now because the
// index on user_id (added in the migration) is specifically there to make
// this query cheap later, and because writing it alongside the schema it
// depends on is clearer than bolting it on after the fact.
//
// Intended future use: a "log out everywhere" endpoint that revokes every
// session for a user in one call — e.g. after a password change or a
// suspected account compromise.
const revokeAllUserTokens = async (userId) => {
  const query = `
    UPDATE refresh_tokens
    SET revoked = true
    WHERE user_id = $1
      AND revoked = false
    RETURNING *;
  `;

  const result = await pool.query(query, [userId]);

  return result.rows;
};

module.exports = {
  createRefreshToken,
  findValidRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
};