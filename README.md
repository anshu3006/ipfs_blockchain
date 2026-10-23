# Secure IPFS Storage

IPFS-based blockchain file sharing with wallet authentication and attribute-based access control (ABAC).

- `blockchain/` – `FileStorage.sol` smart contract (users + attributes, file records, policy, grant/revoke, audit events), tests, deploy script
- `backend/` – Express API: wallet sign-in (JWT), AES-256-GCM encryption, IPFS upload/download, on-chain access checks
- `frontend/` – React app (to do)

## Run the backend (3 terminals)

```bash
# 1. Local blockchain (keep running)
cd blockchain
npm install
npx hardhat node

# 2. Deploy the contract (writes backend/config/contract.json and frontend/src/contract.json)
cd blockchain
npm run deploy

# 3. API server
cd backend
npm install
npm run setup      # creates .env with random secrets (once)
npm start          # http://localhost:5000
```

Run the contract tests with `cd blockchain && npm test`.

IPFS: if an IPFS Kubo node is running on `127.0.0.1:5001` it is used automatically; otherwise files are kept in `backend/uploads/` with a `mock-` CID so the demo still works (`IPFS_MODE` in `.env`).

After restarting `npx hardhat node` the chain is empty again, so run `npm run deploy` again.

## How a file flows

1. **Login** – `GET /api/auth/nonce/:address` → sign message in MetaMask → `POST /api/auth/verify` → JWT
2. **Upload** – `POST /api/files/upload` (multipart `file`) → backend encrypts, adds to IPFS, stores the key → returns `cid`, `contentHash`
3. **Register on-chain** – user calls `uploadFile(cid, name, contentHash, role, department, organization)` from MetaMask (empty policy field = any)
4. **Download** – `GET /api/files/:id/download` → backend checks `canAccess` on-chain, fetches from IPFS, decrypts, verifies hash
5. **Manage** – owner calls `grantAccess`, `revokeAccess`, `updatePolicy`, `setFileActive` from MetaMask

Other endpoints: `GET /api/files/mine`, `/api/files/shared`, `/api/files/:id`, `/api/access/:id/check` (decision + reason), `/api/access/audit`, `/api/access/user/:address`, `/api/health`.

The admin (the deploying account, Hardhat account #0) registers users with `registerUser(address, role, department, organization)`.

**Note:** file keys are held by the backend (wrapped with `MASTER_KEY`), so the backend is trusted to release a file only after the on-chain check. Revocation stops future downloads but cannot erase copies already downloaded.
