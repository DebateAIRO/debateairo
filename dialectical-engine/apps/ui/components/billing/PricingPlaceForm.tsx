import type { JSX } from "react";
import type { BillingPlansPlace } from "@debateai/contract";
import { COUNTRY_CODES } from "@/lib/billing/countries";
import { countryName } from "@/lib/billing/format";
import { t, type MessageCatalog } from "@/lib/i18n/translate";

/** The US and Canada price their tax by the state or province, which only the postal code tells (as at checkout). */
const POSTAL_CODE_COUNTRIES: ReadonlySet<string> = new Set(["US", "CA"]);

/**
 * Terms §12: the place the cards are priced for, as the checkout asks it: the country where the visitor lives (the
 * connection's, until they choose), and in the US and Canada the postal code. A plain GET form back to /pricing, so it
 * works without scripts; the place is used for this page only and stored nowhere.
 */
export function PricingPlaceForm({
  catalog,
  locale,
  place
}: Readonly<{ catalog: MessageCatalog; locale: string; place: BillingPlansPlace }>): JSX.Element {
  const countries = COUNTRY_CODES.map((code) => ({ code, label: countryName(locale, code) }))
    .sort((left, right) => left.label.localeCompare(right.label, locale));
  const asksPostalCode = place.country !== null && POSTAL_CODE_COUNTRIES.has(place.country);
  const postalInvalid = place.status === "POSTAL_CODE_INVALID";
  return (
    <form className="pricingPlace" method="get" action="/pricing" data-pricing-place>
      <div className="billingField">
        <label htmlFor="pricing-country">{t(catalog, "billing.checkout.country")}</label>
        <select id="pricing-country" name="country" defaultValue={place.country ?? ""} required>
          <option value="" disabled>{t(catalog, "billing.checkout.country")}</option>
          {countries.map((entry) => <option key={entry.code} value={entry.code}>{entry.label}</option>)}
        </select>
      </div>
      {asksPostalCode ? (
        <div className="billingField">
          <label htmlFor="pricing-postal-code">{t(catalog, "billing.checkout.postalCode")}</label>
          <input
            id="pricing-postal-code" name="postal_code" defaultValue={place.postal_code ?? ""} autoComplete="postal-code"
            maxLength={16} required aria-invalid={postalInvalid}
            aria-describedby={postalInvalid ? "pricing-postal-code-error" : undefined}
          />
          {postalInvalid
            ? <p id="pricing-postal-code-error" className="authFieldError">{t(catalog, "billing.checkout.postalCodeInvalid")}</p>
            : null}
        </div>
      ) : null}
      <button className="btn" type="submit">{t(catalog, "billing.pricing.showPrices")}</button>
    </form>
  );
}
