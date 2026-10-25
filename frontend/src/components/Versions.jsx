// Versions component: a file's on-chain version history, key rotation and new content versions.
import { useCallback, useEffect, useRef, useState } from "react";
import { api, saveBlob } from "../services/api";
import { rotateKey, uploadNewVersion } from "../services/versions";
import { formatDate } from "../utils/time";
import { shortAddress } from "../utils/wallet";
import Notice from "./Notice";

const REASON_LABEL = {
  Initial: "First upload",
  Revocation: "Key rotated after revoke",
  KeyCompromise: "Key rotated (compromise)",
  ContentUpdate: "New content",
};

function shortCid(cid) {
  return cid.startsWith("mock-") ? `${cid.slice(0, 13)}…` : `${cid.slice(0, 10)}…${cid.slice(-6)}`;
}

/**
 * @param isOwner  owner gets rotate / upload / download-old actions; a delegate sees the history only
 * @param refresh  bump to reload (e.g. after a revoke + rotate elsewhere in the panel)
 */
export default function Versions({ file, isOwner, refresh = 0, onChanged }) {
  const [versions, setVersions] = useState(null);
  const [busy, setBusy] = useState(null);
  const [notice, setNotice] = useState(null);
  const inputRef = useRef(null);

  const load = useCallback(() => {
    api.versions(file.id).then(setVersions).catch((err) => setNotice({ type: "error", text: err.message }));
  }, [file.id]);

  useEffect(load, [load, refresh]);

  async function run(label, fn) {
    setBusy(label);
    setNotice(null);
    try {
      setNotice({ type: "success", text: await fn() });
      load();
      onChanged?.();
    } catch (err) {
      setNotice({ type: "error", text: err.message });
    } finally {
      setBusy(null);
    }
  }

  const rotate = () =>
    run("rotate", async () => {
      const r = await rotateKey(file.id, { reason: "KeyCompromise" });
      return `Key rotated: new CID ${shortCid(r.newCid)}. Old key ${r.keyDestroyed ? "destroyed" : "was already gone"}${r.unpinned ? ", old copy unpinned" : ""}.`;
    });

  const upload = (f) =>
    run("upload", async () => {
      await uploadNewVersion(file.id, f);
      if (inputRef.current) inputRef.current.value = "";
      return `New version uploaded from ${f.name}`;
    });

  const downloadOld = (v) =>
    run(`dl-${v.version}`, async () => {
      const { blob, name } = await api.downloadVersion(file.id, v.version);
      saveBlob(blob, name);
      return `Downloaded version ${v.version} · integrity verified against its on-chain hash`;
    });

  return (
    <section>
      <h4>Versions &amp; encryption key</h4>
      <p className="hint">
        Every version is recorded on the blockchain. Rotating the key re-encrypts the file under a new key, uploads it as
        a new IPFS version and destroys the old key, so old encrypted copies can never be decrypted again.
      </p>

      {isOwner && (
        <div className="btn-row">
          <button className="btn btn-danger" disabled={!!busy} onClick={rotate}>
            {busy === "rotate" ? "Rotating… confirm in MetaMask" : "Rotate key now (key compromised)"}
          </button>
          <label className={`btn ${busy ? "btn-disabled" : ""}`}>
            <input
              ref={inputRef}
              type="file"
              hidden
              disabled={!!busy}
              onChange={(e) => e.target.files[0] && upload(e.target.files[0])}
            />
            {busy === "upload" ? "Uploading… confirm in MetaMask" : "Upload new version"}
          </label>
        </div>
      )}

      {versions && (
        <ol className="versions">
          {[...versions].reverse().map((v) => (
            <li key={v.version} className={v.current ? "version-current" : ""}>
              <div className="version-head">
                <strong>v{v.version}</strong>
                <span className={`badge ${v.reason === "ContentUpdate" || v.reason === "Initial" ? "" : "badge-warn"}`}>
                  {REASON_LABEL[v.reason] || v.reason}
                </span>
                {v.current ? (
                  <span className="badge badge-ok">Current</span>
                ) : v.keyAvailable ? (
                  <span className="badge">Key kept</span>
                ) : (
                  <span className="badge badge-off">Key destroyed</span>
                )}
                {isOwner && !v.current && v.keyAvailable && (
                  <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => downloadOld(v)}>
                    Download v{v.version}
                  </button>
                )}
              </div>
              <div className="version-meta">
                <span className="mono" title={v.cid}>CID {shortCid(v.cid)}</span>
                <span className="mono" title={v.contentHash}>hash {v.contentHash.slice(0, 10)}…</span>
                <span className="muted">
                  {formatDate(v.createdAt)} · by <span className="mono" title={v.by}>{shortAddress(v.by)}</span>
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}

      <Notice notice={notice} onClose={() => setNotice(null)} />
    </section>
  );
}
