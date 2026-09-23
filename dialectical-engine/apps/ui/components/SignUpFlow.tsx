"use client";

import Link from "next/link";
import { FormEvent, MouseEvent as ReactMouseEvent, useEffect, useRef, useState } from "react";
import type { ContractClient } from "@debateai/contract";
import { AuthShell } from "@/components/AuthShell";
import { PrivacyPolicyModal } from "@/components/consent/PrivacyPolicyModal";
import { contractClient } from "@/lib/api";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import authEnglish from "@/messages/en/auth.json";

type RegistrationClient = Pick<ContractClient, "register" | "resendVerification">;
type SuccessMessageKey = "auth.signUp.registrationSent" | "auth.signUp.resendSent";

type Validity = Readonly<{ state: "idle" | "ok" | "bad"; text: string }>;

function successMessage(catalog: MessageCatalog, key: SuccessMessageKey): string {
  return key === "auth.signUp.registrationSent"
    ? t(catalog, "auth.signUp.registrationSent")
    : t(catalog, "auth.signUp.resendSent");
}

/* The document's ✓/✗ rules under the password field (Turn 8 · 8a). */
const passwordRules = (catalog: MessageCatalog) => [
  { label: t(catalog, "auth.signUp.passwordRuleEight"), met: (value: string) => value.length >= 8 },
  { label: t(catalog, "auth.passwordRuleCapital"), met: (value: string) => /[A-Z]/.test(value) },
  { label: t(catalog, "auth.passwordRuleNumber"), met: (value: string) => /[0-9]/.test(value) },
  { label: t(catalog, "auth.passwordRuleSpecial"), met: (value: string) => /[^A-Za-z0-9]/.test(value) }
] as const;

/* The id the privacy row's input points at with aria-labelledby: its sentence holds an
   interactive control, so the row cannot be a <label> (see the consent group below). */
const PRIVACY_CONSENT_TEXT_ID = "signup-privacy-consent-text";

// Deliberately permissive: the address is checked for shape, not existence.
const shapedEmail = (value: string) => /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(value);

function emailValidity(value: string, sent: boolean, catalog: MessageCatalog): Validity {
  const trimmed = value.trim();
  if (trimmed.length === 0) return { state: "idle", text: "" };
  if (!shapedEmail(trimmed)) return { state: "bad", text: t(catalog, "auth.invalidEmail") };
  return sent
    ? { state: "ok", text: t(catalog, "auth.signUp.validAddressSent") }
    : { state: "ok", text: t(catalog, "auth.validAddress") };
}

function recoveryValidity(value: string, primary: string, catalog: MessageCatalog): Validity {
  const trimmed = value.trim();
  if (trimmed.length === 0) return { state: "idle", text: "" };
  if (!shapedEmail(trimmed)) return { state: "bad", text: t(catalog, "auth.invalidEmail") };
  if (trimmed.toLowerCase() === primary.trim().toLowerCase()) {
    return { state: "bad", text: t(catalog, "auth.signUp.recoveryMustDiffer") };
  }
  return { state: "ok", text: t(catalog, "auth.signUp.validRecoveryAddress") };
}

export function SignUpFlow({
  catalog = authEnglish,
  client = contractClient
}: Readonly<{ catalog?: MessageCatalog; client?: RegistrationClient }>) {
  const [email, setEmail] = useState("");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const [messageKey, setMessageKey] = useState<SuccessMessageKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginHref, setLoginHref] = useState("/login");
  /* The two consent boxes stay UNCONTROLLED. These mirrors exist for ONE purpose:
     computing the submit button's `disabled`, so it reflects the boxes live.
     FormData is the truth at submit — see submitRegistration. */
  const [adultAffirmed, setAdultAffirmed] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  const privacyInputRef = useRef<HTMLInputElement | null>(null);

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
      await client.register(
        submitted,
        String(data.get("password") ?? ""),
        String(data.get("recovery-email") ?? "").trim(),
        data.get("adult-affirmed") === "on"
      );
      setSubmittedEmail(submitted);
      setMessageKey("auth.signUp.registrationSent");
    } catch {
      setError(t(catalog, "auth.signUp.creationFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function resendVerification(): Promise<void> {
    if (submittedEmail === null) return;
    setBusy(true);
    setError(null);
    try {
      await client.resendVerification(submittedEmail);
      setMessageKey("auth.signUp.resendSent");
    } catch {
      setError(t(catalog, "auth.signUp.resendFailed"));
    } finally {
      setBusy(false);
    }
  }

  /* THE ONE CLICK RULE for the privacy row. */
  function onPrivacyRowClick(event: ReactMouseEvent<HTMLElement>): void {
    const input = privacyInputRef.current;
    if (input === null) return;
    /* THE PREDICATE READS THE REACT MIRROR, NEVER THE DOM. The pre-click activation steps
       have ALREADY flipped `input.checked` by the time this runs, so `if (input.checked)`
       takes the CHECKED branch on a bare click on an EMPTY box: the policy would never open
       and the box would tick — the one behaviour V's goal forbids. `privacyAccepted` is the
       settled value (ARCH-REV-S02 r3 N12, measured). */
    if (privacyAccepted) {
      /* No preventDefault: the box unchecks directly, with no modal. A click that did not
         originate ON the input toggles nothing natively — the row is a <div>, not a <label>
         — so it is driven through `.click()`, the path React's change detection listens to.
         The `event.target !== input` guard is also what stops that synthesised click, which
         bubbles back through this same handler, from recursing. */
      if (event.target !== input) input.click();
      return;
    }
    event.preventDefault();
    /* The helper returns focus to whatever was focused when the surface opened, so focusing
       the input HERE is what makes focus come back to it from every entry point. */
    input.focus();
    setPolicyOpen(true);
    /* THE TRACKER RESYNC, and it runs AFTER the dispatch, never inside it.
       React's value tracker desynchronises across a cancelled click: the box is toggled
       BEFORE dispatch, React's change extraction records `true`, and the canceled-activation
       steps revert the DOM to `false` AFTER dispatch — leaving tracker `true` over DOM
       `false`, so a later genuine change can go unannounced. A PLAIN instance assignment
       re-syncs it (the prototype setter and a synthesised `.click()` are both measured NOT
       to: probe code-rev-s02-c3c4-r1-recovery.test.tsx, R1 against R2/R3).
       PLACEMENT IS LOAD-BEARING AND IS MEASURED. Assigning inside this handler leaves the
       box CHECKED under jsdom 30.0.1, whose canceled-activation behaviour for a checkbox is
       `this.checked = !this.checked` — a TOGGLE, not the spec's restore-to-pre-click-value
       (jsdom/living/nodes/HTMLInputElement-impl.js:179-182) — so it inverts the `false` this
       line writes. Measured that way round: `the box must stay unticked: expected true to be
       false`. A microtask runs after the activation steps in every environment, and touches
       only the tracker (the DOM value is already `false`), so no frame shows a ticked box. */
    queueMicrotask(() => {
      const box = privacyInputRef.current;
      if (box !== null) box.checked = false;
    });
  }

  /* `I have read it` is the ONLY route that ticks the box, and it must set BOTH halves.
     The DOM, because `FormData` is the truth at submit and the R18 refusal reads it; and the
     R17 mirror, because the button's live `disabled` is computed from the mirrors. Setting
     only the DOM leaves `Create account` disabled with both boxes visibly ticked; setting
     only the mirror sends an empty box to `FormData` and R18 refuses the registration. */
  function acknowledgePolicy(): void {
    const input = privacyInputRef.current;
    if (input !== null) input.checked = true;
    setPrivacyAccepted(true);
    setPolicyOpen(false);
  }

  /* Every dismissal route — the close control, Esc and a backdrop click all arrive here.
     The mirror is re-read FROM THE DOM before closing: member 1 (the `onChange` guard on the
     privacy input) already makes every route end `false`, measured, so this changes no
     observable outcome today. It is kept because it makes the invariant structural instead
     of accidental — the mirror cannot outlive the DOM across a close, whatever a later edit
     does to the open path. */
  function closePolicy(): void {
    setPrivacyAccepted(privacyInputRef.current?.checked ?? false);
    setPolicyOpen(false);
  }

  const sent = submittedEmail !== null;
  const emailState = emailValidity(email, sent, catalog);
  const recoveryState = recoveryValidity(recoveryEmail, email, catalog);
  const rules = passwordRules(catalog);

  return (
    <AuthShell
      eyebrow={t(catalog, "auth.signUp.eyebrow")}
      title={t(catalog, "auth.signUp.title")}
      description={t(catalog, "auth.signUp.description")}
      footer={null}
    >
      {error ? <div className="authAlert" role="alert">{error}</div> : null}

      <form className="authForm" data-form="signup" method="post" action="/sign-up" aria-busy={busy} onSubmit={submitRegistration}>
        <div className="authField">
          <label htmlFor="signup-email">{t(catalog, "auth.email")}</label>
          <div className="authEmailRow">
            <input
              id="signup-email"
              name="email"
              type="email"
              autoComplete="section-primary-email email"
              placeholder={t(catalog, "auth.emailPlaceholder")}
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
              title={sent
                ? t(catalog, "auth.signUp.resendVerificationLink")
                : t(catalog, "auth.signUp.createToSendVerificationLink")}
              onClick={() => void resendVerification()}
            >
              {t(catalog, "auth.signUp.verifyEmail")}
            </button>
          </div>
          <p className="authValidity" data-state={emailState.state}>{emailState.text}</p>
        </div>

        <div className="authField">
          <label htmlFor="signup-recovery-email">{t(catalog, "auth.signUp.recoveryEmail")}</label>
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
            {t(catalog, "auth.signUp.recoveryEmailHint")}
          </span>
          <p className="authValidity" data-state={recoveryState.state}>{recoveryState.text}</p>
        </div>

        <div className="authField">
          <label htmlFor="signup-password">{t(catalog, "auth.password")}</label>
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
            {rules.map((rule) => {
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
            <span className="consentText">{t(catalog, "auth.signUp.adultAffirmation")}</span>
          </label>
          {/* ONE onClick, on the ROW: the check square, the sentence and the Privacy Policy
              control are three entry points onto one behaviour, and a handler placed on any
              one of them covers only that one. */}
          <div className="consentRow" onClick={onPrivacyRowClick}>
            <input
              className="consentBox"
              name="privacy-accepted"
              type="checkbox"
              required
              disabled={busy || sent}
              aria-labelledby={PRIVACY_CONSENT_TEXT_ID}
              ref={privacyInputRef}
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
              {t(catalog, "auth.signUp.privacyAgreementPrefix")}{" "}
              <button type="button" className="consentPolicyLink">
                {t(catalog, "auth.signUp.privacyPolicy")}
              </button>
              {t(catalog, "auth.signUp.privacyAgreementSuffix")}
            </span>
          </div>
        </div>

        <button
          className="authPrimary"
          type="submit"
          disabled={busy || sent || !adultAffirmed || !privacyAccepted}
        >
          {busy ? t(catalog, "auth.signUp.creating") : t(catalog, "auth.signUp.createAccount")}
        </button>

        <p className="authPanelFooter">
          {t(catalog, "auth.signUp.alreadyHaveOne")} <Link href={loginHref}>{t(catalog, "auth.signUp.logIn")}</Link>
        </p>

        {sent && messageKey !== null ? (
          <p className="authFinePrint" role="status" aria-live="polite">
            {successMessage(catalog, messageKey)} {t(catalog, "auth.signUp.verificationStatusSuffix")}
          </p>
        ) : null}
      </form>

      {/* OUTSIDE the sign-up form element (S02-S57) — spelled in prose because
          `authRoutes.source-test.mjs:159-165` counts form OPENING TAGS in this file's source
          text and a grep-based guard does not know what a comment is: the literal tag written
          here took that count from 3 to 4. No control inside the policy can submit the
          registration, whatever its `type` says, and `Enter` inside it cannot register an
          account. Mounted CONDITIONALLY, so every open is a fresh read — the scroll gate
          resets, the reader starts at the top, and `I have read it` is disabled again until
          they reach the end (orchestrator ruling 2026-09-07 from CODE-REV-S02-C5C6 r1 N7). */}
      {policyOpen ? (
        <PrivacyPolicyModal
          open
          mode="consent"
          onClose={closePolicy}
          onAcknowledge={acknowledgePolicy}
        />
      ) : null}
    </AuthShell>
  );
}
