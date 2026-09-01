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

/* The document shows live validity marks under both auth fields (7a, and 8a
   with two rules unmet). These are presentation only — the server remains the
   authority on whether any credential is accepted. */
const PASSWORD_RULES: readonly { readonly label: string; readonly met: (value: string) => boolean }[] = [
  { label: "Eight characters", met: (v) => v.length >= 8 },
  { label: "One capital letter", met: (v) => /[A-Z]/.test(v) },
  { label: "One number", met: (v) => /[0-9]/.test(v) },
  { label: "One special character", met: (v) => /[^A-Za-z0-9]/.test(v) }
];

function emailValidity(value: string): { state: "idle" | "ok" | "bad"; text: string } {
  const trimmed = value.trim();
  if (trimmed.length === 0) return { state: "idle", text: "Use the address this account was verified with." };
  // Deliberately permissive: the address is checked for shape, not existence.
  const shaped = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(trimmed);
  return shaped
    ? { state: "ok", text: "✓ Valid address" }
    : { state: "bad", text: "✗ That does not look like an email address" };
}

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
  const [signUpHref, setSignUpHref] = useState("/sign-up");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");

  useEffect(() => {
    const next = new URLSearchParams(window.location.search).get("next");
    if (next !== null) setSignUpHref(`/sign-up?next=${encodeURIComponent(next)}`);
    return () => setRecoveryAcknowledgementPending(false);
  }, []);

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
  const emailState = emailValidity(email);
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
        <p>No account yet? <Link href={signUpHref}>Create one</Link></p>
      ) : null}
    >
      {error ? <div className="authAlert" role="alert">{error}</div> : null}

      {replacementRecoveryCode !== null ? (
        <section className="authSuccessWarning" role="alert" aria-labelledby="replacement-code-title">
          <span className="authSuccessAccent" aria-hidden />
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
          <div className="authField">
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              name="email"
              type="email"
              autoComplete="username"
              placeholder="you@institution.edu"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-describedby="login-email-validity"
              required
              autoFocus
              disabled={busy}
            />
            <p className="authValidity" id="login-email-validity" data-state={emailState.state}>
              {emailState.text}
            </p>
          </div>
          <div className="authField">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-describedby="login-password-rules"
              required
              disabled={busy}
            />
            <ul className="authRules" id="login-password-rules">
              {PASSWORD_RULES.map((rule) => {
                const met = rule.met(password);
                return (
                  <li
                    className="authRule"
                    key={rule.label}
                    data-met={password.length === 0 ? undefined : String(met)}
                  >
                    {password.length === 0 ? "·" : met ? "✓" : "✗"} {rule.label}
                  </li>
                );
              })}
            </ul>
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
            {verificationMethod === "authenticator" ? (
              /* Six boxes are the document's presentation; the real control is
                 a single input beneath them, so one-time-code autofill, paste
                 and assistive tech all keep working. */
              <div className="authCodeField">
                <input
                  className="authCodeCapture"
                  id="login-code"
                  name="code"
                  type="text"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                  aria-describedby="login-code-hint"
                  aria-label="6-digit authentication code"
                  spellCheck={false}
                  required
                  autoFocus
                  disabled={busy}
                />
                <div className="authCodeBoxes" aria-hidden="true">
                  {[0, 1, 2, 3, 4, 5].map((slot) => (
                    <span
                      className="authCodeBox"
                      key={slot}
                      data-filled={code.length > slot ? "true" : undefined}
                      data-next={code.length === slot ? "true" : undefined}
                    >
                      {code[slot] ?? ""}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <input
                className="authRecoveryInput"
                id="login-code"
                name="code"
                type="text"
                autoComplete="one-time-code"
                inputMode="text"
                placeholder="XXXX-XXXX-XXXX-XXXX"
                aria-describedby="login-code-hint"
                spellCheck={false}
                required
                autoFocus
                disabled={busy}
              />
            )}
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
              setCode("");
              setError(null);
            }}>
              {verificationMethod === "authenticator" ? "Use a recovery code" : "Use an authenticator code"}
            </button>
            <button className="authTextButton authBackButton" type="button" disabled={busy} onClick={() => {
              setChallengeToken(null);
              setVerificationMethod("authenticator");
              setCode("");
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
