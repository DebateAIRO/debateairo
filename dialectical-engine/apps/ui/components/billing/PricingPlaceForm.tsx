"use client";

import { useEffect, useState, type JSX } from "react";
import type { BillingPlansPlace } from "@debateai/contract";
import { REGION_COUNTRIES, regionCountryName } from "@debateai/kernel";
import { RegionField, type RegionPick } from "@/components/RegionField";
import { t, type MessageCatalog } from "@/lib/i18n/translate";

/** The US and Canada price their tax by the state or province, which only the postal code tells (as at checkout). */
const POSTAL_CODE_COUNTRIES: ReadonlySet<string> = new Set(["US", "CA"]);

/**
 * Terms §12: the place the cards are priced for, as the checkout asks it: the country where the visitor lives (the
 * connection's, until they choose), picked with sign-up's own region picker among the countries we serve, and in the
 * US and Canada the postal code. A GET form back to /pricing; the place is used for this page only and stored nowhere.
 * The postal code is asked only while the picked country needs it, and is not `required`: one sent empty is asked for
 * again by the cards. The picker needs scripts, so without them (a Tor exit, whose country is never known, often has
 * none) a plain select of the same countries sends the country instead; the picker's hidden field and the disabled
 * button apply only once scripts run, so the two never both send one.
 */
export function PricingPlaceForm({
  catalog,
  regionCatalog,
  locale,
  place,
  typedPostalCode
}: Readonly<{
  catalog: MessageCatalog;
  /** Sign-up's catalogue, for the picker's continents and its back button. */
  regionCatalog: MessageCatalog;
  locale: string;
  place: BillingPlansPlace;
  /** The postal code as the visitor typed it, given back when it did not fit so they can correct it. */
  typedPostalCode?: string;
}>): JSX.Element {
  // The picker starts from the priced place, even one outside its list (a connection's country): it shows the country
  // the cards are priced for, and sends it again.
  const [pick, setPick] = useState<RegionPick>({ country: place.country, usState: "" });
  const [scripted, setScripted] = useState(false);
  useEffect(() => setScripted(true), []);
  const listed = REGION_COUNTRIES.map(({ code }) => code);
  const choices = [...(place.country === null || listed.includes(place.country) ? listed : [...listed, place.country])]
    .map((code) => ({ code, label: regionCountryName(code, locale) }))
    .sort((left, right) => left.label.localeCompare(right.label, locale));
  const asksPostalCode = pick.country !== null && POSTAL_CODE_COUNTRIES.has(pick.country);
  // The answer's postal code and its error belong to the answer's country, not to one picked since.
  const samePlace = pick.country === place.country;
  const postalInvalid = samePlace && place.status === "POSTAL_CODE_INVALID";
  const postalDefault = !samePlace ? "" : place.postal_code ?? (postalInvalid ? typedPostalCode ?? "" : "");
  return (
    <form className="pricingPlace" method="get" action="/pricing" data-pricing-place>
      <RegionField
        catalog={regionCatalog} locale={locale} value={pick} onChange={setPick} disabled={false}
        idPrefix="pricing-region" label={t(catalog, "billing.checkout.country")}
        placeholder={t(catalog, "billing.checkout.country")} askUsState={false}
      />
      {scripted && pick.country !== null ? <input type="hidden" name="country" value={pick.country} /> : null}
      <noscript>
        <div className="billingField">
          <label htmlFor="pricing-country">{t(catalog, "billing.checkout.country")}</label>
          <select id="pricing-country" name="country" defaultValue={place.country ?? ""} required>
            <option value="" disabled>{t(catalog, "billing.checkout.country")}</option>
            {choices.map((entry) => <option key={entry.code} value={entry.code}>{entry.label}</option>)}
          </select>
        </div>
      </noscript>
      {asksPostalCode ? (
        <div className="billingField">
          <label htmlFor="pricing-postal-code">{t(catalog, "billing.checkout.postalCode")}</label>
          <input
            key={pick.country} id="pricing-postal-code" name="postal_code" defaultValue={postalDefault}
            autoComplete="postal-code" maxLength={16} aria-invalid={postalInvalid}
            aria-describedby={postalInvalid ? "pricing-postal-code-error" : undefined}
          />
          {postalInvalid
            ? <p id="pricing-postal-code-error" className="authFieldError">{t(catalog, "billing.checkout.postalCodeInvalid")}</p>
            : null}
        </div>
      ) : null}
      <button className="btn" type="submit" disabled={scripted && pick.country === null}>{t(catalog, "billing.pricing.showPrices")}</button>
    </form>
  );
}
