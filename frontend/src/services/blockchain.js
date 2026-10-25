// Blockchain service
// Sends FileStorage transactions from the user's MetaMask wallet.
import { ethers } from "ethers";

// contract.json is written by `npm run deploy` in blockchain/. Loaded via glob so the
// app still builds (and shows a helpful message) before the contract is deployed.
const found = import.meta.glob("../contract.json", { eager: true, import: "default" });
export const contractInfo = Object.values(found)[0] || null;

// Mirrors the contract's VersionReason enum.
const VERSION_REASON = { Initial: 0, Revocation: 1, KeyCompromise: 2, ContentUpdate: 3 };

let signer = null;

export function setSigner(value) {
  signer = value;
}

function contract() {
  if (!contractInfo) throw new Error("Contract not deployed. Run `npm run deploy` in blockchain/.");
  if (!signer) throw new Error("Wallet not connected");
  return new ethers.Contract(contractInfo.address, contractInfo.abi, signer);
}

export function readableError(err) {
  if (err?.code === "ACTION_REJECTED" || err?.code === 4001 || err?.info?.error?.code === 4001) {
    return "Request rejected in MetaMask";
  }
  const reason =
    err?.reason ||
    err?.revert?.args?.[0] ||
    err?.info?.error?.data?.message ||
    err?.info?.error?.message ||
    err?.shortMessage ||
    err?.message ||
    "Something went wrong";
  return String(reason).replace(/^execution reverted:?\s*/i, "").replace(/^Error: VM Exception.*reverted with reason string '(.*)'$/, "$1");
}

async function send(method, ...args) {
  try {
    const tx = await contract()[method](...args);
    return await tx.wait();
  } catch (err) {
    throw new Error(readableError(err));
  }
}

function findEvent(receipt, name) {
  const iface = contract().interface;
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed?.name === name) return parsed;
    } catch {
      /* log from another contract */
    }
  }
  return null;
}

export const chain = {
  registerUser: (address, role, department, organization) =>
    send("registerUser", address, role, department, organization),

  uploadFile: async (cid, name, contentHash, policy) => {
    const receipt = await send("uploadFile", cid, name, contentHash, policy.role, policy.department, policy.organization);
    const event = findEvent(receipt, "FileUploaded");
    return { txHash: receipt.hash, fileId: event ? Number(event.args.fileId) : null };
  },

  updatePolicy: (fileId, policy) =>
    send("updatePolicy", fileId, policy.role, policy.department, policy.organization),
  /** expiresAt = unix seconds, or null for no expiry (a delegate's grant still ends with its delegation). */
  grantAccess: (fileId, address, expiresAt = null) =>
    expiresAt ? send("grantTemporaryAccess", fileId, address, expiresAt) : send("grantAccess", fileId, address),
  revokeAccess: (fileId, address) => send("revokeAccess", fileId, address),
  delegateManagement: (fileId, address, expiresAt) => send("delegateManagement", fileId, address, expiresAt),
  rotateKey: (fileId, newCid, reason) => send("rotateKey", fileId, newCid, VERSION_REASON[reason]),
  revokeAndRotate: (fileId, address, newCid) => send("revokeAndRotate", fileId, address, newCid),
  addVersion: (fileId, newCid, contentHash) => send("addVersion", fileId, newCid, contentHash),
  revokeDelegation: (fileId, address) => send("revokeDelegation", fileId, address),
  setFileActive: (fileId, active) => send("setFileActive", fileId, active),

  /** Records the access attempt on-chain (audit log) and returns the decision. */
  requestAccess: async (fileId) => {
    const receipt = await send("requestAccess", fileId);
    const event = findEvent(receipt, "AccessRequested");
    return { txHash: receipt.hash, granted: event ? event.args.granted : false };
  },
};
