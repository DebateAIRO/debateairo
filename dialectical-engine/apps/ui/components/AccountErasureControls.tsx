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

const CONFIRMATION = "DELETE MY ACCOUNT";

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
    if (confirmation !== CONFIRMATION || busy) return;
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
                {t(catalog, "settings.erasure.typeConfirmation", { confirmation: CONFIRMATION })}
              </label>
              <input
                id="account-deletion-confirmation"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                placeholder={t(catalog, "settings.erasure.typeConfirmation", { confirmation: CONFIRMATION })}
                required
              />
            </div>
            <button
              type="submit"
              className="setBtn setBtnDanger"
              disabled={busy || confirmation !== CONFIRMATION}
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
