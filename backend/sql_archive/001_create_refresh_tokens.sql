-- migrations/001_create_refresh_tokens.sql
--
-- Run manually against your local Postgres instance, e.g.:
--   psql -U postgres -d ringwave_db -f migrations/001_create_refresh_tokens.sql

CREATE TABLE refresh_tokens (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(255) NOT NULL UNIQUE,
    expires_at  TIMESTAMP NOT NULL,
    revoked     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- UNIQUE on token_hash already creates an index for the /refresh and /logout
-- lookup queries — no separate index needed for that column.

-- Speeds up a future "log out everywhere" feature (revokeAllUserTokens),
-- which will query "all rows for this user_id" — not used by this
-- implementation yet, but cheap to add now.
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);