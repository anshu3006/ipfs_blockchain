// Access controller
const { ethers } = require("ethers");
const accessControl = require("../services/accessControlService");
const chain = require("../services/blockchainService");
const { parseFileId } = require("./fileController");

/** Explains whether the signed-in wallet (or ?address=) may access a file, and why. */
async function check(req, res, next) {
  try {
    const address = req.query.address || req.user.address;
    if (!ethers.isAddress(address)) return res.status(400).json({ error: "Invalid address" });
    res.json(await accessControl.evaluate(parseFileId(req.params.id), ethers.getAddress(address)));
  } catch (err) {
    next(err);
  }
}

async function userAttributes(req, res, next) {
  try {
    const { address } = req.params;
    if (!ethers.isAddress(address)) return res.status(400).json({ error: "Invalid address" });
    res.json({ address: ethers.getAddress(address), ...(await chain.getUser(address)) });
  } catch (err) {
    next(err);
  }
}

/** On-chain audit log. Optional filters: ?fileId=1 and/or ?address=0x... */
async function audit(req, res, next) {
  try {
    const filters = {};
    if (req.query.fileId) filters.fileId = parseFileId(req.query.fileId);
    if (req.query.address) {
      if (!ethers.isAddress(req.query.address)) return res.status(400).json({ error: "Invalid address" });
      filters.address = req.query.address;
    }
    res.json(await chain.getAuditLog(filters));
  } catch (err) {
    next(err);
  }
}

module.exports = { check, userAttributes, audit };
