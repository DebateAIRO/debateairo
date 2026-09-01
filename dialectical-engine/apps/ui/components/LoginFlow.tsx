"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ContractHttpError, type ContractClient } from "@debateai/contract";
import { AuthShell } from "@/components/AuthShell";
import { contractClient } from "@/lib/api";
import { setRecoveryAcknowledgementPending } from "@/lib/authNavigationGuard";
import { safeReturnPath } from "@/lib/returnPath";

type LoginClient = Pick<ContractClient, "beginLogin" | "completeLogin">;
type VerificationMethod = "authenticator" | "recovery";

function navigateHome(): void {
  const next = new URLSearchParams(window.location.search).get("next");
  window.location.assign(safeReturnPath(next));
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
  const [verificationMethod, setVerificationMethod] = useState<VerificationMethod>("authenticator");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => setRecoveryAcknowledgementPending(false), []);

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
      setVerificationMethod("authenticator");
      setChallengeToken(result.challenge_token);
    } catch {
      setError("Sign-in could not be completed.");
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
        setRecoveryAcknowledgementPending(true);
        setReplacementRecoveryCode(result.replacement_recovery_code);
        return;
      }
      onAuthenticated();
    } catch (failure) {
      if (failure instanceof ContractHttpError && failure.status === 429) {
        setError("Too many verification attempts. Wait five minutes, then start sign-in again.");
      } else if (failure instanceof ContractHttpError && failure.status === 401
        && verificationMethod === "recovery") {
        setError("That recovery code was not accepted. Start sign-in again if the challenge is more than five minutes old, or use another unused code from this account.");
      } else if (failure instanceof ContractHttpError && failure.status === 401) {
        setError("That authentication code was not accepted. Enter the current 6-digit code, or use an unused recovery code.");
      } else {
        setError("Authenticator verification could not be completed.");
      }
    } finally {
      setBusy(false);
    }
  }

  const verificationPending = challengeToken !== null;
  const shellCopy = replacementRecoveryCode !== null
    ? {
        eyebrow: "Recovery access",
        title: "Save your new recovery code.",
        description: "Your session is ready, but this replacement code must be recorded before you continue."
      }
    : verificationPending
      ? verificationMethod === "authenticator"
        ? {
            eyebrow: "Two-step verification",
            title: "Enter your authentication code.",
            description: "Open Google Authenticator or another authenticator app and enter the current 6-digit code."
          }
        : {
            eyebrow: "Two-step verification",
            title: "Enter a recovery code.",
            description: "Use one of the recovery codes you saved when you secured this account. Each code works once."
          }
      : {
          eyebrow: "Welcome back",
          title: "Back to the graph.",
          description: "Sessions follow a fixed security policy. Every sign-in continues with your authenticator or a recovery code."
        };

  return (
    <AuthShell
      eyebrow={shellCopy.eyebrow}
      title={shellCopy.title}
      description={shellCopy.description}
      footer={replacementRecoveryCode === null && !verificationPending ? (
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
              setRecoveryAcknowledgementPending(false);
              setReplacementRecoveryCode(null);
              onAuthenticated();
            }}
          >
            I saved it — continue
          </button>
        </section>
      ) : challengeToken === null ? (
        <form className="authForm" method="post" action="/login" aria-busy={busy} onSubmit={submitCredentials}>
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
        <form className="authForm authMfaForm" method="post" action="/login" aria-busy={busy} onSubmit={submitMfa}>
          <p className="srOnly" role="status">Password accepted. Complete the required second step to open your session.</p>
          <div className="authField">
            <label htmlFor="login-code">
              {verificationMethod === "authenticator" ? "6-digit authentication code" : "Recovery code"}
            </label>
            <input
              className={verificationMethod === "authenticator" ? "authCodeInput" : "authRecoveryInput"}
              id="login-code"
              name="code"
              type="text"
              autoComplete="one-time-code"
              inputMode={verificationMethod === "authenticator" ? "numeric" : "text"}
              pattern={verificationMethod === "authenticator" ? "[0-9]{6}" : undefined}
              maxLength={verificationMethod === "authenticator" ? 6 : undefined}
              placeholder={verificationMethod === "authenticator" ? "000000" : "XXXX-XXXX-XXXX-XXXX"}
              aria-describedby="login-code-hint"
              spellCheck={false}
              required
              autoFocus
              disabled={busy}
            />
            <p className="authFieldHint" id="login-code-hint">
              {verificationMethod === "authenticator"
                ? "Open Google Authenticator, 1Password, or your preferred authenticator."
                : "Enter one unused code exactly as you saved it."}
            </p>
          </div>
          <button className="authPrimary" type="submit" disabled={busy}>
            {busy ? "Verifying…" : "Continue"}
          </button>
          <div className="authMfaAlternatives">
            <button className="authTextButton" type="button" disabled={busy} onClick={() => {
              setVerificationMethod((current) => current === "authenticator" ? "recovery" : "authenticator");
              setError(null);
            }}>
              {verificationMethod === "authenticator" ? "Use a recovery code" : "Use an authenticator code"}
            </button>
            <button className="authTextButton authBackButton" type="button" disabled={busy} onClick={() => {
              setChallengeToken(null);
              setVerificationMethod("authenticator");
              setError(null);
            }}>
              Back to sign in
            </button>
          </div>
        </form>
      )}
    </AuthShell>
  );
}
