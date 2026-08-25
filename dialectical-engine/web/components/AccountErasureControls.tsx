"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ContractHttpError, type ContractClient } from "@debateai/contract";
import { contractClient } from "@/lib/api";

const CONFIRMATION = "DELETE MY ACCOUNT";
type ErasureStatus = Awaited<ReturnType<ContractClient["readAccountErasure"]>>;
type AccountErasureClient = Pick<ContractClient,
  "stepUp" | "scheduleAccountErasure" | "readAccountErasure" | "cancelAccountErasure"
>;

function failureMessage(failure: unknown): string {
  if (failure instanceof ContractHttpError
    && failure.serverCode === "ACCOUNT_NOTIFICATION_CHANNEL_REQUIRED") {
    return "Add and verify an email or recovery email before scheduling deletion.";
  }
  if (failure instanceof ContractHttpError && failure.code === "SESSION_REQUIRED") {
    return "Your session expired. Sign in again before changing account deletion.";
  }
  return "Account deletion was not authorized. Recheck your password and authenticator code.";
}

export function AccountErasureControls({ client = contractClient }: {
  readonly client?: AccountErasureClient;
}) {
  const [status, setStatus] = useState<ErasureStatus | null>(null);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const refresh=()=>client.readAccountErasure().then(
      (current) => { if (active) { setStatus(current); setMessage(null); } },
      () => { if (active) setMessage("Account deletion status is unavailable."); }
    );
    void refresh();
    const timer=window.setInterval(()=>{ void refresh(); },5_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [client]);

  async function schedule(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (confirmation !== CONFIRMATION || busy) return;
    setBusy(true); setMessage(null);
    try {
      const steppedUp = await client.stepUp(password, code, { action: "DELETE_ACCOUNT" });
      const grant = steppedUp.step_up_grant;
      if (grant === undefined || grant.action !== "DELETE_ACCOUNT") {
        throw new Error("DELETE_ACCOUNT_GRANT_MISSING");
      }
      const scheduled = await client.scheduleAccountErasure(grant.token);
      setStatus(scheduled); setPassword(""); setCode(""); setConfirmation("");
      setMessage("Account deletion scheduled. Notifications will be sent to your bound email channels.");
    } catch (failure) {
      setMessage(failureMessage(failure));
    } finally { setBusy(false); }
  }

  async function cancel(): Promise<void> {
    if (busy) return;
    setBusy(true); setMessage(null);
    try {
      const current=status !== null && status.status !== "NONE" ? status : null;
      if (current===null || current.status==="PROCESSING") return;
      await client.cancelAccountErasure(current.cancellation_ref);
      setStatus({ status: "NONE" });
      setMessage("Account deletion cancelled. A notification will be sent to each bound email channel.");
    } catch {
      setMessage("Account deletion could not be cancelled. Refresh the status before trying again.");
    } finally { setBusy(false); }
  }

  const scheduled = status !== null && status.status !== "NONE" ? status : null;
  return <section className="card" aria-labelledby="account-deletion-heading" style={{ marginTop: 24 }}>
    <h2 id="account-deletion-heading">Delete account</h2>
    <p>Deletion begins after seven full days. You can cancel before it begins. Schedule, cancellation, and completion notices are sent to every bound email or recovery email; at least one verified channel is required.</p>
    <p className="muted">Encrypted private content becomes permanently unreadable when its keys are destroyed. Current public snapshots remain public under a retired pseudonym, and downloaded, quoted, cached, indexed, or provider-retained copies may persist. Claimed legacy plaintext is reported as a retained residual, not as fully cleaned content.</p>
    {status === null ? <p>Checking account deletion status…</p> : null}
    {scheduled !== null ? <div><p role="status">Status: <strong>{scheduled.status}</strong>. Scheduled deletion time: {new Date(scheduled.execute_at).toLocaleString()}.</p>{scheduled.status === "PROCESSING" ? <p className="muted">Irreversible deletion is processing. Scheduling and cancellation are no longer available.</p> : <button type="button" className="button" disabled={busy} onClick={() => { void cancel(); }}>{busy ? "Cancelling…" : "Cancel account deletion"}</button>}</div> : status !== null ?
      <form onSubmit={(event) => void schedule(event)}>
        <label>Account password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
        <label>Authenticator code<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" value={code} onChange={(event) => setCode(event.target.value)} required /></label>
        <label>Type {CONFIRMATION}<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" spellCheck={false} required /></label>
        <button type="submit" className="button" disabled={busy || confirmation !== CONFIRMATION}>{busy ? "Authorizing…" : "Schedule account deletion"}</button>
      </form> : null}
    {message ? <p role="status">{message}</p> : null}
  </section>;
}
