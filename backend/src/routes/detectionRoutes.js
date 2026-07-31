const express = require("express");

const router = express.Router();

const { logDetection, getDetectionHistory } = require("../controllers/detectionController");
const { verifyToken } = require("../middleware/authMiddleware");
const { validate } = require("../middleware/validate");
const { logDetectionSchema, paginationSchema } = require("../middleware/schemas");

router.post("/", verifyToken, validate(logDetectionSchema), logDetection);

// Same rationale as callRoutes.js — see those comments.
router.get(
  "/history",
  verifyToken,
  validate(paginationSchema, "query"),
  getDetectionHistory
);

module.exports = router;