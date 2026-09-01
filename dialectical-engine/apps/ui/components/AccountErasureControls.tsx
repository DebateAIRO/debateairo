"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  ContractHttpError,
  type ContractClient
} from "@debateai/contract";
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

export function AccountErasureControls({
  client = contractClient
}: { readonly client?: AccountErasureClient }) {
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
    setBusy(true);
    setMessage(null);
    try {
      const steppedUp = await client.stepUp(password, code, { action: "DELETE_ACCOUNT" });
      const grant = steppedUp.step_up_grant;
      if (grant === undefined || grant.action !== "DELETE_ACCOUNT") {
        throw new Error("DELETE_ACCOUNT_GRANT_MISSING");
      }
      const scheduled = await client.scheduleAccountErasure(grant.token);
      setStatus(scheduled);
      setPassword("");
      setCode("");
      setConfirmation("");
      setMessage("Account deletion scheduled. Notifications will be sent to your bound email channels.");
    } catch (failure) {
      setMessage(failureMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  async function cancel(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const current=status !== null && status.status !== "NONE" ? status : null;
      if (current===null || current.status==="PROCESSING") return;
      await client.cancelAccountErasure(current.cancellation_ref);
      setStatus({ status: "NONE" });
      setMessage("Account deletion cancelled. A notification will be sent to each bound email channel.");
    } catch {
      setMessage("Account deletion could not be cancelled. Refresh the status before trying again.");
    } finally {
      setBusy(false);
    }
  }

  const scheduled = status !== null && status.status !== "NONE" ? status : null;

  return (
    <section className="setCard setCardDanger" aria-labelledby="account-deletion-heading">
      <h2 className="setCardTitle" id="account-deletion-heading">Delete account</h2>
      <p className="setCardHint">
        Deletion begins after seven full days. You can cancel before it begins. Schedule, cancellation, and completion
        notices are sent to every bound email or recovery email; at least one verified channel is required.
      </p>
      <p className="setCardNote">
        Encrypted private content becomes permanently unreadable when its keys are destroyed. Current public snapshots
        remain public under a retired pseudonym, and downloaded, quoted, cached, indexed, or provider-retained copies
        may persist. Claimed legacy plaintext is reported as a retained residual, not as fully cleaned content.
      </p>
      {status === null ? <p className="setStatus">Checking account deletion status…</p> : null}
      {scheduled !== null ? (
        <div>
          <p className="setStatus" role="status">
            Status: <strong>{scheduled.status}</strong>. Scheduled deletion time:{" "}
            {new Date(scheduled.execute_at).toLocaleString()}.
          </p>
          {scheduled.status === "PROCESSING" ? (
            <p className="setCardNote">
              Irreversible deletion is processing. Scheduling and cancellation are no longer available.
            </p>
          ) : (
            <div className="setCardRow">
              <button type="button" className="setBtn" disabled={busy} onClick={() => { void cancel(); }}>
                {busy ? "Cancelling…" : "Cancel account deletion"}
              </button>
            </div>
          )}
        </div>
      ) : status !== null ? (
        <form onSubmit={(event) => void schedule(event)}>
          <div className="setCardRow">
            <div className="setField">
              <label htmlFor="account-deletion-password">Account password</label>
              <input
                id="account-deletion-password"
                type="password"
                autoComplete="current-password"
                placeholder="Password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            <div className="setField">
              <label htmlFor="account-deletion-code">Authenticator code</label>
              <input
                id="account-deletion-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                placeholder="Authenticator code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                required
              />
            </div>
            <div className="setField setFieldDanger">
              <label htmlFor="account-deletion-confirmation">Type {CONFIRMATION}</label>
              <input
                id="account-deletion-confirmation"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                placeholder={`Type ${CONFIRMATION}`}
                required
              />
            </div>
            <button
              type="submit"
              className="setBtn setBtnDanger"
              disabled={busy || confirmation !== CONFIRMATION}
            >
              {busy ? "Authorizing…" : "Schedule deletion"}
            </button>
          </div>
        </form>
      ) : null}
      {message ? <p className="setStatus" role="status">{message}</p> : null}
    </section>
  );
}
