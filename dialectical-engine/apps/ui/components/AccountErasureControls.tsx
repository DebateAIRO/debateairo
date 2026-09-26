"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  ContractHttpError,
  type ContractClient
} from "@debateai/contract";
import { contractClient } from "@/lib/api";
import type { LocaleCode } from "@/lib/i18n/locales";
import { formatDate, t, type MessageCatalog } from "@/lib/i18n/translate";
import settingsEnglish from "@/messages/en/settings.json";

/**
 * The phrase the reader must type to schedule deletion, in the reader's locale
 * (V 2026-09-26: "Translate it"). It is a UI gate only: the API's wire literal
 * `confirmation: "DELETE MY ACCOUNT"` (packages/contract/src/index.ts) is sent by
 * the contract client whatever the reader typed, and does not change.
 *
 * Matching: English stays EXACT, byte for byte as before (no trimming, no case
 * folding: "delete my account" or a trailing space is refused). Other locales
 * compare after trimming and Unicode NFC normalisation, case-insensitively via
 * toLocaleUpperCase(locale), because typed case is unreliable in scripts with
 * locale-specific casing and on mobile keyboards.
 *
 * After that fold, three spellings that native keyboards and writers use
 * interchangeably are made equal on both sides (fluency review REV-VKEYS):
 * Russian Ё/Е («учётную» typed «учетную»), Romanian cedilla Ş/Ţ (U+015E/U+0162)
 * for comma-below Ș/Ț (U+0218/U+021A), and Hindi chandrabindu ँ (U+0901) typed
 * as anusvara ं (U+0902). Nothing else is loosened.
 */
const NATIVE_VARIANTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/[\u0401\u0451]/g, "\u0415"], // Ё ё → Е
  [/[\u015E\u015F]/g, "\u0218"], // Ş ş → Ș
  [/[\u0162\u0163]/g, "\u021A"], // Ţ ţ → Ț
  [/\u0901/g, "\u0902"] // ँ → ं
];

export function confirmationPhraseMatches(typed: string, phrase: string, locale: LocaleCode): boolean {
  if (locale === "en") return typed === phrase;
  const fold = (value: string) => NATIVE_VARIANTS.reduce(
    (folded, [variant, canonical]) => folded.replace(variant, canonical),
    value.trim().normalize("NFC").toLocaleUpperCase(locale)
  );
  return fold(typed) === fold(phrase);
}

type ErasureStatus = Awaited<ReturnType<ContractClient["readAccountErasure"]>>;
type AccountErasureClient = Pick<ContractClient,
  "stepUp" | "scheduleAccountErasure" | "readAccountErasure" | "cancelAccountErasure"
>;

function failureMessage(failure: unknown, catalog: MessageCatalog): string {
  if (failure instanceof ContractHttpError
    && failure.serverCode === "ACCOUNT_NOTIFICATION_CHANNEL_REQUIRED") {
    return t(catalog, "settings.erasure.notificationChannelRequired");
  }
  if (failure instanceof ContractHttpError && failure.code === "SESSION_REQUIRED") {
    return t(catalog, "settings.erasure.sessionExpired");
  }
  return t(catalog, "settings.erasure.notAuthorized");
}

export function AccountErasureControls({
  client = contractClient,
  catalog = settingsEnglish,
  locale = "en"
}: Readonly<{
  client?: AccountErasureClient;
  catalog?: MessageCatalog;
  locale?: LocaleCode;
}>) {
  const [status, setStatus] = useState<ErasureStatus | null>(null);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const confirmationPhrase = t(catalog, "settings.erasure.confirmationPhrase");
  const confirmed = confirmationPhraseMatches(confirmation, confirmationPhrase, locale);

  useEffect(() => {
    let active = true;
    const refresh=()=>client.readAccountErasure().then(
      (current) => { if (active) { setStatus(current); setMessage(null); } },
      () => { if (active) setMessage(t(catalog, "settings.erasure.statusUnavailable")); }
    );
    void refresh();
    const timer=window.setInterval(()=>{ void refresh(); },5_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [catalog, client]);

  async function schedule(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!confirmed || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const steppedUp = await client.stepUp(password, code, { action: "DELETE_ACCOUNT" });
      const grant = steppedUp.step_up_grant;
      if (grant === undefined || grant.action !== "DELETE_ACCOUNT") {
        throw new Error("DELETE_ACCOUNT_GRANT_MISSING");
      }
      const scheduled = await client.scheduleAccountErasure(grant.token);
      setStatus(scheduled);
      setPassword("");
      setCode("");
      setConfirmation("");
      setMessage(t(catalog, "settings.erasure.scheduled"));
    } catch (failure) {
      setMessage(failureMessage(failure, catalog));
    } finally {
      setBusy(false);
    }
  }

  async function cancel(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const current=status !== null && status.status !== "NONE" ? status : null;
      if (current===null || current.status==="PROCESSING") return;
      await client.cancelAccountErasure(current.cancellation_ref);
      setStatus({ status: "NONE" });
      setMessage(t(catalog, "settings.erasure.cancelled"));
    } catch {
      setMessage(t(catalog, "settings.erasure.cancelFailed"));
    } finally {
      setBusy(false);
    }
  }

  const scheduled = status !== null && status.status !== "NONE" ? status : null;

  return (
    <section className="setCard setCardDanger" aria-labelledby="account-deletion-heading">
      <h2 className="setCardTitle" id="account-deletion-heading">
        {t(catalog, "settings.erasure.title")}
      </h2>
      <p className="setCardHint">
        {t(catalog, "settings.erasure.hint")}
      </p>
      <p className="setCardNote">
        {t(catalog, "settings.erasure.dataWarning")}
      </p>
      {status === null
        ? <p className="setStatus">{t(catalog, "settings.erasure.checking")}</p>
        : null}
      {scheduled !== null ? (
        <div>
          <p className="setStatus" role="status">
            {t(catalog, "settings.erasure.status", {
              status: scheduled.status,
              time: formatDate(locale, scheduled.execute_at, { dateStyle: "medium", timeStyle: "short" })
            })}
          </p>
          {scheduled.status === "PROCESSING" ? (
            <p className="setCardNote">
              {t(catalog, "settings.erasure.processing")}
            </p>
          ) : (
            <div className="setCardRow">
              <button type="button" className="setBtn" disabled={busy} onClick={() => { void cancel(); }}>
                {busy
                  ? t(catalog, "settings.erasure.cancelling")
                  : t(catalog, "settings.erasure.cancel")}
              </button>
            </div>
          )}
        </div>
      ) : status !== null ? (
        <form onSubmit={(event) => void schedule(event)}>
          <div className="setCardRow">
            <div className="setField">
              <label htmlFor="account-deletion-password">
                {t(catalog, "settings.erasure.passwordLabel")}
              </label>
              <input
                id="account-deletion-password"
                type="password"
                autoComplete="current-password"
                placeholder={t(catalog, "settings.password")}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            <div className="setField">
              <label htmlFor="account-deletion-code">
                {t(catalog, "settings.authenticatorCode")}
              </label>
              <input
                id="account-deletion-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                placeholder={t(catalog, "settings.authenticatorCode")}
                value={code}
                onChange={(event) => setCode(event.target.value)}
                required
              />
            </div>
            <div className="setField setFieldDanger">
              <label htmlFor="account-deletion-confirmation">
                {t(catalog, "settings.erasure.typeConfirmation", { confirmation: confirmationPhrase })}
              </label>
              <input
                id="account-deletion-confirmation"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                placeholder={t(catalog, "settings.erasure.typeConfirmation", { confirmation: confirmationPhrase })}
                required
              />
            </div>
            <button
              type="submit"
              className="setBtn setBtnDanger"
              disabled={busy || !confirmed}
            >
              {busy
                ? t(catalog, "settings.erasure.authorizing")
                : t(catalog, "settings.erasure.schedule")}
            </button>
          </div>
        </form>
      ) : null}
      {message ? <p className="setStatus" role="status">{message}</p> : null}
    </section>
  );
}
