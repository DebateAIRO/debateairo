"use client";

import Link from "next/link";
import {
  FormEvent,
  MouseEvent as ReactMouseEvent,
  RefObject,
  useEffect,
  useRef,
  useState
} from "react";
import type { ContractClient } from "@debateai/contract";
import { AuthShell } from "@/components/AuthShell";
import { PrivacyPolicyModal } from "@/components/consent/PrivacyPolicyModal";
import { TermsOfServiceModal } from "@/components/consent/TermsOfServiceModal";
import { contractClient } from "@/lib/api";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import authEnglish from "@/messages/en/auth.json";

type RegistrationClient = Pick<ContractClient, "register">;
type SuccessMessageKey = "auth.signUp.registrationSent";

type Validity = Readonly<{ state: "idle" | "ok" | "bad"; text: string }>;

function successMessage(catalog: MessageCatalog, key: SuccessMessageKey): string {
  switch (key) {
    case "auth.signUp.registrationSent":
      return t(catalog, "auth.signUp.registrationSent");
  }
}

/* The document's ✓/✗ rules under the password field (Turn 8 · 8a). */
const passwordRules = (catalog: MessageCatalog) => [
  { label: t(catalog, "auth.signUp.passwordRuleEight"), met: (value: string) => value.length >= 8 },
  { label: t(catalog, "auth.passwordRuleCapital"), met: (value: string) => /[A-Z]/.test(value) },
  { label: t(catalog, "auth.passwordRuleNumber"), met: (value: string) => /[0-9]/.test(value) },
  { label: t(catalog, "auth.passwordRuleSpecial"), met: (value: string) => /[^A-Za-z0-9]/.test(value) }
] as const;

/* The ids the two document rows' inputs point at with aria-labelledby: each sentence holds an
   interactive control, so neither row can be a <label> (see the consent group below). */
const PRIVACY_CONSENT_TEXT_ID = "signup-privacy-consent-text";
const TERMS_CONSENT_TEXT_ID = "signup-terms-consent-text";

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

function confirmEmailValidity(value: string, primary: string, catalog: MessageCatalog): Validity {
  const trimmed = value.trim();
  if (trimmed.length === 0) return { state: "idle", text: "" };
  return trimmed.toLowerCase() === primary.trim().toLowerCase()
    ? { state: "ok", text: t(catalog, "auth.signUp.confirmEmailMatch") }
    : { state: "bad", text: t(catalog, "auth.signUp.confirmEmailMismatch") };
}

function confirmPasswordValidity(value: string, primary: string, catalog: MessageCatalog): Validity {
  if (value.length === 0) return { state: "idle", text: "" };
  return value === primary
    ? { state: "ok", text: t(catalog, "auth.signUp.confirmPasswordMatch") }
    : { state: "bad", text: t(catalog, "auth.signUp.confirmPasswordMismatch") };
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

/* THE ONE CLICK RULE for a document row — the privacy row and the terms row share it, built
   per row from that row's input, its SETTLED mirror and its opener, so both rows have one
   behaviour and one explanation. */
function gatedRowClick(
  inputRef: RefObject<HTMLInputElement | null>,
  accepted: boolean,
  open: () => void
): (event: ReactMouseEvent<HTMLElement>) => void {
  return (event) => {
    const input = inputRef.current;
    if (input === null) return;
    /* THE PREDICATE READS THE REACT MIRROR, NEVER THE DOM. The pre-click activation steps
       have ALREADY flipped `input.checked` by the time this runs, so `if (input.checked)`
       takes the CHECKED branch on a bare click on an EMPTY box: the document would never open
       and the box would tick — the one behaviour V's goal forbids. `accepted` is the
       settled value (ARCH-REV-S02 r3 N12, measured). */
    if (accepted) {
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
    open();
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
      const box = inputRef.current;
      if (box !== null) box.checked = false;
    });
  };
}

export function SignUpFlow({
  catalog = authEnglish,
  client = contractClient
}: Readonly<{ catalog?: MessageCatalog; client?: RegistrationClient }>) {
  const [email, setEmail] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const [messageKey, setMessageKey] = useState<SuccessMessageKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginHref, setLoginHref] = useState("/login");
  /* The three consent boxes stay UNCONTROLLED. These mirrors exist for ONE purpose:
     computing the submit button's `disabled`, so it reflects the boxes live.
     FormData is the truth at submit — see submitRegistration. */
  const [adultAffirmed, setAdultAffirmed] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const privacyInputRef = useRef<HTMLInputElement | null>(null);
  const termsInputRef = useRef<HTMLInputElement | null>(null);

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
       Consent and confirmation are read from FormData, never the mirrors above. */
    if (
      data.get("adult-affirmed") !== "on" ||
      data.get("privacy-accepted") !== "on" ||
      data.get("terms-accepted") !== "on" ||
      confirmEmailValidity(
        String(data.get("confirm-email") ?? ""),
        String(data.get("email") ?? ""),
        catalog
      ).state !== "ok" ||
      confirmPasswordValidity(
        String(data.get("confirm-password") ?? ""),
        String(data.get("password") ?? ""),
        catalog
      ).state !== "ok"
    ) {
      return;
    }
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

  const onPrivacyRowClick = gatedRowClick(privacyInputRef, privacyAccepted, () =>
    setPolicyOpen(true)
  );
  const onTermsRowClick = gatedRowClick(termsInputRef, termsAccepted, () => setTermsOpen(true));

  /* `I have read it` is the ONLY route that ticks a document row's box, and it must set BOTH
     halves. The DOM, because `FormData` is the truth at submit and the R18 refusal reads it;
     and the R17 mirror, because the button's live `disabled` is computed from the mirrors.
     Setting only the DOM leaves `Create account` disabled with every box visibly ticked;
     setting only the mirror sends an empty box to `FormData` and R18 refuses the
     registration. */
  function acknowledgePolicy(): void {
    const input = privacyInputRef.current;
    if (input !== null) input.checked = true;
    setPrivacyAccepted(true);
    setPolicyOpen(false);
  }

  function acknowledgeTerms(): void {
    const input = termsInputRef.current;
    if (input !== null) input.checked = true;
    setTermsAccepted(true);
    setTermsOpen(false);
  }

  /* Every dismissal route — the close control, Esc and a backdrop click all arrive here.
     The mirror is re-read FROM THE DOM before closing: member 1 (the `onChange` guard on the
     row's input) already makes every route end `false`, measured, so this changes no
     observable outcome today. It is kept because it makes the invariant structural instead
     of accidental — the mirror cannot outlive the DOM across a close, whatever a later edit
     does to the open path. */
  function closePolicy(): void {
    setPrivacyAccepted(privacyInputRef.current?.checked ?? false);
    setPolicyOpen(false);
  }

  function closeTerms(): void {
    setTermsAccepted(termsInputRef.current?.checked ?? false);
    setTermsOpen(false);
  }

  const sent = submittedEmail !== null;
  const emailState = emailValidity(email, sent, catalog);
  const confirmEmailState = confirmEmailValidity(confirmEmail, email, catalog);
  const recoveryState = recoveryValidity(recoveryEmail, email, catalog);
  const confirmPasswordState = confirmPasswordValidity(confirmPassword, password, catalog);
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
          <p className="authValidity" data-state={emailState.state}>{emailState.text}</p>
        </div>

        <div className="authField">
          <label htmlFor="signup-confirm-email">{t(catalog, "auth.signUp.confirmEmail")}</label>
          <input
            id="signup-confirm-email"
            name="confirm-email"
            type="email"
            autoComplete="off"
            value={confirmEmail}
            onChange={(event) => setConfirmEmail(event.target.value)}
            required
            disabled={busy || sent}
          />
          <p className="authValidity" data-state={confirmEmailState.state}>{confirmEmailState.text}</p>
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

        <div className="authField">
          <label htmlFor="signup-confirm-password">{t(catalog, "auth.signUp.confirmPassword")}</label>
          <input
            id="signup-confirm-password"
            name="confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
            disabled={busy || sent}
          />
          <p className="authValidity" data-state={confirmPasswordState.state}>{confirmPasswordState.text}</p>
        </div>

        {/* Consent group — design artboard 8a (turn-8a-checkbox-group.html:1-10), plus the
            Terms row that joined it when the Terms of Service became a document in the
            product. Row 1 is a <label> wrapping its input, so the square, the text and the
            row all toggle it natively. Rows 2 and 3 cannot be a <label>: their document
            controls are interactive content, which the <label> content model forbids — so
            each is a <div> and its input takes its name from aria-labelledby. The privacy
            row is a READ acknowledgement (the Terms say the policy is information owed, not
            a contract agreed to); the terms row is the agreement, in the words the Terms
            themselves use for it. */}
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
          {/* ONE onClick, on the ROW: the check square, the sentence and the document
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
          <div className="consentRow" onClick={onTermsRowClick}>
            <input
              className="consentBox"
              name="terms-accepted"
              type="checkbox"
              required
              disabled={busy || sent}
              aria-labelledby={TERMS_CONSENT_TEXT_ID}
              ref={termsInputRef}
              onChange={(event) =>
                setTermsAccepted(
                  event.currentTarget.checked && !event.nativeEvent.defaultPrevented
                )
              }
            />
            <span className="consentText" id={TERMS_CONSENT_TEXT_ID}>
              {t(catalog, "auth.signUp.termsAgreementPrefix")}{" "}
              <button type="button" className="consentPolicyLink">
                {t(catalog, "auth.signUp.termsOfService")}
              </button>
              {t(catalog, "auth.signUp.privacyAgreementSuffix")}
            </span>
          </div>
        </div>

        <button
          className="authPrimary"
          type="submit"
          disabled={busy || sent || !adultAffirmed || !privacyAccepted || !termsAccepted}
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

      {/* Both documents mount OUTSIDE the sign-up form element (S02-S57) — spelled in prose
          because `authRoutes.source-test.mjs` counts form OPENING TAGS in this file's source
          text and a grep-based guard does not know what a comment is. No control inside a
          document can submit the registration, whatever its `type` says, and `Enter` inside
          one cannot register an account. Each is mounted CONDITIONALLY, so every open is a
          fresh read — the scroll gate resets, the reader starts at the top, and
          `I have read it` is disabled again until they reach the end (orchestrator ruling
          2026-09-07 from CODE-REV-S02-C5C6 r1 N7). Only one is ever open: each opens from
          its own row, and a row cannot be clicked while a document covers it. */}
      {policyOpen ? (
        <PrivacyPolicyModal
          open
          mode="consent"
          onClose={closePolicy}
          onAcknowledge={acknowledgePolicy}
        />
      ) : null}
      {termsOpen ? (
        <TermsOfServiceModal
          open
          mode="consent"
          onClose={closeTerms}
          onAcknowledge={acknowledgeTerms}
        />
      ) : null}
    </AuthShell>
  );
}
