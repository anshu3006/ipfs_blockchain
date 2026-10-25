// FileList component
import { useState } from "react";
import { isMockCid } from "../services/ipfs";
import { shortAddress } from "../utils/wallet";

export function formatPolicy(policy) {
  const parts = [
    policy.role && `Role = ${policy.role}`,
    policy.department && `Dept = ${policy.department}`,
    policy.organization && `Org = ${policy.organization}`,
  ].filter(Boolean);
  return parts.length ? parts : ["Any registered user"];
}

function Cid({ cid }) {
  const [copied, setCopied] = useState(false);
  const label = isMockCid(cid) ? `${cid.slice(0, 13)}…` : `${cid.slice(0, 10)}…${cid.slice(-6)}`;
  return (
    <button
      className="cid"
      title={`${cid}\n(click to copy)`}
      onClick={() => {
        navigator.clipboard?.writeText(cid);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
    >
      {copied ? "Copied" : label}
    </button>
  );
}

/**
 * @param files   file records from the backend
 * @param actions (file) => ReactNode rendered in the last column
 * @param showOwner show the owner column (for files shared with you)
 */
export default function FileList({ files, actions, showOwner = false, empty = "No files yet." }) {
  if (!files.length) return <p className="empty">{empty}</p>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            {showOwner && <th>Owner</th>}
            <th>CID</th>
            <th>Access policy</th>
            <th>Status</th>
            <th>Uploaded</th>
            {actions && <th aria-label="Actions" />}
          </tr>
        </thead>
        <tbody>
          {files.map((f) => (
            <tr key={f.id}>
              <td className="mono">#{f.id}</td>
              <td className="file-name">
                {f.name}
                {f.version > 1 && <span className="badge" title={`Version ${f.version}`}>v{f.version}</span>}
              </td>
              {showOwner && <td className="mono" title={f.owner}>{shortAddress(f.owner)}</td>}
              <td><Cid cid={f.cid} /></td>
              <td>
                <div className="chips">
                  {formatPolicy(f.policy).map((p) => (
                    <span key={p} className="chip">{p}</span>
                  ))}
                </div>
              </td>
              <td>
                <span className={`badge ${f.active ? "badge-ok" : "badge-off"}`}>{f.active ? "Active" : "Inactive"}</span>
              </td>
              <td className="muted">{new Date(f.uploadedAt).toLocaleString()}</td>
              {actions && <td className="row-actions">{actions(f)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
