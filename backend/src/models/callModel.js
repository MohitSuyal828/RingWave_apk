const pool = require("../config/db");

// ─── Create Call ────────────────────────────────────────────────────────────
const createCall = async (caller_id, receiver_id, duration, status, call_session_id = null) => {
  const query = `
    INSERT INTO call_history (caller_id, receiver_id, duration, status, call_session_id)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *;
  `;

  const values = [caller_id, receiver_id, duration, status, call_session_id];

  const result = await pool.query(query, values);

  return result.rows[0];
};

// ─── Get Calls For One User (Paginated) ──────────────────────────────────────
//
// Changes from the previous batch:
//   BEFORE  getCallsByUser(userId) — no LIMIT, returns every matching row
//   AFTER   getCallsByUser(userId, limit, offset) — adds LIMIT $2 OFFSET $3
//
// limit and offset are computed by the controller from already-validated
// pagination query params — by the time they reach this function they are
// guaranteed to be positive integers (limit capped at 100), so no further
// validation happens at this layer.
//
// ORDER BY ch.created_at DESC is unchanged and load-bearing: pagination
// without a stable ORDER BY produces inconsistent page boundaries between
// requests (Postgres makes no ordering guarantee without one), so this
// clause is what makes "page 2" mean the same 10 rows every time it's
// requested, as long as no new rows are inserted in between.
const getCallsByUser = async (userId, limit, offset) => {
  const query = `
    SELECT
      ch.id,
      ch.caller_id,
      ch.receiver_id,
      ch.duration,
      ch.status,
      ch.created_at,
      ch.call_session_id,
      caller.name   AS caller_name,
      caller.email  AS caller_email,
      receiver.name  AS receiver_name,
      receiver.email AS receiver_email
    FROM call_history ch
    LEFT JOIN users caller   ON ch.caller_id   = caller.id
    LEFT JOIN users receiver ON ch.receiver_id = receiver.id
    WHERE ch.caller_id = $1
       OR ch.receiver_id = $1
    ORDER BY ch.created_at DESC
    LIMIT $2
    OFFSET $3;
  `;

  const result = await pool.query(query, [userId, limit, offset]);

  return result.rows;
};

// ─── Count Calls For One User ────────────────────────────────────────────────
//
// New. Used by the controller to compute total/totalPages for the
// pagination metadata. Deliberately uses the EXACT SAME WHERE clause as
// getCallsByUser above — if these two ever drift apart (e.g. someone edits
// one filter and forgets the other), totalPages would silently become
// wrong while the actual returned rows stay correctly scoped, which is a
// subtle, hard-to-notice bug. Keeping both queries' WHERE clauses visually
// identical side by side in this file is the simplest guard against that.
const countCallsByUser = async (userId) => {
  const query = `
    SELECT COUNT(*) AS total
    FROM call_history ch
    WHERE ch.caller_id = $1
       OR ch.receiver_id = $1;
  `;

  const result = await pool.query(query, [userId]);

  // COUNT(*) returns a string in node-postgres (Postgres BIGINT is returned
  // as a JS string to avoid precision loss above Number.MAX_SAFE_INTEGER).
  // parseInt here is safe — call counts will never realistically approach
  // that boundary — and it lets the controller do normal arithmetic
  // (Math.ceil(total / limit)) without a stray string-concatenation bug.
  return parseInt(result.rows[0].total, 10);
};

module.exports = {
  createCall,
  getCallsByUser,
  countCallsByUser,
};