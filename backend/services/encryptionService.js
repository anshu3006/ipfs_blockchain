// Encryption service
// AES-256-GCM. Output layout: [12-byte IV][16-byte auth tag][ciphertext].
const crypto = require("crypto");

const IV_LEN = 12;
const TAG_LEN = 16;

function generateKey() {
  return crypto.randomBytes(32);
}

function encrypt(plain, key) {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

function decrypt(data, key) {
  const iv = data.subarray(0, IV_LEN);
  const tag = data.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const body = data.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]);
}

/** sha256 as 0x-prefixed hex, matching the bytes32 contentHash stored on-chain. */
function sha256(data) {
  return "0x" + crypto.createHash("sha256").update(data).digest("hex");
}

module.exports = { generateKey, encrypt, decrypt, sha256 };
