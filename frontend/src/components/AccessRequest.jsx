// AccessRequest component
// Request a file by ID: the attempt is recorded on-chain (audit log), then the
// backend explains the decision and, if granted, returns the decrypted file.
import { useState } from "react";
import { api, saveBlob } from "../services/api";
import { chain } from "../services/blockchain";
import Notice from "./Notice";

export default function AccessRequest({ address }) {
  const [fileId, setFileId] = useState("");
  const [busy, setBusy] = useState(false);
  const [decision, setDecision] = useState(null);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    const id = Number(fileId);
    if (!Number.isInteger(id) || id < 1) return setError("Enter a file ID like 1");
    setBusy(true);
    setError(null);
    setDecision(null);
    try {
      await chain.requestAccess(id);
      const check = await api.checkAccess(id, address);
      setDecision(check);
      if (check.granted) {
        const { blob, name } = await api.download(id);
        saveBlob(blob, name);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card request" onSubmit={submit}>
      <div className="request-row">
        <label className="field">
          <span>File ID</span>
          <input value={fileId} onChange={(e) => setFileId(e.target.value)} placeholder="e.g. 1" inputMode="numeric" />
        </label>
        <button className="btn btn-primary" disabled={busy || !fileId}>
          {busy ? "Checking…" : "Request access"}
        </button>
      </div>
      <p className="hint">Your request is recorded on the blockchain whether it is granted or denied.</p>
      {decision && (
        <div className={`decision ${decision.granted ? "decision-ok" : "decision-no"}`}>
          <strong>{decision.granted ? "ACCESS GRANTED · download started" : "ACCESS DENIED"}</strong>
          <span>{decision.reason}</span>
        </div>
      )}
      <Notice notice={error && { type: "error", text: error }} onClose={() => setError(null)} />
    </form>
  );
}
