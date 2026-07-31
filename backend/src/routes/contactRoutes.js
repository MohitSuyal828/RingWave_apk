const express = require("express");

const router = express.Router();

const { verifyToken } = require("../middleware/authMiddleware");
const { getContacts, postContact, deleteContact } = require("../controllers/contactController");

router.get("/", verifyToken, getContacts);
router.post("/", verifyToken, postContact);
router.delete("/:id", verifyToken, deleteContact);

module.exports = router;
