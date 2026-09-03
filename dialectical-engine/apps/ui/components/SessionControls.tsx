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

/* The server stores only a hash of the user agent (binding_context.user_agent_hash),
   so no session row carries a device name. The current session is the exception:
   it is this browser, so its device can be named from the client directly.
   Other sessions have no honest source and stay unnamed. */
type UADataBrand = { readonly brand: string; readonly version: string };
type UAData = { readonly platform?: string; readonly brands?: readonly UADataBrand[] };

function currentDeviceLabel(): string | null {
  if (typeof navigator === "undefined") return null;
  const uaData = (navigator as Navigator & { userAgentData?: UAData }).userAgentData;
  const ua = navigator.userAgent;

  const platform =
    uaData?.platform && uaData.platform.length > 0
      ? uaData.platform
      : /iPhone/.test(ua) ? "iPhone"
      : /iPad/.test(ua) ? "iPad"
      : /Android/.test(ua) ? "Android"
      : /Macintosh|Mac OS X/.test(ua) ? "Mac"
      : /Windows/.test(ua) ? "Windows"
      : /Linux/.test(ua) ? "Linux"
      : null;

  const branded = (uaData?.brands ?? []).find(
    (b) => !/Not.?A.?Brand/i.test(b.brand) && b.brand !== "Chromium"
  );
  const browser =
    branded?.brand
      ?? (/Edg\//.test(ua) ? "Edge"
      : /OPR\//.test(ua) ? "Opera"
      : /Firefox\//.test(ua) ? "Firefox"
      : /Chrome\//.test(ua) ? "Chrome"
      : /Safari\//.test(ua) ? "Safari"
      : null);

  const parts = [platform, browser].filter((p): p is string => p !== null && p.length > 0);
  return parts.length === 0 ? null : parts.join(" · ");
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
  // Read after mount: navigator is absent during SSR, and reading it in render
  // would desynchronise the server and client markup.
  const [deviceLabel, setDeviceLabel] = useState<string | null>(null);
  useEffect(() => { setDeviceLabel(currentDeviceLabel()); }, []);
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

  /* A session id is a uuid — unreadable, and useless for deciding what to
     revoke. Every row therefore leads with something a person can actually
     recognise: the current session names this device, and the others name when
     they were signed in. The id stays on the revoke control's accessible name
     so the action is still unambiguous to assistive tech and to tests. */
  const signedInOn = (iso: string): string =>
    new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

  return (
    <>
      <section aria-labelledby="active-sessions-heading">
        <div className="setSectionHead">
          <h2 className="setSectionTitle" id="active-sessions-heading">Active sessions</h2>
          <p className="setSectionHint">Review devices, revoke a single session, or sign out everywhere.</p>
        </div>
        <div className="setList">
          {loading ? <p className="setStatus">Loading sessions…</p> : null}
          {error ? <div className="setError" role="alert">{error}</div> : null}
          {!loading && sessions.length === 0 ? (
            <p className="setStatus">No active sessions were returned.</p>
          ) : null}
          {sessions.map((session) => (
            <div className="setSessionRow" key={session.session_id}>
              <span className="setDot" data-state={session.current ? "current" : undefined} aria-hidden="true" />
              <div className="setSessionMain">
                <div className="setSessionLine">
                  <span className="setSessionDevice">
                    {session.current
                      ? deviceLabel ?? "Current session"
                      : `Signed in ${signedInOn(session.created_at)}`}
                  </span>
                  <span className="setSessionName">
                    {session.current ? "Current session" : "Other session"}
                  </span>
                </div>
                <p className="setSessionSeen">
                  Last seen {new Date(session.last_seen_at).toLocaleString()}
                </p>
              </div>
              <button
                type="button"
                className="setBtn setBtnRevoke"
                disabled={busy !== null}
                aria-label={`Revoke session ${session.session_id}`}
                onClick={() => { void revoke(session); }}
              >
                Revoke
              </button>
            </div>
          ))}
          <div className="setListActions">
            <button
              type="button"
              className="setBtn setBtnQuiet"
              disabled={busy !== null}
              onClick={() => { void revokeAll(); }}
            >
              Revoke all sessions
            </button>
            <button
              type="button"
              className="setBtn setBtnQuiet"
              disabled={busy !== null}
              onClick={() => { void logout(); }}
            >
              Sign out
            </button>
          </div>
        </div>
      </section>

      <form className="setCard" data-session-step-up="true" onSubmit={stepUp}>
        <h3 className="setCardTitle">Fresh authentication</h3>
        <p className="setCardHint">
          Sensitive actions require re-entering your password and an authenticator code.
        </p>
        <div className="setCardRow">
          <div className="setField">
            <label htmlFor="step-up-password">Password</label>
            <input
              id="step-up-password"
              name="step-up-password"
              type="password"
              autoComplete="current-password"
              placeholder="Password"
              required
            />
          </div>
          <div className="setField">
            <label htmlFor="step-up-code">Authenticator code</label>
            <input
              id="step-up-code"
              name="step-up-code"
              autoComplete="one-time-code"
              placeholder="Authenticator code"
              required
            />
          </div>
          <button type="submit" className="setBtn setBtnPrimary" disabled={busy !== null}>
            Verify
          </button>
        </div>
        {stepUpComplete ? <p className="setStatus" role="status">Fresh authentication complete</p> : null}
      </form>
    </>
  );
}
