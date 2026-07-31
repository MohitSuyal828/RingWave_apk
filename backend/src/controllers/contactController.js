const { addContact, removeContact, listContacts } = require("../models/contactModel");
const { findUserById } = require("../models/userModel");
const { success, fail } = require("../utils/response");

// ─── GET /contacts ─────────────────────────────────────────────────────────
const getContacts = async (req, res, next) => {
  try {
    const contacts = await listContacts(req.user.id);

    return success(res, { contacts }, "Contacts fetched successfully", 200);
  } catch (error) {
    next(error);
  }
};

// ─── POST /contacts ────────────────────────────────────────────────────────
//
// Body: { contactId }. Adds contactId to the CALLER's own list — there is
// no way to add a contact to someone else's list via this endpoint,
// req.user.id (from the verified JWT) is always the owner.
const postContact = async (req, res, next) => {
  try {
    const contactId = parseInt(req.body.contactId, 10);

    if (Number.isNaN(contactId)) {
      return fail(res, "contactId is required and must be a number", [], 422);
    }

    if (contactId === req.user.id) {
      return fail(res, "You can't add yourself as a contact", [], 422);
    }

    const targetUser = await findUserById(contactId);
    if (!targetUser) {
      return fail(res, "User not found", [], 404);
    }

    await addContact(req.user.id, contactId);

    return success(
      res,
      {
        contact: {
          id: targetUser.id,
          name: targetUser.name,
          email: targetUser.email,
        },
      },
      "Contact added",
      201
    );
  } catch (error) {
    next(error);
  }
};

// ─── DELETE /contacts/:id ──────────────────────────────────────────────────
const deleteContact = async (req, res, next) => {
  try {
    const contactId = parseInt(req.params.id, 10);

    if (Number.isNaN(contactId)) {
      return fail(res, "Invalid contact id", [], 422);
    }

    const removed = await removeContact(req.user.id, contactId);

    if (!removed) {
      return fail(res, "That user isn't in your contacts", [], 404);
    }

    return success(res, {}, "Contact removed", 200);
  } catch (error) {
    next(error);
  }
};

module.exports = { getContacts, postContact, deleteContact };
