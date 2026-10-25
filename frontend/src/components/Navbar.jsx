// Navbar component
import { shortAddress } from "../utils/wallet";

export const PAGES = [
  { id: "dashboard", label: "Dashboard" },
  { id: "upload", label: "Upload" },
  { id: "mine", label: "My Files" },
  { id: "shared", label: "Shared With Me" },
  { id: "delegated", label: "Delegated to Me" },
  { id: "audit", label: "Audit Log" },
  { id: "admin", label: "Admin", adminOnly: true },
];

export default function Navbar({ session, page, onNavigate, onLogout }) {
  return (
    <header className="navbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">⬢</span>
        Secure IPFS Storage
      </div>
      <nav className="tabs">
        {PAGES.filter((p) => !p.adminOnly || session.isAdmin).map((p) => (
          <button
            key={p.id}
            className={`tab ${page === p.id ? "tab-active" : ""}`}
            onClick={() => onNavigate(p.id)}
          >
            {p.label}
          </button>
        ))}
      </nav>
      <div className="account">
        <span className="address" title={session.address}>
          {shortAddress(session.address)}
        </span>
        {session.isAdmin && <span className="badge badge-admin">Admin</span>}
        <button className="btn btn-ghost btn-sm" onClick={onLogout}>
          Log out
        </button>
      </div>
    </header>
  );
}
