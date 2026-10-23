// SharedFiles page: files other users' policies allow you to open
import { useEffect, useState } from "react";
import { api, saveBlob } from "../services/api";
import FileList from "../components/FileList";
import AccessRequest from "../components/AccessRequest";
import Notice from "../components/Notice";

export default function SharedFiles({ session }) {
  const [files, setFiles] = useState(null);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    api.sharedFiles().then(setFiles).catch((err) => setNotice({ type: "error", text: err.message }));
  }, []);

  async function download(file) {
    try {
      const { blob, name, verified } = await api.download(file.id);
      saveBlob(blob, name);
      setNotice({ type: "success", text: `Downloaded ${name}${verified ? " · integrity verified against on-chain hash" : ""}` });
    } catch (err) {
      setNotice({ type: "error", text: err.message });
    }
  }

  return (
    <div className="page">
      <h2>Shared with me</h2>
      <p className="lead">Files whose access policy matches your attributes, or that an owner granted to you.</p>
      <Notice notice={notice} onClose={() => setNotice(null)} />

      {files === null ? (
        <p className="muted">Loading…</p>
      ) : (
        <FileList
          files={files}
          showOwner
          empty="No files are shared with you yet."
          actions={(f) => <button className="btn btn-sm" onClick={() => download(f)}>Download</button>}
        />
      )}

      <h3>Request a file by ID</h3>
      <AccessRequest address={session.address} />
    </div>
  );
}
