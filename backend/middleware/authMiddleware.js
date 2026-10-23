// Auth middleware
// Expects "Authorization: Bearer <jwt>" issued by /api/auth/verify.
const jwt = require("jsonwebtoken");

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing auth token. Connect your wallet first." });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { address: payload.address };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token. Please sign in again." });
  }
}

module.exports = { requireAuth };
