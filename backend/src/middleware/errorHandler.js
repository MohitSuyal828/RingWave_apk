const { fail } = require("../utils/response");
const logger = require("../config/logger");

// ─── Global Error Handler ────────────────────────────────────────────────────
//
// Unchanged in every way except how the error gets logged. See response.js
// and earlier project history for the full rationale on dev/prod message
// behavior — that logic is untouched here.
//
// Changes from the previous batch:
//   BEFORE  console.error("Unhandled error:", err)
//   AFTER   (req.log || logger).error({ err }, "Unhandled error")
//
//   req.log is the per-request CHILD logger attached by requestLogger.js
//   (pino-http) — using it here means this error log line carries the exact
//   same request id as every other log line produced during this same
//   request (the "request completed" line, any req.log calls a controller
//   might make, etc.). That correlation is the entire point of adding
//   request IDs in the first place: without it, an error log and the
//   request that caused it are two separate, unlinked lines in the output.
//
//   The `(req.log || logger)` fallback exists only as a defensive guard —
//   in normal operation req.log is always present, since requestLogger is
//   registered as the very first middleware in server.js, before every
//   route. It would only be missing if this handler were somehow invoked
//   outside that middleware chain, which should not happen in practice.
//
//   `{ err }` as the first argument (rather than passing the error as the
//   second argument the way console.error did) is pino's documented
//   convention for logging Error objects — pino's standard error serializer
//   recognizes the `err` key specifically and formats the stack trace
//   correctly. Passing an Error as a bare second argument to a pino log
//   call does not get the same treatment.
const errorHandler = (err, req, res, next) => {
  (req.log || logger).error({ err }, "Unhandled error");

  const isDevelopment = process.env.NODE_ENV !== "production";

  const message = isDevelopment
    ? err.message || "Something went wrong"
    : "Something went wrong. Please try again later.";

  return fail(res, message, [], 500);
};

module.exports = { errorHandler };