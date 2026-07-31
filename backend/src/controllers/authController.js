const bcrypt = require("bcrypt");

const {
  createUser,
  findUserByEmail,
  findUserById,
  updateUser,
} = require("../models/userModel");

const {
  createRefreshToken,
  findValidRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
} = require("../models/refreshTokenModel");

const {
  createPasswordResetToken,
  findValidPasswordResetToken,
  markPasswordResetTokenUsed,
  invalidateActiveResetTokensForUser,
} = require("../models/passwordResetTokenModel");

const {
  generateAccessToken,
  generateRefreshToken,
  generateResetToken,
  hashToken,
} = require("../utils/token");

const { sendPasswordResetEmail } = require("../utils/emailService");

const { success, fail } = require("../utils/response");

// ─── SAFE USER SANITIZER ─────────────────────────────────────────────────────
const sanitizeUser = (user) => {
  if (!user) return user;
  const { password, ...safeUser } = user;
  return safeUser;
};

const REFRESH_TOKEN_EXPIRES_IN_DAYS = parseInt(
  process.env.REFRESH_TOKEN_EXPIRES_IN_DAYS || "7",
  10
);

const parseExpiresInToSeconds = (duration) => {
  const match = /^(\d+)(s|m|h|d)$/.exec(duration.trim());
  if (!match) return 15 * 60;

  const value = parseInt(match[1], 10);
  const unit = match[2];
  const secondsPerUnit = { s: 1, m: 60, h: 3600, d: 86400 };

  return value * secondsPerUnit[unit];
};

const ACCESS_TOKEN_EXPIRES_IN_SECONDS = parseExpiresInToSeconds(
  process.env.ACCESS_TOKEN_EXPIRES_IN || "15m"
);

const PASSWORD_RESET_EXPIRES_IN_MINUTES = parseInt(
  process.env.PASSWORD_RESET_EXPIRES_IN_MINUTES || "15",
  10
);

// FRONTEND_URL is used to build the link embedded in the reset email.
// Defaults to the frontend's local dev origin (matches the frontend's own
// .env — VITE_API_URL points at http://localhost:5000, so the frontend
// itself runs on :5173, Vite's default).
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

// ─── REGISTER ────────────────────────────────────────────────────────────────
const registerUser = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await createUser(name, email, hashedPassword);

    return success(
      res,
      { user: sanitizeUser(user) },
      "User registered successfully",
      201
    );
  } catch (error) {
    if (error.code === "23505") {
      return fail(res, "An account with this email already exists", [], 409);
    }
    return next(error);
  }
};

// ─── LOGIN ───────────────────────────────────────────────────────────────────
const loginUser = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await findUserByEmail(email);

    if (!user) {
      return fail(res, "Invalid email or password", [], 401);
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return fail(res, "Invalid email or password", [], 401);
    }

    const accessToken = generateAccessToken(user);

    const refreshToken = generateRefreshToken();
    const tokenHash = hashToken(refreshToken);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRES_IN_DAYS);

    await createRefreshToken(user.id, tokenHash, expiresAt);

    return success(
      res,
      {
        accessToken,
        refreshToken,
        expiresIn: ACCESS_TOKEN_EXPIRES_IN_SECONDS,
        user: sanitizeUser(user),
      },
      "Login successful",
      200
    );
  } catch (error) {
    return next(error);
  }
};

// ─── REFRESH TOKEN ───────────────────────────────────────────────────────────
const refreshAccessToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    const tokenHash = hashToken(refreshToken);

    const tokenRow = await findValidRefreshToken(tokenHash);

    if (!tokenRow) {
      return fail(
        res,
        "Invalid or expired refresh token. Please log in again.",
        [],
        401
      );
    }

    const user = await findUserById(tokenRow.user_id);

    if (!user) {
      return fail(
        res,
        "Invalid or expired refresh token. Please log in again.",
        [],
        401
      );
    }

    const accessToken = generateAccessToken(user);

    return success(
      res,
      { accessToken, expiresIn: ACCESS_TOKEN_EXPIRES_IN_SECONDS },
      "Token refreshed successfully",
      200
    );
  } catch (error) {
    return next(error);
  }
};

// ─── LOGOUT ──────────────────────────────────────────────────────────────────
const logoutUser = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    const tokenHash = hashToken(refreshToken);

    await revokeRefreshToken(tokenHash);

    return success(res, {}, "Logged out successfully", 200);
  } catch (error) {
    return next(error);
  }
};

// ─── GET PROFILE ──────────────────────────────────────────────────────────────
const getProfile = async (req, res, next) => {
  try {
    const user = await findUserById(req.user.id);

    if (!user) {
      return fail(res, "User not found", [], 404);
    }

    return success(
      res,
      { user: sanitizeUser(user) },
      "Profile fetched successfully",
      200
    );
  } catch (error) {
    return next(error);
  }
};

// ─── UPDATE PROFILE ───────────────────────────────────────────────────────────
const updateProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { name, password, current_password } = req.body;

    const fieldsToUpdate = {};

    if (name !== undefined) {
      fieldsToUpdate.name = name;
    }

    if (password !== undefined) {
      const userWithPassword = await findUserByEmail(req.user.email);

      if (!userWithPassword) {
        return fail(res, "User not found", [], 404);
      }

      const isMatch = await bcrypt.compare(
        current_password,
        userWithPassword.password
      );

      if (!isMatch) {
        return fail(res, "Current password is incorrect", [], 401);
      }

      fieldsToUpdate.password = await bcrypt.hash(password, 12);
    }

    const updatedUser = await updateUser(userId, fieldsToUpdate);

    if (!updatedUser) {
      return fail(res, "User not found", [], 404);
    }

    if (password !== undefined) {
      await revokeAllUserTokens(userId);
    }

    return success(
      res,
      { user: sanitizeUser(updatedUser) },
      "Profile updated successfully",
      200
    );
  } catch (error) {
    return next(error);
  }
};

// ─── FORGOT PASSWORD ──────────────────────────────────────────────────────────
//
// Always responds with the same generic 200 message whether or not the
// email belongs to a real account — this is deliberate. Returning a
// different response for "no such account" vs "reset email sent" would let
// an attacker enumerate which emails have RingWave accounts just by
// submitting this form repeatedly. The only difference between the two
// cases is invisible to the caller: a real token gets generated and
// "emailed" only when a matching user actually exists.
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    const user = await findUserByEmail(email);

    if (user) {
      // Invalidate any previous outstanding token for this user first, so
      // at most one reset link is ever valid at a time.
      await invalidateActiveResetTokensForUser(user.id);

      const rawToken = generateResetToken();
      const tokenHash = hashToken(rawToken);

      const expiresAt = new Date();
      expiresAt.setMinutes(
        expiresAt.getMinutes() + PASSWORD_RESET_EXPIRES_IN_MINUTES
      );

      await createPasswordResetToken(user.id, tokenHash, expiresAt);

      const resetLink = `${FRONTEND_URL}/reset-password?token=${rawToken}`;

      // Deliberately not awaited-then-failed-on: a transient email
      // provider outage shouldn't turn into a 500 that also reveals
      // "yes, this email exists, and something broke sending to it." Any
      // failure here is logged server-side; the response to the client is
      // unaffected either way.
      try {
        await sendPasswordResetEmail(user.email, resetLink);
      } catch (emailError) {
        console.error("Failed to send password reset email:", emailError);
      }
    }

    return success(
      res,
      {},
      "If an account exists for that email, a password reset link has been sent.",
      200
    );
  } catch (error) {
    return next(error);
  }
};

// ─── RESET PASSWORD ───────────────────────────────────────────────────────────
const resetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body;

    const tokenHash = hashToken(token);

    const tokenRow = await findValidPasswordResetToken(tokenHash);

    if (!tokenRow) {
      return fail(
        res,
        "This password reset link is invalid or has expired. Please request a new one.",
        [],
        401
      );
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const updatedUser = await updateUser(tokenRow.user_id, {
      password: hashedPassword,
    });

    if (!updatedUser) {
      return fail(res, "User not found", [], 404);
    }

    await markPasswordResetTokenUsed(tokenRow.id);

    // Same security posture as a password change via PATCH /profile: a
    // password reset means every existing session's refresh token should
    // stop working, since the reset itself is evidence the old password may
    // have been compromised (that's exactly why the user reset it).
    await revokeAllUserTokens(tokenRow.user_id);

    return success(res, {}, "Password reset successfully. Please log in.", 200);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  registerUser,
  loginUser,
  refreshAccessToken,
  logoutUser,
  getProfile,
  updateProfile,
  forgotPassword,
  resetPassword,
};