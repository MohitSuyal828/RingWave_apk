const { fail } = require("../utils/response");

// ─── validate(schema, source) ───────────────────────────────────────────────
//
// Changes from the previous batch:
//   BEFORE  validate(schema) — always parsed req.body, hardcoded, and wrote
//           the parsed result back to req.body.
//   AFTER   validate(schema, source = "body") — parses req[source], where
//           source is "body" (default, unchanged for every existing call
//           site) or "query" (new, used by the pagination schema below).
//
// CRITICAL Express 5 detail, discovered while implementing this:
//   In Express 5, req.query is a GETTER — it is no longer a writable plain
//   property the way req.body is. Attempting `req.query = result.data`
//   throws "TypeError: Cannot set property query of #<IncomingMessage>
//   which has only a getter" and crashes the request. This is a documented
//   Express 4 → 5 breaking change, and this project is on express ^5.2.1,
//   so it is NOT a hypothetical edge case here — every query-validated
//   request would hit this.
//
//   The fix: when source is "query", write the parsed/coerced/defaulted
//   result to a NEW property, req.validatedQuery, instead of trying to
//   overwrite req.query itself. req.body has no such restriction in
//   Express 5, so the body path is unchanged — parsed data still goes
//   back into req.body exactly as before.
//
//   Practical effect: controllers reading body input still use req.body.
//   Controllers reading query input (e.g. pagination) must read from
//   req.validatedQuery, NOT req.query — req.query still holds the raw,
//   un-coerced strings (e.g. "2", not 2) and should not be read directly
//   once this middleware is in the chain.
const validate = (schema, source = "body") => (req, res, next) => {
  const result = schema.safeParse(req[source]);

  if (!result.success) {
    // result.error.issues — NOT result.error.errors.
    //
    // CRITICAL BUG FOUND while implementing this batch: this codebase is on
    // Zod 4 (confirmed via `npm view zod version` → 4.4.3, and no version
    // was ever pinned when zod was first installed in an earlier batch).
    // Zod 4 renamed ZodError.errors to ZodError.issues. The previous version
    // of this file read result.error.errors, which is `undefined` in Zod 4
    // — calling .map() on it threw a TypeError, which Express then rendered
    // as a raw HTML 500 stack trace instead of the clean 422 JSON response
    // this middleware was designed to produce.
    //
    // Practical impact: EVERY validation failure on EVERY route using this
    // middleware — register, login, refresh, logout, call creation,
    // detection creation — has been returning an unhandled 500 crash page
    // instead of a 422 with a clean errors array, since the validation
    // middleware was first introduced. This was only caught now because the
    // pagination smoke test below exercised an actual failing validation
    // path against the real installed Zod version, instead of relying on
    // memory of Zod's API.
    const errors = result.error.issues.map((issue) => ({
      field: issue.path.join(".") || source,
      message: issue.message,
    }));

    return fail(res, "Validation failed", errors, 422);
  }

  if (source === "query") {
    req.validatedQuery = result.data;
  } else {
    req[source] = result.data;
  }

  next();
};

module.exports = { validate };