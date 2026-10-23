// Login page
import ConnectWallet from "../components/ConnectWallet";
import Notice from "../components/Notice";
import { contractInfo } from "../services/blockchain";

const FEATURES = [
  ["Wallet sign-in", "No passwords. You prove you own your wallet by signing a message."],
  ["Encrypted on IPFS", "Files are AES-256 encrypted and stored by content ID (CID)."],
  ["On-chain access rules", "Role, department and organization decide who can open a file."],
  ["Audit trail", "Uploads, grants, revocations and requests are recorded on the blockchain."],
];

export default function Login({ onLogin }) {
  return (
    <main className="login">
      <section className="login-hero">
        <span className="brand-mark brand-mark-lg" aria-hidden="true">⬢</span>
        <h1>Secure IPFS Storage</h1>
        <p className="lead">
          Decentralized file sharing with blockchain authentication and attribute-based access control.
        </p>
        {!contractInfo && (
          <Notice
            notice={{ type: "error", text: "Contract not deployed yet. Run `npm run deploy` in blockchain/, then reload." }}
          />
        )}
        <ConnectWallet onLogin={onLogin} />
      </section>
      <ul className="features">
        {FEATURES.map(([title, text]) => (
          <li key={title}>
            <strong>{title}</strong>
            <span>{text}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
