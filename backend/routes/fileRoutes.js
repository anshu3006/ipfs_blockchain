// File routes
const router = require("express").Router();
const multer = require("multer");
const files = require("../controllers/fileController");
const { requireAuth } = require("../middleware/authMiddleware");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.use(requireAuth);
router.post("/upload", upload.single("file"), files.upload);
router.get("/mine", files.mine);
router.get("/shared", files.shared);
router.get("/:id", files.getOne);
router.get("/:id/download", files.download);

module.exports = router;
