// DelegatedFiles page: files other owners have delegated to you to manage
import { useCallback, useEffect, useState } from "react";
import { api } from "../services/api";
import FileList from "../components/FileList";
import AccessPolicy from "../components/AccessPolicy";
import Notice from "../components/Notice";
import { formatExpiry } from "../utils/time";

export default function DelegatedFiles() {
  const [files, setFiles] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    api.managedFiles().then(setFiles).catch((err) => setError(err.message));
  }, []);

  useEffect(load, [load]);

  const selected = files?.find((f) => f.id === selectedId);

  return (
    <div className="page">
      <h2>Delegated to me</h2>
      <p className="lead">
        Owners have asked you to manage access to these files for a limited time. You can grant and revoke access for
        other users; you cannot change the policy or open the file yourself unless it's shared with you.
      </p>
      <Notice notice={error && { type: "error", text: error }} onClose={() => setError(null)} />

      {files === null ? (
        <p className="muted">Loading…</p>
      ) : (
        <FileList
          files={files}
          showOwner
          empty="No files are delegated to you right now."
          actions={(f) => (
            <>
              <span className="badge badge-warn" title={f.delegationExpiresAt}>
                ends {formatExpiry(f.delegationExpiresAt).replace(/ \(.*\)$/, "")}
              </span>
              <button
                className={`btn btn-sm ${selectedId === f.id ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setSelectedId(selectedId === f.id ? null : f.id)}
              >
                Manage
              </button>
            </>
          )}
        />
      )}

      {selected && (
        <div className="card">
          <div className="page-head">
            <h3>Manage #{selected.id} · {selected.name}</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => setSelectedId(null)}>Close</button>
          </div>
          <AccessPolicy key={selected.id} file={selected} asDelegate delegationExpiresAt={selected.delegationExpiresAt} onChanged={load} />
        </div>
      )}
    </div>
  );
}
