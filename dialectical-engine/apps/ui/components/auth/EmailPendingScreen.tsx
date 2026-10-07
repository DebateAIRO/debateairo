"use client";

import { useEffect, useRef, useState } from "react";
import type { ContractClient, LocaleCode } from "@debateai/contract";
import { AuthShell } from "@/components/AuthShell";
import { TurnstileChallenge } from "@/components/auth/TurnstileChallenge";
import { catalogLocale } from "@/lib/i18n/locales";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import { validTurnstilePublicConfig, type TurnstilePublicConfig } from "@/lib/turnstile";

export type EmailPendingScreenProps = Readonly<{
  email: string;
  retryAfterSeconds: number;
  client: Pick<ContractClient, "resendVerification">;
  catalog: MessageCatalog;
  locale: LocaleCode;
  turnstile?: TurnstilePublicConfig;
  onDifferentEmail(): void;
}>;

export function EmailPendingScreen({ email, retryAfterSeconds, client, catalog, locale, turnstile, onDifferentEmail }: EmailPendingScreenProps) {
  const [deadline, setDeadline] = useState(() => Date.now() + retryAfterSeconds * 1_000);
  const remaining = () => Math.max(0, Math.ceil((deadline - Date.now()) / 1_000));
  const [seconds, setSeconds] = useState(remaining);
  const [proof, setProof] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [proofUnavailable, setProofUnavailable] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const configured = turnstile !== undefined && validTurnstilePublicConfig(turnstile);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    const refresh = () => setSeconds(Math.max(0, Math.ceil((deadline - Date.now()) / 1_000)));
    refresh();
    const timer = window.setInterval(refresh, 1_000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh); window.removeEventListener("focus", refresh); };
  }, [deadline]);

  async function resend(): Promise<void> {
    // Ref ownership closes the same-event double-click gap before React paints.
    if (inFlight.current || Date.now() < deadline || proof === null || !configured) return;
    inFlight.current = true; setBusy(true); setError(false);
    const token = proof; setProof(null);
    try {
      let timeZone: string | null = null;
      try { timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { /* Optional display preference. */ }
      const acknowledgement = await client.resendVerification({
        email, locale: catalogLocale(locale), ui_locale: locale, time_zone: timeZone, turnstile_token: token
      });
      if (mounted.current) setDeadline(Date.now() + acknowledgement.retry_after_seconds * 1_000);
    } catch {
      if (mounted.current) setError(true);
    } finally {
      inFlight.current = false;
      if (mounted.current) { setBusy(false); setResetKey(value => value + 1); }
    }
  }

  return <AuthShell eyebrow={t(catalog, "auth.signUp.eyebrow")} title={t(catalog, "auth.pending.title")}
    description={email} footer={null}>
    <p className="authFinePrint" role="status" aria-live="polite">{t(catalog, "auth.signUp.registrationSent")}</p>
    {configured ? <TurnstileChallenge siteKey={turnstile.siteKey} nonce={turnstile.nonce} action="resend-verification"
      locale={locale} resetKey={resetKey} onToken={token => { setProof(token); if (token !== null) setProofUnavailable(false); }} onError={() => setProofUnavailable(true)} /> : null}
    {/* Countdown text has no live region; assistive readers hear only stable state. */}
    <p className="authFinePrint">{seconds > 0 ? t(catalog, "auth.pending.retry", { seconds }) : t(catalog, "auth.pending.resend")}</p>
    <button className="authPrimary" type="button" data-action="resend" disabled={busy || seconds > 0 || proof === null || !configured} onClick={() => { void resend(); }}>
      {t(catalog, "auth.pending.resend")}
    </button>
    {error ? <p className="authFinePrint" role="alert">{t(catalog, "auth.pending.unavailable")}</p> : null}
    {!configured || proofUnavailable ? <p className="authFinePrint" role="status">{t(catalog, "auth.pending.proofUnavailable")}</p> : null}
    <button className="authSecondary" type="button" disabled={busy} onClick={onDifferentEmail}>{t(catalog, "auth.pending.different")}</button>
  </AuthShell>;
}
