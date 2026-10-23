// MyFiles page
import { useCallback, useEffect, useState } from "react";
import { api, saveBlob } from "../services/api";
import FileList from "../components/FileList";
import AccessPolicy from "../components/AccessPolicy";
import Notice from "../components/Notice";

export default function MyFiles({ onNavigate }) {
  const [files, setFiles] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [notice, setNotice] = useState(null);

  const load = useCallback(() => {
    api.myFiles().then(setFiles).catch((err) => setNotice({ type: "error", text: err.message }));
  }, []);

  useEffect(load, [load]);

  async function download(file) {
    try {
      const { blob, name, verified } = await api.download(file.id);
      saveBlob(blob, name);
      setNotice({ type: "success", text: `Downloaded ${name}${verified ? " · integrity verified against on-chain hash" : ""}` });
    } catch (err) {
      setNotice({ type: "error", text: err.message });
    }
  }

  const selected = files?.find((f) => f.id === selectedId);

  return (
    <div className="page">
      <div className="page-head">
        <h2>My files</h2>
        <button className="btn btn-primary" onClick={() => onNavigate("upload")}>Upload file</button>
      </div>
      <Notice notice={notice} onClose={() => setNotice(null)} />

      {files === null ? (
        <p className="muted">Loading…</p>
      ) : (
        <FileList
          files={files}
          empty="You haven't uploaded any files yet."
          actions={(f) => (
            <>
              <button className="btn btn-sm" onClick={() => download(f)}>Download</button>
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
          <AccessPolicy key={`${selected.id}-${JSON.stringify(selected.policy)}-${selected.active}`} file={selected} onChanged={load} />
        </div>
      )}
    </div>
  );
}
