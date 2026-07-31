// ─── Graceful Shutdown ────────────────────────────────────────────────────────
//
// Roadmap item #13. Without this, a SIGTERM (sent by every container
// orchestrator, process manager, or `docker stop` before forcibly killing a
// process) or SIGINT (Ctrl+C) would tear the process down immediately —
// dropping in-flight requests mid-response and leaving Postgres connections
// open without a clean disconnect. In a deploy, that means every request
// that happened to be in flight at the exact moment of restart gets an
// abruptly closed connection instead of a real response.
//
// The shutdown sequence, in order:
//   1. Stop accepting NEW connections (server.close()) — requests already
//      in progress are allowed to finish; nothing new comes in.
//   2. Once the HTTP server confirms it's fully closed (its callback fires,
//      meaning every in-flight request has completed), drain the database
//      connection pool (pool.end()) — this disconnects cleanly instead of
//      just abandoning open sockets.
//   3. Exit the process with code 0 (clean shutdown) or 1 (something in the
//      sequence itself failed).
//
// ─── Why a separate module instead of inline in server.js ───────────────────
//
// Matches this project's existing pattern of one focused file per concern
// (logger.js, requestLogger.js, errorHandler.js, rateLimiter.js, etc.)
// rather than letting server.js accumulate every piece of infrastructure
// logic inline. createGracefulShutdown takes its dependencies as explicit
// arguments (server, pool, logger) rather than importing them directly,
// keeping this module testable in isolation and free of hidden coupling to
// server.js's specific variable names.
// ─── Force-Exit Timeout ──────────────────────────────────────────────────────
//
// A real, documented failure mode exists where server.close()'s callback
// or pool.end()'s promise can hang indefinitely — e.g. a client connection
// that never completes, or a stuck query holding a pool client open. A
// graceful shutdown that can hang forever isn't actually graceful from an
// operator's perspective: a deploy or container restart that never
// completes is worse than a slightly-less-clean fast exit. This is why a
// hard timeout (default 10s) is included: if the graceful sequence hasn't
// finished by then, the process force-exits anyway.
//
// IMPORTANT: this timer is deliberately NOT .unref()'d. An earlier version
// of this file called forceExitTimer.unref() under the reasoning that the
// timer shouldn't keep the process alive if the rest of shutdown finishes
// first. That reasoning was already fully covered by the explicit
// clearTimeout(forceExitTimer) call in the success path below — the
// .unref() was redundant for the happy path, and harmful for the failure
// path it exists to guard against: verified via direct testing, a
// .unref()'d timer can be skipped entirely if every OTHER handle in the
// event loop happens to close first (e.g. server.close() finishes and
// nothing else is pending), letting Node exit "naturally" with code 0
// BEFORE the timeout ever fires — even while pool.end() never genuinely
// resolved. That defeats the entire purpose of this safety net: a force
// exit must be guaranteed to fire if the graceful path doesn't complete,
// not merely happen to fire if the rest of the event loop stays busy long
// enough. Without .unref(), this timer reliably keeps the process alive
// until either it fires (forcing exit 1) or clearTimeout() cancels it
// (the graceful path succeeded) — there is no third, accidental outcome.
const createGracefulShutdown = ({ server, pool, logger, timeoutMs = 10000 }) => {
  let isShuttingDown = false;

  const shutdown = (signal) => {
    // Guards against a SECOND SIGTERM/SIGINT arriving while shutdown is
    // already in progress (e.g. an impatient operator hitting Ctrl+C
    // twice) from restarting the sequence or racing two shutdowns against
    // each other.
    if (isShuttingDown) {
      logger.warn(`Received ${signal} again while already shutting down — ignoring`);
      return;
    }
    isShuttingDown = true;

    logger.info(`Received ${signal}. Starting graceful shutdown...`);

    const forceExitTimer = setTimeout(() => {
      logger.error(
        `Graceful shutdown did not complete within ${timeoutMs}ms — forcing exit`
      );
      process.exit(1);
    }, timeoutMs);

    server.close((closeError) => {
      if (closeError) {
        logger.error({ err: closeError }, "Error while closing HTTP server");
      } else {
        logger.info("HTTP server closed — no longer accepting new connections");
      }

      pool
        .end()
        .then(() => {
          logger.info("Database pool closed");
        })
        .catch((poolError) => {
          logger.error({ err: poolError }, "Error while closing database pool");
        })
        .finally(() => {
          clearTimeout(forceExitTimer);
          logger.info("Graceful shutdown complete");
          process.exit(closeError ? 1 : 0);
        });
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
};

module.exports = { createGracefulShutdown };