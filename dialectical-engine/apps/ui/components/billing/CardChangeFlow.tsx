"use client";

import { useEffect, useState } from "react";
import { ContractHttpError, postcodeOptional, type BillingCurrency, type ContractClient } from "@debateai/contract";
import { contractClient } from "@/lib/api";
import { countryName, formatMoney } from "@/lib/billing/format";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import billingEnglish from "@/messages/en/billing.json";
import { BillingDetailsFields, type BillingDetails } from "./BillingDetailsFields";
import { ChargeStatusPoller } from "./ChargeStatusPoller";
import type { ConsentPair } from "./CheckoutFlow";

export type CardChangeClient = Pick<ContractClient, "getBillingCardDetails" | "getBillingSubscription" | "startCardChange" | "getBillingCharge">;
type Stored = Awaited<ReturnType<ContractClient["getBillingCardDetails"]>>;

const leaveFor = (href: string): void => { window.location.replace(href); };
/** Spec §2.11: NETOPIA's check for 0 is reached by a top-level navigation, as the checkout's page is. */
const leaveForPayment = (url: string): void => { window.location.assign(url); };
const sessionEnded = (failure: unknown): boolean => failure instanceof ContractHttpError && failure.status === 401;

/** Spec 2026-10-05 §2.11 (C-2): corrected details (country and region fixed, §2.5.3), the agreement, NETOPIA's 0 check. */
export function CardChangeFlow({
  catalog = billingEnglish,
  locale,
  renewalConsent,
  returnedChargeRef = null,
  client = contractClient,
  navigate = leaveFor,
  goToPayment = leaveForPayment
}: Readonly<{
  catalog?: MessageCatalog;
  locale: string;
  /** The renewal sentence's manifest pair in this locale; null: the page offers no check (the server would refuse it). */
  renewalConsent: ConsentPair | null;
  returnedChargeRef?: string | null;
  client?: CardChangeClient;
  navigate?: (href: string) => void;
  goToPayment?: (url: string) => void;
}>) {
  const [stored, setStored] = useState<Stored | null>(null);
  const [details, setDetails] = useState<BillingDetails | null>(null);
  const [city, setCity] = useState("");
  const [total, setTotal] = useState<string | null>(null);
  // Spec 2026-10-05 §2.16.3: the subscription's own currency, the one its total is in.
  const [currency, setCurrency] = useState<BillingCurrency | null>(null);
  const [cancelRequested, setCancelRequested] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [messageKey, setMessageKey] = useState<string | null>(null);

  useEffect(() => {
    if (returnedChargeRef !== null) return;
    let active = true;
    void (async () => {
      try {
        const [read, subscribed] = await Promise.all([client.getBillingCardDetails(), client.getBillingSubscription()]);
        if (!active) return;
        setStored(read);
        setDetails({
          firstName: read.first_name ?? "", lastName: read.last_name ?? "", phone: read.phone ?? "",
          street: read.street ?? "", postalCode: read.postal_code ?? ""
        });
        setCity(read.city ?? "");
        setTotal(subscribed.subscription?.renewal_total ?? null);
        setCurrency(subscribed.subscription?.currency ?? null);
        setCancelRequested(subscribed.subscription?.cancel_requested ?? false);
      } catch (failure) {
        if (!active) return;
        if (sessionEnded(failure)) { navigate(`/login?next=${encodeURIComponent("/settings/card")}`); return; }
        setMessageKey(failure instanceof ContractHttpError && failure.serverCode === "NOT_SUBSCRIBED"
          ? "billing.card.notSubscribed" : "billing.checkout.genericError");
      }
    })();
    return () => { active = false; };
  }, [client, navigate, returnedChargeRef]);

  async function start(): Promise<void> {
    if (stored === null || details === null || renewalConsent === null) return;
    setBusy(true);
    setMessageKey(null);
    try {
      const started = await client.startCardChange({
        locale, renewal_terms: renewalConsent, first_name: details.firstName.trim(), last_name: details.lastName.trim(),
        phone: details.phone.trim(), street: details.street.trim(), city: city.trim(),
        ...(details.postalCode.trim() === "" ? {} : { postal_code: details.postalCode.trim() })
      });
      goToPayment(started.redirect_url);
    } catch (failure) {
      setBusy(false);
      if (sessionEnded(failure)) {
        navigate(`/login?next=${encodeURIComponent("/settings/card")}`);
        return;
      }
      const code = failure instanceof ContractHttpError ? failure.serverCode : null;
      setMessageKey(code === "NOT_SUBSCRIBED" ? "billing.card.notSubscribed"
        : code === "ACCOUNT_ERASURE_PENDING" ? "billing.checkout.erasurePending"
        : code === "CARD_CHANGE_NOT_AVAILABLE_NOW" ? "billing.card.tryAgainShortly"
        : code === "LEGAL_REACCEPTANCE_REQUIRED" ? "billing.checkout.reacceptRequired"
        // F4 (finding ui-2): the agreement this page carries was superseded while it was open; a retry resends it.
        : code === "LEGAL_DOCUMENT_STALE" ? "billing.checkout.pageOutdated"
        : code === "ADMISSION_RATE_LIMITED" ? "billing.checkout.rateLimited"
        : code === "BILLING_PHONE_INVALID" ? "billing.checkout.phoneInvalid"
        : code === "BILLING_ADDRESS_REQUIRED" ? "billing.checkout.detailsRequired"
        : code === "PAYMENT_PROVIDER_UNAVAILABLE" ? "billing.checkout.formUnavailable"
        : "billing.checkout.genericError");
    }
  }

  const postalOptional = stored !== null && postcodeOptional(stored.country);
  const complete = details !== null && [details.firstName, details.lastName, details.phone, details.street, city]
    .every((value) => value.trim() !== "") && (postalOptional || details.postalCode.trim() !== "");
  const canStart = !busy && complete && agreed && renewalConsent !== null && total !== null && currency !== null;

  return (
    <section aria-labelledby="card-change-title">
      <h1 id="card-change-title" className="setTitle">{t(catalog, "billing.card.title")}</h1>
      <p className="billingNote">{t(catalog, "billing.card.intro")}</p>
      {returnedChargeRef !== null ? (
        <ChargeStatusPoller
          chargeRef={returnedChargeRef}
          catalog={catalog}
          client={client}
          successText={t(catalog, "billing.card.saved")}
          failureText={t(catalog, "billing.card.failed")}
          // No email follows a card check, so the wait promises none.
          timedOutText={t(catalog, "billing.subscription.stillConfirming")}
        />
      ) : stored !== null && details !== null ? (
        <>
          <div className="billingField">
            <label htmlFor="card-country">{t(catalog, "billing.checkout.country")}</label>
            <input id="card-country" value={countryName(locale, stored.country)} readOnly />
          </div>
          {stored.region !== null ? (
            <div className="billingField">
              <label htmlFor="card-region">{t(catalog, stored.country === "RO" ? "billing.checkout.county" : "billing.checkout.region")}</label>
              <input id="card-region" value={stored.region} readOnly />
            </div>
          ) : null}
          <p className="billingNote">{t(catalog, "billing.card.taxPlaceNote")}</p>
          <BillingDetailsFields catalog={catalog} idPrefix="card" values={details} postalOptional={postalOptional}
            onChange={(field, value) => setDetails({ ...details, [field]: value })} />
          <div className="billingField">
            <label htmlFor="card-city">{t(catalog, "billing.checkout.city")}</label>
            <input id="card-city" value={city} onChange={(event) => setCity(event.target.value)} autoComplete="address-level2" required />
          </div>
          <p className="billingNote">{t(catalog, "billing.card.noHoldNote")}</p>
          {total !== null && currency !== null ? (
            <>
              <label className="billingConsent">
                <input id="card-agreement" type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
                <span>{t(catalog, "billing.consent.renewal", { total: formatMoney(locale, total, currency) })}</span>
              </label>
              <div className="billingActions">
                <button type="button" className="btn btnDark" disabled={!canStart} onClick={() => { void start(); }}>
                  {t(catalog, "billing.card.checkCard")}
                </button>
              </div>
            </>
          ) : (
            // No total, no agreement to give and no check to start: say why instead of a button that never enables.
            cancelRequested
              ? <p className="billingStatus" role="status">{t(catalog, "billing.subscription.wontRenew")}</p>
              : <p className="billingError" role="alert">{t(catalog, "billing.checkout.genericError")}</p>
          )}
        </>
      ) : null}
      {messageKey === null ? null : messageKey === "billing.checkout.reacceptRequired" ? (
        <p className="billingError" role="alert"><a href="/">{t(catalog, messageKey)}</a></p>
      ) : <p className="billingError" role="alert">{t(catalog, messageKey)}</p>}
      <p className="billingActions"><a href="/settings">{t(catalog, "billing.card.back")}</a></p>
    </section>
  );
}
