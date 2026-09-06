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

/* The id the privacy row's input points at with aria-labelledby: its sentence holds an
   interactive control, so the row cannot be a <label> (see the consent group below). */
const PRIVACY_CONSENT_TEXT_ID = "signup-privacy-consent-text";

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
  /* The two consent boxes stay UNCONTROLLED. These mirrors exist for ONE purpose:
     computing the submit button's `disabled`, so it reflects the boxes live.
     FormData is the truth at submit — see submitRegistration. */
  const [adultAffirmed, setAdultAffirmed] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);

  useEffect(() => {
    const next = new URLSearchParams(window.location.search).get("next");
    if (next !== null) setLoginHref(`/login?next=${encodeURIComponent(next)}`);
  }, []);

  async function submitRegistration(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    /* Defence in depth. A bare `new Event("submit")` bypasses HTML constraint
       validation, so `required` alone gates nothing against a scripted submit.
       These are the two FormData reads, never the mirrors above. */
    if (data.get("adult-affirmed") !== "on" || data.get("privacy-accepted") !== "on") return;
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

        {/* Consent group — design artboard 8a (turn-8a-checkbox-group.html:1-10).
            Row 1 is a <label> wrapping its input, so the square, the text and the row
            all toggle it natively. Row 2 cannot be a <label>: its Privacy Policy
            control is interactive content, which the <label> content model forbids —
            so it is a <div> and the input takes its name from aria-labelledby. */}
        <div className="consentGroup">
          <label className="consentRow">
            <input
              className="consentBox"
              name="adult-affirmed"
              type="checkbox"
              required
              disabled={busy || sent}
              onChange={(event) => setAdultAffirmed(event.currentTarget.checked)}
            />
            <span className="consentText">I am 18 or over.</span>
          </label>
          <div className="consentRow">
            <input
              className="consentBox"
              name="privacy-accepted"
              type="checkbox"
              required
              disabled={busy || sent}
              aria-labelledby={PRIVACY_CONSENT_TEXT_ID}
              /* The SETTLED value, not the in-flight one: a cancelled change never
                 reaches the DOM, so mirroring its `true` would record a state the box
                 never holds. `adult-affirmed`'s handler is the literal form. */
              onChange={(event) =>
                setPrivacyAccepted(
                  event.currentTarget.checked && !event.nativeEvent.defaultPrevented
                )
              }
            />
            <span className="consentText" id={PRIVACY_CONSENT_TEXT_ID}>
              I agree to the{" "}
              <button type="button" className="consentPolicyLink">Privacy Policy</button>
              , including that my debates may be published publicly.
            </span>
          </div>
        </div>

        <button
          className="authPrimary"
          type="submit"
          disabled={busy || sent || !adultAffirmed || !privacyAccepted}
        >
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
