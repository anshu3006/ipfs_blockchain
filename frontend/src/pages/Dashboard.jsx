// Dashboard page
import { useEffect, useState } from "react";
import { api } from "../services/api";
import Notice from "../components/Notice";

export default function Dashboard({ session, onNavigate }) {
  const [stats, setStats] = useState(null);
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);
  const { attributes } = session;

  useEffect(() => {
    Promise.all([api.myFiles(), api.sharedFiles(), api.audit({ address: session.address }), api.health()])
      .then(([mine, shared, audit, h]) => {
        setStats({ mine: mine.length, shared: shared.length, activity: audit.length });
        setHealth(h);
      })
      .catch((err) => setError(err.message));
  }, [session.address]);

  return (
    <div className="page">
      <h2>Dashboard</h2>
      <Notice notice={error && { type: "error", text: error }} />

      {!attributes.registered && (
        <Notice
          notice={{
            type: "warn",
            text: session.isAdmin
              ? "Your admin wallet has no attributes yet. Register yourself on the Admin page to upload files."
              : `This wallet is not registered yet. Ask the admin to register ${session.address} with your role and department.`,
          }}
        />
      )}

      <div className="grid-2">
        <div className="card">
          <h3>Your identity</h3>
          <dl className="kv">
            <dt>Wallet</dt>
            <dd className="mono">{session.address}</dd>
            <dt>Role</dt>
            <dd>{attributes.role || "—"}</dd>
            <dt>Department</dt>
            <dd>{attributes.department || "—"}</dd>
            <dt>Organization</dt>
            <dd>{attributes.organization || "—"}</dd>
            <dt>Status</dt>
            <dd>
              <span className={`badge ${attributes.registered ? "badge-ok" : "badge-off"}`}>
                {attributes.registered ? "Registered" : "Not registered"}
              </span>
              {session.isAdmin && <span className="badge badge-admin">Admin</span>}
            </dd>
          </dl>
        </div>

        <div className="card">
          <h3>System</h3>
          {health ? (
            <dl className="kv">
              <dt>Blockchain</dt>
              <dd>
                <span className={`badge ${health.blockchain.connected ? "badge-ok" : "badge-off"}`}>
                  {health.blockchain.connected ? `Connected · chain ${health.blockchain.chainId}` : "Disconnected"}
                </span>
              </dd>
              <dt>Contract</dt>
              <dd className="mono">{health.blockchain.contract || "—"}</dd>
              <dt>IPFS</dt>
              <dd>
                <span className={`badge ${health.ipfs.using === "kubo" ? "badge-ok" : "badge-warn"}`}>
                  {health.ipfs.using === "kubo" ? "IPFS node (Kubo)" : "Local fallback store"}
                </span>
              </dd>
            </dl>
          ) : (
            <p className="muted">Loading…</p>
          )}
        </div>
      </div>

      <div className="stats">
        <button className="stat" onClick={() => onNavigate("mine")}>
          <span className="stat-value">{stats?.mine ?? "–"}</span>
          <span className="stat-label">My files</span>
        </button>
        <button className="stat" onClick={() => onNavigate("shared")}>
          <span className="stat-value">{stats?.shared ?? "–"}</span>
          <span className="stat-label">Shared with me</span>
        </button>
        <button className="stat" onClick={() => onNavigate("audit")}>
          <span className="stat-value">{stats?.activity ?? "–"}</span>
          <span className="stat-label">My on-chain events</span>
        </button>
      </div>
    </div>
  );
}
