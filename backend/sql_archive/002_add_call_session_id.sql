-- Adds call_session_id to call_history so multiple rows from the same
-- group call can be grouped together in the UI (call_history is pairwise
-- caller/receiver by design — one row per participant — so this column is
-- what ties several rows back to a single call session).
--
-- call_history is intentionally NOT managed by node-pg-migrate (see the
-- baseline migration's comment) — run this by hand with psql, the same
-- way the table itself was created:
--
--   psql -U postgres -d ringwave_db -f sql_archive/002_add_call_session_id.sql
--
-- Nullable and backward-compatible: existing rows just have NULL, which
-- the app treats as "not part of a tracked group session" (1:1 calls
-- logged before this column existed, or calls where the session id
-- otherwise wasn't available).

ALTER TABLE call_history
  ADD COLUMN IF NOT EXISTS call_session_id UUID;

CREATE INDEX IF NOT EXISTS idx_call_history_session
  ON call_history (call_session_id);
