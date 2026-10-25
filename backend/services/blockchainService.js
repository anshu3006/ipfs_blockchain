// Blockchain service
// Read-only connection to the FileStorage contract. Users send transactions
// themselves from MetaMask; the backend only reads state to enforce access.
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const CONFIG = path.join(__dirname, "..", "config", "contract.json");

let cached = null;

function getContract() {
  if (cached) return cached;
  if (!fs.existsSync(CONFIG)) {
    throw Object.assign(
      new Error("Contract not deployed. Run `npm run deploy` in blockchain/ first."),
      { status: 503 }
    );
  }
  const { address, abi } = JSON.parse(fs.readFileSync(CONFIG, "utf8"));
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || "http://127.0.0.1:8545");
  cached = new ethers.Contract(address, abi, provider);
  return cached;
}

function formatFile(f) {
  return {
    id: Number(f.id),
    owner: f.owner,
    cid: f.cid,
    name: f.name,
    contentHash: f.contentHash,
    policy: { role: f.policy.role, department: f.policy.department, organization: f.policy.organization },
    active: f.active,
    uploadedAt: new Date(Number(f.uploadedAt) * 1000).toISOString(),
    version: Number(f.version),
  };
}

// Mirrors the contract's VersionReason enum.
const VERSION_REASONS = ["Initial", "Revocation", "KeyCompromise", "ContentUpdate"];

/** Every version of a file, oldest first; version numbers start at 1. */
async function getVersions(id) {
  const versions = await getContract().getVersions(id);
  return versions.map((v, i) => ({
    version: i + 1,
    cid: v.cid,
    contentHash: v.contentHash,
    reason: VERSION_REASONS.at(Number(v.reason)),
    by: v.by,
    createdAt: new Date(Number(v.createdAt) * 1000).toISOString(),
  }));
}

function formatUser(u) {
  return { role: u.role, department: u.department, organization: u.organization, registered: u.registered };
}

async function getFile(id) {
  try {
    return formatFile(await getContract().getFile(id));
  } catch (err) {
    if (/File does not exist/.test(err.shortMessage || err.message)) {
      throw Object.assign(new Error("File does not exist"), { status: 404 });
    }
    throw err;
  }
}

async function getUser(address) {
  return formatUser(await getContract().getUser(address));
}

async function canAccess(id, address) {
  return getContract().canAccess(id, address);
}

async function isRevoked(id, address) {
  return getContract().revoked(id, address);
}

const FOREVER = 2n ** 64n - 1n;

function toDate(seconds) {
  return seconds >= FOREVER ? null : new Date(Number(seconds) * 1000).toISOString();
}

/** The explicit grant for this user, if it is currently active. expiresAt null = never expires. */
async function getActiveGrant(id, address) {
  const contract = getContract();
  if (!(await contract.hasActiveGrant(id, address))) return null;
  const [expiresAt, by] = await Promise.all([contract.grantExpiry(id, address), contract.grantedBy(id, address)]);
  return { expiresAt: toDate(expiresAt), by };
}

async function isDelegate(id, address) {
  return getContract().isDelegate(id, address);
}

async function getDelegates(id) {
  const [delegates, expiries] = await getContract().getDelegates(id);
  return delegates.map((address, i) => ({ address, expiresAt: toDate(expiries[i]) }));
}

/** Files `address` may currently manage as a delegate, each with when that right ends. */
async function getManagedFiles(address) {
  const contract = getContract();
  const ids = await contract.getManagedFiles(address);
  return Promise.all(
    ids.map(async (id) => ({
      ...(await getFile(id)),
      delegationExpiresAt: toDate(await contract.delegationExpiry(id, address)),
    }))
  );
}

async function getFilesByOwner(address) {
  const ids = await getContract().getFilesByOwner(address);
  return Promise.all(ids.map((id) => getFile(id)));
}

async function getAccessibleFiles(address) {
  const ids = await getContract().getAccessibleFiles(address);
  return Promise.all(ids.map((id) => getFile(id)));
}

async function getAdmin() {
  return getContract().admin();
}

/** All contract events, newest first, as the audit log. */
async function getAuditLog({ fileId, address } = {}) {
  const contract = getContract();
  const logs = await contract.queryFilter("*", 0, "latest");
  const blockTimes = new Map();

  const entries = [];
  for (const log of logs) {
    if (!log.fragment) continue;
    const args = {};
    log.fragment.inputs.forEach((input, i) => {
      const v = log.args[i];
      if (input.name === "reason") args.reason = VERSION_REASONS.at(Number(v));
      // A grant "forever" is uint64 max; report it as null (no expiry).
      else args[input.name] = typeof v === "bigint" ? (v >= FOREVER ? null : Number(v)) : v;
    });
    if (fileId !== undefined && args.fileId !== fileId) continue;
    if (address) {
      const a = address.toLowerCase();
      const involved = [args.user, args.owner].some((x) => typeof x === "string" && x.toLowerCase() === a);
      if (!involved) continue;
    }
    if (!blockTimes.has(log.blockNumber)) {
      const block = await log.getBlock();
      blockTimes.set(log.blockNumber, new Date(block.timestamp * 1000).toISOString());
    }
    entries.push({
      event: log.fragment.name,
      args,
      blockNumber: log.blockNumber,
      txHash: log.transactionHash,
      timestamp: blockTimes.get(log.blockNumber),
    });
  }
  return entries.reverse();
}

async function status() {
  try {
    const contract = getContract();
    const network = await contract.runner.provider.getNetwork();
    return { connected: true, chainId: Number(network.chainId), contract: await contract.getAddress() };
  } catch (err) {
    return { connected: false, error: err.shortMessage || err.message };
  }
}

module.exports = {
  getFile,
  getUser,
  canAccess,
  isRevoked,
  getActiveGrant,
  isDelegate,
  getDelegates,
  getManagedFiles,
  getVersions,
  VERSION_REASONS,
  getFilesByOwner,
  getAccessibleFiles,
  getAdmin,
  getAuditLog,
  status,
};
