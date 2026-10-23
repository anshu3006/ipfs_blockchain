// AccessPolicy component
// Owner controls for one file: edit ABAC policy, grant / revoke a wallet, (de)activate, test access.
import { useState } from "react";
import { ethers } from "ethers";
import { api } from "../services/api";
import { chain } from "../services/blockchain";
import Notice from "./Notice";

export const ROLES = ["", "Student", "Faculty", "Staff", "Admin"];
export const DEPARTMENTS = ["", "CSE", "ECE", "ISE", "MECH", "CIVIL", "EEE"];

/** Role / department / organization inputs. Empty = any value allowed. */
export function PolicyFields({ policy, onChange, anyLabel = "Any" }) {
  const set = (key) => (e) => onChange({ ...policy, [key]: e.target.value });
  return (
    <div className="grid-3">
      <label className="field">
        <span>Role</span>
        <select value={policy.role} onChange={set("role")}>
          {ROLES.map((r) => <option key={r} value={r}>{r || anyLabel}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Department</span>
        <select value={policy.department} onChange={set("department")}>
          {DEPARTMENTS.map((d) => <option key={d} value={d}>{d || anyLabel}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Organization</span>
        <input value={policy.organization} onChange={set("organization")} placeholder={anyLabel} />
      </label>
    </div>
  );
}

export default function AccessPolicy({ file, onChanged }) {
  const [policy, setPolicy] = useState(file.policy);
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(null);
  const [notice, setNotice] = useState(null);
  const [check, setCheck] = useState(null);

  async function run(label, fn, success) {
    setBusy(label);
    setNotice(null);
    try {
      await fn();
      setNotice({ type: "success", text: success });
      onChanged?.();
    } catch (err) {
      setNotice({ type: "error", text: err.message });
    } finally {
      setBusy(null);
    }
  }

  function requireAddress() {
    if (!ethers.isAddress(target.trim())) throw new Error("Enter a valid wallet address (0x…)");
    return target.trim();
  }

  const policyChanged = ["role", "department", "organization"].some((k) => policy[k] !== file.policy[k]);

  return (
    <div className="manage">
      <section>
        <h4>Access policy</h4>
        <p className="hint">Users whose attributes match every selected field can access this file.</p>
        <PolicyFields policy={policy} onChange={setPolicy} />
        <button
          className="btn btn-primary"
          disabled={!policyChanged || !!busy}
          onClick={() => run("policy", () => chain.updatePolicy(file.id, policy), "Policy updated on-chain")}
        >
          {busy === "policy" ? "Confirm in MetaMask…" : "Save policy"}
        </button>
      </section>

      <section>
        <h4>Individual users</h4>
        <p className="hint">Grant overrides the policy for one wallet. Revoke blocks a wallet even if its attributes match.</p>
        <label className="field">
          <span>Wallet address</span>
          <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="0x…" spellCheck={false} />
        </label>
        <div className="btn-row">
          <button
            className="btn"
            disabled={!!busy}
            onClick={() => run("grant", () => chain.grantAccess(file.id, requireAddress()), "Access granted")}
          >
            {busy === "grant" ? "Confirm…" : "Grant"}
          </button>
          <button
            className="btn btn-danger"
            disabled={!!busy}
            onClick={() => run("revoke", () => chain.revokeAccess(file.id, requireAddress()), "Access revoked")}
          >
            {busy === "revoke" ? "Confirm…" : "Revoke"}
          </button>
          <button
            className="btn btn-ghost"
            disabled={!!busy}
            onClick={() =>
              run("check", async () => setCheck(await api.checkAccess(file.id, requireAddress())), "Checked against the contract")
            }
          >
            Check access
          </button>
        </div>
        {check && (
          <div className={`decision ${check.granted ? "decision-ok" : "decision-no"}`}>
            <strong>{check.granted ? "ACCESS GRANTED" : "ACCESS DENIED"}</strong>
            <span>{check.reason}</span>
          </div>
        )}
      </section>

      <section>
        <h4>File status</h4>
        <p className="hint">An inactive file can only be opened by its owner.</p>
        <button
          className={`btn ${file.active ? "btn-danger" : ""}`}
          disabled={!!busy}
          onClick={() =>
            run("status", () => chain.setFileActive(file.id, !file.active), file.active ? "File deactivated" : "File activated")
          }
        >
          {busy === "status" ? "Confirm in MetaMask…" : file.active ? "Deactivate file" : "Activate file"}
        </button>
      </section>

      <Notice notice={notice} onClose={() => setNotice(null)} />
    </div>
  );
}
