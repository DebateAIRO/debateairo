"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  BUCHAREST_COUNTY, BUCHAREST_SECTORS, ContractHttpError, isRomanianInvoiceLocality, postcodeOptional, ROMANIA_COUNTIES,
  type ContractClient
} from "@debateai/contract";
import { PaymentMarksGroup } from "@/components/SiteFooter";
import { useFormAnnouncer } from "@/components/auth/InlineFieldMessage";
import { ageConfirmationHref } from "@/lib/ageConfirmation";
import { contractClient } from "@/lib/api";
import { phonePrefill, phoneTyped } from "@/lib/billing/callingCodes";
import { checkoutFailureKey } from "@/lib/billing/checkoutFailure";
import { COUNTRY_CODES } from "@/lib/billing/countries";
import { countryName, formatMoney, planName, renewDayLabel, taxLabel } from "@/lib/billing/format";
import type { PaymentMarks } from "@/lib/billing/paymentMarks";
import type { PaidPlanId } from "@/lib/billing/plans";
import { catalogLocale, type LocaleCode } from "@/lib/i18n/locales";
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
const NO_MARKS: PaymentMarks = Object.freeze({ netopia: false, visa: false, mastercard: false });
/** The fields a price needs, in page order: a refused "Show the full price" goes to the first one still wrong. */
type CheckoutField = "country" | keyof BillingDetails | "region" | "city";
const FIELD_ORDER: readonly CheckoutField[] = ["country", "firstName", "lastName", "phone", "street", "postalCode", "region", "city"];
const FIELD_REQUIRED = "billing.checkout.fieldRequired";
const COMPANY_IDS = ["checkout-company-name", "checkout-company-vat", "checkout-company-address"] as const;

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
  goToPayment = leaveForPayment,
  paymentMarks = NO_MARKS
}: Readonly<{
  planId: PaidPlanId;
  locale: LocaleCode;
  catalog?: MessageCatalog;
  consents: CheckoutConsents | null;
  client?: CheckoutClient;
  navigate?: (href: string) => void;
  goToPayment?: (url: string) => void;
  /** Spec §2.18 (N25b): the marks the PAYMENT_MARKS_AVAILABLE setting names, read on the server by the page; none by default. */
  paymentMarks?: PaymentMarks;
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
  /** Set by a press on "Show the full price" while something is missing; each field then says what is wrong with it. */
  const [showErrors, setShowErrors] = useState(false);
  /** Always mounted and polite: the price when it arrives, its removal by an edit, and why a press was refused. */
  const announcer = useFormAnnouncer();
  const started = useRef(false);
  /** Bumped by every edit, so a price asked before an edit never shows for the edited details. */
  const edits = useRef(0);
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
  // A phone still at its pre-filled calling code is not typed: the quote's schema would refuse it before sending.
  const addressComplete = country !== ""
    && [details.firstName, details.lastName, details.street, city].every((value) => filled(value) !== "")
    && phoneTyped(details.phone)
    && (postalOptional || filled(details.postalCode) !== "")
    && (!asksRegion || filled(region) !== "")
    && (!romanian || isRomanianInvoiceLocality(region, city));
  // A company block that is open and started must be whole: half of it would quote a business as a consumer.
  const companyFields = [companyName, vatId, companyAddress].map(filled);
  const companyComplete = companyFields.every((value) => value !== "");
  const companyIncomplete = companyOpen && companyFields.some((value) => value !== "") && !companyComplete;
  // The rules of addressComplete, field by field (a11y repair, 2026-10-15). A Bucharest county with no sector chosen,
  // or a city that is no locality of the county, leaves the city wrong.
  const missing: Partial<Record<CheckoutField, string>> = {};
  if (country === "") missing.country = FIELD_REQUIRED;
  if (filled(details.firstName) === "") missing.firstName = FIELD_REQUIRED;
  if (filled(details.lastName) === "") missing.lastName = FIELD_REQUIRED;
  if (!phoneTyped(details.phone)) missing.phone = "billing.checkout.phoneInvalid";
  if (filled(details.street) === "") missing.street = FIELD_REQUIRED;
  if (!postalOptional && filled(details.postalCode) === "") missing.postalCode = FIELD_REQUIRED;
  if (asksRegion && filled(region) === "") missing.region = FIELD_REQUIRED;
  if (filled(city) === "" || (romanian && filled(region) !== "" && !isRomanianInvoiceLocality(region, city))) missing.city = FIELD_REQUIRED;
  const fieldError = (field: CheckoutField): string | undefined => {
    const key = missing[field];
    return showErrors && key !== undefined ? t(catalog, key) : undefined;
  };
  const companyFieldInvalid = (index: number): boolean => showErrors && companyIncomplete && companyFields[index] === "";

  /**
   * The quote seals the payer and the buyer it was priced for (NETOPIA's payer, the stored profile and every invoice
   * are taken from it), so any edit of a value the quote request sends takes the price away until it is asked again.
   * Called in the handlers, never an effect: the connection's first quote runs changeCountry and must survive it.
   */
  function edited(): void {
    edits.current += 1;
    // The price, the two agreements and the payment button go with it; a screen reader is told so (a11y repair, 2026-10-15).
    if (quote !== null) announcer.announce(t(catalog, "billing.checkout.priceCleared"));
    setQuote(null);
  }

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
    const asked = edits.current;
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
      // The connection's first quote prices no payer, so an edit made while it loads leaves it standing.
      else if (edits.current !== asked) return;
      setQuote(answer);
      // A price the person asked for is said as it appears; the connection's is simply part of the page on arrival.
      if (!fromConnection) announcer.announce(totalSentence(answer));
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
        locale: catalogLocale(locale),
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
      // N19b (spec §2.6.3, A3 (a)): a failed start leaves a FAILED charge holding this quote's one use, so it is never
      // sent again; the next try asks for a fresh price, accepted afresh (as requestQuote does).
      setQuote(null);
      setCountryConfirmed(false);
      setRenewalAccepted(false);
      setImmediateAccepted(false);
      setMessageKey(checkoutFailureKey(failure));
    }
  }

  function startAgain(): void {
    setChargeRef(null);
    setSettled(null);
    void requestQuote();
  }

  function totalSentence(priced: Quote): string {
    return t(catalog, "billing.checkout.total", {
      plan: name,
      net: formatMoney(locale, priced.net, priced.currency),
      taxLabel: taxLabel(catalog, locale, {
        status: priced.tax_status, taxAmount: priced.tax, currency: priced.currency, taxName: priced.tax_name,
        rateBasisPoints: priced.tax_rate_bp, country: priced.tax_country
      }),
      total: formatMoney(locale, priced.total, priced.currency),
      day: renewDayLabel(locale, priced.renews_on)
    });
  }
  const totalLine = quote === null ? "" : totalSentence(quote);

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

  /**
   * "Show the full price" stays focusable (aria-disabled, a11y repair 2026-10-15), so a press made while a field is
   * missing or wrong is answered here and asks for nothing: every such field says why, focus goes to the first, and
   * the first reason is said (a press from inside that very field moves focus nowhere).
   */
  function askForPrice(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (busy) return;
    if (canQuote) {
      setShowErrors(false);
      void requestQuote();
      return;
    }
    setShowErrors(true);
    const first = FIELD_ORDER.find((field) => missing[field] !== undefined);
    const companyGap = companyIncomplete ? companyFields.findIndex((value) => value === "") : -1;
    const target = first !== undefined ? `checkout-${first}` : companyGap >= 0 ? COMPANY_IDS[companyGap] : undefined;
    if (target !== undefined) event.currentTarget.querySelector<HTMLElement>(`#${target}`)?.focus();
    announcer.announce(first !== undefined ? t(catalog, missing[first]!)
      : t(catalog, companyIncomplete ? "billing.checkout.companyIncomplete" : "billing.checkout.detailsRequired"));
  }
  // The server refuses 422 BILLING_ADDRESS_REQUIRED for a quote that still lacks a payer field, so it never goes on.
  const canContinue = !busy && quote !== null && consents !== null && renewalAccepted && immediateAccepted
    && !quote.address_required && (!quote.country_confirm_needed || countryConfirmed);
  // "Continue to payment" stays focusable too: while it is locked, this says why (as its description and
  // when pressed), and a press moves focus to the first thing still missing.
  const continueBlocker: { key: string; target: string } | null = busy || quote === null || consents === null ? null
    : quote.address_required ? { key: "billing.checkout.detailsRequired", target: `checkout-${FIELD_ORDER.find((field) => missing[field] !== undefined) ?? FIELD_ORDER[0]}` }
    : quote.country_confirm_needed && !countryConfirmed ? { key: "billing.checkout.confirmCountryRequired", target: "checkout-confirm-country" }
    : !renewalAccepted ? { key: "billing.checkout.consentsRequired", target: "checkout-renewal" }
    : !immediateAccepted ? { key: "billing.checkout.consentsRequired", target: "checkout-immediate" }
    : null;
  function pressLockedContinue(): void {
    if (continueBlocker === null) return;
    if (quote?.address_required) setShowErrors(true);
    document.getElementById(continueBlocker.target)?.focus();
    announcer.announce(t(catalog, continueBlocker.key));
  }

  return (
    <section aria-labelledby="checkout-title">
      <p className="setEyebrow">{t(catalog, "billing.checkout.eyebrow")}</p>
      <h1 id="checkout-title" className="setTitle">{t(catalog, "billing.checkout.title", { plan: name })}</h1>
      {/* noValidate: the browser's own bubbles would stop a press before askForPrice could explain it in the page. */}
      <form noValidate onSubmit={askForPrice}>
        <div className="billingField">
          <label htmlFor="checkout-country">{t(catalog, "billing.checkout.country")}</label>
          <select id="checkout-country" value={country} onChange={(event) => { edited(); changeCountry(event.target.value); }} required
            aria-invalid={Boolean(fieldError("country"))} aria-describedby={fieldError("country") ? "checkout-country-error" : undefined}>
            <option value="" disabled>{t(catalog, "billing.checkout.country")}</option>
            {countries.map((entry) => <option key={entry.code} value={entry.code}>{entry.label}</option>)}
          </select>
          {fieldError("country") ? <p id="checkout-country-error" className="authFieldError">{fieldError("country")}</p> : null}
        </div>
        <h2 className="setSubtitle">{t(catalog, "billing.checkout.billingTitle")}</h2>
        <p className="billingNote">{t(catalog, "billing.checkout.billingNote")}</p>
        <BillingDetailsFields catalog={catalog} idPrefix="checkout" values={details} postalOptional={postalOptional}
          errors={{
            firstName: fieldError("firstName"), lastName: fieldError("lastName"), phone: fieldError("phone"),
            street: fieldError("street"), postalCode: fieldError("postalCode")
          }}
          onChange={(field, value) => { edited(); setDetails((current) => ({ ...current, [field]: value })); }} />
        {asksRegion ? (
          <div className="billingField">
            <label htmlFor="checkout-region">{t(catalog, romanian ? "billing.checkout.county" : "billing.checkout.region")}</label>
            {romanian ? (
              <select id="checkout-region" value={region} onChange={(event) => {
                const next = event.target.value;
                // A sector is no city outside Bucharest, and a city is no sector inside it.
                if ((next === BUCHAREST_COUNTY) !== (region === BUCHAREST_COUNTY)) setCity("");
                edited();
                setRegion(next);
              }} autoComplete="address-level1" required
                aria-invalid={Boolean(fieldError("region"))} aria-describedby={fieldError("region") ? "checkout-region-error" : undefined}>
                <option value="" disabled>{t(catalog, "billing.checkout.county")}</option>
                {ROMANIA_COUNTIES.map((county) => <option key={county} value={county}>{county}</option>)}
              </select>
            ) : (
              <input id="checkout-region" value={region} onChange={(event) => { edited(); setRegion(event.target.value); }} autoComplete="address-level1" required
                aria-invalid={Boolean(fieldError("region"))} aria-describedby={fieldError("region") ? "checkout-region-error" : undefined} />
            )}
            {fieldError("region") ? <p id="checkout-region-error" className="authFieldError">{fieldError("region")}</p> : null}
          </div>
        ) : null}
        <div className="billingField">
          <label htmlFor="checkout-city">{t(catalog, "billing.checkout.city")}</label>
          {bucharest ? (
            <select id="checkout-city" value={city} onChange={(event) => { edited(); setCity(event.target.value); }} autoComplete="address-level2" required
              aria-invalid={Boolean(fieldError("city"))} aria-describedby={fieldError("city") ? "checkout-city-error" : undefined}>
              <option value="">{t(catalog, "billing.checkout.city")}</option>
              {BUCHAREST_SECTORS.map((sector) => <option key={sector} value={sector}>{sector}</option>)}
            </select>
          ) : (
            <input id="checkout-city" value={city} onChange={(event) => { edited(); setCity(event.target.value); }} autoComplete="address-level2" required
              aria-invalid={Boolean(fieldError("city"))} aria-describedby={fieldError("city") ? "checkout-city-error" : undefined} />
          )}
          {fieldError("city") ? <p id="checkout-city-error" className="authFieldError">{fieldError("city")}</p> : null}
        </div>
        <div className="billingActions">
          <button type="button" className="setBtn" aria-expanded={companyOpen} onClick={() => { edited(); setCompanyOpen(!companyOpen); }}>
            {t(catalog, "billing.checkout.companyToggle")}
          </button>
        </div>
        {companyOpen ? (
          <>
            <div className="billingField">
              <label htmlFor="checkout-company-name">{t(catalog, "billing.checkout.companyName")}</label>
              <input id="checkout-company-name" value={companyName} onChange={(event) => { edited(); setCompanyName(event.target.value); }} autoComplete="organization"
                aria-invalid={companyFieldInvalid(0)} aria-describedby={companyFieldInvalid(0) ? "checkout-company-error" : undefined} />
            </div>
            <div className="billingField">
              <label htmlFor="checkout-company-vat">{t(catalog, "billing.checkout.companyVatId")}</label>
              <input id="checkout-company-vat" value={vatId} onChange={(event) => { edited(); setVatId(event.target.value); }}
                aria-invalid={companyFieldInvalid(1)} aria-describedby={companyFieldInvalid(1) ? "checkout-company-error" : undefined} />
            </div>
            <div className="billingField">
              <label htmlFor="checkout-company-address">{t(catalog, "billing.checkout.companyAddress")}</label>
              <input id="checkout-company-address" value={companyAddress} onChange={(event) => { edited(); setCompanyAddress(event.target.value); }} autoComplete="street-address"
                aria-invalid={companyFieldInvalid(2)} aria-describedby={companyFieldInvalid(2) ? "checkout-company-error" : undefined} />
            </div>
            {companyIncomplete ? <p id="checkout-company-error" className="billingNote" role="status">{t(catalog, "billing.checkout.companyIncomplete")}</p> : null}
          </>
        ) : null}
        <div className="billingActions">
          {/* aria-disabled, never disabled: Tab still reaches it, and askForPrice says what a press is missing. */}
          <button type="submit" className="btn" aria-disabled={!canQuote || undefined}>{t(catalog, "billing.checkout.showPrice")}</button>
        </div>
        {announcer.region}
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
              <button type="button" id="checkout-confirm-country" className="setBtn" aria-pressed={countryConfirmed} onClick={() => setCountryConfirmed(true)}>
                {t(catalog, "billing.checkout.confirmCountryYes")}
              </button>
            </div>
          ) : null}
          <label className="billingConsent">
            <input type="checkbox" id="checkout-renewal" checked={renewalAccepted} onChange={(event) => setRenewalAccepted(event.target.checked)} />
            {/* Spec §2.18: the card-saving agreement names the monthly total (N20 adds {total} to the sentence). */}
            <span>{t(catalog, "billing.consent.renewal", { total: formatMoney(locale, quote.total, quote.currency) })}</span>
          </label>
          <label className="billingConsent">
            <input type="checkbox" id="checkout-immediate" checked={immediateAccepted} onChange={(event) => setImmediateAccepted(event.target.checked)} />
            <span>{t(catalog, "billing.consent.immediateStart")}</span>
          </label>
          <h2 className="setSubtitle">{t(catalog, "billing.checkout.cardTitle")}</h2>
          <p className="billingNote">{t(catalog, "billing.checkout.cardNote")}</p>
          <div className="billingActions">
            <button
              type="button"
              className="btn btnDark"
              disabled={busy}
              aria-disabled={!canContinue || undefined}
              aria-describedby={continueBlocker !== null ? "checkout-continue-hint" : undefined}
              onClick={() => { if (canContinue) void continueToPayment(); else pressLockedContinue(); }}
            >
              {t(catalog, "billing.checkout.continueToCard")}
            </button>
            {continueBlocker !== null ? <span id="checkout-continue-hint" className="srOnly">{t(catalog, continueBlocker.key)}</span> : null}
          </div>
          {/* Spec §2.18: NETOPIA's logo and the card marks NETOPIA's shop approval asks for on the checkout, as in the footer. */}
          <PaymentMarksGroup marks={paymentMarks} />
        </section>
      ) : null}
    </section>
  );
}
