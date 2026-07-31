const {
  createDetection,
  getDetectionsByUser,
  countDetectionsByUser,
} = require("../models/detectionModel");
const { findUserById } = require("../models/userModel");
const { success, fail } = require("../utils/response");

const logDetection = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const { prediction, confidence_score, call_session_id, other_user_id } = req.body;

    // Fail cleanly (422) rather than letting a bogus other_user_id hit the
    // FK constraint and surface as a raw DB error — same reasoning as
    // contactController's check before inserting into contacts.
    if (other_user_id != null) {
      const otherUser = await findUserById(other_user_id);
      if (!otherUser) {
        return fail(res, "other_user_id does not refer to a real user", [], 422);
      }
    }

    const detection = await createDetection(
      userId,
      prediction,
      confidence_score,
      call_session_id ?? null,
      other_user_id ?? null
    );

    return success(res, { detection }, "Detection logged successfully", 201);
  } catch (error) {
    return next(error);
  }
};

// ─── Get Detection History (Paginated) ───────────────────────────────────────
// Same pattern as callController.js's getCallHistory — see those comments
// for the full rationale on req.validatedQuery, offset calculation, and the
// Math.ceil(total / limit) zero-total edge case.
const getDetectionHistory = async (req, res, next) => {
  try {
    const { page, limit } = req.validatedQuery;
    const offset = (page - 1) * limit;

    const [detections, total] = await Promise.all([
      getDetectionsByUser(req.user.id, limit, offset),
      countDetectionsByUser(req.user.id),
    ]);

    return success(
      res,
      {
        detections,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      "Detection history fetched successfully",
      200
    );
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  logDetection,
  getDetectionHistory,
};