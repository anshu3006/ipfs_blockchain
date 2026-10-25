// File routes
const router = require("express").Router();
const multer = require("multer");
const files = require("../controllers/fileController");
const versions = require("../controllers/versionController");
const { requireAuth } = require("../middleware/authMiddleware");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.use(requireAuth);
router.post("/upload", upload.single("file"), files.upload);
router.get("/mine", files.mine);
router.get("/shared", files.shared);
router.get("/managed", files.managed);
router.get("/:id", files.getOne);
router.get("/:id/delegates", files.delegates);
router.get("/:id/download", files.download);
router.get("/:id/versions", versions.list);
router.get("/:id/versions/:n/download", versions.downloadVersion);
router.post("/:id/versions", upload.single("file"), versions.uploadVersion);
router.post("/:id/rotate/prepare", versions.prepareRotation);
router.post("/:id/rotate/commit", versions.commitRotation);

module.exports = router;
