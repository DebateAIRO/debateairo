"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ContractHttpError, type ContractClient } from "@debateai/contract";
import { AuthShell } from "@/components/AuthShell";
import { contractClient } from "@/lib/api";
import { setRecoveryAcknowledgementPending } from "@/lib/authNavigationGuard";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import { safeReturnPath } from "@/lib/returnPath";
import authEnglish from "@/messages/en/auth.json";

type LoginClient = Pick<ContractClient, "beginLogin" | "completeLogin">;
type VerificationMethod = "authenticator" | "recovery";

/* The document shows live validity marks under both auth fields (7a, and 8a
   with two rules unmet). These are presentation only — the server remains the
   authority on whether any credential is accepted. */
const passwordRules = (catalog: MessageCatalog) => [
  { label: t(catalog, "auth.login.passwordRuleEight"), met: (v: string) => v.length >= 8 },
  { label: t(catalog, "auth.passwordRuleCapital"), met: (v: string) => /[A-Z]/.test(v) },
  { label: t(catalog, "auth.passwordRuleNumber"), met: (v: string) => /[0-9]/.test(v) },
  { label: t(catalog, "auth.passwordRuleSpecial"), met: (v: string) => /[^A-Za-z0-9]/.test(v) }
] as const;

function emailValidity(value: string, catalog: MessageCatalog): { state: "idle" | "ok" | "bad"; text: string } {
  const trimmed = value.trim();
  if (trimmed.length === 0) return { state: "idle", text: t(catalog, "auth.login.emailHint") };
  // Deliberately permissive: the address is checked for shape, not existence.
  const shaped = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(trimmed);
  return shaped
    ? { state: "ok", text: t(catalog, "auth.validAddress") }
    : { state: "bad", text: t(catalog, "auth.invalidEmail") };
}

function navigateHome(): void {
  const next = new URLSearchParams(window.location.search).get("next");
  window.location.assign(safeReturnPath(next));
}

export function LoginFlow({
  catalog = authEnglish,
  client = contractClient,
  onAuthenticated = navigateHome
}: Readonly<{
  catalog?: MessageCatalog;
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
      setError(t(catalog, "auth.login.signInFailed"));
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
        setError(t(catalog, "auth.login.tooManyAttempts"));
      } else if (failure instanceof ContractHttpError && failure.status === 401
        && verificationMethod === "recovery") {
        setError(t(catalog, "auth.login.recoveryCodeRejected"));
      } else if (failure instanceof ContractHttpError && failure.status === 401) {
        setError(t(catalog, "auth.login.authenticationCodeRejected"));
      } else {
        setError(t(catalog, "auth.login.verificationFailed"));
      }
    } finally {
      setBusy(false);
    }
  }

  const verificationPending = challengeToken !== null;
  const emailState = emailValidity(email, catalog);
  const rules = passwordRules(catalog);
  const shellCopy = replacementRecoveryCode !== null
    ? {
        eyebrow: t(catalog, "auth.login.recoveryAccess"),
        title: t(catalog, "auth.login.replacementTitle"),
        description: t(catalog, "auth.login.replacementDescription")
      }
    : verificationPending
      ? verificationMethod === "authenticator"
        ? {
            eyebrow: t(catalog, "auth.login.twoStepVerification"),
            title: t(catalog, "auth.login.authenticatorTitle"),
            description: t(catalog, "auth.login.authenticatorDescription")
          }
        : {
            eyebrow: t(catalog, "auth.login.twoStepVerification"),
            title: t(catalog, "auth.login.recoveryTitle"),
            description: t(catalog, "auth.login.recoveryDescription")
          }
      : {
          eyebrow: t(catalog, "auth.login.welcomeBack"),
          title: t(catalog, "auth.login.backToGraph"),
          description: t(catalog, "auth.login.securityPolicy")
        };

  return (
    <AuthShell
      eyebrow={shellCopy.eyebrow}
      title={shellCopy.title}
      description={shellCopy.description}
      footer={replacementRecoveryCode === null && !verificationPending ? (
        <p>{t(catalog, "auth.login.noAccountYet")} <Link href={signUpHref}>{t(catalog, "auth.login.createOne")}</Link></p>
      ) : null}
    >
      {error ? <div className="authAlert" role="alert">{error}</div> : null}

      {replacementRecoveryCode !== null ? (
        <section className="authSuccessWarning" role="alert" aria-labelledby="replacement-code-title">
          <span className="authSuccessAccent" aria-hidden />
          <p className="authNoticeKicker">{t(catalog, "auth.login.signedInSecurely")}</p>
          <h2 id="replacement-code-title">{t(catalog, "auth.login.recordReplacementCode")}</h2>
          <p>{t(catalog, "auth.login.replacementCodeNotice")}</p>
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
            {t(catalog, "auth.login.savedContinue")}
          </button>
        </section>
      ) : challengeToken === null ? (
        <form className="authForm" method="post" action="/login" aria-busy={busy} onSubmit={submitCredentials}>
          <div className="authField">
            <label htmlFor="login-email">{t(catalog, "auth.email")}</label>
            <input
              id="login-email"
              name="email"
              type="email"
              autoComplete="username"
              placeholder={t(catalog, "auth.emailPlaceholder")}
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
            <label htmlFor="login-password">{t(catalog, "auth.password")}</label>
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
              {rules.map((rule) => {
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
            {busy ? t(catalog, "auth.login.checking") : t(catalog, "auth.continue")}
          </button>
        </form>
      ) : (
        <form className="authForm authMfaForm" method="post" action="/login" aria-busy={busy} onSubmit={submitMfa}>
          <p className="srOnly" role="status">{t(catalog, "auth.login.passwordAcceptedStatus")}</p>
          <div className="authField">
            <label htmlFor="login-code">
              {verificationMethod === "authenticator"
                ? t(catalog, "auth.login.authenticationCodeLabel")
                : t(catalog, "auth.login.recoveryCodeLabel")}
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
                  aria-label={t(catalog, "auth.login.authenticationCodeLabel")}
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
                placeholder={t(catalog, "auth.login.recoveryCodePlaceholder")}
                aria-describedby="login-code-hint"
                spellCheck={false}
                required
                autoFocus
                disabled={busy}
              />
            )}
            <p className="authFieldHint" id="login-code-hint">
              {verificationMethod === "authenticator"
                ? t(catalog, "auth.login.authenticatorHint")
                : t(catalog, "auth.login.recoveryHint")}
            </p>
          </div>
          <button className="authPrimary" type="submit" disabled={busy}>
            {busy ? t(catalog, "auth.login.verifying") : t(catalog, "auth.continue")}
          </button>
          <div className="authMfaAlternatives">
            <button className="authTextButton" type="button" disabled={busy} onClick={() => {
              setVerificationMethod((current) => current === "authenticator" ? "recovery" : "authenticator");
              setCode("");
              setError(null);
            }}>
              {verificationMethod === "authenticator"
                ? t(catalog, "auth.login.useRecoveryCode")
                : t(catalog, "auth.login.useAuthenticatorCode")}
            </button>
            <button className="authTextButton authBackButton" type="button" disabled={busy} onClick={() => {
              setChallengeToken(null);
              setVerificationMethod("authenticator");
              setCode("");
              setError(null);
            }}>
              {t(catalog, "auth.login.backToSignIn")}
            </button>
          </div>
        </form>
      )}
    </AuthShell>
  );
}
