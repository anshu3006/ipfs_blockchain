// Version controller: key rotation, crypto-shredding and content versions.
//
// Rotation is two-phase so a rejected MetaMask transaction never breaks a file:
//   1. prepare  - re-encrypt the current version under a new key, add it to IPFS, store the new key.
//                 The old key is kept, so downloads keep working.
//   2. (client) - rotateKey / revokeAndRotate on-chain makes the new CID current.
//   3. commit   - once the chain shows the old CID was superseded by a rotation,
//                 destroy its key and unpin it (crypto-shredding).
const encryption = require("../services/encryptionService");
const ipfs = require("../services/ipfsService");
const chain = require("../services/blockchainService");
const keyManager = require("../utils/keyManager");
const { parseFileId, decryptStored, sendFile } = require("./fileController");

const ROTATION_REASONS = ["Revocation", "KeyCompromise"];

/** "owner", "delegate" or null for the signed-in wallet. */
async function roleFor(id, address) {
  const file = await chain.getFile(id);
  if (file.owner.toLowerCase() === address.toLowerCase()) return { file, role: "owner" };
  if (await chain.isDelegate(id, address)) return { file, role: "delegate" };
  return { file, role: null };
}

function forbid(message) {
  return Object.assign(new Error(message), { status: 403 });
}

/** Version history with whether each version's key still exists. Owner and delegates only. */
async function list(req, res, next) {
  try {
    const id = parseFileId(req.params.id);
    const { role } = await roleFor(id, req.user.address);
    if (!role) throw forbid("Only the owner or a delegate can see the version history");
    const versions = await chain.getVersions(id);
    res.json(
      versions.map((v, i) => ({
        ...v,
        current: i === versions.length - 1,
        keyAvailable: keyManager.hasKey(v.cid),
      }))
    );
  } catch (err) {
    next(err);
  }
}

/** Phase 1: re-encrypt the current content under a fresh key and store it on IPFS. */
async function prepareRotation(req, res, next) {
  try {
    const id = parseFileId(req.params.id);
    const reason = req.body?.reason;
    if (!ROTATION_REASONS.includes(reason)) {
      return res.status(400).json({ error: `reason must be one of ${ROTATION_REASONS.join(", ")}` });
    }
    const { file, role } = await roleFor(id, req.user.address);
    if (!role) throw forbid("Only the owner or an active delegate can rotate the key");
    if (role === "delegate" && reason !== "Revocation") throw forbid("Delegates can rotate only after a revocation");

    const plain = await decryptStored(file.cid, file.contentHash);
    const newKey = encryption.generateKey();
    const newCid = await ipfs.add(encryption.encrypt(plain, newKey), file.name + ".enc");
    keyManager.saveKey(newCid, newKey, req.user.address);

    res.status(201).json({ oldCid: file.cid, newCid, contentHash: file.contentHash });
  } catch (err) {
    next(err);
  }
}

/** Phase 3: after the chain recorded the rotation, destroy the superseded key and unpin its CID. */
async function commitRotation(req, res, next) {
  try {
    const id = parseFileId(req.params.id);
    const { oldCid } = req.body || {};
    if (!oldCid) return res.status(400).json({ error: "oldCid is required" });

    const { role } = await roleFor(id, req.user.address);
    if (!role) throw forbid("Only the owner or an active delegate can finish a rotation");

    // Only shred a version the chain shows was replaced by a rotation of the same content.
    const versions = await chain.getVersions(id);
    const i = versions.findIndex((v) => v.cid === oldCid);
    const successor = versions.at(i + 1);
    if (i === -1 || !successor || !ROTATION_REASONS.includes(successor.reason)) {
      return res.status(409).json({ error: "The blockchain does not show this version as rotated yet" });
    }

    const keyDestroyed = keyManager.deleteKey(oldCid);
    const unpinned = await ipfs.unpin(oldCid);
    res.json({ oldCid, keyDestroyed, unpinned, currentVersion: versions.length });
  } catch (err) {
    next(err);
  }
}

/** Owner uploads new content for an existing file; the client then calls addVersion on-chain. */
async function uploadVersion(req, res, next) {
  try {
    const id = parseFileId(req.params.id);
    if (!req.file) return res.status(400).json({ error: "No file uploaded (form field name: file)" });
    const { file, role } = await roleFor(id, req.user.address);
    if (role !== "owner") throw forbid("Only the owner can upload a new version");

    const plain = req.file.buffer;
    const contentHash = encryption.sha256(plain);
    if (contentHash === file.contentHash) {
      return res.status(409).json({ error: "This content is identical to the current version" });
    }
    const key = encryption.generateKey();
    const cid = await ipfs.add(encryption.encrypt(plain, key), file.name + ".enc");
    keyManager.saveKey(cid, key, req.user.address);

    res.status(201).json({ cid, contentHash, size: plain.length });
  } catch (err) {
    next(err);
  }
}

/** Owner downloads an older version, if its key still exists (rotated-away versions are shredded). */
async function downloadVersion(req, res, next) {
  try {
    const id = parseFileId(req.params.id);
    const n = Number(req.params.n);
    const { file, role } = await roleFor(id, req.user.address);
    if (role !== "owner") throw forbid("Only the owner can download older versions");

    const version = (await chain.getVersions(id)).at(n - 1);
    if (!Number.isInteger(n) || n < 1 || !version) return res.status(404).json({ error: "No such version" });

    const dot = file.name.lastIndexOf(".");
    const name = dot > 0 ? `${file.name.slice(0, dot)}.v${n}${file.name.slice(dot)}` : `${file.name}.v${n}`;
    sendFile(res, name, await decryptStored(version.cid, version.contentHash));
  } catch (err) {
    next(err);
  }
}

module.exports = { list, prepareRotation, commitRotation, uploadVersion, downloadVersion };
