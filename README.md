# Secure IPFS Storage

IPFS-based blockchain file sharing with wallet authentication and attribute-based access control (ABAC).

- `blockchain/` – `FileStorage.sol` smart contract (users + attributes, file records, policy, grant/revoke, audit events), tests, deploy script
- `backend/` – Express API: wallet sign-in (JWT), AES-256-GCM encryption, IPFS upload/download, on-chain access checks
- `frontend/` – React (Vite) app: login, dashboard, upload, my files, shared with me, audit log, admin

## First-time setup

Needs Node.js 18+ (22 recommended) and the MetaMask browser extension.

In the project root (`mini/`):

```bash
npm run setup   # installs all three parts and creates backend/.env with random secrets
```

## Run

In the project root:

```bash
npm start
```

This starts the local blockchain, deploys the contract, and runs the backend (http://localhost:5000) and frontend
(http://localhost:5173) together. Ctrl+C stops everything. Every start is a fresh chain, so see the MetaMask note below.

### Or run each part in its own terminal

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

**Block every 2 seconds.** `npx hardhat node` (and therefore `npm start`) is configured to mine a block every 2 seconds
in addition to one per transaction (`blockchain/hardhat.config.js`). Expiry of delegations and temporary grants is checked
against `block.timestamp`; without interval mining the idle local chain would keep an old timestamp and expired rights
would still look active. Real networks produce a block about every 12 seconds, so this matches their behaviour.
Unit tests (`npm test`) keep plain automine.

**Red `eth_call … unrecognized-selector … reverted` lines in the chain output are harmless.** They are read-only probes
MetaMask sends to check whether the contract is a token (`decimals()`, `symbol()`, …); `FileStorage` is not, so they
revert. They are not transactions and cost no gas.

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
| 5 | #0 | My Files → Manage → revoke #1 → Check access | "Access was revoked" |
| 6 | #0 | My Files → Manage → Delegates: delegate to #1 for 7 days | #1 listed with its end date |
| 7 | #1 (delegate) | Delegated to Me → Manage → grant #2 for 1 hour | #2 can now download; check says "granted by delegate" |
| 8 | #1 | Try to grant its own address | Refused: "Delegates cannot grant themselves access" |
| 9 | #0 | Delegates → Remove #1 → Check access for #2 | **ACCESS DENIED** – the delegate's grant ended with the delegation |
| 10 | #0 | My Files → Manage → tick "also rotate the key" → revoke #1 | New version in the Versions list; the previous version shows "Key destroyed" |
| 11 | #0 | Upload new version, then Rotate key now | v3 "New content", v4 "Key rotated (compromise)"; v2 still downloadable by the owner |
| 12 | any | Audit Log | Every action above, with block and tx hash |

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
5. **Manage** – owner calls `grantAccess` / `grantTemporaryAccess`, `revokeAccess`, `updatePolicy`, `setFileActive` from MetaMask
6. **Delegate** – owner calls `delegateManagement(fileId, delegate, expiresAt)`; see below
7. **Request** – `requestAccess(fileId)` records the attempt (granted or denied) on-chain

## Delegation with limits

An owner can let another registered user (for example a TA) manage access to one file for a limited time.

- **A delegate can** grant access (permanent or for a set time) and revoke access for other users, until the delegation ends.
- **A delegate cannot** change the policy, deactivate the file, delegate further, grant itself access, or undo a revocation the owner made.
- **Grants a delegate makes** never outlive the delegation. They stop when it expires, or straight away if the owner removes the delegate.
- **Owner grants** are not affected by delegations ending.

Contract functions: `delegateManagement`, `revokeDelegation`, `isDelegate`, `getDelegates`, `getManagedFiles`,
`grantTemporaryAccess`, `hasActiveGrant`. Events: `ManagementDelegated`, `DelegationRevoked`; `AccessGranted` and
`AccessRevoked` record who acted (`by`) and the grant's expiry.

## Key rotation and versioning

Every file keeps an on-chain **version history** (CID, content hash, reason, who, when). On **My Files → Manage**:

- **Revoke + rotate key** (tick the box under Revoke): revokes the user and re-encrypts the file under a new key, in one transaction. Delegates can do this too.
- **Rotate key now (key compromised)**: owner re-keys the file without revoking anyone.
- **Upload new version**: owner replaces the content; earlier versions stay in the history and the owner can still download them.

A rotation runs in three steps, so a rejected MetaMask transaction never breaks the file:

1. `POST /api/files/:id/rotate/prepare` – backend decrypts the current version, encrypts it under a **new random key**, adds it to IPFS (new CID) and stores the new key. The old key is still kept.
2. MetaMask: `rotateKey(fileId, newCid, reason)` or `revokeAndRotate(fileId, user, newCid)` makes the new CID current. The content hash stays the same.
3. `POST /api/files/:id/rotate/commit` – only once the chain shows the old CID was replaced by a rotation, the backend **destroys the old key** and unpins the old CID (**crypto-shredding**: old copies can never be decrypted again).

New content: `POST /api/files/:id/versions` then `addVersion(fileId, cid, contentHash)`. History: `GET /api/files/:id/versions`; old version: `GET /api/files/:id/versions/:n/download` (owner only; 410 if its key was destroyed).
Events: `KeyRotated`, `VersionAdded`.

Other endpoints: `GET /api/files/managed` (files delegated to you), `/api/files/:id/delegates`, `/api/files/mine`, `/api/files/shared`, `/api/files/:id`, `/api/access/:id/check` (decision + reason), `/api/access/audit`, `/api/access/user/:address`, `/api/health`.

**Design note:** file keys are held by the backend (wrapped with `MASTER_KEY`), so the backend is trusted to release a file only
after the on-chain check. Revocation stops future downloads but cannot erase copies already downloaded.
