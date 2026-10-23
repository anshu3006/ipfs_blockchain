// ConnectWallet component
// Login: connect MetaMask -> sign one-time message -> backend verifies signature -> JWT.
import { useState } from "react";
import { api } from "../services/api";
import { contractInfo, readableError } from "../services/blockchain";
import { connectWallet, hasWallet } from "../utils/wallet";
import Notice from "./Notice";

const STEPS = ["Connect wallet", "Sign message", "Verify signature"];

export default function ConnectWallet({ onLogin }) {
  const [step, setStep] = useState(-1);
  const [error, setError] = useState(null);

  async function login() {
    setError(null);
    try {
      setStep(0);
      const { signer, address } = await connectWallet(contractInfo?.chainId);
      setStep(1);
      const { message } = await api.nonce(address);
      const signature = await signer.signMessage(message);
      setStep(2);
      const res = await api.verify(address, signature);
      onLogin({ signer, token: res.token, address: res.address, isAdmin: res.isAdmin, attributes: res.attributes });
    } catch (err) {
      setError(readableError(err));
      setStep(-1);
    }
  }

  const busy = step >= 0;

  return (
    <div className="connect">
      <ol className="steps">
        {STEPS.map((label, i) => (
          <li key={label} className={i < step ? "step-done" : i === step ? "step-current" : ""}>
            {label}
          </li>
        ))}
      </ol>
      <button className="btn btn-primary btn-lg" onClick={login} disabled={busy}>
        {busy ? "Waiting for MetaMask…" : "Connect Wallet"}
      </button>
      {!hasWallet() && (
        <Notice notice={{ type: "error", text: "MetaMask not detected. Install the MetaMask extension and reload." }} />
      )}
      <Notice notice={error && { type: "error", text: error }} onClose={() => setError(null)} />
    </div>
  );
}
