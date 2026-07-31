const pool = require("../config/db");

const createUser = async (name, email, password) => {
  const query = `
    INSERT INTO users (name, email, password)
    VALUES ($1, $2, $3)
    RETURNING *;
  `;

  const values = [name, email, password];

  const result = await pool.query(query, values);

  return result.rows[0];
};

const findUserByEmail = async (email) => {
  const query = `
    SELECT * FROM users
    WHERE email = $1
    LIMIT 1;
  `;

  const result = await pool.query(query, [email]);

  return result.rows[0];
};

const findUserById = async (id) => {
  const query = `
    SELECT id, name, email, created_at
    FROM users
    WHERE id = $1
    LIMIT 1;
  `;

  const result = await pool.query(query, [id]);

  return result.rows[0]; // password is intentionally excluded
};

const findAllUsersExcept = async (currentUserId) => {
  const query = `
    SELECT id, name, email, created_at
    FROM users
    WHERE id != $1
    ORDER BY name ASC;
  `;

  const result = await pool.query(query, [currentUserId]);

  return result.rows;
};

// ─── Update User (Partial) ───────────────────────────────────────────────────
//
// New. Backs PATCH /api/auth/profile. `fields` is a plain object containing
// only the columns that should actually change — e.g. { name: "Alice" } or
// { password: "<new hash>" } or both together. This function builds its
// SQL SET clause dynamically based on which keys are present, rather than
// having one fixed UPDATE statement that always touches every column.
//
// Why build the query dynamically instead of one fixed UPDATE name=$1,
// password=$2 WHERE id=$3? Because the controller may be doing a name-only
// update — always writing password=$2 in that case would require passing
// the user's EXISTING hashed password back in as a no-op write, which is
// unnecessary work and a subtly riskier pattern (any bug in re-fetching the
// existing hash before "no-op" rewriting it is a bug that touches the
// password column at all, for an operation that never needed to).
//
// Only `name` and `password` are ever accepted here — this function has no
// knowledge of, and no path to, updating `email`, which is deliberately out
// of scope for this item. Whatever keys end up in `fields` are entirely the
// controller's responsibility to construct correctly; this function trusts
// its caller, same as every other function in this file.
const updateUser = async (id, fields) => {
  const columns = Object.keys(fields);

  // Build "name = $1", "password = $2", etc., in the same order as columns,
  // then append "updated WHERE id = $N" as the final parameter — keeps the
  // parameter numbering correct regardless of how many fields are present.
  const setClauses = columns.map((column, index) => `${column} = $${index + 1}`);

  const values = columns.map((column) => fields[column]);
  values.push(id); // id is always the LAST parameter, after all dynamic columns

  const query = `
    UPDATE users
    SET ${setClauses.join(", ")}
    WHERE id = $${columns.length + 1}
    RETURNING id, name, email, created_at;
  `;

  const result = await pool.query(query, values);

  return result.rows[0]; // password is intentionally excluded from RETURNING
};

module.exports = {
  createUser,
  findUserByEmail,
  findUserById,
  findAllUsersExcept,
  updateUser,
};