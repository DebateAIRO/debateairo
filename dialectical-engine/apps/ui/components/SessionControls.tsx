"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { ContractClient, SessionSummary } from "@debateai/contract";
import { contractClient } from "../lib/api.js";

export type SessionControlClient = Pick<ContractClient,
  "listSessions" | "logout" | "revokeSession" | "revokeAllSessions" | "stepUp"
>;

export interface SessionControlsProps {
  readonly client?: SessionControlClient;
  readonly onSessionEnded?: () => void;
}

function describeFailure(failure: unknown): string {
  return failure instanceof Error ? failure.message : "Session operation failed";
}

export function SessionControls({
  client = contractClient,
  onSessionEnded
}: SessionControlsProps) {
  const [sessions, setSessions] = useState<readonly SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stepUpComplete, setStepUpComplete] = useState(false);
  const finishSession = () => {
    if (onSessionEnded !== undefined) onSessionEnded();
    else if (typeof window !== "undefined") window.location.assign("/settings");
  };

  async function refresh(): Promise<void> {
    const result = await client.listSessions();
    setSessions(result.sessions);
  }

  useEffect(() => {
    let active = true;
    void client.listSessions().then(
      (result) => { if (active) { setSessions(result.sessions); setError(null); } },
      (failure) => { if (active) setError(describeFailure(failure)); }
    ).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [client]);

  async function revoke(session: SessionSummary): Promise<void> {
    setBusy(session.session_id);
    setError(null);
    try {
      await client.revokeSession(session.session_id);
      if (session.current) finishSession();
      else await refresh();
    } catch (failure) {
      setError(describeFailure(failure));
    } finally {
      setBusy(null);
    }
  }

  async function revokeAll(): Promise<void> {
    setBusy("all");
    setError(null);
    try {
      await client.revokeAllSessions();
      setSessions([]);
      finishSession();
    } catch (failure) {
      setError(describeFailure(failure));
    } finally {
      setBusy(null);
    }
  }

  async function logout(): Promise<void> {
    setBusy("logout");
    setError(null);
    try {
      await client.logout();
      setSessions([]);
      finishSession();
    } catch (failure) {
      setError(describeFailure(failure));
    } finally {
      setBusy(null);
    }
  }

  async function stepUp(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy("step-up");
    setError(null);
    setStepUpComplete(false);
    try {
      await client.stepUp(
        String(data.get("step-up-password") ?? ""),
        String(data.get("step-up-code") ?? "")
      );
      setStepUpComplete(true);
      form.reset();
      await refresh();
    } catch (failure) {
      setError(describeFailure(failure));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card" aria-labelledby="active-sessions-heading" style={{ marginTop: 24 }}>
      <h2 id="active-sessions-heading">Active sessions</h2>
      <p className="muted">Review devices, revoke a single session, or sign out everywhere.</p>
      {loading ? <p>Loading sessions…</p> : null}
      {error ? <div className="error" role="alert">{error}</div> : null}
      {!loading && sessions.length === 0 ? <p>No active sessions were returned.</p> : null}
      {sessions.map((session) => (
        <div className="modelRow" key={session.session_id}>
          <div className="modelName">
            <strong>{session.current ? "Current session" : "Other session"}</strong>
            <div>{session.session_id}</div>
            <small>Last seen {new Date(session.last_seen_at).toLocaleString()}</small>
          </div>
          <button
            type="button"
            className="btn"
            disabled={busy !== null}
            onClick={() => { void revoke(session); }}
          >
            Revoke {session.session_id}
          </button>
        </div>
      ))}
      <div className="formActions">
        <button type="button" className="btn" disabled={busy !== null} onClick={() => { void revokeAll(); }}>
          Revoke all sessions
        </button>
        <button type="button" className="btn" disabled={busy !== null} onClick={() => { void logout(); }}>
          Sign out
        </button>
      </div>
      <form data-session-step-up="true" onSubmit={stepUp} style={{ marginTop: 24 }}>
        <h3>Fresh authentication</h3>
        <div className="fieldGroup">
          <label htmlFor="step-up-password">Password</label>
          <input id="step-up-password" name="step-up-password" type="password" autoComplete="current-password" required />
        </div>
        <div className="fieldGroup">
          <label htmlFor="step-up-code">Authenticator code</label>
          <input id="step-up-code" name="step-up-code" autoComplete="one-time-code" required />
        </div>
        <button type="submit" className="btn" disabled={busy !== null}>Verify fresh authentication</button>
        {stepUpComplete ? <p role="status">Fresh authentication complete</p> : null}
      </form>
    </section>
  );
}
