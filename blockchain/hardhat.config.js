// Hardhat configuration
require("@nomicfoundation/hardhat-toolbox");

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true },
  },
  networks: {
    // `npx hardhat node` starts this local chain (chainId 31337, 20 funded test accounts)
    localhost: { url: "http://127.0.0.1:8545" },
  },
};
