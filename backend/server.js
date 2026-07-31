require("dotenv").config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const helmet = require("helmet");
const cors = require("cors");

const pool = require("./src/config/db");
const logger = require("./src/config/logger");
const requestLogger = require("./src/middleware/requestLogger");
const { deprecationNotice } = require("./src/middleware/deprecationNotice");
const { createGracefulShutdown } = require("./src/utils/gracefulShutdown");

const authRoutes = require("./src/routes/authRoutes");
const userRoutes = require("./src/routes/userRoutes");
const callRoutes = require("./src/routes/callRoutes");
const detectionRoutes = require("./src/routes/detectionRoutes");
const contactRoutes = require("./src/routes/contactRoutes");


const { fail } = require("./src/utils/response");
const { errorHandler } = require("./src/middleware/errorHandler");

const { socketHandler } = require("./src/socket");

const app = express();

// Railway, Render, and most reverse-proxy deployment targets sit in front
// of this app and forward the real client IP via X-Forwarded-For. Without
// `trust proxy`, Express treats every request as coming from the proxy's
// own IP — which breaks express-rate-limit specifically: every client
// would share a single rate-limit bucket keyed off that one proxy IP,
// meaning one busy user could lock everyone else out (or, in the other
// direction, a genuine attacker's requests would blend into the same
// shared bucket as legitimate traffic and never get isolated). `1` means
// "trust exactly one hop" — appropriate for a single reverse proxy in
// front of this app, not an arbitrary chain of proxies.
app.set("trust proxy", 1);
const server = http.createServer(app);

// ─── CORS_ORIGINS: comma-separated allowlist, e.g.
//   CORS_ORIGINS=http://localhost:5173,http://192.168.1.42:5173
// If unset, any localhost/127.0.0.1 origin or private-LAN origin (the
// address you'd use to reach this machine from your phone on the same
// Wi-Fi) is allowed — convenient for local multi-device testing without
// needing to hardcode your machine's IP. Set CORS_ORIGINS explicitly in
// production instead of relying on this fallback.
//
// Defined once, up here, and reused by both the REST CORS middleware
// below AND Socket.IO's CORS config — previously Socket.IO had its own
// hardcoded `origin: "*"`, which meant setting CORS_ORIGINS in production
// locked down the REST API but left every WebSocket call/signaling
// connection reachable from any origin. Same allowlist, same policy,
// both transports.
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((o) => o.trim())
  : null;

const LAN_ORIGIN_PATTERN =
  /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?$/;

// The Capacitor Android app (capacitor.config.ts's androidScheme: "https")
// serves its WebView content from the fixed origin "https://localhost" —
// not from wherever the backend is deployed, and not from wherever a web
// frontend is deployed either. This is Capacitor's own well-known virtual
// origin for every app built with it; it isn't something an attacker
// controls or can spoof into meaning anything else in this context, the
// way an arbitrary Origin header can for a normal website. Always
// allowing it means the mobile app works regardless of what CORS_ORIGINS
// is set to for the web frontend — an easy, easy-to-forget mismatch to
// hit otherwise (set CORS_ORIGINS to your web app's URL in production,
// and the Android build silently breaks with every request rejected by
// CORS, which looks like nothing more specific than "login/register just
// fails").
const CAPACITOR_ORIGINS = ["https://localhost", "http://localhost"];

const isOriginAllowed = (origin) => {
  // No origin (curl, server-to-server, some mobile webviews) — allow.
  if (!origin) return true;
  if (CAPACITOR_ORIGINS.includes(origin)) return true;
  if (allowedOrigins) return allowedOrigins.includes(origin);
  return LAN_ORIGIN_PATTERN.test(origin);
};

// ─── SOCKET.IO SETUP ─────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => callback(null, isOriginAllowed(origin)),
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// make io accessible in controllers later if needed
app.set("io", io);

// attach socket auth + events
socketHandler(io);

// ─── MIDDLEWARE ──────────────────────────────────────────────────────────────
app.use(requestLogger);
app.use(helmet());

app.use(
  cors({
    origin: (origin, callback) => callback(null, isOriginAllowed(origin)),
    credentials: true,
  })
);

app.use(express.json());

// ─── BASIC ROUTES ────────────────────────────────────────────────────────────
app.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({
      message: "RingWave Backend Running",
      databaseTime: result.rows[0].now,
    });
  } catch (error) {
    req.log.error({ err: error }, "GET / failed — database query error");
    res.status(500).send("Database Connection Failed");
  }
});

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.status(200).json({
      status: "ok",
      db: "connected",
      uptime: process.uptime(),
    });
  } catch (error) {
    req.log.error({ err: error }, "Health check failed — database unreachable");
    res.status(503).json({
      status: "error",
      db: "disconnected",
      uptime: process.uptime(),
    });
  }
});

// ─── API ROUTES ──────────────────────────────────────────────────────────────
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/calls", callRoutes);
app.use("/api/v1/detections", detectionRoutes);
app.use("/api/v1/contacts", contactRoutes);

// deprecated routes
app.use("/api/auth", deprecationNotice, authRoutes);
app.use("/api/users", deprecationNotice, userRoutes);
app.use("/api/calls", deprecationNotice, callRoutes);
app.use("/api/detections", deprecationNotice, detectionRoutes);
app.use("/api/contacts", deprecationNotice, contactRoutes);

// ─── 404 HANDLER ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  return fail(res, "Route not found", [], 404);
});

// ─── ERROR HANDLER ───────────────────────────────────────────────────────────
app.use(errorHandler);

// ─── PROCESS SAFETY ──────────────────────────────────────────────────────────
process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "Unhandled promise rejection");
});

process.on("uncaughtException", (error) => {
  logger.error({ err: error }, "Uncaught exception");
  process.exit(1);
});

// ─── START SERVER ────────────────────────────────────────────────────────────
const startServer = async () => {
  try {
    await pool.query("SELECT 1");
    logger.info("Database connection verified.");
  } catch (error) {
    logger.error({ err: error }, "Failed to connect to the database on startup");
    process.exit(1);
  }

  // ─── call_history.call_session_id guard ────────────────────────────────
  //
  // call_history/detection_logs/users are intentionally NOT managed by
  // node-pg-migrate (see migrations/1782024766043_create-refresh-tokens.js)
  // -- call_session_id in particular was only ever added by hand-running
  // sql_archive/002_add_call_session_id.sql. That's an easy step to miss
  // on a fresh clone/restore, and callModel.js's createCall() always
  // includes this column in its INSERT regardless -- when it's missing,
  // every single POST /api/v1/calls fails with a 500
  // ("column call_session_id of relation call_history does not exist"),
  // which the frontend logs fire-and-forget and never surfaces, so Call
  // History and the Dashboard silently never receive a single row. This
  // makes that migration self-healing instead of a manual prerequisite
  // that's easy to forget.
  try {
    await pool.query(
      "ALTER TABLE call_history ADD COLUMN IF NOT EXISTS call_session_id UUID"
    );
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_call_history_session ON call_history (call_session_id)"
    );
  } catch (error) {
    logger.error(
      { err: error },
      "Failed to ensure call_history.call_session_id exists"
    );
    process.exit(1);
  }

  // ─── refresh_tokens table guard ─────────────────────────────────────────
  //
  // Same class of problem as the call_session_id guard above, on the same
  // "unmanaged table, easy to skip on a fresh clone/restore" root cause.
  //
  // migrations/1782024766043_create-refresh-tokens.js is a BASELINE
  // migration: its own header says it must never actually run its `up`
  // function against a database where refresh_tokens already exists, and
  // the documented setup path is to manually mark it as already-applied
  // in node-pg-migrate's `pgmigrations` tracking table (see that file's
  // comments; sql_archive/001_create_refresh_tokens.sql is the actual
  // manual CREATE TABLE meant to be run once, by hand, before that
  // baseline-marking step).
  //
  // It's easy to perform the "mark as applied" half of that setup without
  // ever running the manual SQL that creates the table itself — pgmigrations
  // then reports the migration as applied, `node-pg-migrate up` skips it as
  // expected, but refresh_tokens never actually exists. The failure mode is
  // silent at startup (nothing here queries refresh_tokens yet) and only
  // surfaces the moment someone logs in: authController.loginUser's
  // createRefreshToken() INSERTs into a table that isn't there, login
  // fails with a 500, and — same as the call_session_id case — that error
  // is easy to misdiagnose as an auth bug rather than a schema gap.
  //
  // CREATE TABLE IF NOT EXISTS makes this idempotent and safe to run every
  // startup, whether or not the manual SQL / baseline marking was ever
  // done correctly, matching sql_archive/001_create_refresh_tokens.sql
  // exactly (see backend/migrations/1782024766043_create-refresh-tokens.js
  // for the same schema expressed as a node-pg-migrate migration).
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash  VARCHAR(255) NOT NULL UNIQUE,
        expires_at  TIMESTAMP NOT NULL,
        revoked     BOOLEAN NOT NULL DEFAULT FALSE,
        created_at  TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens (user_id)"
    );
  } catch (error) {
    logger.error(
      { err: error },
      "Failed to ensure refresh_tokens table exists"
    );
    process.exit(1);
  }

  // ─── password_reset_tokens table guard ──────────────────────────────────
  //
  // Same class of problem as the refresh_tokens guard above: this table
  // was added (see ringwave.sql) after the original unmanaged-tables
  // decision, backing POST /auth/forgot-password and /auth/reset-password.
  // Without this guard, a fresh deploy target that only ever runs this
  // server (no manual psql step, no node-pg-migrate run) would 500 on the
  // very first forgot-password request with "relation
  // password_reset_tokens does not exist" — exactly the failure mode the
  // refresh_tokens guard above exists to prevent, just for a newer table.
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash  VARCHAR(255) NOT NULL UNIQUE,
        expires_at  TIMESTAMP NOT NULL,
        used        BOOLEAN NOT NULL DEFAULT FALSE,
        created_at  TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens (user_id)"
    );
  } catch (error) {
    logger.error(
      { err: error },
      "Failed to ensure password_reset_tokens table exists"
    );
    process.exit(1);
  }

  // ─── identity_keys table guard ───────────────────────────────────────────
  //
  // Same reasoning as the two guards above: without this, a fresh deploy
  // target would 500 on the first identity-key upload/fetch.
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS identity_keys (
        user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        public_key  TEXT NOT NULL,
        algorithm   VARCHAR(50) NOT NULL DEFAULT 'ECDH-P256',
        updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
  } catch (error) {
    logger.error({ err: error }, "Failed to ensure identity_keys table exists");
    process.exit(1);
  }

  // ─── contacts table guard ─────────────────────────────────────────────────
  //
  // Same reasoning as the guards above: without this, a fresh deploy
  // target would 500 on the first add-contact request.
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS contacts (
        id          SERIAL PRIMARY KEY,
        owner_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        contact_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE (owner_id, contact_id),
        CHECK (owner_id <> contact_id)
      )
    `);
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_contacts_owner_id ON contacts(owner_id)"
    );
  } catch (error) {
    logger.error({ err: error }, "Failed to ensure contacts table exists");
    process.exit(1);
  }

  // ─── detection_logs call-linkage columns guard ───────────────────────────
  //
  // Same reasoning as the guards above: without this, a fresh deploy
  // target would 500 the moment a call tries to log a detection verdict
  // with call_session_id/other_user_id.
  try {
    await pool.query(
      "ALTER TABLE detection_logs ADD COLUMN IF NOT EXISTS call_session_id UUID"
    );
    await pool.query(
      "ALTER TABLE detection_logs ADD COLUMN IF NOT EXISTS other_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL"
    );
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_detection_logs_call_session ON detection_logs(call_session_id)"
    );
  } catch (error) {
    logger.error(
      { err: error },
      "Failed to ensure detection_logs call-linkage columns exist"
    );
    process.exit(1);
  }

  const port = process.env.PORT || 5000;
  server.listen(port, () => {
    logger.info(`Server running on port ${port}`);
  });

  createGracefulShutdown({ server, pool, logger });
};

startServer();