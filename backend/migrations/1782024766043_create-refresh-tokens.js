// migrations/1782024766043_create-refresh-tokens.js
//
// ─── BASELINE MIGRATION — DO NOT RUN VIA `up` ────────────────────────────────
//
// This migration describes the refresh_tokens table EXACTLY as it already
// exists in the database (created manually via migrations/001_create_refresh_tokens.sql,
// run by hand with psql before node-pg-migrate was introduced).
//
// It is written so that, if you ever needed to build a brand-new empty
// database for this project, this file alone could recreate the
// refresh_tokens table correctly. But against the EXISTING dev database,
// this file must NEVER actually execute its `up` function — the table
// already exists, and running `CREATE TABLE refresh_tokens` again would
// throw a duplicate-table error and abort the whole migration run.
//
// Instead, this migration's name is manually inserted into node-pg-migrate's
// own tracking table (`pgmigrations`) as "already applied" — see the
// baseline command in the implementation notes. From that point on,
// `node-pg-migrate up` skips this file entirely and only runs migrations
// that come after it.
//
// users, call_history, and detection_logs are intentionally NOT represented
// here or anywhere else in migrations/ — per the Option B decision, those
// three tables remain unmanaged by node-pg-migrate. This file covers only
// the one table this project decided to bring under migration management.

exports.up = (pgm) => {
  pgm.createTable("refresh_tokens", {
    id: "id", // shorthand for SERIAL PRIMARY KEY — matches the original table's `id SERIAL PRIMARY KEY`

    user_id: {
      type: "integer",
      notNull: true,
      references: '"users"', // matches node-pg-migrate's documented reference syntax
      onDelete: "CASCADE", // matches the original: REFERENCES users(id) ON DELETE CASCADE
    },

    token_hash: {
      type: "varchar(255)",
      notNull: true,
      unique: true, // matches the original: VARCHAR(255) NOT NULL UNIQUE
    },

    expires_at: {
      type: "timestamp",
      notNull: true,
    },

    revoked: {
      type: "boolean",
      notNull: true,
      default: false,
    },

    created_at: {
      type: "timestamp",
      notNull: true,
      default: pgm.func("now()"),
    },
  });

  // Matches the original migrations/001_create_refresh_tokens.sql exactly:
  // a separate index on user_id, for the future "revoke all sessions" query.
  // (UNIQUE on token_hash above already creates its own index — no separate
  // index needed for that column, same reasoning as the original file.)
  pgm.createIndex("refresh_tokens", "user_id");
};

exports.down = (pgm) => {
  pgm.dropTable("refresh_tokens");
};