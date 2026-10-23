// Auth routes
const router = require("express").Router();
const auth = require("../controllers/authController");
const { requireAuth } = require("../middleware/authMiddleware");

router.get("/nonce/:address", auth.getNonce); // -> { message } to sign in MetaMask
router.post("/verify", auth.verify);          // { address, signature } -> { token, ... }
router.get("/me", requireAuth, auth.me);

module.exports = router;
