// Express server
require("dotenv").config({ path: require("path").join(__dirname, ".env") });

const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/authRoutes");
const fileRoutes = require("./routes/fileRoutes");
const accessRoutes = require("./routes/accessRoutes");
const ipfsService = require("./services/ipfsService");
const blockchainService = require("./services/blockchainService");

if (!process.env.JWT_SECRET || !process.env.MASTER_KEY) {
  console.error("JWT_SECRET / MASTER_KEY missing. Run `npm run setup` in backend/ first.");
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || "*", exposedHeaders: ["Content-Disposition", "X-Content-Hash-Verified"] }));
app.use(express.json());

app.get("/api/health", async (req, res) => {
  res.json({
    status: "ok",
    ipfs: await ipfsService.status(),
    blockchain: await blockchainService.status(),
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/files", fileRoutes);
app.use("/api/access", accessRoutes);

app.use((req, res) => res.status(404).json({ error: "Not found" }));

// Central error handler: controllers throw errors with an optional `status`.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || (err.code === "LIMIT_FILE_SIZE" ? 413 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
