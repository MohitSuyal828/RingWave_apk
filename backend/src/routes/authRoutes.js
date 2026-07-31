const express = require("express");

const router = express.Router();

const {
  registerUser,
  loginUser,
  refreshAccessToken,
  logoutUser,
  getProfile,
  updateProfile,
  forgotPassword,
  resetPassword,
} = require("../controllers/authController");
const { verifyToken } = require("../middleware/authMiddleware");
const { validate } = require("../middleware/validate");
const {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  updateProfileSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} = require("../middleware/schemas");
const { loginLimiter, registerLimiter, forgotPasswordLimiter } = require("../middleware/rateLimiter");

// ─── Public Routes ────────────────────────────────────────────────────────────
//
// POST /register:  registerLimiter → validate(registerSchema) → registerUser
// POST /login:      loginLimiter   → validate(loginSchema)    → loginUser
//
// (Rationale for limiter-before-validate ordering unchanged from the
// previous batch — see comments there.)
router.post("/register", registerLimiter, validate(registerSchema), registerUser);
router.post("/login", loginLimiter, validate(loginSchema), loginUser);

// ─── Refresh & Logout ─────────────────────────────────────────────────────────
//
// Neither route uses verifyToken — the refresh token itself, not an access
// token, is the credential being checked here, and that check happens
// inside the controller against the database. A client calling /refresh
// has, by definition, an access token that's already expired (that's why
// they're refreshing), so requiring a valid access token would be
// self-defeating.
//
// No rate limiter applied to /refresh or /logout. /login and /register are
// the routes attackers brute-force (guessing passwords / spamming
// accounts) — guessing a valid 256-bit opaque refresh token by brute force
// is not a remotely practical attack, so a limiter here would only add
// friction for legitimate clients with no real security benefit. This can
// be revisited if usage patterns ever suggest otherwise.
router.post("/refresh", validate(refreshTokenSchema), refreshAccessToken);
router.post("/logout", validate(refreshTokenSchema), logoutUser);

// ─── Forgot / Reset Password ──────────────────────────────────────────────────
//
// Neither route uses verifyToken, by definition — a user who has forgotten
// their password cannot supply a valid access token. The security boundary
// here is the reset token itself (opaque, hashed, single-use, short expiry),
// checked inside resetPassword against the database, exactly like /refresh
// checks a refresh token.
router.post(
  "/forgot-password",
  forgotPasswordLimiter,
  validate(forgotPasswordSchema),
  forgotPassword
);
router.post(
  "/reset-password",
  validate(resetPasswordSchema),
  resetPassword
);

// ─── Protected Routes ─────────────────────────────────────────────────────────
router.get("/profile", verifyToken, getProfile);

// PATCH /profile: verifyToken → validate(updateProfileSchema) → updateProfile
//
// Standard "body" validation (the default — no second argument needed),
// since this is a JSON body, not query params. verifyToken runs first so
// req.user.id and req.user.email are available before validation and the
// controller run.
router.patch("/profile", verifyToken, validate(updateProfileSchema), updateProfile);

module.exports = router;