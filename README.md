# Secure IPFS Storage

IPFS-based blockchain file sharing with wallet authentication and attribute-based access control (ABAC).

- `blockchain/` – `FileStorage.sol` smart contract (users + attributes, file records, policy, grant/revoke, audit events), tests, deploy script
- `backend/` – Express API: wallet sign-in (JWT), AES-256-GCM encryption, IPFS upload/download, on-chain access checks
- `frontend/` – React (Vite) app: login, dashboard, upload, my files, shared with me, audit log, admin

## First-time setup

Needs Node.js 18+ (22 recommended) and the MetaMask browser extension.

```bash
cd blockchain && npm install
cd ../backend && npm install && npm run setup   # setup creates .env with random secrets
cd ../frontend && npm install
```

## Run (4 terminals)

```bash
# 1. Local blockchain – keep running
cd blockchain
npx hardhat node

# 2. Deploy the contract (writes backend/config/contract.json and frontend/src/contract.json)
cd blockchain
npm run deploy

# 3. API server – http://localhost:5000
cd backend
npm start

# 4. Web app – open http://localhost:5173
cd frontend
npm run dev
```

Run the contract tests with `cd blockchain && npm test`.

**After restarting `npx hardhat node`** the chain is empty: run `npm run deploy` again, and in MetaMask use
*Settings → Advanced → Clear activity tab data* for each account (otherwise MetaMask uses old nonces and transactions fail).

## MetaMask setup (once)

1. The app adds the **Hardhat Local** network (`http://127.0.0.1:8545`, chain ID `31337`) automatically when you connect. You can also add it by hand.
2. Import test accounts with *Add account → Import account*, using the private keys that `npx hardhat node` prints:
   - **Account #0** – the **admin** (deployed the contract)
   - **Account #1, #2, …** – normal users

These are public test keys with fake ETH. Never use them on a real network.

## Demo script

| Step | Account | Action | Expected |
|---|---|---|---|
| 1 | #0 admin | Admin page: register #0 as Faculty/CSE/SIT, #1 as Student/CSE/SIT, #2 as Student/ECE/SIT | 3 × "User registered" in the audit log |
| 2 | #0 | Upload a file with policy Department = CSE | File #1, CID, SHA-256 and tx hash shown |
| 3 | #1 (CSE) | Shared With Me → Download | File downloads, "integrity verified" |
| 4 | #2 (ECE) | Shared With Me → Request file ID 1 | **ACCESS DENIED** – department requires "CSE" |
| 5 | #0 | My Files → Manage → revoke #1 → Check access | "Access was revoked by the owner" |
| 6 | any | Audit Log | Every action above, with block and tx hash |

Switch accounts in MetaMask between steps. The app logs you out automatically, so just click *Connect Wallet* again.

## IPFS

If an IPFS Kubo node is running (`ipfs daemon`, API on `127.0.0.1:5001`) it is used automatically. Otherwise the backend keeps
encrypted files in `backend/uploads/` with a `mock-` CID so the demo still works. The Dashboard shows which one is in use.
Set `IPFS_MODE` in `backend/.env` to `kubo` or `mock` to force one.

## How a file flows

1. **Login** – `GET /api/auth/nonce/:address` → sign message in MetaMask → `POST /api/auth/verify` → JWT
2. **Upload** – `POST /api/files/upload` (multipart `file`) → backend encrypts, adds to IPFS, stores the key → returns `cid`, `contentHash`
3. **Register on-chain** – user calls `uploadFile(cid, name, contentHash, role, department, organization)` from MetaMask (empty policy field = any)
4. **Download** – `GET /api/files/:id/download` → backend checks `canAccess` on-chain, fetches from IPFS, decrypts, verifies hash
5. **Manage** – owner calls `grantAccess`, `revokeAccess`, `updatePolicy`, `setFileActive` from MetaMask
6. **Request** – `requestAccess(fileId)` records the attempt (granted or denied) on-chain

Other endpoints: `GET /api/files/mine`, `/api/files/shared`, `/api/files/:id`, `/api/access/:id/check` (decision + reason), `/api/access/audit`, `/api/access/user/:address`, `/api/health`.

**Design note:** file keys are held by the backend (wrapped with `MASTER_KEY`), so the backend is trusted to release a file only
after the on-chain check. Revocation stops future downloads but cannot erase copies already downloaded.
