const pool = require("../config/db");

// ─── Single-device identity model ─────────────────────────────────────────────
//
// One public key per user, not per device. This is a deliberate scope
// limit, not an oversight: a real multi-device E2E system (what
// WhatsApp/Signal actually do) needs a per-device key list, a way to
// fan a message out to every device, and a way to add/remove devices
// without breaking existing verified conversations — meaningfully more
// infrastructure than a single web client currently needs. Upgrading to
// multi-device later means adding a device_id column and returning a
// list from getIdentityKey instead of a single row; it does not require
// re-deriving how the crypto itself works.
//
// upsertIdentityKey overwrites any previous key unconditionally — e.g. if
// a user clears their browser storage and this device generates a new
// keypair. Callers that care about detecting a key CHANGE (which is
// exactly the event a real system would want to surface — "this
// contact's security code just changed" — see WhatsApp's own warning for
// this) should compare against the previous value before calling this,
// not rely on this function to do it.
const upsertIdentityKey = async (userId, publicKeyJwk, algorithm = "ECDH-P256") => {
  const query = `
    INSERT INTO identity_keys (user_id, public_key, algorithm, updated_at)
    VALUES ($1, $2, $3, NOW())
    ON CONFLICT (user_id)
    DO UPDATE SET public_key = $2, algorithm = $3, updated_at = NOW()
    RETURNING *;
  `;

  const result = await pool.query(query, [userId, publicKeyJwk, algorithm]);

  return result.rows[0];
};

const getIdentityKey = async (userId) => {
  const query = `SELECT user_id, public_key, algorithm, updated_at FROM identity_keys WHERE user_id = $1;`;

  const result = await pool.query(query, [userId]);

  return result.rows[0];
};

module.exports = { upsertIdentityKey, getIdentityKey };
