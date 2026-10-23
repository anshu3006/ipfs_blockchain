// Starts the whole project with one command (`npm start` in the project root):
// local Hardhat chain -> deploy contract -> backend API -> frontend dev server.
// Ctrl+C stops everything.
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const isWin = process.platform === "win32";
const children = [];

const COLORS = { chain: 35, deploy: 33, backend: 36, frontend: 32 };

// Hardhat node logs every RPC call by name (eth_chainId, eth_call, …); hide those.
const RPC_NOISE = /^\s*(eth|net|web3|evm|hardhat)_\w+( \(\d+\))?\s*$/;

function log(name, text) {
  for (const line of String(text).split(/\r?\n/)) {
    if (line.trim() && !RPC_NOISE.test(line)) console.log(`\x1b[${COLORS[name]}m[${name}]\x1b[0m ${line}`);
  }
}

/** Runs a package binary from the folder's node_modules (`npx <args>`), or `node` itself. */
function run(name, dir, args, { keepAlive = true } = {}) {
  const useNode = args[0] === "node";
  // shell: true lets Windows resolve npx.cmd
  const child = useNode
    ? spawn(process.execPath, args.slice(1), { cwd: path.join(root, dir), env: process.env })
    : spawn(isWin ? "npx.cmd" : "npx", args, { cwd: path.join(root, dir), shell: isWin, env: process.env });
  child.stdout.on("data", (d) => log(name, d));
  child.stderr.on("data", (d) => log(name, String(d).replace(/.*not supported by Hardhat.*\n?/g, "")));
  if (keepAlive) {
    children.push(child);
    child.on("exit", (code) => {
      if (!shuttingDown) {
        log(name, `exited with code ${code}. Stopping everything.`);
        shutdown(1);
      }
    });
  }
  return child;
}

async function rpcUp() {
  try {
    const res = await fetch("http://127.0.0.1:8545", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitFor(check, what, timeoutMs = 60000) {
  const start = Date.now();
  while (!(await check())) {
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (child.exitCode !== null) continue;
    if (isWin) spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else child.kill("SIGINT");
  }
  setTimeout(() => process.exit(code), 500);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

function checkInstalled() {
  const missing = ["blockchain", "backend", "frontend"].filter((d) => !fs.existsSync(path.join(root, d, "node_modules")));
  if (missing.length) {
    console.error(`Dependencies missing in: ${missing.join(", ")}. Run \`npm run setup\` in the project root first.`);
    process.exit(1);
  }
  if (!fs.existsSync(path.join(root, "backend", ".env"))) {
    console.error("backend/.env missing. Run `npm run setup` in the project root first.");
    process.exit(1);
  }
}

(async () => {
  checkInstalled();

  if (await rpcUp()) {
    log("chain", "A blockchain is already running on 127.0.0.1:8545 – using it.");
  } else {
    run("chain", "blockchain", ["hardhat", "node"]);
    await waitFor(rpcUp, "the Hardhat node");
  }

  log("deploy", "Deploying FileStorage…");
  const deploy = run("deploy", "blockchain", ["hardhat", "run", "scripts/deploy.js", "--network", "localhost"], { keepAlive: false });
  const code = await new Promise((r) => deploy.on("exit", r));
  if (code !== 0) {
    log("deploy", "Deployment failed.");
    return shutdown(1);
  }

  run("backend", "backend", ["node", "server.js"]);
  run("frontend", "frontend", ["vite"]);

  setTimeout(() => {
    console.log("\n  Open http://localhost:5173 in the browser with MetaMask.");
    console.log("  Admin = Hardhat account #0 (private keys are printed above under [chain]).");
    console.log("  Press Ctrl+C to stop everything.\n");
  }, 3000);
})().catch((err) => {
  console.error(err.message);
  shutdown(1);
});
