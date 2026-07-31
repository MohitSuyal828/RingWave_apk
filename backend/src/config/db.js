const { Pool } = require("pg");

// ─── Connection Config ─────────────────────────────────────────────────────────
//
// Prefer DATABASE_URL when it's set. This matters for deployment: Railway
// and Render's managed Postgres add-ons both provision a database and hand
// you a single connection string (often with a host/port/user/password you
// can't necessarily see or reconstruct separately) — they don't reliably
// give you DB_USER/DB_HOST/DB_NAME/DB_PASSWORD/DB_PORT as independent env
// vars the way local development does. Without this, the app would have no
// way to connect to either platform's database at all.
//
// SSL is required by both platforms' managed Postgres (and by most managed
// Postgres providers generally) — connecting without it fails outright.
// `rejectUnauthorized: false` is the standard, documented approach for
// these providers' internally-issued certificates (Render's own deployment
// docs recommend exactly this for node-postgres); it still encrypts the
// connection, it just doesn't validate the cert chain against a public CA.
// Local development (no DATABASE_URL set) talks to a local/LAN Postgres
// over an unencrypted connection, same as before.
// A DATABASE_URL pointing at localhost/127.0.0.1 means local development or
// a Docker Compose Postgres container — neither has SSL configured, and
// requiring it there would break every local/Compose setup. Only a
// non-local host (i.e., an actual managed Postgres instance on Railway,
// Render, etc.) gets `ssl: { rejectUnauthorized: false }`.
const isLocalDatabaseUrl =
  !!process.env.DATABASE_URL &&
  /(localhost|127\.0\.0\.1)/.test(process.env.DATABASE_URL);

const connectionConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: isLocalDatabaseUrl ? false : { rejectUnauthorized: false },
    }
  : {
      user: process.env.DB_USER,
      host: process.env.DB_HOST,
      database: process.env.DB_NAME,
      password: process.env.DB_PASSWORD,
      port: process.env.DB_PORT,
    };

// ─── Pool Hardening ───────────────────────────────────────────────────────────
//
// The original config had no max, no timeouts, and no error listener. Three
// concrete problems that creates in production-like conditions:
//
//   1. No `max` — the pool would happily open an unbounded number of
//      connections under load. Postgres itself has a hard connection limit
//      (default 100); a traffic spike could exhaust it, starving every other
//      process that also needs a DB connection (including, e.g., a second
//      app instance or an admin psql session).
//
//   2. No `idleTimeoutMillis` — connections that finish their query just sit
//      open indefinitely instead of being released back when unused. Over
//      time this wastes connections that could otherwise be reused.
//
//   3. No `connectionTimeoutMillis` — if Postgres is unreachable (down,
//      network partition, wrong credentials), a query attempting to grab a
//      connection would hang indefinitely with no defined failure point,
//      rather than failing fast with a clear error.
//
// The values below are reasonable defaults for a single-instance Node app
// talking to a local/managed Postgres — not tuned for any specific load
// test, but a significant improvement over "no limits at all."
const pool = new Pool({
  ...connectionConfig,

  max: 10, // maximum simultaneous connections this pool will open
  idleTimeoutMillis: 30000, // close idle connections after 30s
  connectionTimeoutMillis: 5000, // fail a connection attempt after 5s instead of hanging forever
});

// ─── Idle Client Error Listener ───────────────────────────────────────────────
//
// Without this listener, an error on a connection that's sitting idle in the
// pool (e.g. the underlying TCP connection drops, Postgres restarts) becomes
// an uncaught error at the process level — in some Node/pg version
// combinations this can crash the entire server with no log line explaining
// why. Attaching a listener here means the error is caught and logged
// instead of taking down the process.
pool.on("error", (err) => {
  console.error("Unexpected error on idle PostgreSQL client:", err);
});

module.exports = pool;