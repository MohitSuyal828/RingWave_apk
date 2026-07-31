const pool = require("../config/db");

// ─── addContact ────────────────────────────────────────────────────────────
//
// ON CONFLICT DO NOTHING makes this idempotent — adding someone who's
// already a contact is a harmless no-op, not a 409/500 the frontend needs
// to special-case. Returns the existing or newly-created row either way
// (or undefined if RETURNING found nothing on a no-op conflict — the
// controller treats that as "already a contact" and re-fetches).
const addContact = async (ownerId, contactId) => {
  const query = `
    INSERT INTO contacts (owner_id, contact_id)
    VALUES ($1, $2)
    ON CONFLICT (owner_id, contact_id) DO NOTHING
    RETURNING *;
  `;

  const result = await pool.query(query, [ownerId, contactId]);

  return result.rows[0];
};

const removeContact = async (ownerId, contactId) => {
  const query = `
    DELETE FROM contacts
    WHERE owner_id = $1 AND contact_id = $2
    RETURNING *;
  `;

  const result = await pool.query(query, [ownerId, contactId]);

  return result.rows[0];
};

// Joined with users so the frontend gets name/email directly, the same
// shape ContactsPage/DashboardPage/AddParticipantModal already expect
// from /users — this is a drop-in replacement for that response shape,
// just scoped to the owner's actual contact list instead of every user.
const listContacts = async (ownerId) => {
  const query = `
    SELECT u.id, u.name, u.email, u.created_at AS user_created_at, c.created_at AS added_at
    FROM contacts c
    JOIN users u ON u.id = c.contact_id
    WHERE c.owner_id = $1
    ORDER BY u.name ASC;
  `;

  const result = await pool.query(query, [ownerId]);

  return result.rows;
};

const isContact = async (ownerId, contactId) => {
  const query = `SELECT 1 FROM contacts WHERE owner_id = $1 AND contact_id = $2 LIMIT 1;`;

  const result = await pool.query(query, [ownerId, contactId]);

  return result.rows.length > 0;
};

module.exports = { addContact, removeContact, listContacts, isContact };
