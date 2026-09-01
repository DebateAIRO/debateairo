"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import type { ContractClient } from "@debateai/contract";
import { AuthShell } from "@/components/AuthShell";
import { contractClient } from "@/lib/api";

type RegistrationClient = Pick<ContractClient, "register" | "resendVerification">;

type Validity = Readonly<{ state: "idle" | "ok" | "bad"; text: string }>;

/* The document's ✓/✗ rules under the password field (Turn 8 · 8a). */
const PASSWORD_RULES: ReadonlyArray<{ label: string; met: (value: string) => boolean }> = [
  { label: "At least eight characters", met: (value) => value.length >= 8 },
  { label: "One capital letter", met: (value) => /[A-Z]/.test(value) },
  { label: "One number", met: (value) => /[0-9]/.test(value) },
  { label: "One special character", met: (value) => /[^A-Za-z0-9]/.test(value) }
];

// Deliberately permissive: the address is checked for shape, not existence.
const shapedEmail = (value: string) => /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(value);

function emailValidity(value: string, sent: boolean): Validity {
  const trimmed = value.trim();
  if (trimmed.length === 0) return { state: "idle", text: "" };
  if (!shapedEmail(trimmed)) return { state: "bad", text: "✗ That does not look like an email address" };
  return sent
    ? { state: "ok", text: "✓ Valid address · verification link sent — awaiting confirmation" }
    : { state: "ok", text: "✓ Valid address" };
}

function recoveryValidity(value: string, primary: string): Validity {
  const trimmed = value.trim();
  if (trimmed.length === 0) return { state: "idle", text: "" };
  if (!shapedEmail(trimmed)) return { state: "bad", text: "✗ That does not look like an email address" };
  if (trimmed.toLowerCase() === primary.trim().toLowerCase()) {
    return { state: "bad", text: "✗ Must differ from the primary email" };
  }
  return { state: "ok", text: "✓ Valid recovery address" };
}

export function SignUpFlow({
  client = contractClient
}: Readonly<{ client?: RegistrationClient }>) {
  const [email, setEmail] = useState("");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginHref, setLoginHref] = useState("/login");

  useEffect(() => {
    const next = new URLSearchParams(window.location.search).get("next");
    if (next !== null) setLoginHref(`/login?next=${encodeURIComponent(next)}`);
  }, []);

  async function submitRegistration(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const submitted = String(data.get("email") ?? "").trim();
    setBusy(true);
    setError(null);
    try {
      const result = await client.register(
        submitted,
        String(data.get("password") ?? ""),
        String(data.get("recovery-email") ?? "").trim(),
        data.get("adult-affirmed") === "on"
      );
      setSubmittedEmail(submitted);
      setMessage(result.message);
    } catch {
      setError("Account creation could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  async function resendVerification(): Promise<void> {
    if (submittedEmail === null) return;
    setBusy(true);
    setError(null);
    try {
      const result = await client.resendVerification(submittedEmail);
      setMessage(result.message);
    } catch {
      setError("Verification instructions could not be resent.");
    } finally {
      setBusy(false);
    }
  }

  const sent = submittedEmail !== null;
  const emailState = emailValidity(email, sent);
  const recoveryState = recoveryValidity(recoveryEmail, email);

  return (
    <AuthShell
      eyebrow="Create an account"
      title="Put a claim to the bench."
      description="Email verification and authenticator enrolment are required before your account can be used."
      footer={null}
    >
      {error ? <div className="authAlert" role="alert">{error}</div> : null}

      <form className="authForm" data-form="signup" method="post" action="/sign-up" aria-busy={busy} onSubmit={submitRegistration}>
        <div className="authField">
          <label htmlFor="signup-email">Email</label>
          <div className="authEmailRow">
            <input
              id="signup-email"
              name="email"
              type="email"
              autoComplete="section-primary-email email"
              placeholder="you@institution.edu"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoFocus
              disabled={busy || sent}
            />
            {/* Create account is what mails the link; this control resends it,
                so it stays inert until there is something to resend. */}
            <button
              type="button"
              className="authVerifyEmail"
              disabled={busy || !sent}
              title={sent ? "Resend the verification link" : "Create the account to send the verification link"}
              onClick={() => void resendVerification()}
            >
              Verify email
            </button>
          </div>
          <p className="authValidity" data-state={emailState.state}>{emailState.text}</p>
        </div>

        <div className="authField">
          <label htmlFor="signup-recovery-email">Recovery email</label>
          <input
            id="signup-recovery-email"
            name="recovery-email"
            type="email"
            autoComplete="section-recovery-email email"
            aria-describedby="recovery-email-hint"
            value={recoveryEmail}
            onChange={(event) => setRecoveryEmail(event.target.value)}
            required
            disabled={busy || sent}
          />
          <span className="authFieldHint" id="recovery-email-hint">
            Use a different address reserved for account recovery.
          </span>
          <p className="authValidity" data-state={recoveryState.state}>{recoveryState.text}</p>
        </div>

        <div className="authField">
          <label htmlFor="signup-password">Password</label>
          <input
            id="signup-password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            disabled={busy || sent}
          />
          <ul className="authRules" data-stack="true">
            {PASSWORD_RULES.map((rule) => {
              const met = rule.met(password);
              return (
                <li className="authRule" key={rule.label} data-met={password.length === 0 ? undefined : met}>
                  {password.length === 0 ? "·" : met ? "✓" : "✗"} {rule.label}
                </li>
              );
            })}
          </ul>
        </div>

        <label className="authCheck">
          <input name="adult-affirmed" type="checkbox" required disabled={busy || sent} />
          <span>I affirm that I am at least 18 years old.</span>
        </label>

        <button className="authPrimary" type="submit" disabled={busy || sent}>
          {busy ? "Creating…" : "Create account"}
        </button>

        <p className="authPanelFooter">Already have one? <Link href={loginHref}>Log in</Link></p>

        {sent && message !== null ? (
          <p className="authFinePrint" role="status" aria-live="polite">
            {message} The verification page continues into mandatory authenticator setup. No account status is
            revealed here.
          </p>
        ) : null}
      </form>
    </AuthShell>
  );
}
