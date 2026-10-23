// Auth controller
// Wallet login: the client asks for a one-time message, signs it in MetaMask,
// and the server recovers the signer address to prove wallet ownership.
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { ethers } = require("ethers");
const chain = require("../services/blockchainService");

const NONCE_TTL_MS = 5 * 60 * 1000;
const nonces = new Map(); // lowercase address -> { message, expires }

function buildMessage(address, nonce) {
  return [
    "Sign in to IPFS Blockchain File Sharing",
    "",
    `Wallet: ${address}`,
    `Nonce: ${nonce}`,
    `Issued At: ${new Date().toISOString()}`,
    "",
    "This signature only proves you own this wallet. It costs no gas.",
  ].join("\n");
}

function getNonce(req, res) {
  const { address } = req.params;
  if (!ethers.isAddress(address)) return res.status(400).json({ error: "Invalid wallet address" });

  const checksum = ethers.getAddress(address);
  const message = buildMessage(checksum, crypto.randomBytes(16).toString("hex"));
  nonces.set(checksum.toLowerCase(), { message, expires: Date.now() + NONCE_TTL_MS });
  res.json({ message });
}

async function verify(req, res, next) {
  try {
    const { address, signature } = req.body || {};
    if (!ethers.isAddress(address) || !signature) {
      return res.status(400).json({ error: "address and signature are required" });
    }

    const key = address.toLowerCase();
    const entry = nonces.get(key);
    nonces.delete(key); // one-time use
    if (!entry || entry.expires < Date.now()) {
      return res.status(400).json({ error: "Login message expired. Request a new one." });
    }

    let recovered;
    try {
      recovered = ethers.verifyMessage(entry.message, signature);
    } catch {
      return res.status(401).json({ error: "Malformed signature" });
    }
    if (recovered.toLowerCase() !== key) {
      return res.status(401).json({ error: "Signature does not match wallet address" });
    }

    const checksum = ethers.getAddress(address);
    const token = jwt.sign({ address: checksum }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || "8h",
    });
    res.json({ token, ...(await profile(checksum)) });
  } catch (err) {
    next(err);
  }
}

async function me(req, res, next) {
  try {
    res.json(await profile(req.user.address));
  } catch (err) {
    next(err);
  }
}

async function profile(address) {
  const [user, admin] = await Promise.all([chain.getUser(address), chain.getAdmin()]);
  return { address, isAdmin: admin.toLowerCase() === address.toLowerCase(), attributes: user };
}

module.exports = { getNonce, verify, me };
