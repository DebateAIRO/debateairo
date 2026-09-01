"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import type { ContractClient } from "@debateai/contract";
import { AuthShell } from "@/components/AuthShell";
import { contractClient } from "@/lib/api";

type RegistrationClient = Pick<ContractClient, "register" | "resendVerification">;

export function SignUpFlow({
  client = contractClient
}: Readonly<{ client?: RegistrationClient }>) {
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
    const email = String(data.get("email") ?? "").trim();
    setBusy(true);
    setError(null);
    try {
      const result = await client.register(
        email,
        String(data.get("password") ?? ""),
        String(data.get("recovery-email") ?? "").trim(),
        data.get("adult-affirmed") === "on"
      );
      form.reset();
      setSubmittedEmail(email);
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

  return (
    <AuthShell
      eyebrow="Create an account"
      title="Put a claim to the bench."
      description="Email verification and authenticator enrolment are required before your account can be used."
      footer={<p>Already have one? <Link href={loginHref}>Log in</Link></p>}
    >
      {error ? <div className="authAlert" role="alert">{error}</div> : null}

      {submittedEmail !== null && message !== null ? (
        <section className="authCheckEmail" role="status" aria-live="polite">
          <p className="authNoticeKicker">Check your email</p>
          <h2>Continue with the private verification link</h2>
          <p>{message}</p>
          <p className="authFinePrint">
            The verification page continues into mandatory authenticator setup. No account status is revealed here.
          </p>
          <button className="authPrimary" type="button" disabled={busy} onClick={() => void resendVerification()}>
            {busy ? "Sending…" : "Resend instructions"}
          </button>
        </section>
      ) : (
        <form className="authForm" method="post" action="/sign-up" aria-busy={busy} onSubmit={submitRegistration}>
          <div className="authField">
            <label htmlFor="signup-email">Email</label>
            <input id="signup-email" name="email" type="email" autoComplete="section-primary-email email" placeholder="you@institution.edu" required autoFocus disabled={busy} />
          </div>
          <div className="authField">
            <label htmlFor="signup-recovery-email">Recovery email</label>
            <input id="signup-recovery-email" name="recovery-email" type="email" autoComplete="section-recovery-email email" aria-describedby="recovery-email-hint" required disabled={busy} />
            <span className="authFieldHint" id="recovery-email-hint">Use a different address reserved for account recovery.</span>
          </div>
          <div className="authField">
            <label htmlFor="signup-password">Password</label>
            <input id="signup-password" name="password" type="password" autoComplete="new-password" minLength={8} aria-describedby="signup-password-hint" required disabled={busy} />
            <span className="authFieldHint" id="signup-password-hint">At least eight characters.</span>
          </div>
          <label className="authCheck">
            <input name="adult-affirmed" type="checkbox" required disabled={busy} />
            <span>I affirm that I am at least 18 years old.</span>
          </label>
          <button className="authPrimary" type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create account"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
