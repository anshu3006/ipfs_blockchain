// AuditLog page: every FileStorage event, read from the blockchain
import { useCallback, useEffect, useState } from "react";
import { api } from "../services/api";
import Notice from "../components/Notice";
import { shortAddress } from "../utils/wallet";
import { formatDate } from "../utils/time";

const LABELS = {
  UserRegistered: "User registered",
  FileUploaded: "File uploaded",
  PolicyUpdated: "Policy set",
  AccessGranted: "Access granted",
  AccessRevoked: "Access revoked",
  FileStatusChanged: "Status changed",
  AccessRequested: "Access requested",
  AdminTransferred: "Admin transferred",
  ManagementDelegated: "Delegated",
  DelegationRevoked: "Delegation removed",
  KeyRotated: "Key rotated",
  VersionAdded: "New version",
};

const ROTATION_REASON = { Revocation: "after revoke", KeyCompromise: "key compromised" };

const TONE = {
  AccessGranted: "badge-ok",
  AccessRevoked: "badge-off",
  UserRegistered: "badge-admin",
  ManagementDelegated: "badge-warn",
  DelegationRevoked: "badge-off",
  KeyRotated: "badge-warn",
  VersionAdded: "badge-admin",
};

function describe({ event, args }) {
  const who = (a) => <span className="mono" title={a}>{shortAddress(a)}</span>;
  const policy = [args.role, args.department, args.organization].filter(Boolean).join(" / ") || "any registered user";
  switch (event) {
    case "UserRegistered":
      return <>{who(args.user)} as {[args.role, args.department, args.organization].filter(Boolean).join(" / ")}</>;
    case "FileUploaded":
      return <>#{args.fileId} “{args.name}” by {who(args.owner)}</>;
    case "PolicyUpdated":
      return <>#{args.fileId} → {policy}</>;
    case "AccessGranted":
      return (
        <>
          #{args.fileId} for {who(args.user)} by {who(args.by)}
          {args.expiresAt !== null && <span className="muted"> · until {formatDate(args.expiresAt)}</span>}
        </>
      );
    case "AccessRevoked":
      return <>#{args.fileId} for {who(args.user)} by {who(args.by)}</>;
    case "ManagementDelegated":
      return (
        <>
          #{args.fileId} to {who(args.delegate)} by {who(args.owner)}
          <span className="muted"> · until {formatDate(args.expiresAt)}</span>
        </>
      );
    case "DelegationRevoked":
      return <>#{args.fileId} from {who(args.delegate)}</>;
    case "KeyRotated":
      return (
        <>
          #{args.fileId} → v{args.version} by {who(args.by)}
          <span className="muted"> · {ROTATION_REASON[args.reason] || args.reason}, old key destroyed</span>
        </>
      );
    case "VersionAdded":
      return <>#{args.fileId} → v{args.version} by {who(args.by)}</>;
    case "FileStatusChanged":
      return <>#{args.fileId} {args.active ? "activated" : "deactivated"}</>;
    case "AccessRequested":
      return <>#{args.fileId} by {who(args.user)} → <strong>{args.granted ? "granted" : "denied"}</strong></>;
    case "AdminTransferred":
      return <>{who(args.oldAdmin)} → {who(args.newAdmin)}</>;
    default:
      return JSON.stringify(args);
  }
}

export default function AuditLog() {
  const [entries, setEntries] = useState(null);
  const [fileId, setFileId] = useState("");
  const [error, setError] = useState(null);

  const load = useCallback((id) => {
    setEntries(null);
    setError(null);
    api.audit({ fileId: id }).then(setEntries).catch((err) => {
      setError(err.message);
      setEntries([]);
    });
  }, []);

  useEffect(() => load(), [load]);

  return (
    <div className="page">
      <div className="page-head">
        <h2>Audit log</h2>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            load(fileId);
          }}
        >
          <input value={fileId} onChange={(e) => setFileId(e.target.value)} placeholder="Filter by file ID" inputMode="numeric" />
          <button className="btn btn-sm">Filter</button>
          {fileId && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setFileId(""); load(); }}>
              Clear
            </button>
          )}
        </form>
      </div>
      <p className="lead">Read directly from smart-contract events. These records cannot be edited or deleted.</p>
      <Notice notice={error && { type: "error", text: error }} />

      {entries === null ? (
        <p className="muted">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="empty">No events yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Event</th>
                <th>Details</th>
                <th>Block</th>
                <th>Transaction</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={`${e.txHash}-${i}`}>
                  <td className="muted">{new Date(e.timestamp).toLocaleString()}</td>
                  <td>
                    <span className={`badge ${TONE[e.event] || (e.event === "AccessRequested" ? (e.args.granted ? "badge-ok" : "badge-off") : "")}`}>
                      {LABELS[e.event] || e.event}
                    </span>
                  </td>
                  <td>{describe(e)}</td>
                  <td className="mono">{e.blockNumber}</td>
                  <td className="mono" title={e.txHash}>{e.txHash.slice(0, 10)}…</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
