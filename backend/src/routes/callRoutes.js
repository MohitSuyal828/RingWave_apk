const express = require("express");

const router = express.Router();

const { logCall, getCallHistory } = require("../controllers/callController");
const { verifyToken } = require("../middleware/authMiddleware");
const { validate } = require("../middleware/validate");
const { logCallSchema, paginationSchema } = require("../middleware/schemas");

router.post("/", verifyToken, validate(logCallSchema), logCall);

// ─── GET /history — now validated ────────────────────────────────────────────
//
// Changes from the previous batch:
//   BEFORE  router.get("/history", verifyToken, getCallHistory);
//   AFTER   adds validate(paginationSchema, "query") between verifyToken
//           and getCallHistory.
//
// The "query" second argument is required here — without it, validate()
// would default to parsing req.body, which is empty on a GET request, and
// every page/limit value would fail as "required" even when correctly
// supplied in the URL.
router.get(
  "/history",
  verifyToken,
  validate(paginationSchema, "query"),
  getCallHistory
);

module.exports = router;