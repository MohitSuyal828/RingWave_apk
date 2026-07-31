const jwt = require("jsonwebtoken");
const { fail } = require("../utils/response");

const verifyToken = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return fail(res, "Unauthorized. No token provided.", [], 401);
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      return fail(res, "Unauthorized. Malformed token.", [], 401);
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // attach user payload
    req.user = decoded;

    return next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return fail(res, "Token expired. Please log in again.", [], 401);
    }

    return fail(res, "Invalid token.", [], 401);
  }
};

module.exports = { verifyToken };