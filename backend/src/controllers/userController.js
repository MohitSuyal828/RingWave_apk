const { findAllUsersExcept, findUserById } = require("../models/userModel");
const { upsertIdentityKey, getIdentityKey } = require("../models/identityKeyModel");
const { success, fail } = require("../utils/response");

const getUsers = async (req, res, next) => {
  try {
    const users = await findAllUsersExcept(req.user.id);

    return success(
      res,
      { users },
      "Users fetched successfully",
      200
    );
  } catch (error) {
    next(error);
  }
};

// ─── PUT /users/identity-key ──────────────────────────────────────────────────
//
// Uploads the CALLER'S OWN public key (never anyone else's — req.user.id
// comes from the verified JWT, not from the request body, so there is no
// way for one user to overwrite another user's key via this endpoint).
// publicKey is an exported JWK (JSON Web Key) — a public-key
// representation, not raw key material. There is no equivalent "upload
// your private key" endpoint anywhere in this API, deliberately: the
// server is never meant to see one.
const putOwnIdentityKey = async (req, res, next) => {
  try {
    const { publicKey, algorithm } = req.body;

    if (!publicKey || typeof publicKey !== "object") {
      return fail(res, "publicKey (a JWK object) is required", [], 422);
    }

    const row = await upsertIdentityKey(
      req.user.id,
      JSON.stringify(publicKey),
      typeof algorithm === "string" ? algorithm : "ECDH-P256"
    );

    return success(
      res,
      { publicKey: JSON.parse(row.public_key), algorithm: row.algorithm },
      "Identity key saved",
      200
    );
  } catch (error) {
    next(error);
  }
};

// ─── GET /users/:id/identity-key ──────────────────────────────────────────────
//
// Returns another user's PUBLIC key so the caller's browser can perform
// ECDH locally. This is exactly the kind of data this server is allowed
// to hold and hand out freely — a public key reveals nothing usable
// without the matching private key, which this server never has.
const getUserIdentityKey = async (req, res, next) => {
  try {
    const targetUserId = parseInt(req.params.id, 10);

    if (Number.isNaN(targetUserId)) {
      return fail(res, "Invalid user id", [], 422);
    }

    const user = await findUserById(targetUserId);
    if (!user) {
      return fail(res, "User not found", [], 404);
    }

    const row = await getIdentityKey(targetUserId);

    if (!row) {
      return fail(
        res,
        "This user hasn't set up call verification yet.",
        [],
        404
      );
    }

    return success(
      res,
      { publicKey: JSON.parse(row.public_key), algorithm: row.algorithm, updatedAt: row.updated_at },
      "Identity key fetched",
      200
    );
  } catch (error) {
    next(error);
  }
};

module.exports = { getUsers, putOwnIdentityKey, getUserIdentityKey };