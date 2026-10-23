// Creates backend/.env from .env.example, filling JWT_SECRET and MASTER_KEY with random values.
// Existing non-empty values are kept, so it is safe to run again.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = path.join(__dirname, "..");
const examplePath = path.join(root, ".env.example");
const envPath = path.join(root, ".env");

const current = {};
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && m[2]) current[m[1]] = m[2];
  }
}

const random = () => crypto.randomBytes(32).toString("hex");
const output = fs
  .readFileSync(examplePath, "utf8")
  .split(/\r?\n/)
  .map((line) => {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (!m) return line;
    const [, key, value] = m;
    if (current[key]) return `${key}=${current[key]}`;
    if (key === "JWT_SECRET" || key === "MASTER_KEY") return `${key}=${random()}`;
    return `${key}=${value}`;
  })
  .join("\n");

fs.writeFileSync(envPath, output);
console.log(`Wrote ${envPath}`);
