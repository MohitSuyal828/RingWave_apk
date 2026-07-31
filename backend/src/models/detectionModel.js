const pool = require("../config/db");

// ─── Create Detection ────────────────────────────────────────────────────────
//
// callSessionId/otherUserId are both optional (older clients, or a
// detection that genuinely isn't tied to a call, still work — the columns
// are nullable specifically for this). See the migration comment in
// ringwave.sql for why these exist and where otherUserId comes from.
const createDetection = async (
  user_id,
  prediction,
  confidence_score,
  callSessionId = null,
  otherUserId = null
) => {
  const query = `
    INSERT INTO detection_logs (user_id, prediction, confidence_score, call_session_id, other_user_id)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *;
  `;

  const values = [user_id, prediction, confidence_score, callSessionId, otherUserId];

  const result = await pool.query(query, values);

  return result.rows[0];
};

// ─── Get Detections For One User (Paginated) ─────────────────────────────────
//
// Same pattern as callModel.js's getCallsByUser — see those comments for the
// full rationale on LIMIT/OFFSET placement and why ORDER BY is load-bearing
// for stable pagination.
//
// The join here used to be `u ON dl.user_id = u.id` — which resolves to
// the VIEWER'S OWN name (dl.user_id is whoever this detection's audio
// belonged to, i.e. always the person requesting their own history).
// That was never useful for display. This joins on other_user_id instead
// — the actual person the call was with — aliased distinctly from
// user_id's own name/email so the frontend can never accidentally
// display the wrong one.
const getDetectionsByUser = async (userId, limit, offset) => {
  const query = `
    SELECT
      dl.id,
      dl.user_id,
      dl.prediction,
      dl.confidence_score,
      dl.created_at,
      dl.call_session_id,
      dl.other_user_id,
      ou.name  AS other_user_name,
      ou.email AS other_user_email
    FROM detection_logs dl
    LEFT JOIN users ou ON dl.other_user_id = ou.id
    WHERE dl.user_id = $1
    ORDER BY dl.created_at DESC
    LIMIT $2
    OFFSET $3;
  `;

  const result = await pool.query(query, [userId, limit, offset]);

  return result.rows;
};

// ─── Count Detections For One User ───────────────────────────────────────────
//
// New. Same WHERE clause as getDetectionsByUser, kept side by side
// deliberately — see countCallsByUser in callModel.js for the full
// rationale on why these two queries' filters must never drift apart.
const countDetectionsByUser = async (userId) => {
  const query = `
    SELECT COUNT(*) AS total
    FROM detection_logs dl
    WHERE dl.user_id = $1;
  `;

  const result = await pool.query(query, [userId]);

  // See callModel.js's countCallsByUser for why parseInt is needed here —
  // COUNT(*) returns Postgres BIGINT, which node-postgres returns as a
  // string to avoid precision loss.
  return parseInt(result.rows[0].total, 10);
};

module.exports = {
  createDetection,
  getDetectionsByUser,
  countDetectionsByUser,
};