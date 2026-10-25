// Access control service
// The decision itself always comes from the smart contract (canAccess).
// This service adds a human-readable reason so the UI can explain it.
const chain = require("./blockchainService");

async function evaluate(fileId, address) {
  const file = await chain.getFile(fileId);
  const granted = await chain.canAccess(fileId, address);
  const user = await chain.getUser(address);

  const isOwner = (a) => a.toLowerCase() === file.owner.toLowerCase();

  let reason;
  let grant = null;
  if (isOwner(address)) reason = "You are the owner of this file";
  else if (!file.active) reason = "File has been deactivated by its owner";
  else if (await chain.isRevoked(fileId, address)) reason = "Access was revoked";
  else if ((grant = await chain.getActiveGrant(fileId, address))) {
    const who = isOwner(grant.by) ? "the owner" : `delegate ${grant.by}`;
    // The expiry is returned in `grant.expiresAt` for the client to format in local time.
    reason = `Access explicitly granted by ${who}`;
  } else if (!user.registered) reason = "Wallet is not registered";
  else {
    const mismatches = ["role", "department", "organization"].filter(
      (k) => file.policy[k] && file.policy[k] !== user[k]
    );
    reason = mismatches.length
      ? "Attributes do not match policy: " +
        mismatches.map((k) => `${k} requires "${file.policy[k]}" (has "${user[k] || "none"}")`).join(", ")
      : "Attributes match the file's access policy";
  }

  return { fileId, address, granted, reason, grant, policy: file.policy, userAttributes: user };
}

module.exports = { evaluate };
