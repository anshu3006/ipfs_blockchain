// AccessPolicy component
// Controls for one file. The owner can edit the ABAC policy, grant / revoke a wallet,
// delegate management, (de)activate and test access. A delegate (asDelegate) only
// gets grant / revoke / check, limited by its delegation.
import { useCallback, useEffect, useState } from "react";
import { ethers } from "ethers";
import { api } from "../services/api";
import { chain } from "../services/blockchain";
import { DURATIONS, expiryFromNow, formatExpiry } from "../utils/time";
import { shortAddress } from "../utils/wallet";
import { rotateKey } from "../services/versions";
import Notice from "./Notice";
import Versions from "./Versions";

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

function requireAddress(value) {
  if (!ethers.isAddress(value.trim())) throw new Error("Enter a valid wallet address (0x…)");
  return value.trim();
}

/** Owner only: who may manage this file, until when. */
function Delegates({ file, run, busy }) {
  const [list, setList] = useState(null);
  const [address, setAddress] = useState("");
  const [duration, setDuration] = useState(DURATIONS[3].seconds);

  const load = useCallback(() => {
    api.delegates(file.id).then(setList).catch(() => setList([]));
  }, [file.id]);

  useEffect(load, [load]);

  return (
    <section>
      <h4>Delegates</h4>
      <p className="hint">
        A delegate (for example a TA) can grant and revoke access to this file until the delegation ends. They cannot
        change the policy, deactivate the file or open it themselves. Their grants stop when the delegation ends.
      </p>
      <div className="grid-delegate">
        <label className="field">
          <span>Delegate wallet</span>
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="0x…" spellCheck={false} />
        </label>
        <label className="field">
          <span>For</span>
          <select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
            {DURATIONS.map((d) => <option key={d.seconds} value={d.seconds}>{d.label}</option>)}
          </select>
        </label>
      </div>
      <button
        className="btn btn-primary"
        disabled={!!busy}
        onClick={() =>
          run(
            "delegate",
            async () => {
              await chain.delegateManagement(file.id, requireAddress(address), expiryFromNow(duration));
              setAddress("");
              load();
            },
            "Management delegated"
          )
        }
      >
        {busy === "delegate" ? "Confirm in MetaMask…" : "Delegate"}
      </button>

      {list?.length > 0 && (
        <ul className="delegate-list">
          {list.map((d) => (
            <li key={d.address}>
              <span className="mono" title={d.address}>{shortAddress(d.address)}</span>
              <span className="muted">ends {formatExpiry(d.expiresAt)}</span>
              <button
                className="btn btn-danger btn-sm"
                disabled={!!busy}
                onClick={() =>
                  run(
                    `undelegate-${d.address}`,
                    async () => {
                      await chain.revokeDelegation(file.id, d.address);
                      load();
                    },
                    "Delegation removed; grants this delegate made no longer work"
                  )
                }
              >
                {busy === `undelegate-${d.address}` ? "Confirm…" : "Remove"}
              </button>
            </li>
          ))}
        </ul>
      )}
      {list?.length === 0 && <p className="muted">No active delegates.</p>}
    </section>
  );
}

export default function AccessPolicy({ file, onChanged, asDelegate = false, delegationExpiresAt = null }) {
  const [policy, setPolicy] = useState(file.policy);
  const [target, setTarget] = useState("");
  const [grantFor, setGrantFor] = useState(0); // seconds; 0 = no expiry
  const [busy, setBusy] = useState(null);
  const [notice, setNotice] = useState(null);
  const [check, setCheck] = useState(null);
  const [rotateOnRevoke, setRotateOnRevoke] = useState(false);
  const [versionsTick, setVersionsTick] = useState(0);

  async function run(label, fn, success) {
    setBusy(label);
    setNotice(null);
    try {
      const result = await fn();
      setNotice({ type: "success", text: typeof success === "function" ? success(result) : success });
      setVersionsTick((t) => t + 1);
      onChanged?.();
    } catch (err) {
      setNotice({ type: "error", text: err.message });
    } finally {
      setBusy(null);
    }
  }

  const policyChanged = ["role", "department", "organization"].some((k) => policy[k] !== file.policy[k]);
  const grantExpiry = grantFor ? expiryFromNow(grantFor) : null;

  return (
    <div className="manage">
      {asDelegate && (
        <Notice
          notice={{
            type: "info",
            text: `You manage this file as a delegate. Your delegation ends ${formatExpiry(delegationExpiresAt)}; any access you grant ends then too.`,
          }}
        />
      )}

      {!asDelegate && (
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
      )}

      <section>
        <h4>Individual users</h4>
        <p className="hint">Grant overrides the policy for one wallet. Revoke blocks a wallet even if its attributes match.</p>
        <div className="grid-delegate">
          <label className="field">
            <span>Wallet address</span>
            <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="0x…" spellCheck={false} />
          </label>
          <label className="field">
            <span>Grant for</span>
            <select value={grantFor} onChange={(e) => setGrantFor(Number(e.target.value))}>
              <option value={0}>{asDelegate ? "Until my delegation ends" : "No expiry"}</option>
              {DURATIONS.map((d) => <option key={d.seconds} value={d.seconds}>{d.label}</option>)}
            </select>
          </label>
        </div>
        <div className="btn-row">
          <button
            className="btn"
            disabled={!!busy}
            onClick={() =>
              run(
                "grant",
                () => chain.grantAccess(file.id, requireAddress(target), grantExpiry),
                grantExpiry ? `Access granted, ends ${formatExpiry(grantExpiry)}` : "Access granted"
              )
            }
          >
            {busy === "grant" ? "Confirm…" : "Grant"}
          </button>
          <button
            className="btn btn-danger"
            disabled={!!busy}
            onClick={() =>
              rotateOnRevoke
                ? run(
                    "revoke",
                    () => rotateKey(file.id, { reason: "Revocation", revokeUser: requireAddress(target) }),
                    (r) => `Access revoked and key rotated: the old key is ${r.keyDestroyed ? "destroyed" : "gone"}`
                  )
                : run("revoke", () => chain.revokeAccess(file.id, requireAddress(target)), "Access revoked")
            }
          >
            {busy === "revoke" ? "Confirm…" : rotateOnRevoke ? "Revoke + rotate key" : "Revoke"}
          </button>
          <button
            className="btn btn-ghost"
            disabled={!!busy}
            onClick={() =>
              run("check", async () => setCheck(await api.checkAccess(file.id, requireAddress(target))), "Checked against the contract")
            }
          >
            Check access
          </button>
        </div>
        <label className="checkbox">
          <input type="checkbox" checked={rotateOnRevoke} onChange={(e) => setRotateOnRevoke(e.target.checked)} />
          <span>On revoke, also rotate the encryption key (re-encrypt the file and destroy the old key)</span>
        </label>
        {check && (
          <div className={`decision ${check.granted ? "decision-ok" : "decision-no"}`}>
            <strong>{check.granted ? "ACCESS GRANTED" : "ACCESS DENIED"}</strong>
            <span>
              {check.reason}
              {check.grant?.expiresAt && `, ends ${formatExpiry(check.grant.expiresAt)}`}
            </span>
          </div>
        )}
      </section>

      {!asDelegate && <Delegates file={file} run={run} busy={busy} />}

      <Versions file={file} isOwner={!asDelegate} refresh={versionsTick} onChanged={onChanged} />

      {!asDelegate && (
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
      )}

      <Notice notice={notice} onClose={() => setNotice(null)} />
    </div>
  );
}
