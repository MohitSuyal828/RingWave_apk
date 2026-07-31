const { rateLimit } = require("express-rate-limit");

// ─── Why two separate limiters instead of one shared one? ───────────────────
//
// Register and login have different abuse profiles:
//
//   - Login is the target of credential-stuffing / brute-force attacks —
//     an attacker tries many passwords against ONE known email. This needs
//     a tight limit (5 per 15 min) because a legitimate user almost never
//     fails login 5 times in a row.
//
//   - Register is the target of mass fake-account creation / spam — an
//     attacker scripts account creation in bulk. A slightly looser limit
//     (10 per 15 min) still stops automation without punishing a real user
//     who, for example, mistypes their email twice while signing up.
//
// Sharing one limiter across both routes would force a single number that's
// either too strict for register or too loose for login. Separate limiters
// let each route have a threshold that matches its actual risk.

// ─── Login Limiter ────────────────────────────────────────────────────────────
//
// 5 attempts per 15 minutes, keyed by IP address (express-rate-limit's default).
//
// skipSuccessfulRequests: true
//   A successful login (200) does NOT count against the limit. Only failed
//   attempts (401 wrong password, 422 bad format) consume the quota. This
//   means a legitimate user who logs in successfully on attempt #6 after
//   5 typos is still blocked correctly — but a user who logs in fine every
//   time never gets throttled by their own normal usage.
//
// message is a plain object, not a function — express-rate-limit sends
// whatever you give it directly via res.send/res.json, BYPASSING every
// other middleware in the app, including the new success()/fail() helpers
// and the global error handler. This means a 429 response is never
// automatically wrapped in the standardized envelope — it has to be written
// out by hand here, matching fail()'s exact shape, to stay consistent with
// every other error response in the API.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 5,
  standardHeaders: true,   // adds RateLimit-Limit / RateLimit-Remaining / RateLimit-Reset headers
  legacyHeaders: false,    // disables the older X-RateLimit-* headers — standardHeaders is enough
  skipSuccessfulRequests: true,
  message: {
    success: false,
    message: "Too many login attempts. Please try again in 15 minutes.",
    errors: [],
  },
});

// ─── Register Limiter ─────────────────────────────────────────────────────────
//
// 10 requests per 15 minutes, keyed by IP address.
//
// skipSuccessfulRequests is intentionally NOT set here — every registration
// attempt counts, successful or not. Unlike login, there's no concept of a
// "legitimate failed attempt" pattern to exempt; repeated registration
// attempts from the same IP (whether they succeed or hit the 409 duplicate-
// email error) are exactly the pattern mass-account-creation abuse looks like.
const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many registration attempts. Please try again in 15 minutes.",
    errors: [],
  },
});

// ─── Forgot Password Limiter ──────────────────────────────────────────────────
//
// 5 requests per 15 minutes, keyed by IP. Two abuse patterns this stops:
//   1. Email-bombing a victim's inbox by repeatedly requesting resets for
//      their address.
//   2. Using response timing/behavior across many emails to enumerate which
//      addresses have accounts (the controller already returns an identical
//      generic response either way, but a tight limiter removes the volume
//      an attacker would need to make any such timing analysis practical).
//
// Not shared with loginLimiter/registerLimiter — this route's abuse profile
// (spamming ONE victim, or probing MANY addresses) doesn't match either of
// theirs closely enough to justify reusing one of those thresholds.
const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many password reset requests. Please try again in 15 minutes.",
    errors: [],
  },
});

module.exports = { loginLimiter, registerLimiter, forgotPasswordLimiter };