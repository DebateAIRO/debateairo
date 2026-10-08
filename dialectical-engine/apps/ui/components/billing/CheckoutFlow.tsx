"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  BUCHAREST_COUNTY, BUCHAREST_SECTORS, ContractHttpError, isRomanianInvoiceLocality, postcodeOptional, ROMANIA_COUNTIES,
  type ContractClient
} from "@debateai/contract";
import { ageConfirmationHref } from "@/lib/ageConfirmation";
import { contractClient } from "@/lib/api";
import { phonePrefill } from "@/lib/billing/callingCodes";
import { checkoutFailureKey } from "@/lib/billing/checkoutFailure";
import { COUNTRY_CODES } from "@/lib/billing/countries";
import { countryName, formatUsd, planName, renewDayLabel, taxLabel } from "@/lib/billing/format";
import type { PaidPlanId } from "@/lib/billing/plans";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import billingEnglish from "@/messages/en/billing.json";
import { BillingDetailsFields, type BillingDetails } from "./BillingDetailsFields";
import { ChargeStatusPoller } from "./ChargeStatusPoller";

export type CheckoutClient = Pick<ContractClient, "createBillingQuote" | "startBillingCheckout" | "getBillingCharge">;
type Quote = Awaited<ReturnType<ContractClient["createBillingQuote"]>>;
export type ConsentPair = Readonly<{ version: string; sha256: string }>;
export type CheckoutConsents = Readonly<{ renewal: ConsentPair; immediateStart: ConsentPair }>;

/** A31 (h), R-15: the countries whose region the invoice and the tax need (as N18's `addressRequired`). */
const REGION_COUNTRIES: ReadonlySet<string> = new Set(["US", "CA", "RO"]);
const EMPTY_DETAILS: BillingDetails = Object.freeze({ firstName: "", lastName: "", phone: "", street: "", postalCode: "" });

/** Leaves for the age gate's interstitial the way AuthGate does (no history entry back to a page that cannot pay). */
const leaveFor = (href: string): void => { window.location.replace(href); };
/** Spec §2.6.2 step 7: NETOPIA's page is reached by a top-level navigation, never a frame or a fetch. */
const leaveForPayment = (url: string): void => { window.location.assign(url); };

/** The API's SESSION_REQUIRED: the session ended while the page was open (expired, revoked, signed out elsewhere). */
const sessionEnded = (failure: unknown): boolean => failure instanceof ContractHttpError && failure.status === 401;

export function CheckoutFlow({
  planId,
  locale,
  catalog = billingEnglish,
  consents,
  client = contractClient,
  navigate = leaveFor,
  goToPayment = leaveForPayment
}: Readonly<{
  planId: PaidPlanId;
  locale: string;
  catalog?: MessageCatalog;
  consents: CheckoutConsents | null;
  client?: CheckoutClient;
  navigate?: (href: string) => void;
  goToPayment?: (url: string) => void;
}>) {
  // Empty until the first quote answers the connection's country (spec §1.3: pre-filled from the address).
  const [country, setCountry] = useState("");
  const [region, setRegion] = useState("");
  const [city, setCity] = useState("");
  const [details, setDetails] = useState<BillingDetails>(EMPTY_DETAILS);
  const [companyOpen, setCompanyOpen] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [vatId, setVatId] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [countryConfirmed, setCountryConfirmed] = useState(false);
  const [renewalAccepted, setRenewalAccepted] = useState(false);
  const [immediateAccepted, setImmediateAccepted] = useState(false);
  const [chargeRef, setChargeRef] = useState<string | null>(null);
  const [settled, setSettled] = useState<"SUCCEEDED" | "FAILED" | "TIMED_OUT" | null>(null);
  const [busy, setBusy] = useState(false);
  const [messageKey, setMessageKey] = useState<string | null>(null);
  const started = useRef(false);
  const name = planName(catalog, planId);
  const romanian = country === "RO";
  const bucharest = romanian && region === BUCHAREST_COUNTY;
  const asksRegion = REGION_COUNTRIES.has(country);
  const postalOptional = country !== "" && postcodeOptional(country);
  const countries = useMemo(
    () => COUNTRY_CODES.map((code) => ({ code, label: countryName(locale, code) }))
      .sort((left, right) => left.label.localeCompare(right.label, locale)),
    [locale]
  );
  const filled = (value: string): string => value.trim();
  // Spec §2.6.1: NETOPIA's cardholder for everyone; SmartBill's county list and, in Bucharest, a sector (P2-M15).
  const addressComplete = country !== ""
    && [details.firstName, details.lastName, details.phone, details.street, city].every((value) => filled(value) !== "")
    && (postalOptional || filled(details.postalCode) !== "")
    && (!asksRegion || filled(region) !== "")
    && (!romanian || isRomanianInvoiceLocality(region, city));
  // A company block that is open and started must be whole: half of it would quote a business as a consumer.
  const companyFields = [companyName, vatId, companyAddress].map(filled);
  const companyComplete = companyFields.every((value) => value !== "");
  const companyIncomplete = companyOpen && companyFields.some((value) => value !== "") && !companyComplete;

  function changeCountry(next: string): void {
    // A Romanian sector is no city elsewhere, and a city typed elsewhere is no Romanian locality.
    if ((next === "RO") !== (country === "RO")) setCity("");
    setCountry(next);
    setQuote(null);
    setRegion("");
    setDetails((current) => ({ ...current, phone: phonePrefill(next, current.phone) }));
  }

  /** `fromConnection`: the first quote sends no country (the server's pre-fill); later ones send the whole block. */
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
      const answer = await client.createBillingQuote(fromConnection ? { plan_id: planId } : {
        plan_id: planId,
        country,
        first_name: filled(details.firstName),
        last_name: filled(details.lastName),
        phone: filled(details.phone),
        street: filled(details.street),
        city: filled(city),
        ...(filled(details.postalCode) === "" ? {} : { postal_code: filled(details.postalCode) }),
        ...(!asksRegion || filled(region) === "" ? {} : { region: filled(region) }),
        ...(company === null ? {} : { company })
      });
      if (fromConnection) changeCountry(answer.country);
      setQuote(answer);
    } catch (failure) {
      if (sessionEnded(failure)) {
        navigate(`/login?next=${encodeURIComponent(`/checkout?plan=${planId}`)}`);
        return;
      }
      setMessageKey(checkoutFailureKey(failure));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void requestQuote(true);
  });

  async function continueToPayment(): Promise<void> {
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
      // N18's CHECKOUT_PENDING: the open checkout's payment is on its way; wait on that charge, never pay twice.
      if ("state" in answer) {
        setChargeRef(answer.charge_ref);
        setBusy(false);
        return;
      }
      // The page stays busy while the browser leaves for NETOPIA's page.
      goToPayment(answer.redirect_url);
    } catch (failure) {
      setBusy(false);
      if (failure instanceof ContractHttpError && failure.serverCode === "AGE_CONFIRMATION_REQUIRED") {
        navigate(ageConfirmationHref(`/checkout?plan=${planId}`));
        return;
      }
      if (sessionEnded(failure)) {
        navigate(`/login?next=${encodeURIComponent(`/checkout?plan=${planId}`)}`);
        return;
      }
      setMessageKey(checkoutFailureKey(failure));
    }
  }

  function startAgain(): void {
    setChargeRef(null);
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
          // The bank may still confirm: never offer a new payment here, only the way to Settings.
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

  const canQuote = !busy && addressComplete && !companyIncomplete;
  // The server refuses 422 BILLING_ADDRESS_REQUIRED for a quote that still lacks a payer field, so it never goes on.
  const canContinue = !busy && quote !== null && consents !== null && renewalAccepted && immediateAccepted
    && !quote.address_required && (!quote.country_confirm_needed || countryConfirmed);

  return (
    <section aria-labelledby="checkout-title">
      <p className="setEyebrow">{t(catalog, "billing.checkout.eyebrow")}</p>
      <h1 id="checkout-title" className="setTitle">{t(catalog, "billing.checkout.title", { plan: name })}</h1>
      <form onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (canQuote) void requestQuote(); }}>
        <div className="billingField">
          <label htmlFor="checkout-country">{t(catalog, "billing.checkout.country")}</label>
          <select id="checkout-country" value={country} onChange={(event) => changeCountry(event.target.value)} required>
            <option value="" disabled>{t(catalog, "billing.checkout.country")}</option>
            {countries.map((entry) => <option key={entry.code} value={entry.code}>{entry.label}</option>)}
          </select>
        </div>
        <h2 className="setSubtitle">{t(catalog, "billing.checkout.billingTitle")}</h2>
        <p className="billingNote">{t(catalog, "billing.checkout.billingNote")}</p>
        <BillingDetailsFields catalog={catalog} idPrefix="checkout" values={details} postalOptional={postalOptional}
          onChange={(field, value) => setDetails((current) => ({ ...current, [field]: value }))} />
        {asksRegion ? (
          <div className="billingField">
            <label htmlFor="checkout-region">{t(catalog, romanian ? "billing.checkout.county" : "billing.checkout.region")}</label>
            {romanian ? (
              <select id="checkout-region" value={region} onChange={(event) => {
                const next = event.target.value;
                // A sector is no city outside Bucharest, and a city is no sector inside it.
                if ((next === BUCHAREST_COUNTY) !== (region === BUCHAREST_COUNTY)) setCity("");
                setRegion(next);
              }} autoComplete="address-level1" required>
                <option value="" disabled>{t(catalog, "billing.checkout.county")}</option>
                {ROMANIA_COUNTIES.map((county) => <option key={county} value={county}>{county}</option>)}
              </select>
            ) : (
              <input id="checkout-region" value={region} onChange={(event) => setRegion(event.target.value)} autoComplete="address-level1" required />
            )}
          </div>
        ) : null}
        <div className="billingField">
          <label htmlFor="checkout-city">{t(catalog, "billing.checkout.city")}</label>
          {bucharest ? (
            <select id="checkout-city" value={city} onChange={(event) => setCity(event.target.value)} autoComplete="address-level2" required>
              <option value="">{t(catalog, "billing.checkout.city")}</option>
              {BUCHAREST_SECTORS.map((sector) => <option key={sector} value={sector}>{sector}</option>)}
            </select>
          ) : (
            <input id="checkout-city" value={city} onChange={(event) => setCity(event.target.value)} autoComplete="address-level2" required />
          )}
        </div>
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
      {messageKey === null ? null : messageKey === "billing.checkout.reacceptRequired" ? (
        // W10 (P2-M20): the accept screen covers the signed-in home page (L4); /checkout has none of its own.
        <p className="billingError" role="alert"><a href="/">{t(catalog, messageKey)}</a></p>
      ) : <p className="billingError" role="alert">{t(catalog, messageKey)}</p>}
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
                ipCountry: countryName(locale, quote.ip_country), declaredCountry: countryName(locale, country)
              })}</p>
              <button type="button" className="setBtn" aria-pressed={countryConfirmed} onClick={() => setCountryConfirmed(true)}>
                {t(catalog, "billing.checkout.confirmCountryYes")}
              </button>
            </div>
          ) : null}
          <label className="billingConsent">
            <input type="checkbox" checked={renewalAccepted} onChange={(event) => setRenewalAccepted(event.target.checked)} />
            {/* Spec §2.18: the card-saving agreement names the monthly total (N20 adds {total} to the sentence). */}
            <span>{t(catalog, "billing.consent.renewal", { total: formatUsd(locale, quote.total) })}</span>
          </label>
          <label className="billingConsent">
            <input type="checkbox" checked={immediateAccepted} onChange={(event) => setImmediateAccepted(event.target.checked)} />
            <span>{t(catalog, "billing.consent.immediateStart")}</span>
          </label>
          <h2 className="setSubtitle">{t(catalog, "billing.checkout.cardTitle")}</h2>
          <p className="billingNote">{t(catalog, "billing.checkout.cardNote")}</p>
          <div className="billingActions">
            <button type="button" className="btn btnDark" disabled={!canContinue} onClick={() => { void continueToPayment(); }}>
              {t(catalog, "billing.checkout.continueToCard")}
            </button>
          </div>
        </section>
      ) : null}
    </section>
  );
}
