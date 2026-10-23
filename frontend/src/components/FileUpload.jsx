// FileUpload component
// 1) backend encrypts + adds to IPFS  2) user registers CID + policy on-chain from MetaMask.
import { useRef, useState } from "react";
import { chain } from "../services/blockchain";
import { uploadToIpfs, isMockCid } from "../services/ipfs";
import { PolicyFields } from "./AccessPolicy";
import Notice from "./Notice";

const EMPTY_POLICY = { role: "", department: "", organization: "" };

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function FileUpload({ defaultPolicy, onUploaded }) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [policy, setPolicy] = useState({ ...EMPTY_POLICY, ...defaultPolicy });
  const [stage, setStage] = useState(null); // "ipfs" | "chain"
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [dragging, setDragging] = useState(false);

  function pick(f) {
    if (!f) return;
    setFile(f);
    setResult(null);
    setError(null);
  }

  async function submit(e) {
    e.preventDefault();
    if (!file) return;
    setError(null);
    setResult(null);
    try {
      setStage("ipfs");
      const stored = await uploadToIpfs(file);
      setStage("chain");
      const { fileId, txHash } = await chain.uploadFile(stored.cid, stored.name, stored.contentHash, policy);
      setResult({ ...stored, fileId, txHash });
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      onUploaded?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setStage(null);
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <label
        className={`dropzone ${dragging ? "dropzone-active" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          pick(e.dataTransfer.files[0]);
        }}
      >
        <input ref={inputRef} type="file" hidden onChange={(e) => pick(e.target.files[0])} />
        {file ? (
          <>
            <strong>{file.name}</strong>
            <span className="muted">{formatSize(file.size)} · click to change</span>
          </>
        ) : (
          <>
            <strong>Drop a file here or click to choose</strong>
            <span className="muted">Up to 50 MB. It is encrypted (AES-256) before it reaches IPFS.</span>
          </>
        )}
      </label>

      <h4>Who can access it?</h4>
      <PolicyFields policy={policy} onChange={setPolicy} />

      <ol className="steps steps-inline">
        <li className={stage === "ipfs" ? "step-current" : stage === "chain" || result ? "step-done" : ""}>Encrypt &amp; store on IPFS</li>
        <li className={stage === "chain" ? "step-current" : result ? "step-done" : ""}>Record on blockchain (MetaMask)</li>
      </ol>

      <button className="btn btn-primary" disabled={!file || !!stage}>
        {stage === "ipfs" ? "Encrypting & uploading…" : stage === "chain" ? "Confirm in MetaMask…" : "Upload file"}
      </button>

      <Notice notice={error && { type: "error", text: error }} onClose={() => setError(null)} />

      {result && (
        <div className="result">
          <div className="result-title">✓ File #{result.fileId} uploaded and registered on-chain</div>
          <dl>
            <dt>CID</dt>
            <dd className="mono">{result.cid}{isMockCid(result.cid) && <span className="badge">local store</span>}</dd>
            <dt>SHA-256</dt>
            <dd className="mono">{result.contentHash}</dd>
            <dt>Transaction</dt>
            <dd className="mono">{result.txHash}</dd>
          </dl>
        </div>
      )}
    </form>
  );
}
