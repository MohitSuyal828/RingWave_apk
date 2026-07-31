const jwt = require("jsonwebtoken");
const crypto = require("crypto");

// ─── generateAccessToken ──────────────────────────────────────────────────────
//
// Short-lived JWT (15 minutes) used in Authorization: Bearer <token> on every
// protected route. Verified by the existing authMiddleware.js — no changes
// needed there, since the shape of the JWT payload ({ id, email }) is
// unchanged from the original single-token design. Only the expiry shrinks.
const generateAccessToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || "15m",
      issuer: "ringwave-api",
    }
  );
};
// ─── generateRefreshToken ─────────────────────────────────────────────────────
//
// An opaque random string — NOT a JWT. There is nothing to "decode"; it is
// purely a high-entropy lookup key for the refresh_tokens table. Security
// comes entirely from its randomness (32 bytes = 256 bits) and from never
// storing it anywhere in raw form — only its hash is persisted.
//
// 32 bytes -> 64 hex characters. Collision probability is negligible at any
// realistic scale (this is the same entropy class used by session-token
// libraries across the industry).
const generateRefreshToken = () => {
  return crypto.randomBytes(32).toString("hex");
};

// ─── hashToken ────────────────────────────────────────────────────────────────
//
// SHA-256 hash of the raw refresh token. Used both when storing a new token
// (login) and when looking one up (refresh, logout) — the raw token is never
// written to the database, only this hash. If the refresh_tokens table is
// ever leaked, none of the hashes can be turned back into usable tokens.
//
// SHA-256 (not bcrypt) is appropriate here because the refresh token is
// already a high-entropy random value, not a low-entropy human password —
// there's no need for bcrypt's deliberate slowness, and a fast hash keeps
// the /refresh and /logout lookup queries cheap.
const hashToken = (token) => {
  return crypto.createHash("sha256").update(token).digest("hex");
};

// ─── generateResetToken ───────────────────────────────────────────────────────
//
// Same shape as generateRefreshToken (32 bytes -> 64 hex chars, opaque
// random string, not a JWT) — reused here rather than introduced as a
// separate concept because the security requirements are identical: a
// high-entropy bearer credential that must never be stored in raw form,
// only its hash (via hashToken, below).
const generateResetToken = () => {
  return crypto.randomBytes(32).toString("hex");
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  generateResetToken,
  hashToken,
};