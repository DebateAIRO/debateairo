"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ContractHttpError, type ContractClient } from "@debateai/contract";
import { ageConfirmationHref } from "@/lib/ageConfirmation";
import { contractClient } from "@/lib/api";
import { checkoutFailureKey } from "@/lib/billing/checkoutFailure";
import { COUNTRY_CODES } from "@/lib/billing/countries";
import { countryName, formatUsd, planName, renewDayLabel, taxLabel } from "@/lib/billing/format";
import type { PaidPlanId } from "@/lib/billing/plans";
import type { XMoneySdkLoader } from "@/lib/billing/xmoneySdk";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import billingEnglish from "@/messages/en/billing.json";
import { ChargeStatusPoller } from "./ChargeStatusPoller";
import { XMoneyCardForm } from "./XMoneyCardForm";

export type CheckoutClient = Pick<ContractClient, "createBillingQuote" | "startBillingCheckout" | "getBillingCharge">;
type Quote = Awaited<ReturnType<ContractClient["createBillingQuote"]>>;
type CheckoutAnswer = Awaited<ReturnType<ContractClient["startBillingCheckout"]>>;
/** The signed order the card form mounts; P8c's CHECKOUT_PENDING answer (`{state: "PENDING", charge_ref}`) is not one. */
type Checkout = Exclude<CheckoutAnswer, Readonly<{ state: "PENDING" }>>;
export type ConsentPair = Readonly<{ version: string; sha256: string }>;
export type CheckoutConsents = Readonly<{ renewal: ConsentPair; immediateStart: ConsentPair }>;

/** Quaderno prices the US and Canada by postal code (spec §1.3 "Paying" step 1). */
const POSTAL_COUNTRIES: ReadonlySet<string> = new Set(["US", "CA"]);
/**
 * R-15: SmartBill refuses a Romanian invoice without the buyer's name, city and county, so Romania asks at once.
 * Any other country the register sends to SmartBill asks as soon as its quote answers `address_required`.
 */
const INVOICE_ADDRESS_COUNTRIES: ReadonlySet<string> = new Set(["RO"]);

/** Leaves for the age gate's interstitial the way AuthGate does (no history entry back to a page that cannot pay). */
const leaveFor = (href: string): void => { window.location.replace(href); };

export function CheckoutFlow({
  planId,
  locale,
  catalog = billingEnglish,
  consents,
  sdkOrigin,
  nonce,
  client = contractClient,
  loadSdk,
  navigate = leaveFor
}: Readonly<{
  planId: PaidPlanId;
  locale: string;
  catalog?: MessageCatalog;
  consents: CheckoutConsents | null;
  sdkOrigin: string | null;
  nonce: string | undefined;
  client?: CheckoutClient;
  loadSdk?: XMoneySdkLoader;
  navigate?: (href: string) => void;
}>) {
  // Empty until P8b's first quote answers the connection's country (spec §1.3: pre-filled from the address).
  const [country, setCountry] = useState("");
  const [region, setRegion] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [city, setCity] = useState("");
  const [companyOpen, setCompanyOpen] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [vatId, setVatId] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [countryConfirmed, setCountryConfirmed] = useState(false);
  const [renewalAccepted, setRenewalAccepted] = useState(false);
  const [immediateAccepted, setImmediateAccepted] = useState(false);
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [chargeRef, setChargeRef] = useState<string | null>(null);
  const [settled, setSettled] = useState<"SUCCEEDED" | "FAILED" | "TIMED_OUT" | null>(null);
  const [busy, setBusy] = useState(false);
  const [messageKey, setMessageKey] = useState<string | null>(null);
  // The country whose quote (or checkout) asked for the invoice address; the fields stay until another is picked.
  const [addressAskedFor, setAddressAskedFor] = useState<string | null>(null);
  const started = useRef(false);
  const name = planName(catalog, planId);
  const needsPostal = POSTAL_COUNTRIES.has(country);
  const needsInvoiceAddress = INVOICE_ADDRESS_COUNTRIES.has(country) || (country !== "" && addressAskedFor === country);
  const countries = useMemo(
    () => COUNTRY_CODES.map((code) => ({ code, label: countryName(locale, code) }))
      .sort((left, right) => left.label.localeCompare(right.label, locale)),
    [locale]
  );
  const addressComplete = country !== ""
    && (!needsPostal || postalCode.trim() !== "")
    && (!needsInvoiceAddress || (fullName.trim() !== "" && city.trim() !== "" && region.trim() !== ""));
  // A company block that is open and started must be whole: half of it would quote a business as a consumer.
  const companyFields = [companyName, vatId, companyAddress].map((value) => value.trim());
  const companyStarted = companyOpen && companyFields.some((value) => value !== "");
  const companyComplete = companyFields.every((value) => value !== "");
  const companyIncomplete = companyStarted && !companyComplete;

  /**
   * `fromConnection`: the first quote sends no country, so P8b prices the connection's own and answers it as
   * `country` (its pre-fill). Every later quote names the selected country and the fields that country shows.
   */
  async function requestQuote(fromConnection = false): Promise<void> {
    setBusy(true);
    setMessageKey(null);
    setQuote(null);
    setCountryConfirmed(false);
    setRenewalAccepted(false);
    setImmediateAccepted(false);
    const company = companyOpen && companyComplete
      ? { name: companyFields[0]!, vat_id: companyFields[1]!, address: companyFields[2]! }
      : null;
    try {
      // Only the fields the chosen country shows are sent: a county typed for Romania never follows a switch to Germany.
      const asksRegion = needsPostal || needsInvoiceAddress;
      const answer = await client.createBillingQuote(fromConnection ? { plan_id: planId } : {
        plan_id: planId,
        country,
        ...(!asksRegion || region.trim() === "" ? {} : { region: region.trim() }),
        ...(!needsPostal || postalCode.trim() === "" ? {} : { postal_code: postalCode.trim() }),
        ...(needsInvoiceAddress ? { city: city.trim(), name: fullName.trim() } : {}),
        ...(company === null ? {} : { company })
      });
      setCountry(answer.country);
      if (answer.address_required) setAddressAskedFor(answer.country);
      setQuote(answer);
    } catch (failure) {
      setMessageKey(checkoutFailureKey(failure));
    } finally {
      setBusy(false);
    }
  }

  // The connection's country is priced at once (P8b's pre-fill). For Romania that first answer says
  // address_required, and the page asks for the name, city and county before the card step (R-15).
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void requestQuote(true);
  });

  async function continueToCard(): Promise<void> {
    if (quote === null || consents === null) return;
    setBusy(true);
    setMessageKey(null);
    try {
      const answer = await client.startBillingCheckout({
        quote_ref: quote.quote_ref,
        locale,
        consents: { renewal_terms: consents.renewal, immediate_start: consents.immediateStart },
        ...(quote.country_confirm_needed ? { country_confirmed: true as const } : {})
      });
      // P8c's CHECKOUT_PENDING: this checkout's payment is already on its way. Show its waiting screen; mounting
      // the card form again would let the person pay the same order twice. Told apart structurally: only that
      // answer has a `state` (always "PENDING"), and the `in` check alone narrows the signed order for setCheckout.
      if ("state" in answer) {
        setChargeRef(answer.charge_ref);
        return;
      }
      setCheckout(answer);
    } catch (failure) {
      // P8c's age guard (R3-2): the page's own read failed open and the account still owes its one-time age check.
      // Send the person to the age gate's interstitial with this checkout as `next`, exactly as the page does.
      if (failure instanceof ContractHttpError && failure.serverCode === "AGE_CONFIRMATION_REQUIRED") {
        navigate(ageConfirmationHref(`/checkout?plan=${planId}`));
        return;
      }
      if (failure instanceof ContractHttpError && failure.serverCode === "BILLING_ADDRESS_REQUIRED") {
        setAddressAskedFor(country);
      }
      setMessageKey(checkoutFailureKey(failure));
    } finally {
      setBusy(false);
    }
  }

  function startAgain(): void {
    setChargeRef(null);
    setCheckout(null);
    setSettled(null);
    void requestQuote();
  }

  const totalLine = quote === null ? "" : t(catalog, "billing.checkout.total", {
    plan: name,
    net: formatUsd(locale, quote.net),
    taxLabel: taxLabel(catalog, locale, {
      status: quote.tax_status, taxAmount: quote.tax, taxName: quote.tax_name, rateBasisPoints: quote.tax_rate_bp,
      country: quote.tax_country
    }),
    total: formatUsd(locale, quote.total),
    day: renewDayLabel(locale, quote.renews_on)
  });

  if (chargeRef !== null) {
    return (
      <section aria-labelledby="checkout-status-title">
        <h1 id="checkout-status-title" className="setTitle">{t(catalog, "billing.checkout.title", { plan: name })}</h1>
        <ChargeStatusPoller
          chargeRef={chargeRef}
          catalog={catalog}
          client={client}
          successText={t(catalog, "billing.checkout.succeeded", { plan: name })}
          failureText={t(catalog, "billing.checkout.failed")}
          onSettled={setSettled}
        />
        {settled === "SUCCEEDED" ? (
          <div className="billingActions">
            <a className="btn btnDark" href="/new">{t(catalog, "billing.checkout.startDebate")}</a>
            <a className="btn" href="/settings">{t(catalog, "billing.checkout.goToSettings")}</a>
          </div>
        ) : null}
        {settled === "FAILED" ? (
          <div className="billingActions">
            <button type="button" className="btn" onClick={startAgain}>{t(catalog, "billing.checkout.tryAgain")}</button>
          </div>
        ) : null}
        {settled === "TIMED_OUT" ? (
          // The bank may still confirm (3-D Secure, retries): never offer a new payment here, only the way to Settings.
          <>
            <p className="billingNote">{t(catalog, "billing.checkout.doNotPayAgain")}</p>
            <div className="billingActions">
              <a className="btn" href="/settings">{t(catalog, "billing.checkout.goToSettings")}</a>
            </div>
          </>
        ) : null}
      </section>
    );
  }

  if (checkout !== null) {
    return (
      <XMoneyCardForm
        checkout={checkout}
        sdkOrigin={sdkOrigin}
        nonce={nonce}
        locale={locale}
        catalog={catalog}
        submitLabel={t(catalog, "billing.checkout.subscribeAndPay")}
        summary={totalLine}
        onSubmitted={() => setChargeRef(checkout.charge_ref)}
        {...(loadSdk === undefined ? {} : { loadSdk })}
      />
    );
  }

  const canQuote = !busy && addressComplete && !companyIncomplete;
  // P8c refuses BILLING_ADDRESS_REQUIRED for a quote that still lacks the invoice address (R-15), so it never goes on.
  const canContinue = !busy && quote !== null && consents !== null && renewalAccepted && immediateAccepted
    && !quote.address_required && (!quote.country_confirm_needed || countryConfirmed);

  return (
    <section aria-labelledby="checkout-title">
      <p className="setEyebrow">{t(catalog, "billing.checkout.eyebrow")}</p>
      <h1 id="checkout-title" className="setTitle">{t(catalog, "billing.checkout.title", { plan: name })}</h1>
      <form onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (canQuote) void requestQuote(); }}>
        <div className="billingField">
          <label htmlFor="checkout-country">{t(catalog, "billing.checkout.country")}</label>
          <select id="checkout-country" value={country} onChange={(event) => { setCountry(event.target.value); setQuote(null); setAddressAskedFor(null); }} required>
            <option value="" disabled>{t(catalog, "billing.checkout.country")}</option>
            {countries.map((entry) => <option key={entry.code} value={entry.code}>{entry.label}</option>)}
          </select>
        </div>
        {needsInvoiceAddress ? (
          <>
            <p className="billingNote">{t(catalog, "billing.checkout.romaniaNote")}</p>
            <div className="billingField">
              <label htmlFor="checkout-name">{t(catalog, "billing.checkout.fullName")}</label>
              <input id="checkout-name" value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" required />
            </div>
            <div className="billingField">
              <label htmlFor="checkout-city">{t(catalog, "billing.checkout.city")}</label>
              <input id="checkout-city" value={city} onChange={(event) => setCity(event.target.value)} autoComplete="address-level2" required />
            </div>
            <div className="billingField">
              <label htmlFor="checkout-region">{t(catalog, "billing.checkout.county")}</label>
              <input id="checkout-region" value={region} onChange={(event) => setRegion(event.target.value)} autoComplete="address-level1" required />
            </div>
          </>
        ) : null}
        {needsPostal ? (
          <>
            <div className="billingField">
              <label htmlFor="checkout-region">{t(catalog, "billing.checkout.region")}</label>
              <input id="checkout-region" value={region} onChange={(event) => setRegion(event.target.value)} autoComplete="address-level1" />
            </div>
            <div className="billingField">
              <label htmlFor="checkout-postal">{t(catalog, "billing.checkout.postalCode")}</label>
              <input id="checkout-postal" value={postalCode} onChange={(event) => setPostalCode(event.target.value)} autoComplete="postal-code" required />
            </div>
          </>
        ) : null}
        <div className="billingActions">
          <button type="button" className="setBtn" aria-expanded={companyOpen} onClick={() => setCompanyOpen(!companyOpen)}>
            {t(catalog, "billing.checkout.companyToggle")}
          </button>
        </div>
        {companyOpen ? (
          <>
            <div className="billingField">
              <label htmlFor="checkout-company-name">{t(catalog, "billing.checkout.companyName")}</label>
              <input id="checkout-company-name" value={companyName} onChange={(event) => setCompanyName(event.target.value)} autoComplete="organization" />
            </div>
            <div className="billingField">
              <label htmlFor="checkout-company-vat">{t(catalog, "billing.checkout.companyVatId")}</label>
              <input id="checkout-company-vat" value={vatId} onChange={(event) => setVatId(event.target.value)} />
            </div>
            <div className="billingField">
              <label htmlFor="checkout-company-address">{t(catalog, "billing.checkout.companyAddress")}</label>
              <input id="checkout-company-address" value={companyAddress} onChange={(event) => setCompanyAddress(event.target.value)} autoComplete="street-address" />
            </div>
            {companyIncomplete ? <p className="billingNote" role="status">{t(catalog, "billing.checkout.companyIncomplete")}</p> : null}
          </>
        ) : null}
        <div className="billingActions">
          <button type="submit" className="btn" disabled={!canQuote}>{t(catalog, "billing.checkout.showPrice")}</button>
        </div>
      </form>
      {busy && quote === null ? <p className="billingStatus" role="status">{t(catalog, "billing.checkout.quoting")}</p> : null}
      {messageKey !== null ? <p className="billingError" role="alert">{t(catalog, messageKey)}</p> : null}
      {messageKey === "billing.checkout.alreadySubscribed" ? (
        <p><a href="/settings">{t(catalog, "billing.checkout.goToSettings")}</a></p>
      ) : null}
      {consents === null ? <p className="billingError" role="alert">{t(catalog, "billing.checkout.genericError")}</p> : null}
      {quote !== null ? (
        <section aria-labelledby="checkout-total">
          <p id="checkout-total" className="billingTotal">{totalLine}</p>
          {quote.country_confirm_needed ? (
            <div className="billingConsent">
              <p>{t(catalog, "billing.checkout.confirmCountry", {
                // P8b always answers the connection's country; sentence G3 names it only when they differ.
                ipCountry: countryName(locale, quote.ip_country),
                declaredCountry: countryName(locale, country)
              })}</p>
              <button type="button" className="setBtn" aria-pressed={countryConfirmed} onClick={() => setCountryConfirmed(true)}>
                {t(catalog, "billing.checkout.confirmCountryYes")}
              </button>
            </div>
          ) : null}
          <label className="billingConsent">
            <input type="checkbox" checked={renewalAccepted} onChange={(event) => setRenewalAccepted(event.target.checked)} />
            <span>{t(catalog, "billing.consent.renewal")}</span>
          </label>
          <label className="billingConsent">
            <input type="checkbox" checked={immediateAccepted} onChange={(event) => setImmediateAccepted(event.target.checked)} />
            <span>{t(catalog, "billing.consent.immediateStart")}</span>
          </label>
          <div className="billingActions">
            <button type="button" className="btn btnDark" disabled={!canContinue} onClick={() => { void continueToCard(); }}>
              {t(catalog, "billing.checkout.continueToCard")}
            </button>
          </div>
        </section>
      ) : null}
    </section>
  );
}
