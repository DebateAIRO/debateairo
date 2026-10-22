"use client";
import { useEffect, useRef, useState } from "react";
import { ContractHttpError, type ContractClient, type DataExportStatus } from "@debateai/contract";
import { contractClient } from "@/lib/api";
import { useSelectedAuthCatalog } from "@/components/AuthShell";
import { SecurityConfirmation } from "@/components/auth/SecurityConfirmation";
import { formatDate, t, type MessageCatalog } from "@/lib/i18n/translate";
import { catalogLocale, type LocaleCode } from "@/lib/i18n/locales";

export function refusalMessage(failure: unknown, catalog: MessageCatalog, locale: LocaleCode): string {
  if (!(failure instanceof ContractHttpError)) return t(catalog, "settings.export.unavailable");
  if (failure.code === "SESSION_REQUIRED" || failure.serverCode === "COOKIE_SESSION_REQUIRED"
    || failure.serverCode === "SESSION_REQUIRED") return t(catalog, "settings.export.sessionExpired");
  switch (failure.serverCode) {
    case "EXPORT_UNAVAILABLE": return t(catalog, "settings.export.unavailable");
    case "STEP_UP_REQUIRED": return t(catalog, "settings.export.notAuthorized");
    case "EXPORT_EMAIL_REQUIRED": return t(catalog, "settings.export.emailRequired");
    case "EXPORT_ACCOUNT_ERASING": return t(catalog, "settings.export.erasing");
    case "EXPORT_ACCOUNT_HELD": return t(catalog, "settings.export.held");
    case "EXPORT_IN_PROGRESS": return t(catalog, "settings.export.inProgress");
    case "EXPORT_RATE_LIMITED":
      return failure.retryAfterMs === null
        ? t(catalog, "settings.export.unavailable")
        : t(catalog, "settings.export.rateLimited", {
            time: formatDate(locale, new Date(Date.now() + failure.retryAfterMs).toISOString(),
              { dateStyle: "medium", timeStyle: "short" })
          });
    default: return t(catalog, "settings.export.unavailable");
  }
}

export function DataExportCard({ catalog, locale, client = contractClient }: {
  catalog: MessageCatalog;
  locale: LocaleCode;
  client?: ContractClient;
}) {
  const authCatalog = useSelectedAuthCatalog(locale);
  const [status, setStatus] = useState<DataExportStatus | null>(null);
  const [statusUnavailable, setStatusUnavailable] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [noMethod, setNoMethod] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const cardRef = useRef<HTMLElement>(null);
  const focusFromLink = useRef(false);
  // Cancel on the security check, or the request it confirmed, unmounts the focused control: focus goes back to
  // Export data, or to the card's heading while that button is disabled or gone (keyboard check 2026-10-22).
  const heading = useRef<HTMLHeadingElement>(null);
  const requestButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  useEffect(() => {
    if (!returnFocus.current) return;
    returnFocus.current = false;
    const back = requestButton.current;
    if (back && back.isConnected && !back.disabled) back.focus();
    else heading.current?.focus();
  });

  useEffect(() => {
    let active = true;
    const refresh = () => client.readDataExportStatus().then(
      (next) => { if (active) { setStatus(next); setStatusUnavailable(false); } },
      () => { if (active) setStatusUnavailable(true); }
    );
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 5_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [client]);

  async function beginConfirmation(fromLink = false): Promise<void> {
    focusFromLink.current = fromLink;
    setMessage(null);
    try {
      const methods = await client.authMethods();
      if (methods.available_step_up_methods.length === 0) {
        focusFromLink.current = false;
        setNoMethod(true);
        setConfirming(false);
      } else {
        setNoMethod(false);
        setConfirming(true);
      }
    } catch {
      focusFromLink.current = false;
      setMessage(t(catalog, "settings.export.unavailable"));
    }
  }

  useEffect(() => {
    if (status === null && !statusUnavailable) return;
    const url = new URL(window.location.href);
    if (url.pathname !== "/settings" || url.searchParams.get("request-export") !== "1") return;
    url.searchParams.delete("request-export");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    if (!statusUnavailable && status && (status.status === "NONE" || status.status === "FAILED" || status.status === "SENT")) {
      void beginConfirmation(true);
    }
  }, [status, statusUnavailable]);

  useEffect(() => {
    if (!confirming || !focusFromLink.current || !cardRef.current) return;
    const card = cardRef.current;
    card.scrollIntoView?.({ block: "center" });
    const focusFirstChoice = () => {
      const choice = card.querySelector<HTMLButtonElement>(".authSecurityConfirmation .authSecurityActions button");
      if (!choice) return false;
      choice.focus({ preventScroll: true });
      focusFromLink.current = false;
      return true;
    };
    if (focusFirstChoice()) return;
    const observer = new MutationObserver(() => { if (focusFirstChoice()) observer.disconnect(); });
    observer.observe(card, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [confirming]);

  async function request(grantToken: string): Promise<void> {
    returnFocus.current = true;
    setConfirming(false);
    setRequesting(true);
    setMessage(null);
    try {
      setStatus(await client.requestDataExport(grantToken, catalogLocale(locale)));
      setStatusUnavailable(false);
    } catch (failure) {
      setMessage(refusalMessage(failure, catalog, locale));
      try { setStatus(await client.readDataExportStatus()); setStatusUnavailable(false); }
      catch { setStatusUnavailable(true); }
    } finally {
      setRequesting(false);
    }
  }

  return (
    <section className="setCard" aria-labelledby="export-heading" ref={cardRef}>
      <h2 className="setCardTitle" id="export-heading" ref={heading} tabIndex={-1}>{t(catalog, "settings.export.title")}</h2>
      <p className="setCardHint">{t(catalog, "settings.export.hint")}</p>
      {status === null && !statusUnavailable ? <p className="setStatus" role="status">{t(catalog, "settings.export.checking")}</p> : null}
      {statusUnavailable ? <p className="setStatus" role="status">{t(catalog, "settings.export.statusUnavailable")}</p> : null}
      {!statusUnavailable && status?.status === "PREPARING" ? <p className="setStatus" role="status">{t(catalog, "settings.export.preparing", {
        time: formatDate(locale, status.requested_at, { dateStyle: "medium", timeStyle: "short" })
      })}</p> : null}
      {!statusUnavailable && status?.status === "SENT" ? <p className="setStatus" role="status">{t(catalog, "settings.export.sent", {
        time: formatDate(locale, status.requested_at, { dateStyle: "medium", timeStyle: "short" }),
        expires: formatDate(locale, status.expires_at, { dateStyle: "medium", timeStyle: "short" })
      })}</p> : null}
      {!statusUnavailable && status?.status === "FAILED" ? <p className="setStatus" role="status">{t(catalog, "settings.export.failed")}</p> : null}
      {noMethod && !statusUnavailable ? <><p className="setStatus" role="status">{t(catalog, "settings.export.noMethod")}</p><div className="setCardRow"><a className="setBtn" href="/settings/security">{t(catalog, "settings.security.title")}</a></div></> : null}
      {status !== null && !statusUnavailable && (status.status === "NONE" || status.status === "FAILED" || status.status === "SENT") && !noMethod ? (
        <div className="setCardRow">
          <button className="setBtn" type="button" ref={requestButton} disabled={requesting} onClick={() => { if (!confirming) void beginConfirmation(); }}>
            {requesting ? t(catalog, "settings.export.requesting")
              : status.status === "SENT" ? t(catalog, "settings.export.requestAgain")
              : t(catalog, "settings.export.request")}
          </button>
        </div>
      ) : null}
      {!statusUnavailable && status?.status === "SENT" ? <p className="setCardNote">{t(catalog, "settings.export.supersedes")}</p> : null}
      {confirming ? <SecurityConfirmation catalog={authCatalog} client={client} authorization={{ action: "EXPORT_DATA" }}
        onError={() => setMessage(t(catalog, "settings.export.notAuthorized"))}
        onConfirmed={(result) => request(result.step_up_grant.token)}
        onCancel={() => { returnFocus.current = true; setConfirming(false); setMessage(null); }} /> : null}
      {message ? <p className="setStatus" role="status">{message}</p> : null}
    </section>
  );
}
