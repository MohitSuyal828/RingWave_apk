// ─── success / fail envelope helpers ─────────────────────────────────────────
//
// Every response in this API now goes through one of these two functions.
// Before this file existed, each controller built its own ad-hoc JSON shape
// inline — some returned { message, user }, others { message, count, calls },
// with no consistent top-level structure a client could rely on. These two
// helpers fix that by giving every response the same envelope:
//
//   Success: { success: true,  message, data: { ... } }
//   Failure: { success: false, message, errors: [ ... ] }
//
// `data` and `errors` are always present (never undefined) — data defaults
// to an empty object, errors defaults to an empty array — so a client never
// has to defensively check "does this response even have a data field"
// before reading from it.

// ─── success ──────────────────────────────────────────────────────────────────
//
// @param res     Express response object
// @param data    The payload — same field names as the existing API contract
//                (e.g. { accessToken, refreshToken, user }), just nested one
//                level deeper than before.
// @param message Human-readable success message
// @param status  HTTP status code — defaults to 200; pass 201 for creates
const success = (res, data = {}, message = "Success", status = 200) => {
  return res.status(status).json({
    success: true,
    message,
    data,
  });
};

// ─── fail ──────────────────────────────────────────────────────────────────────
//
// @param res     Express response object
// @param message Human-readable error message
// @param errors  Array of structured error details — e.g. Zod's
//                [{ field, message }] objects. Defaults to an empty array
//                for errors that don't have field-level detail (e.g. a
//                generic 401 "Invalid email or password").
// @param status  HTTP status code — caller decides (400, 401, 404, 409, 422, 500...)
const fail = (res, message = "Something went wrong", errors = [], status = 500) => {
  return res.status(status).json({
    success: false,
    message,
    errors,
  });
};

module.exports = { success, fail };