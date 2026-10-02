"use client";

import { useState } from "react";
import { ContractHttpError, type ContractClient } from "@debateai/contract";
import { contractClient } from "@/lib/api";
import { formatUsd } from "@/lib/billing/format";
import type { XMoneySdkLoader } from "@/lib/billing/xmoneySdk";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import billingEnglish from "@/messages/en/billing.json";
import { ChargeStatusPoller } from "./ChargeStatusPoller";
import { XMoneyCardForm } from "./XMoneyCardForm";

export type CardChangeClient = Pick<ContractClient, "startCardChange" | "getBillingCharge">;
type Checkout = Awaited<ReturnType<ContractClient["startCardChange"]>>;

const NO_HOLD = /^0+(?:\.0+)?$/;

/** Leaves for sign-in the way CheckoutFlow does (no history entry back to a page that cannot change the card). */
const leaveFor = (href: string): void => { window.location.replace(href); };

/** The API's SESSION_REQUIRED: the session ended while the page was open (expired, revoked, signed out elsewhere). */
const sessionEnded = (failure: unknown): boolean => failure instanceof ContractHttpError && failure.status === 401;

/**
 * AMENDMENTS-R1 A12: a new managed order with an authorisation hold that is released at once. It lives on its own
 * page, so the xMoney policy (A11) never touches /settings itself. Spec §1.3: the page names the hold in plain words,
 * with the amount the server signed (`hold_amount`), before the person presses "Save card".
 */
export function CardChangeFlow({
  catalog = billingEnglish,
  locale,
  sdkOrigin,
  nonce,
  returnedChargeRef = null,
  client = contractClient,
  loadSdk,
  navigate = leaveFor
}: Readonly<{
  catalog?: MessageCatalog;
  locale: string;
  sdkOrigin: string | null;
  nonce: string | undefined;
  /** P12e's backUrl `/settings/card?charge=<ref>`: back from the bank's check, the page polls that charge. */
  returnedChargeRef?: string | null;
  client?: CardChangeClient;
  loadSdk?: XMoneySdkLoader;
  navigate?: (href: string) => void;
}>) {
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [chargeRef, setChargeRef] = useState<string | null>(returnedChargeRef);
  const [busy, setBusy] = useState(false);
  const [messageKey, setMessageKey] = useState<string | null>(null);

  async function start(): Promise<void> {
    setBusy(true);
    setMessageKey(null);
    try {
      setCheckout(await client.startCardChange());
    } catch (failure) {
      // Spec §2.10: the page requires sign-in. A session that ended goes back to sign-in and then to this page, with
      // no error sentence, as CheckoutFlow does.
      if (sessionEnded(failure)) {
        navigate(`/login?next=${encodeURIComponent("/settings/card")}`);
        return;
      }
      const code = failure instanceof ContractHttpError ? failure.serverCode : null;
      setMessageKey(code === "NOT_SUBSCRIBED" ? "billing.card.notSubscribed"
        // P15 (D6b): while an account deletion is pending, the card change takes no new hold.
        : code === "ACCOUNT_ERASURE_PENDING" ? "billing.checkout.erasurePending"
        // P12e (D6b, 409): a payment on the plan is still being confirmed, so no card check starts now.
        : code === "CARD_CHANGE_NOT_AVAILABLE_NOW" ? "billing.card.tryAgainShortly"
        // P12e (D6b, 403): the updated Terms come first, as at checkout.
        : code === "LEGAL_REACCEPTANCE_REQUIRED" ? "billing.checkout.reacceptRequired"
        : "billing.checkout.genericError");
    } finally {
      setBusy(false);
    }
  }

  const holdNote = checkout === null ? "" : NO_HOLD.test(checkout.hold_amount)
    ? t(catalog, "billing.card.noHoldNote")
    : t(catalog, "billing.card.holdNote", { amount: formatUsd(locale, checkout.hold_amount) });

  return (
    <section aria-labelledby="card-change-title">
      <h1 id="card-change-title" className="setTitle">{t(catalog, "billing.card.title")}</h1>
      <p className="billingNote">{t(catalog, "billing.card.intro")}</p>
      {chargeRef !== null ? (
        <ChargeStatusPoller
          chargeRef={chargeRef}
          catalog={catalog}
          client={client}
          successText={t(catalog, "billing.card.saved")}
          failureText={t(catalog, "billing.card.failed")}
        />
      ) : checkout !== null ? (
        <XMoneyCardForm
          checkout={checkout}
          sdkOrigin={sdkOrigin}
          nonce={nonce}
          locale={locale}
          catalog={catalog}
          submitLabel={t(catalog, "billing.card.save")}
          summary={holdNote}
          onSubmitted={() => setChargeRef(checkout.charge_ref)}
          {...(loadSdk === undefined ? {} : { loadSdk })}
        />
      ) : (
        <div className="billingActions">
          <button type="button" className="btn btnDark" disabled={busy} onClick={() => { void start(); }}>
            {t(catalog, "billing.checkout.continueToCard")}
          </button>
        </div>
      )}
      {messageKey !== null ? <p className="billingError" role="alert">{t(catalog, messageKey)}</p> : null}
      <p className="billingActions"><a href="/settings">{t(catalog, "billing.card.back")}</a></p>
    </section>
  );
}
