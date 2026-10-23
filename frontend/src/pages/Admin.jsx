// Admin page: register wallets and their attributes
import { useState } from "react";
import { ethers } from "ethers";
import { api } from "../services/api";
import { chain } from "../services/blockchain";
import { DEPARTMENTS, ROLES } from "../components/AccessPolicy";
import Notice from "../components/Notice";

export default function Admin({ session, onProfileChanged }) {
  const [form, setForm] = useState({ address: "", role: "Student", department: "CSE", organization: "SIT" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [lookup, setLookup] = useState("");
  const [found, setFound] = useState(null);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function register(e) {
    e.preventDefault();
    const address = form.address.trim();
    if (!ethers.isAddress(address)) return setNotice({ type: "error", text: "Enter a valid wallet address (0x…)" });
    setBusy(true);
    setNotice(null);
    try {
      await chain.registerUser(address, form.role, form.department, form.organization);
      setNotice({ type: "success", text: `Registered ${address} as ${form.role} / ${form.department} / ${form.organization}` });
      if (address.toLowerCase() === session.address.toLowerCase()) onProfileChanged();
      setForm({ ...form, address: "" });
    } catch (err) {
      setNotice({ type: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function find(e) {
    e.preventDefault();
    setFound(null);
    if (!ethers.isAddress(lookup.trim())) return setFound({ error: "Enter a valid wallet address" });
    try {
      setFound(await api.user(lookup.trim()));
    } catch (err) {
      setFound({ error: err.message });
    }
  }

  return (
    <div className="page">
      <h2>Admin · user registry</h2>
      <p className="lead">Attributes stored here are what the smart contract checks against each file's access policy.</p>

      <div className="grid-2">
        <form className="card" onSubmit={register}>
          <h3>Register or update a user</h3>
          <label className="field">
            <span>Wallet address</span>
            <div className="input-with-btn">
              <input value={form.address} onChange={set("address")} placeholder="0x…" spellCheck={false} />
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm({ ...form, address: session.address })}>
                Me
              </button>
            </div>
          </label>
          <div className="grid-3">
            <label className="field">
              <span>Role</span>
              <select value={form.role} onChange={set("role")}>
                {ROLES.filter(Boolean).map((r) => <option key={r}>{r}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Department</span>
              <select value={form.department} onChange={set("department")}>
                {DEPARTMENTS.filter(Boolean).map((d) => <option key={d}>{d}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Organization</span>
              <input value={form.organization} onChange={set("organization")} />
            </label>
          </div>
          <button className="btn btn-primary" disabled={busy}>{busy ? "Confirm in MetaMask…" : "Register user"}</button>
          <Notice notice={notice} onClose={() => setNotice(null)} />
        </form>

        <form className="card" onSubmit={find}>
          <h3>Look up a user</h3>
          <label className="field">
            <span>Wallet address</span>
            <input value={lookup} onChange={(e) => setLookup(e.target.value)} placeholder="0x…" spellCheck={false} />
          </label>
          <button className="btn">Look up</button>
          {found?.error && <Notice notice={{ type: "error", text: found.error }} />}
          {found && !found.error && (
            <dl className="kv">
              <dt>Status</dt>
              <dd>
                <span className={`badge ${found.registered ? "badge-ok" : "badge-off"}`}>
                  {found.registered ? "Registered" : "Not registered"}
                </span>
              </dd>
              <dt>Role</dt>
              <dd>{found.role || "—"}</dd>
              <dt>Department</dt>
              <dd>{found.department || "—"}</dd>
              <dt>Organization</dt>
              <dd>{found.organization || "—"}</dd>
            </dl>
          )}
        </form>
      </div>
    </div>
  );
}
