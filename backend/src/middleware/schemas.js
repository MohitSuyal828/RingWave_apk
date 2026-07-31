const { z } = require("zod");

// ─── Auth Schemas ─────────────────────────────────────────────────────────────

const registerSchema = z.object({
  // .trim() strips leading/trailing whitespace before any other check runs.
  // This prevents " " (a space) from passing the min(2) check.
  name: z
    .string({ required_error: "name is required" })
    .trim()
    .min(2, "name must be at least 2 characters")
    .max(64, "name must be at most 64 characters"),

  // Zod's .email() uses a strict RFC-compliant regex — no custom regex needed.
  email: z
    .string({ required_error: "email is required" })
    .trim()
    .toLowerCase()       // normalise before it hits the DB — "Alice@Test.com" and "alice@test.com" are the same user
    .email("email must be a valid email address"),

  // Enforce a real password policy.
  // min 8 chars covers the NIST SP 800-63B baseline.
  password: z
    .string({ required_error: "password is required" })
    .min(8, "password must be at least 8 characters")
    .max(72, "password must be at most 72 characters"), // bcrypt silently truncates at 72 bytes — cap it here explicitly
});

const loginSchema = z.object({
  email: z
    .string({ required_error: "email is required" })
    .trim()
    .toLowerCase()
    .email("email must be a valid email address"),

  password: z
    .string({ required_error: "password is required" })
    .min(1, "password is required"), // intentionally vague — don't reveal policy on login
});

// ─── Refresh / Logout Schema ──────────────────────────────────────────────────
//
// Shared by POST /refresh and POST /logout — both endpoints accept exactly
// one field: the raw opaque refresh token string. No format constraint
// beyond "must be a non-empty string" — the token's actual validity (does
// it exist, is it expired, is it revoked) is a database lookup, not
// something a regex/length check could usefully verify here. A malformed
// or garbage string still safely produces a 401 "Invalid or expired
// refresh token" response further down — being lenient at the schema level
// doesn't weaken security, since the real check happens against the DB.
const refreshTokenSchema = z.object({
  refreshToken: z
    .string({ required_error: "refreshToken is required" })
    .min(1, "refreshToken is required"),
});

// ─── Call Schema ──────────────────────────────────────────────────────────────

const logCallSchema = z.object({
  // receiver_id must be a positive integer.
  // coerce converts "5" (from JSON string or form) to 5 — safe to use here
  // because we immediately validate it is a positive integer.
  receiver_id: z
    .number({ required_error: "receiver_id is required", invalid_type_error: "receiver_id must be a number" })
    .int("receiver_id must be an integer")
    .positive("receiver_id must be a positive integer"),

  // duration is in seconds. 0 is valid (e.g. a call that connected but
  // immediately dropped). Max 86400 = 24 hours — a sane upper bound.
  duration: z
    .number({ required_error: "duration is required", invalid_type_error: "duration must be a number" })
    .int("duration must be an integer (seconds)")
    .min(0, "duration cannot be negative")
    .max(86400, "duration cannot exceed 86400 seconds (24 hours)"),

  status: z.enum(["completed", "missed", "rejected"], {
    required_error: "status is required",
    message: "status must be one of: completed, missed, rejected",
  }),

  // Optional. Ties multiple call_history rows back to the same call
  // session (the WebRTC callId) — used to group per-participant rows from
  // a single group call together in the UI. Omitted/undefined for older
  // clients or rows where it isn't available.
  call_session_id: z.string().uuid().optional(),
});

// ─── Detection Schema ─────────────────────────────────────────────────────────

const logDetectionSchema = z.object({
  // Must match the Prediction literal the AI service actually emits (see
  // ai-service/app/schemas.py and app/dummy.py: "likely_real" | "likely_fake"
  // | "uncertain") and the vocabulary the frontend already maps to UI states
  // (see frontend/src/constants/detection.ts's PREDICTION_TO_STATE). This
  // previously said "likely_synthetic", which the AI service never sends —
  // any real verdict logged via POST /api/v1/detections would have been
  // rejected with a 422 the moment that call was wired up.
  prediction: z.enum(["likely_fake", "likely_real", "uncertain"], {
    required_error: "prediction is required",
    message: "prediction must be one of: likely_fake, likely_real, uncertain",
  }),

  // confidence_score is a float between 0.0 and 100.0.
  // Using z.number() (not int) because scores like 87.5 are valid.
  confidence_score: z
    .number({
      required_error: "confidence_score is required",
      invalid_type_error: "confidence_score must be a number",
    })
    .min(0, "confidence_score must be at least 0")
    .max(100, "confidence_score must be at most 100"),

  // Both optional — a detection genuinely not tied to any call (or from
  // an older client that predates this field) still logs successfully.
  // call_session_id is the same UUID used to group call_history rows for
  // one call (see frontend/src/context/CallContext.tsx's callIdRef).
  call_session_id: z.string().uuid("call_session_id must be a valid UUID").optional(),

  // The specific person this call was with, as known by the CLIENT at
  // the moment the detection fired — deliberately not re-derived
  // server-side from call_session_id, since for a group call there may
  // be several participants and no single unambiguous "other" party;
  // the client already knows exactly who was on the call in that moment,
  // and sends null for group calls rather than the server guessing.
  other_user_id: z
    .number({ invalid_type_error: "other_user_id must be a number" })
    .int()
    .positive()
    .optional()
    .nullable(),
});

// ─── Pagination Schema ─────────────────────────────────────────────────────────
//
// Shared by GET /api/calls/history and GET /api/detections/history.
//
// z.coerce.number() — NOT z.number() — is deliberate here, unlike the
// request-body schemas above. req.query values always arrive as strings
// (URL query strings have no native type system, unlike JSON request
// bodies), so "2" needs to become 2 before the .int()/.positive() checks
// run. This is the one case in this codebase where coercion is the correct
// choice rather than a risk — see the body schemas above, which
// deliberately use z.number() because their input IS already JSON-typed.
//
// .default(1) / .default(20) mean an omitted page or limit is NOT a
// validation error — GET /history with no query string at all is a
// perfectly valid request for "page 1, default page size."
//
// limit is capped at 100 via .max() — this is an explicit 422 rejection,
// not a silent clamp. Silently returning fewer rows than requested without
// saying so would be a worse experience than a clear error telling the
// client exactly what the actual ceiling is.
const paginationSchema = z.object({
  page: z
    .coerce.number({ invalid_type_error: "page must be a number" })
    .int("page must be an integer")
    .positive("page must be a positive integer")
    .default(1),

  limit: z
    .coerce.number({ invalid_type_error: "limit must be a number" })
    .int("limit must be an integer")
    .positive("limit must be a positive integer")
    .max(100, "limit must be at most 100")
    .default(20),
});

// ─── Update Profile Schema ──────────────────────────────────────────────────
//
// Backs PATCH /api/auth/profile. Supports partial updates — name only,
// password only, or both in one request — per project decision. Email is
// deliberately NOT included; email changes are out of scope for this item.
//
// Two business rules can't be expressed as simple per-field constraints,
// so they're enforced via .superRefine() on the whole object instead:
//
//   1. At least one of {name, password} must be present. A request with
//      neither is a no-op that should be rejected with a clear 422, not
//      silently accepted and silently do nothing.
//
//   2. If password is present, current_password MUST also be present —
//      per project decision, password changes require re-verifying the
//      current password rather than trusting the access token alone. This
//      rule only applies when password is being changed; a name-only
//      update should not be forced to also supply current_password.
//
// Why superRefine instead of two separate .refine() calls? superRefine lets
// us attach each error to a specific field path (via ctx.addIssue with a
// `path`), so the resulting error shape stays consistent with every other
// schema in this file — { field, message } pairs the client can map
// directly to form fields — rather than one generic top-level error.
const updateProfileSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "name must be at least 2 characters")
      .max(64, "name must be at most 64 characters")
      .optional(),

    password: z
      .string()
      .min(8, "password must be at least 8 characters")
      .max(72, "password must be at most 72 characters")
      .optional(),

    current_password: z
      .string()
      .min(1, "current_password is required")
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.name === undefined && data.password === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["body"],
        message: "At least one of name or password must be provided",
      });
    }

    if (data.password !== undefined && data.current_password === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["current_password"],
        message: "current_password is required to change password",
      });
    }
  });

// ─── Forgot / Reset Password Schemas ──────────────────────────────────────────
//
// forgotPasswordSchema mirrors loginSchema's email normalization (trim +
// lowercase) — same reasoning as everywhere else email is accepted.
const forgotPasswordSchema = z.object({
  email: z
    .string({ required_error: "email is required" })
    .trim()
    .toLowerCase()
    .email("email must be a valid email address"),
});

// resetPasswordSchema backs POST /api/auth/reset-password. `token` is the
// raw opaque token from the emailed link — same "lenient at the schema
// level, real check happens against the DB" reasoning as
// refreshTokenSchema. `password` reuses registerSchema's exact policy (8-72
// chars) so a reset password is held to the same bar as an initial one.
const resetPasswordSchema = z.object({
  token: z
    .string({ required_error: "token is required" })
    .min(1, "token is required"),

  password: z
    .string({ required_error: "password is required" })
    .min(8, "password must be at least 8 characters")
    .max(72, "password must be at most 72 characters"),
});

module.exports = {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  logCallSchema,
  logDetectionSchema,
  paginationSchema,
  updateProfileSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
};