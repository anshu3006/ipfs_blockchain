// IPFS service
// Files are encrypted by the backend before being added to IPFS, so uploads go through the API.
import { api } from "./api";

export function uploadToIpfs(file) {
  return api.upload(file); // -> { cid, contentHash, name, size, encryptedSize }
}

/** "mock-" CIDs come from the backend's local fallback store when no IPFS node is running. */
export function isMockCid(cid) {
  return cid.startsWith("mock-");
}

/** Link to the (still encrypted) content on the local IPFS Kubo gateway. */
export function gatewayUrl(cid) {
  return isMockCid(cid) ? null : `http://127.0.0.1:8080/ipfs/${cid}`;
}
