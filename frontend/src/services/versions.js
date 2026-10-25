// Key rotation and versioning, combining backend and contract steps.
import { api } from "./api";
import { chain } from "./blockchain";

/**
 * Re-encrypt a file under a new key and destroy the old one.
 *   1. backend re-encrypts and stores the new version on IPFS (old key still kept)
 *   2. MetaMask records it on-chain (with the revocation, if `revokeUser` is given)
 *   3. backend destroys the old key and unpins the old CID (crypto-shredding)
 * If step 2 is rejected, nothing changes for users: the old version stays current.
 */
export async function rotateKey(fileId, { reason, revokeUser = null }) {
  const { oldCid, newCid } = await api.prepareRotation(fileId, reason);
  if (revokeUser) await chain.revokeAndRotate(fileId, revokeUser, newCid);
  else await chain.rotateKey(fileId, newCid, reason);
  const shred = await api.commitRotation(fileId, oldCid);
  return { oldCid, newCid, ...shred };
}

/** Upload new content as the next version (owner only). */
export async function uploadNewVersion(fileId, file) {
  const { cid, contentHash } = await api.uploadVersion(fileId, file);
  await chain.addVersion(fileId, cid, contentHash);
  return { cid, contentHash };
}
