"use client";

import { FormEvent, useEffect, useState } from "react";
import { clearStoredToken, getStoredToken, setStoredToken, validateUserToken } from "@/lib/api";
import {
  shouldClearStoredTokenAfterUnlockFailure,
  tokenUnlockFailureMessage
} from "@/lib/v3/tokenUnlock";

export function AuthGate({ children }: { children: (token: string) => React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadStoredToken() {
      const stored = getStoredToken();
      if (!stored) {
        return;
      }
      if (active) setChecking(true);
      try {
        await validateUserToken(stored);
        if (active) setToken(stored);
      } catch (error) {
        if (shouldClearStoredTokenAfterUnlockFailure(error)) clearStoredToken();
        if (active) setError(tokenUnlockFailureMessage(error));
      } finally {
        if (active) setChecking(false);
      }
    }
    loadStoredToken();
    return () => {
      active = false;
    };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = draft.trim();
    if (!value) return;
    setSubmitting(true);
    setError(null);
    try {
      await validateUserToken(value);
      setStoredToken(value);
      setToken(value);
    } catch (error) {
      if (shouldClearStoredTokenAfterUnlockFailure(error)) clearStoredToken();
      // DR-115: only say "rejected" when the coordinator actually rejected it.
      setError(tokenUnlockFailureMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  if (checking) {
    return (
      <div className="screen scroll">
        <div className="screenInner narrow">
          <p className="muted">Checking token…</p>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="screen scroll">
        <div className="screenInner narrow">
          <div className="eyebrow">Authentication</div>
          <h1 className="display sm" style={{ marginTop: 12 }}>
            Enter your user token
          </h1>
          <p className="lede" style={{ marginTop: 8 }}>
            Paste the user token the coordinator printed on first boot to unlock creating and editing debates.
          </p>
          <form onSubmit={submit} style={{ marginTop: 24, maxWidth: 420 }}>
            {error ? (
              <div className="error" style={{ marginBottom: 14 }}>
                {error}
              </div>
            ) : null}
            <div className="fieldGroup" style={{ marginTop: 0 }}>
              <label htmlFor="token">User token</label>
              <input
                id="token"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                type="password"
                autoComplete="off"
                autoFocus
              />
            </div>
            <div className="formActions">
              <button type="submit" className={`startBtn${draft.trim() ? " ready" : ""}`} disabled={submitting}>
                {submitting ? "Checking…" : "Unlock"} <span aria-hidden>→</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return <>{children(token)}</>;
}
