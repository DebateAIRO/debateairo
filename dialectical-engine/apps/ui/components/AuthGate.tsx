"use client";

import { FormEvent, useEffect, useState } from "react";
import { COOKIE_SESSION_MARKER, contractClient, validateSession } from "@/lib/api";

const SESSION_MARKER = COOKIE_SESSION_MARKER;

export function AuthGate({ children }: { children: (sessionMarker: string) => React.ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [recoveryReplacement, setRecoveryReplacement] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void validateSession().then(
      () => { if (active) setAuthenticated(true); },
      () => { if (active) setAuthenticated(false); }
    ).finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, []);

  async function submitCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSubmitting(true);
    setError(null);
    try {
      const result = await contractClient.beginLogin(
        String(data.get("email") ?? ""),
        String(data.get("password") ?? "")
      );
      setChallengeToken(result.challenge_token);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Sign-in failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (challengeToken === null) return;
    const code = String(new FormData(event.currentTarget).get("code") ?? "");
    setSubmitting(true);
    setError(null);
    try {
      const result = await contractClient.completeLogin(challengeToken, code);
      setRecoveryReplacement(result.replacement_recovery_code ?? null);
      setAuthenticated(true);
      setChallengeToken(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "MFA verification failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (checking) {
    return <div className="screen scroll"><div className="screenInner narrow"><p className="muted">Checking session…</p></div></div>;
  }
  if (authenticated) {
    return <>{recoveryReplacement === null ? null : (
      <div className="screenInner narrow" role="status">
        <div className="error">Your used recovery code was replaced. Record this once: {recoveryReplacement}</div>
      </div>
    )}{children(SESSION_MARKER)}</>;
  }

  return (
    <div className="screen scroll">
      <div className="screenInner narrow">
        <div className="eyebrow">Authentication</div>
        <h1 className="display sm" style={{ marginTop: 12 }}>Sign in</h1>
        <p className="lede" style={{ marginTop: 8 }}>
          Your password is followed by the mandatory authenticator or recovery-code proof.
        </p>
        {error ? <div className="error" role="alert" style={{ marginTop: 14 }}>{error}</div> : null}
        {challengeToken === null ? (
          <form onSubmit={submitCredentials} style={{ marginTop: 24, maxWidth: 420 }}>
            <div className="fieldGroup"><label htmlFor="email">Email</label>
              <input id="email" name="email" type="email" autoComplete="username" required autoFocus />
            </div>
            <div className="fieldGroup"><label htmlFor="password">Password</label>
              <input id="password" name="password" type="password" autoComplete="current-password" required />
            </div>
            <div className="formActions"><button type="submit" className="startBtn ready" disabled={submitting}>
              {submitting ? "Checking…" : "Continue"} <span aria-hidden>→</span>
            </button></div>
          </form>
        ) : (
          <form onSubmit={submitMfa} style={{ marginTop: 24, maxWidth: 420 }}>
            <div className="fieldGroup"><label htmlFor="mfa-code">Authenticator or recovery code</label>
              <input id="mfa-code" name="code" type="text" autoComplete="one-time-code" required autoFocus />
            </div>
            <div className="formActions"><button type="submit" className="startBtn ready" disabled={submitting}>
              {submitting ? "Verifying…" : "Sign in"} <span aria-hidden>→</span>
            </button></div>
          </form>
        )}
      </div>
    </div>
  );
}
