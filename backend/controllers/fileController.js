// File controller
const encryption = require("../services/encryptionService");
const ipfs = require("../services/ipfsService");
const chain = require("../services/blockchainService");
const keyManager = require("../utils/keyManager");

/**
 * Step 1 of upload: encrypt the file, add it to IPFS and keep its key.
 * The client then calls FileStorage.uploadFile(cid, name, contentHash, policy...) from MetaMask.
 */
async function upload(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded (form field name: file)" });

    const user = await chain.getUser(req.user.address);
    if (!user.registered) {
      return res.status(403).json({ error: "Wallet is not registered. Ask the admin to register it." });
    }

    const plain = req.file.buffer;
    const contentHash = encryption.sha256(plain);
    const key = encryption.generateKey();
    const encrypted = encryption.encrypt(plain, key);

    const cid = await ipfs.add(encrypted, req.file.originalname + ".enc");
    keyManager.saveKey(cid, key, req.user.address);

    res.status(201).json({
      cid,
      contentHash,
      name: req.file.originalname,
      size: plain.length,
      encryptedSize: encrypted.length,
    });
  } catch (err) {
    next(err);
  }
}

/** Decrypts and returns the file only if the contract says this wallet may access it. */
async function download(req, res, next) {
  try {
    const id = parseFileId(req.params.id);
    const file = await chain.getFile(id);

    if (!(await chain.canAccess(id, req.user.address))) {
      return res.status(403).json({ error: "ACCESS DENIED by on-chain policy" });
    }

    sendFile(res, file.name, await decryptStored(file.cid, file.contentHash));
  } catch (err) {
    next(err);
  }
}

/**
 * Fetches `cid` from IPFS, decrypts it with its stored key and checks it against the
 * on-chain content hash. Throws an error with an HTTP status if any step fails.
 */
async function decryptStored(cid, contentHash) {
  const key = keyManager.getKey(cid);
  if (!key) {
    throw Object.assign(new Error("Decryption key not found: it was destroyed or never stored"), { status: 410 });
  }
  const encrypted = await ipfs.cat(cid);
  let plain;
  try {
    plain = encryption.decrypt(encrypted, key);
  } catch {
    throw Object.assign(new Error("Integrity check failed: encrypted content was modified"), { status: 409 });
  }
  if (encryption.sha256(plain) !== contentHash) {
    throw Object.assign(new Error("Integrity check failed: content hash does not match blockchain record"), { status: 409 });
  }
  return plain;
}

function sendFile(res, name, data) {
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(name)}"`);
  res.setHeader("X-Content-Hash-Verified", "true");
  res.send(data);
}

async function getOne(req, res, next) {
  try {
    const id = parseFileId(req.params.id);
    const file = await chain.getFile(id);
    const [canAccess, isDelegate] = await Promise.all([
      chain.canAccess(id, req.user.address),
      chain.isDelegate(id, req.user.address),
    ]);
    res.json({ ...file, canAccess, isDelegate });
  } catch (err) {
    next(err);
  }
}

/** Active delegates of a file. Visible to the owner and to its delegates. */
async function delegates(req, res, next) {
  try {
    const id = parseFileId(req.params.id);
    const file = await chain.getFile(id);
    const me = req.user.address;
    if (file.owner.toLowerCase() !== me.toLowerCase() && !(await chain.isDelegate(id, me))) {
      return res.status(403).json({ error: "Only the owner or a delegate can see delegates" });
    }
    res.json(await chain.getDelegates(id));
  } catch (err) {
    next(err);
  }
}

/** Files other owners have delegated to the signed-in wallet. */
async function managed(req, res, next) {
  try {
    res.json(await chain.getManagedFiles(req.user.address));
  } catch (err) {
    next(err);
  }
}

async function mine(req, res, next) {
  try {
    res.json(await chain.getFilesByOwner(req.user.address));
  } catch (err) {
    next(err);
  }
}

async function shared(req, res, next) {
  try {
    res.json(await chain.getAccessibleFiles(req.user.address));
  } catch (err) {
    next(err);
  }
}

function parseFileId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) throw Object.assign(new Error("Invalid file id"), { status: 400 });
  return id;
}

module.exports = { upload, download, getOne, delegates, mine, shared, managed, parseFileId, decryptStored, sendFile };
