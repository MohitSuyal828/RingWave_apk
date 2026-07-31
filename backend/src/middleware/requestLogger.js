const pinoHttp = require("pino-http");
const { randomUUID } = require("crypto");
const logger = require("../config/logger");

// ─── requestLogger ────────────────────────────────────────────────────────────
//
// Wraps the centralized logger (config/logger.js) as Express middleware via
// pino-http. Registered as the FIRST app.use() call in server.js — before
// helmet, before express.json(), before any route — so it observes every
// request that reaches the server at all, including ones that fail in a
// later middleware (e.g. a body-parsing error) or never match a route
// (caught by the 404 handler further down the chain).
//
// What this gives every request automatically, with zero per-route code:
//
//   - req.id        a unique identifier for this request (see genReqId below)
//   - req.log        a CHILD logger, scoped to this request, that automatically
//                    tags every line it produces with that request's id —
//                    controllers can call req.log.info(...) / req.log.error(...)
//                    and the resulting line is already correlated to this
//                    request without passing the id around manually.
//   - automatic "request completed" / "request errored" log lines, one per
//     request, satisfying the "Request/response logging" requirement with
//     no custom logging code needed in any controller or route.
//
// ─── Request ID Generation ───────────────────────────────────────────────────
//
// genReqId checks for an existing X-Request-Id (or similar) header FIRST —
// if RingWave is ever deployed behind a load balancer, API gateway, or
// reverse proxy that already assigns request IDs upstream, that existing ID
// is reused rather than discarded, preserving end-to-end traceability across
// the whole request path, not just within this one Node process. Only when
// no such header is present does this middleware generate a fresh one via
// crypto.randomUUID() — a Node built-in, no extra dependency needed for this.
//
// The generated (or reused) ID is also written back as a response header
// (X-Request-Id) — this means a client (or a developer testing in Postman)
// can see the exact ID tied to their request and grep server logs for that
// ID specifically when investigating an issue, without needing log access
// to even know an ID exists.
const genReqId = (req, res) => {
  const existingId = req.headers["x-request-id"];
  if (existingId) {
    return existingId;
  }

  const id = randomUUID();
  res.setHeader("X-Request-Id", id);
  return id;
};

// ─── Log Level By Outcome ────────────────────────────────────────────────────
//
// Not every completed request deserves the same severity:
//   - err present, or 5xx status   -> "error"   (something genuinely broke)
//   - 4xx status                   -> "warn"    (client error — validation
//                                                failure, 401, 404, etc. —
//                                                worth noticing in aggregate,
//                                                not alarming on its own)
//   - everything else (2xx/3xx)    -> "info"    (normal, healthy traffic)
//
// Without this, every request — successful or not — would log at the same
// level, making it impossible to filter "show me only the requests that
// actually had a problem" in a log viewer without inspecting every line's
// status code by hand.
const customLogLevel = (req, res, err) => {
  if (err || res.statusCode >= 500) {
    return "error";
  }
  if (res.statusCode >= 400) {
    return "warn";
  }
  return "info";
};

const requestLogger = pinoHttp({
  logger,
  genReqId,
  customLogLevel,
});

module.exports = requestLogger;