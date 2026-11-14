"use client";

import { useEffect, useState } from "react";
import { ContractHttpError, postcodeOptional, type BillingCurrency, type ContractClient } from "@debateai/contract";
import { contractClient } from "@/lib/api";
import { focusIsLost } from "@/lib/focusGuard";
import { phoneTyped } from "@/lib/billing/callingCodes";
import { countryName, formatMoney } from "@/lib/billing/format";
import { catalogLocale, type LocaleCode } from "@/lib/i18n/locales";
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
type CardField = keyof BillingDetails | "city";
const FIELD_ORDER: readonly CardField[] = ["firstName", "lastName", "phone", "street", "postalCode", "city"];
const FIELD_REQUIRED = "billing.card.fieldRequired";

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
  locale: LocaleCode;
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
  /** Set by a press on "Check my new card" while something is missing; each field then says what is wrong with it. */
  const [showErrors, setShowErrors] = useState(false);

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
        locale: catalogLocale(locale), renewal_terms: renewalConsent, first_name: details.firstName.trim(), last_name: details.lastName.trim(),
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
      // Keyboard audit 2026-11-12: a refused phone is fixed in its field, above the button: focus goes there.
      if (code === "BILLING_PHONE_INVALID" && (focusIsLost() || document.activeElement?.matches(":disabled")))
        document.getElementById("card-phone")?.focus();
    }
  }

  const postalOptional = stored !== null && postcodeOptional(stored.country);
  // The checkout's rules, field by field (keyboard audit 2026-11-12, SET-10): a phone still at its calling code is not typed.
  const missing: Partial<Record<CardField, string>> = {};
  if (details !== null) {
    if (details.firstName.trim() === "") missing.firstName = FIELD_REQUIRED;
    if (details.lastName.trim() === "") missing.lastName = FIELD_REQUIRED;
    if (!phoneTyped(details.phone)) missing.phone = "billing.checkout.phoneInvalid";
    if (details.street.trim() === "") missing.street = FIELD_REQUIRED;
    if (!postalOptional && details.postalCode.trim() === "") missing.postalCode = FIELD_REQUIRED;
    if (city.trim() === "") missing.city = FIELD_REQUIRED;
  }
  const fieldError = (field: CardField): string | undefined => {
    const key = missing[field];
    return showErrors && key !== undefined ? t(catalog, key) : undefined;
  };
  const firstMissing = FIELD_ORDER.find((field) => missing[field] !== undefined);
  const complete = details !== null && firstMissing === undefined;
  const canStart = !busy && complete && agreed && renewalConsent !== null && total !== null && currency !== null;
  // As on the checkout, the button stays focusable while it is locked: this says why (as its description and when
  // pressed), and a press marks every missing field and moves focus to the first, or to the agreement.
  const blocker: { key: string; target: string } | null = busy ? null
    : firstMissing !== undefined ? { key: "billing.card.detailsRequired", target: `card-${firstMissing}` }
    : !agreed ? { key: "billing.card.agreementRequired", target: "card-agreement" }
    : null;
  function pressLocked(): void {
    if (blocker === null) return;
    if (firstMissing !== undefined) setShowErrors(true);
    document.getElementById(blocker.target)?.focus();
  }

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
            errors={{
              firstName: fieldError("firstName"), lastName: fieldError("lastName"), phone: fieldError("phone"),
              street: fieldError("street"), postalCode: fieldError("postalCode")
            }}
            onChange={(field, value) => setDetails({ ...details, [field]: value })} />
          <div className="billingField">
            <label htmlFor="card-city">{t(catalog, "billing.checkout.city")}</label>
            <input id="card-city" value={city} onChange={(event) => setCity(event.target.value)} autoComplete="address-level2" required
              aria-invalid={Boolean(fieldError("city"))} aria-describedby={fieldError("city") ? "card-city-error" : undefined} />
            {fieldError("city") ? <p id="card-city-error" className="authFieldError">{fieldError("city")}</p> : null}
          </div>
          <p className="billingNote">{t(catalog, "billing.card.noHoldNote")}</p>
          {total !== null && currency !== null ? (
            <>
              <label className="billingConsent">
                <input id="card-agreement" type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
                <span>{t(catalog, "billing.consent.renewal", { total: formatMoney(locale, total, currency) })}</span>
              </label>
              <div className="billingActions">
                <button
                  type="button"
                  className="btn btnDark"
                  // Only a lock with a reason stays focusable; with no renewal terms loaded there is nothing to do or say.
                  disabled={busy || (!canStart && blocker === null)}
                  aria-disabled={blocker !== null || undefined}
                  aria-describedby={blocker !== null ? "card-check-hint" : undefined}
                  onClick={() => { if (canStart) void start(); else pressLocked(); }}
                >
                  {t(catalog, "billing.card.checkCard")}
                </button>
                {blocker !== null ? <span id="card-check-hint" className="srOnly">{t(catalog, blocker.key)}</span> : null}
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
