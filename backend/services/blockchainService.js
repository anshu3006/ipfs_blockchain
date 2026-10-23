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
  };
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

async function isExplicitlyGranted(id, address) {
  return getContract().explicitGrant(id, address);
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
      args[input.name] = typeof v === "bigint" ? Number(v) : v;
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
  isExplicitlyGranted,
  getFilesByOwner,
  getAccessibleFiles,
  getAdmin,
  getAuditLog,
  status,
};
