"use client";

import { useEffect, useRef, useState } from "react";
import { ContractHttpError, type ContractClient, type LocaleCode } from "@debateai/contract";
import { AuthShell } from "@/components/AuthShell";
import { TurnstileChallenge } from "@/components/auth/TurnstileChallenge";
import { useFormAnnouncer } from "@/components/auth/InlineFieldMessage";
import { focusIsLost } from "@/lib/focusGuard";
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
  /** Replaces the after-sign-up sentence when nothing has been sent yet (the sign-in screen's resend entry). */
  notice?: string;
  /**
   * The sign-in screen's resend entry names its own screen and button (nothing has been sent when it
   * opens), and after a send says `sent` instead of `notice`: one sentence for every address, since the
   * server answers every resend the same way.
   */
  context?: Readonly<{ eyebrow: string; title: string; action: string; sent: string }>;
  onDifferentEmail(): void;
}>;

export function EmailPendingScreen({ email, retryAfterSeconds, client, catalog, locale, turnstile, notice, context, onDifferentEmail }: EmailPendingScreenProps) {
  const [deadline, setDeadline] = useState(() => Date.now() + retryAfterSeconds * 1_000);
  const remaining = () => Math.max(0, Math.ceil((deadline - Date.now()) / 1_000));
  const [seconds, setSeconds] = useState(remaining);
  const [proof, setProof] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [busy, setBusy] = useState(false);
  // The message key of the last resend's refusal, or null.
  const [error, setError] = useState<string | null>(null);
  const [proofUnavailable, setProofUnavailable] = useState(false);
  const [sent, setSent] = useState(false);
  const announcer = useFormAnnouncer();
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const configured = turnstile !== undefined && validTurnstilePublicConfig(turnstile);
  // Keyboard audit 2026-11-12 (AUTH-11): Resend stays off after a send (the new countdown, or the spent bot check), so
  // focus goes to the line that says how the send went: the sentence at the top, or the refusal under Resend.
  const outcomeLine = useRef<HTMLParagraphElement>(null), refusalLine = useRef<HTMLParagraphElement>(null);
  const settledLine = useRef<"outcome" | "refusal" | null>(null);
  const sentWords = useRef<string | null>(null);
  useEffect(() => {
    const line = settledLine.current;
    if (busy || line === null) return;
    settledLine.current = null;
    if (focusIsLost()) (line === "outcome" ? outcomeLine : refusalLine).current?.focus();
    // The resend entry's send is said once: by the line that took focus, or by the announcer when focus stayed put.
    else if (line === "outcome" && sentWords.current !== null) announcer.announce(sentWords.current);
    sentWords.current = null;
  }, [busy]); // eslint-disable-line react-hooks/exhaustive-deps -- runs when the send has ended, with that send's words

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
    inFlight.current = true; setBusy(true); setError(null);
    const token = proof; setProof(null);
    try {
      let timeZone: string | null = null;
      try { timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { /* Optional display preference. */ }
      const acknowledgement = await client.resendVerification({
        email, locale: catalogLocale(locale), ui_locale: locale, time_zone: timeZone, turnstile_token: token
      });
      if (mounted.current) {
        setDeadline(Date.now() + acknowledgement.retry_after_seconds * 1_000);
        if (context !== undefined) { setSent(true); sentWords.current = context.sent; }
        settledLine.current = "outcome";
      }
    } catch (failure) {
      const code = failure instanceof ContractHttpError ? failure.serverCode : null;
      if (mounted.current) setError(code === "EMAIL_INVALID" ? "auth.emailUndeliverable"
        : code === "MAIL_DAILY_LIMIT" ? "auth.mailDailyLimit" : "auth.pending.unavailable");
      settledLine.current = "refusal";
    } finally {
      inFlight.current = false;
      if (mounted.current) { setBusy(false); setResetKey(value => value + 1); }
    }
  }

  // After sign-up the sentence is the submit's outcome, a status message. The resend entry's sentence is an
  // instruction until a send, and the send is said by the announcer, so it is not a live region there.
  const outcome = notice === undefined && context === undefined;
  // The screen replaces the form whose button had focus, so focus starts on its headline.
  return <AuthShell eyebrow={context?.eyebrow ?? t(catalog, "auth.signUp.eyebrow")} title={context?.title ?? t(catalog, "auth.pending.title")}
    description={email} footer={null} focusTitle>
    {announcer.region}
    <p ref={outcomeLine} tabIndex={-1} className="authFinePrint" role={outcome ? "status" : undefined} aria-live={outcome ? "polite" : undefined}>{sent && context !== undefined ? context.sent : notice ?? t(catalog, "auth.signUp.registrationSent")}</p>
    {configured ? <TurnstileChallenge siteKey={turnstile.siteKey} nonce={turnstile.nonce} action="resend-verification"
      locale={locale} resetKey={resetKey} onToken={token => { setProof(token); if (token !== null) setProofUnavailable(false); }} onError={() => setProofUnavailable(true)} /> : null}
    {/* Countdown text has no live region; assistive readers hear only stable state. */}
    {seconds > 0 ? <p className="authFinePrint">{t(catalog, "auth.pending.retry", { seconds })}</p>
      : context === undefined ? <p className="authFinePrint">{t(catalog, "auth.pending.resend")}</p> : null}
    <button className="authPrimary" type="button" data-action="resend" disabled={busy || seconds > 0 || proof === null || !configured} onClick={() => { void resend(); }}>
      {context?.action ?? t(catalog, "auth.pending.resend")}
    </button>
    {error !== null ? <p ref={refusalLine} tabIndex={-1} className="authFinePrint" role="alert">{t(catalog, error)}</p> : null}
    {!configured || proofUnavailable ? <p className="authFinePrint" role="status">{t(catalog, "auth.pending.proofUnavailable")}</p> : null}
    <button className="authSecondary" type="button" disabled={busy} onClick={onDifferentEmail}>{t(catalog, "auth.pending.different")}</button>
  </AuthShell>;
}
