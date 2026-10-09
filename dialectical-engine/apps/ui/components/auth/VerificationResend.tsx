"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ContractClient } from "@debateai/contract";
import { AuthShell } from "@/components/AuthShell";
import { EmailPendingScreen } from "@/components/auth/EmailPendingScreen";
import { InlineFieldMessage, useFormErrorAnnouncer } from "@/components/auth/InlineFieldMessage";
import { contractClient } from "@/lib/api";
import { emailShape } from "@/lib/authFormValidation";
import { useChromeI18n } from "@/lib/i18n/I18nProvider";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import type { TurnstilePublicConfig } from "@/lib/turnstile";

/**
 * The sign-in screen's "Didn't get the verification email?" entry (auth UI repair, 2026-10-09): asks for
 * the address, then hands over to the same waiting screen sign-up uses, whose Resend button calls the
 * existing resend endpoint (Turnstile-protected, same generic answer for every address).
 */
export function VerificationResend({ catalog, client, turnstile, onBack }: Readonly<{
  catalog: MessageCatalog;
  client: Partial<Pick<ContractClient, "resendVerification">>;
  turnstile?: TurnstilePublicConfig;
  onBack(): void;
}>) {
  const { locale } = useChromeI18n();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const announcer = useFormErrorAnnouncer();
  useEffect(() => { if (submitted === null) field.current?.focus(); }, [submitted]);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const address = String(new FormData(event.currentTarget).get("email") ?? "").trim();
    setEmail(address);
    if (!emailShape(address)) {
      setError(t(catalog, "auth.invalidEmail"));
      field.current?.focus();
      announcer.announce(t(catalog, "auth.invalidEmail"));
      return;
    }
    setError(null);
    setSubmitted(address);
  }
  if (submitted !== null)
    return <EmailPendingScreen email={submitted} retryAfterSeconds={0} client={{ resendVerification: client.resendVerification ?? contractClient.resendVerification }} catalog={catalog} locale={locale} turnstile={turnstile} notice={t(catalog, "auth.pending.resendNotice")} onDifferentEmail={() => setSubmitted(null)} />;
  return <AuthShell eyebrow={t(catalog, "auth.login.welcomeBack")} title={t(catalog, "auth.pending.resend")} description={t(catalog, "auth.login.resendHint")} footer={null}>
    <form className="authForm" noValidate method="post" action="/login" onSubmit={submit}>
      <div className="authField"><label htmlFor="resend-email">{t(catalog, "auth.email")}</label><input ref={field} id="resend-email" name="email" type="email" autoComplete="email" placeholder={t(catalog, "auth.emailPlaceholder")} value={email} onChange={event => { setEmail(event.target.value); setError(null); }} required aria-invalid={!!error || undefined} aria-describedby={error ? "resend-email-error" : undefined} /><InlineFieldMessage id="resend-email-error" message={error} /></div>
      <button className="authPrimary" type="submit">{t(catalog, "auth.continue")}</button>
      {announcer.region}
    </form>
    <div className="authMfaAlternatives"><button type="button" className="authTextButton authBackButton" onClick={onBack}>{t(catalog, "auth.login.backToSignIn")}</button></div>
  </AuthShell>;
}
