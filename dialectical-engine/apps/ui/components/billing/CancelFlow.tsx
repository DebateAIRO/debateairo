"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ContractHttpError, type ContractClient } from "@debateai/contract";
import { contractClient } from "@/lib/api";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import billingEnglish from "@/messages/en/billing.json";

export type CancelClient = Pick<ContractClient, "requestCancelLink" | "cancelByToken">;

const TOKEN_FRAGMENT = /^#token=([A-Za-z0-9_-]{43})$/;

/** W10 (P2-M19, 429): both public routes share A25's hourly per-network budget; anything else is "try again". */
function failureKey(failure: unknown): string {
  return failure instanceof ContractHttpError && failure.serverCode === "ADMISSION_RATE_LIMITED"
    ? "billing.checkout.rateLimited" : "billing.checkout.genericError";
}

/** Reads the one-time token from the fragment (never the query) and takes it out of the address bar at once. */
export function readCancelToken(
  location: Pick<Location, "hash" | "pathname" | "search">,
  history: Pick<History, "replaceState">
): string | null {
  const match = TOKEN_FRAGMENT.exec(location.hash);
  if (match === null) return null;
  history.replaceState(null, "", `${location.pathname}${location.search}`);
  return match[1]!;
}

export function CancelFlow({
  catalog = billingEnglish,
  client = contractClient
}: Readonly<{ catalog?: MessageCatalog; client?: CancelClient }>) {
  const [stage, setStage] = useState<"EMAIL" | "CONFIRM" | "SENT" | "DONE" | "NOTHING">("EMAIL");
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [messageKey, setMessageKey] = useState<string | null>(null);

  useEffect(() => {
    const found = readCancelToken(window.location, window.history);
    if (found !== null) {
      setToken(found);
      setStage("CONFIRM");
    }
  }, []);

  async function send(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setMessageKey(null);
    try {
      await client.requestCancelLink(email.trim());
      setStage("SENT");
    } catch (failure) {
      setMessageKey(failureKey(failure));
    } finally {
      setBusy(false);
    }
  }

  async function confirm(): Promise<void> {
    if (token === null) return;
    setBusy(true);
    setMessageKey(null);
    try {
      await client.cancelByToken(token);
      setToken(null);
      setStage("DONE");
    } catch (failure) {
      if (failure instanceof ContractHttpError && failure.serverCode === "CANCEL_LINK_INVALID") {
        // P13: unknown, used or expired. The page offers a new link at once.
        setToken(null);
        setStage("EMAIL");
        setMessageKey("billing.cancelPage.linkInvalid");
      } else if (failure instanceof ContractHttpError && failure.serverCode === "NOTHING_TO_CANCEL") {
        // W10 (P2-M18): the token is spent, but its plan was already cancelled, ended, paused or replaced; nothing
        // changed, so the page never says "your plan is cancelled".
        setToken(null);
        setStage("NOTHING");
      } else {
        // A network or server failure, or the hourly limit, spends nothing: the same button may be pressed again.
        setMessageKey(failureKey(failure));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="cancel-title">
      <h1 id="cancel-title" className="setTitle">
        {t(catalog, stage === "CONFIRM" ? "billing.cancelPage.confirmTitle" : "billing.cancelPage.title")}
      </h1>
      {stage === "CONFIRM" ? (
        <>
          <p className="setLede">{t(catalog, "billing.cancelPage.confirmLede")}</p>
          <div className="billingActions">
            <button type="button" className="btn btnDark" disabled={busy} onClick={() => { void confirm(); }}>
              {t(catalog, "billing.cancelPage.confirm")}
            </button>
          </div>
        </>
      ) : null}
      {stage === "DONE" ? <p className="billingStatus" role="status">{t(catalog, "billing.cancelPage.done")}</p> : null}
      {stage === "NOTHING" ? <p className="billingStatus" role="status">{t(catalog, "billing.cancelPage.nothingToCancel")}</p> : null}
      {stage === "SENT" ? <p className="billingStatus" role="status">{t(catalog, "billing.cancelPage.sent")}</p> : null}
      {messageKey !== null ? <p className="billingError" role="alert">{t(catalog, messageKey)}</p> : null}
      {stage === "EMAIL" ? (
        <form method="post" action="/cancel" onSubmit={(event) => { void send(event); }}>
          <p className="setLede">{t(catalog, "billing.cancelPage.lede")}</p>
          <div className="billingField">
            <label htmlFor="cancel-email">{t(catalog, "billing.cancelPage.email")}</label>
            <input id="cancel-email" type="email" autoComplete="email" value={email}
              onChange={(event) => setEmail(event.target.value)} required />
          </div>
          <div className="billingActions">
            <button type="submit" className="btn btnDark" disabled={busy}>{t(catalog, "billing.cancelPage.send")}</button>
          </div>
          <p className="billingNote"><a href="/settings">{t(catalog, "billing.cancelPage.signedInHint")}</a></p>
        </form>
      ) : null}
    </section>
  );
}
