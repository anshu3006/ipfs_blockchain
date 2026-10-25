// IPFS service
// Talks to a local IPFS Kubo node over its HTTP API. If Kubo is not running and
// IPFS_MODE=auto, falls back to a local "mock" store in uploads/ so the demo still works.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const API = () => (process.env.IPFS_API_URL || "http://127.0.0.1:5001").replace(/\/$/, "");
const MODE = () => (process.env.IPFS_MODE || "auto").toLowerCase();
const MOCK_DIR = path.join(__dirname, "..", "uploads");
const MOCK_PREFIX = "mock-";

async function kuboAvailable() {
  try {
    const res = await fetch(`${API()}/api/v0/version`, { method: "POST", signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

async function useKubo() {
  const mode = MODE();
  if (mode === "kubo") return true;
  if (mode === "mock") return false;
  return kuboAvailable();
}

async function add(data, filename) {
  if (await useKubo()) {
    const form = new FormData();
    form.append("file", new Blob([data]), filename);
    const res = await fetch(`${API()}/api/v0/add?pin=true&cid-version=1`, { method: "POST", body: form });
    if (!res.ok) throw new Error(`IPFS add failed: ${res.status} ${await res.text()}`);
    return (await res.json()).Hash;
  }
  const cid = MOCK_PREFIX + crypto.createHash("sha256").update(data).digest("hex");
  fs.mkdirSync(MOCK_DIR, { recursive: true });
  fs.writeFileSync(path.join(MOCK_DIR, cid), data);
  return cid;
}

async function cat(cid) {
  if (cid.startsWith(MOCK_PREFIX)) {
    if (!/^mock-[0-9a-f]{64}$/.test(cid)) throw Object.assign(new Error("Invalid CID"), { status: 400 });
    const file = path.join(MOCK_DIR, cid);
    if (!fs.existsSync(file)) throw Object.assign(new Error("File not found in local store"), { status: 404 });
    return fs.readFileSync(file);
  }
  const res = await fetch(`${API()}/api/v0/cat?arg=${encodeURIComponent(cid)}`, { method: "POST" });
  if (!res.ok) throw Object.assign(new Error(`IPFS cat failed: ${res.status}`), { status: 502 });
  return Buffer.from(await res.arrayBuffer());
}

/** Stop keeping a file. Kubo may garbage-collect it later; the mock store deletes it now. */
async function unpin(cid) {
  if (cid.startsWith(MOCK_PREFIX)) {
    if (!/^mock-[0-9a-f]{64}$/.test(cid)) return false;
    const file = path.join(MOCK_DIR, cid);
    if (!fs.existsSync(file)) return false;
    fs.unlinkSync(file);
    return true;
  }
  try {
    const res = await fetch(`${API()}/api/v0/pin/rm?arg=${encodeURIComponent(cid)}`, { method: "POST" });
    return res.ok;
  } catch {
    return false;
  }
}

async function status() {
  const kubo = await kuboAvailable();
  return { mode: MODE(), kuboRunning: kubo, using: (await useKubo()) ? "kubo" : "mock" };
}

module.exports = { add, cat, unpin, status };
