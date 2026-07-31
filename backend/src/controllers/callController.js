const { createCall, getCallsByUser, countCallsByUser } = require("../models/callModel");
const { success, fail } = require("../utils/response");

const logCall = async (req, res, next) => {
  try {
    const callerId = req.user.id;

    const { receiver_id, duration, status, call_session_id } = req.body;

    if (receiver_id === callerId) {
      return fail(res, "caller and receiver cannot be the same user", [], 400);
    }

    const call = await createCall(callerId, receiver_id, duration, status, call_session_id);

    return success(res, { call }, "Call logged successfully", 201);
  } catch (error) {
    return next(error);
  }
};

// ─── Get Call History (Paginated) ────────────────────────────────────────────
//
// Changes from the previous batch:
//   BEFORE  getCallsByUser(req.user.id) — no limit, returns everything
//   AFTER   reads page/limit from req.validatedQuery (NOT req.query — see
//           validate.js for why Express 5 requires this split), computes
//           offset, fetches one page of rows plus the total count, and
//           returns a pagination object alongside the existing calls array.
//
// req.validatedQuery.page and .limit are guaranteed by this point to be
// positive integers (limit ≤ 100) — the validate(paginationSchema, "query")
// middleware on this route rejects anything else with a 422 before this
// handler ever runs. No further bounds-checking needed here.
//
// offset is computed directly from page/limit using the standard formula:
// page 1 → offset 0, page 2 → offset = limit, page 3 → offset = 2 * limit.
//
// total and totalPages are computed from a SEPARATE count query
// (countCallsByUser), not from calls.length — calls.length is capped at
// `limit` (at most one page), so it can never tell us the true total across
// all pages. Math.ceil(total / limit) correctly returns 0 when total is 0,
// rather than dividing by zero or producing NaN, since 0 / limit = 0 and
// Math.ceil(0) = 0.
const getCallHistory = async (req, res, next) => {
  try {
    const { page, limit } = req.validatedQuery;
    const offset = (page - 1) * limit;

    const [calls, total] = await Promise.all([
      getCallsByUser(req.user.id, limit, offset),
      countCallsByUser(req.user.id),
    ]);

    return success(
      res,
      {
        calls,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      "Call history fetched successfully",
      200
    );
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  logCall,
  getCallHistory,
};