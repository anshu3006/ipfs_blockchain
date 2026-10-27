// Hardhat configuration
require("@nomicfoundation/hardhat-toolbox");

// When running `npx hardhat node`, also mine a block every 2 seconds. Without this the local
// chain only mines when a transaction arrives, so block.timestamp (used for delegation and
// grant expiry) stays frozen while the app is idle and expired rights still look active.
// Real networks produce blocks every ~12 s. Unit tests keep plain automine so they stay
// deterministic.
const runningNode = process.argv.includes("node");

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true },
  },
  networks: {
    hardhat: runningNode ? { mining: { auto: true, interval: 2000 } } : {},
    // `npx hardhat node` starts this local chain (chainId 31337, 20 funded test accounts)
    localhost: { url: "http://127.0.0.1:8545" },
  },
};
