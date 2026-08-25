"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import type { ContractClient } from "@debateai/contract";
import { AuthShell } from "@/components/AuthShell";
import { contractClient } from "@/lib/api";

const HOME_PATH = "/";

function failureMessage(failure: unknown, fallback: string): string {
  return failure instanceof Error && failure.message.trim().length > 0
    ? failure.message
    : fallback;
}

type LoginClient = Pick<ContractClient, "beginLogin" | "completeLogin">;

function navigateHome(): void {
  window.location.assign(HOME_PATH);
}

export function LoginFlow({
  client = contractClient,
  onAuthenticated = navigateHome
}: Readonly<{
  client?: LoginClient;
  onAuthenticated?: () => void;
}>) {
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [replacementRecoveryCode, setReplacementRecoveryCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitCredentials(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const result = await client.beginLogin(
        String(data.get("email") ?? "").trim(),
        String(data.get("password") ?? "")
      );
      setChallengeToken(result.challenge_token);
    } catch (failure) {
      setError(failureMessage(failure, "Sign-in could not be completed."));
    } finally {
      setBusy(false);
    }
  }

  async function submitMfa(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (challengeToken === null) return;
    const code = String(new FormData(event.currentTarget).get("code") ?? "").trim();
    setBusy(true);
    setError(null);
    try {
      const result = await client.completeLogin(challengeToken, code);
      setChallengeToken(null);
      if (result.replacement_recovery_code !== undefined) {
        setReplacementRecoveryCode(result.replacement_recovery_code);
        return;
      }
      onAuthenticated();
    } catch (failure) {
      setError(failureMessage(failure, "Authenticator verification could not be completed."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Back to the graph."
      description="Sessions follow a fixed security policy. Every sign-in continues with your authenticator or a recovery code."
      footer={replacementRecoveryCode === null ? (
        <p>No account yet? <Link href="/sign-up">Create one</Link></p>
      ) : null}
    >
      {error ? <div className="authAlert" role="alert">{error}</div> : null}

      {replacementRecoveryCode !== null ? (
        <section className="authSuccessWarning" role="alert" aria-labelledby="replacement-code-title">
          <p className="authNoticeKicker">Signed in securely</p>
          <h2 id="replacement-code-title">Record your replacement recovery code</h2>
          <p>Your used recovery code has been replaced. This is the only time this new code will be shown.</p>
          <code className="authRecoveryCode">{replacementRecoveryCode}</code>
          <button
            className="authPrimary"
            type="button"
            onClick={() => {
              setReplacementRecoveryCode(null);
              onAuthenticated();
            }}
          >
            I saved it — continue
          </button>
        </section>
      ) : challengeToken === null ? (
        <form className="authForm" aria-busy={busy} onSubmit={submitCredentials}>
          <div className="authField"><label htmlFor="login-email">Email</label>
            <input id="login-email" name="email" type="email" autoComplete="username" placeholder="you@institution.edu" required autoFocus disabled={busy} />
          </div>
          <div className="authField"><label htmlFor="login-password">Password</label>
            <input id="login-password" name="password" type="password" autoComplete="current-password" required disabled={busy} />
          </div>
          <button className="authPrimary" type="submit" disabled={busy}>
            {busy ? "Checking…" : "Continue"}
          </button>
        </form>
      ) : (
        <form className="authForm" aria-busy={busy} onSubmit={submitMfa}>
          <div className="authPhase" role="status">Password accepted. Complete the required second step to open your session.</div>
          <div className="authField">
            <label htmlFor="login-code">Authenticator or recovery code</label>
            <input id="login-code" name="code" type="text" autoComplete="one-time-code" spellCheck={false} required autoFocus disabled={busy} />
          </div>
          <button className="authPrimary" type="submit" disabled={busy}>
            {busy ? "Verifying…" : "Log in"}
          </button>
          <button className="authTextButton" type="button" disabled={busy} onClick={() => {
            setChallengeToken(null);
            setError(null);
          }}>
            Use a different email
          </button>
        </form>
      )}
    </AuthShell>
  );
}
