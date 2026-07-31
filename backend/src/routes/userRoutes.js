const express = require("express");

const router = express.Router();

const { verifyToken } = require("../middleware/authMiddleware");
const { getUsers, putOwnIdentityKey, getUserIdentityKey } = require("../controllers/userController");

router.get("/", verifyToken, getUsers);

// Placed under /users rather than /auth since this is contact-directory
// data (fetching OTHER users' public keys), not the caller's own account
// data the way /auth/profile is.
router.put("/identity-key", verifyToken, putOwnIdentityKey);
router.get("/:id/identity-key", verifyToken, getUserIdentityKey);

module.exports = router;