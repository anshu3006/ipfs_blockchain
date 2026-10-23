// Access routes
const router = require("express").Router();
const access = require("../controllers/accessController");
const { requireAuth } = require("../middleware/authMiddleware");

router.use(requireAuth);
router.get("/audit", access.audit);
router.get("/user/:address", access.userAttributes);
router.get("/:id/check", access.check);

module.exports = router;
