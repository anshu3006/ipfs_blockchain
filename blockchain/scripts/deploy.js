// Deployment script
// Deploys FileStorage and writes its address + ABI where the backend and frontend can read it.
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const contract = await hre.ethers.deployContract("FileStorage");
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const { chainId } = await hre.ethers.provider.getNetwork();
  console.log(`FileStorage deployed to ${address} (chainId ${chainId})`);
  console.log(`Admin account: ${deployer.address}`);

  const artifact = await hre.artifacts.readArtifact("FileStorage");
  const info = { address, chainId: Number(chainId), abi: artifact.abi };

  const targets = [
    path.join(__dirname, "..", "..", "backend", "config", "contract.json"),
    path.join(__dirname, "..", "..", "frontend", "src", "contract.json"),
  ];
  for (const target of targets) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(info, null, 2));
    console.log(`Wrote ${path.relative(path.join(__dirname, "..", ".."), target)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
