"use client";

import { useEffect, useState, type FormEvent } from "react";
import { COOKIE_SESSION_MARKER, contractClient } from "@/lib/api";
import type { Session } from "@/lib/types";
import { ContractHttpError } from "@debateai/contract";
import { SessionControls } from "@/components/SessionControls";

export default function SettingsPage() {
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [replacement, setReplacement] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void contractClient.readSession(COOKIE_SESSION_MARKER).then((currentSession) => {
      if (active) setSession(currentSession);
    }).catch(() => {
      // An absent/expired cookie leaves the sign-in form visible. The session
      // controls render only after cookie-native authentication succeeds.
    });
    return () => { active = false; };
  }, []);

  async function begin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const result = await contractClient.beginLogin(
        String(data.get("email") ?? ""), String(data.get("password") ?? "")
      );
      setChallengeToken(result.challenge_token);
      setError(null);
    } catch (failure) {
      setError(failure instanceof ContractHttpError ? failure.code : "NETWORK_FAILURE");
    }
  }

  async function finish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (challengeToken === null) return;
    try {
      const result = await contractClient.completeLogin(
        challengeToken, String(new FormData(event.currentTarget).get("code") ?? "")
      );
      setSession(result.session);
      setReplacement(result.replacement_recovery_code ?? null);
      setChallengeToken(null);
      setError(null);
    } catch (failure) {
      setError(failure instanceof ContractHttpError ? failure.code : "NETWORK_FAILURE");
    }
  }

  return <main className="screen scroll"><div className="screenInner">
    <div className="eyebrow">Identity</div><h1 className="display">Your asker scope</h1>
    <p className="lede">Sessions use server-set HttpOnly cookies and mandatory MFA. Browser scripts never receive the session credential.</p>
    {challengeToken === null && session === null ? (
      <form onSubmit={begin} className="card" style={{ display: "flex", gap: 12, marginTop: 24 }}>
        <input name="email" type="email" autoComplete="username" required aria-label="Email" />
        <input name="password" type="password" autoComplete="current-password" required aria-label="Password" />
        <button className="button primary">Continue</button>
      </form>
    ) : challengeToken !== null ? (
      <form onSubmit={finish} className="card" style={{ display: "flex", gap: 12, marginTop: 24 }}>
        <input name="code" autoComplete="one-time-code" required aria-label="Authenticator or recovery code" />
        <button className="button primary">Sign in</button>
      </form>
    ) : null}
    {error ? <div className="error" role="alert">{error}</div> : null}
    {replacement ? <div className="error" role="status">Record your replacement recovery code once: {replacement}</div> : null}
    {session ? <dl className="card"><dt>Asker</dt><dd>{session.asker_id}</dd><dt>Scope</dt><dd>{session.caller_scope}</dd><dt>Identity model</dt><dd>Server session</dd></dl> : null}
    {session ? <SessionControls onSessionEnded={() => {
      setSession(null);
      setError(null);
    }} /> : null}
  </div></main>;
}
