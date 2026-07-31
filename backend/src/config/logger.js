const pino = require("pino");

// ─── Centralized Logger ──────────────────────────────────────────────────────
//
// One pino instance, created once, imported everywhere a log line is needed
// outside an active request (startup messages, DB pool errors, process-level
// crash handlers). Inside a request, prefer req.log instead of this file's
// export — req.log is a CHILD logger that pino-http creates per request,
// automatically tagging every line with that request's id, so the request
// and all its related log lines can be correlated together in a log viewer.
// This file's plain `logger` export has no request context, which is
// exactly correct for the places that use it (nothing tying it to a request
// yet at startup, or no request exists at all for a pool-level DB error).
//
// LOG_LEVEL controls verbosity: "debug" | "info" | "warn" | "error" | etc.
// Defaults to "info" — enough to see every request and every error, without
// debug-level noise in normal operation.
const isProduction = process.env.NODE_ENV === "production";

const logger = pino({
  level: process.env.LOG_LEVEL || "info",

  // ─── Dev vs. Prod Output ────────────────────────────────────────────────────
  //
  // Development: pino-pretty formats each log line as human-readable,
  // colorized text — much easier to scan while watching a terminal during
  // local development.
  //
  // Production: NO transport at all — pino's default behavior is to write
  // raw, single-line JSON directly to stdout. This is deliberate: JSON logs
  // are what log aggregation platforms (CloudWatch, Datadog, Grafana Loki,
  // etc.) expect to ingest and index. pino-pretty's formatting would have to
  // be parsed back apart by those tools, working against the entire point
  // of structured logging in production.
  //
  // transport: undefined in production means pino uses its fast default
  // path with no extra worker thread — this is also why pino-pretty is a
  // devDependency only: production never loads it, so it doesn't need to be
  // installed in a production deployment at all.
  transport: isProduction
    ? undefined
    : {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      },

  // ─── Redaction ──────────────────────────────────────────────────────────────
  //
  // pino-http's default request serializer does NOT include the request
  // body — confirmed before writing this file, not assumed — so passwords
  // are not at risk in the automatic per-request logs this project relies
  // on for requirement "Request/response logging." These redact paths are
  // a defensive second layer: if any future log call (custom debugging, an
  // added serializer override, etc.) ever does log req.body or req.headers
  // directly, these fields are still scrubbed before they reach the output,
  // rather than relying on every future log call site to remember not to
  // include them.
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.body.password",
      "req.body.current_password",
      "req.body.refreshToken",
    ],
    censor: "[REDACTED]",
  },
});

module.exports = logger;