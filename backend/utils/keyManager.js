// Key manager utility
// Stores each file's AES key, wrapped (encrypted) with MASTER_KEY, in data/keys.json.
// Keys are only used inside the backend after the on-chain access check passes.
const fs = require("fs");
const path = require("path");
const { encrypt, decrypt } = require("../services/encryptionService");

const STORE = path.join(__dirname, "..", "data", "keys.json");

function masterKey() {
  const hex = process.env.MASTER_KEY || "";
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("MASTER_KEY must be 64 hex characters (run `npm run setup`)");
  }
  return Buffer.from(hex, "hex");
}

function load() {
  if (!fs.existsSync(STORE)) return {};
  return JSON.parse(fs.readFileSync(STORE, "utf8"));
}

function save(store) {
  fs.mkdirSync(path.dirname(STORE), { recursive: true });
  fs.writeFileSync(STORE, JSON.stringify(store, null, 2));
}

function saveKey(cid, key, uploader) {
  const store = load();
  store[cid] = {
    key: encrypt(key, masterKey()).toString("base64"),
    uploader: uploader.toLowerCase(),
    createdAt: new Date().toISOString(),
  };
  save(store);
}

function getKey(cid) {
  const entry = load()[cid];
  if (!entry) return null;
  return decrypt(Buffer.from(entry.key, "base64"), masterKey());
}

function hasKey(cid) {
  return Boolean(load()[cid]);
}

/** Crypto-shredding: once a key is gone, every copy of the data it encrypted is unreadable. */
function deleteKey(cid) {
  const store = load();
  if (!store[cid]) return false;
  delete store[cid];
  save(store);
  return true;
}

module.exports = { saveKey, getKey, hasKey, deleteKey };
