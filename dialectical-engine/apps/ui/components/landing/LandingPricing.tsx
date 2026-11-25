import type { JSX } from "react";
import type { BillingCurrency, BillingPlansPlace, BillingPlansTax } from "@debateai/contract";
import { AiNotice } from "../AiNotice";
import { PricingCards, type PricingPlan } from "@/components/billing/PricingCards";
import { PricingPlaceForm } from "@/components/billing/PricingPlaceForm";
import type { PricedTax } from "@/lib/billing/format";
import { t, type MessageCatalog } from "@/lib/i18n/translate";

/* The document's closing CTA: centred, with the pro/rule/con motif above it.
   The pricing line carries the id the nav points at. It names a price as price +
   VAT: our price, the visitor's country's tax apart and the total with it (or the
   price alone where none is added); Terms §12: with no priced place it says the
   plans are priced with your tax, never a price before tax alone. */
const PRICING_COPY: Readonly<Record<Exclude<PricedTax, "UNPRICED">, string>> = Object.freeze({
  INCLUDED: "home.pricingCopyTaxIncluded", NONE: "home.pricingCopyNoTax"
});

/**
 * The plans the landing shows between its closing title and its CTA: the pricing page's own cards, from the same
 * answer, so Terms §12 holds here as it does there (a paid price only with the place's tax in it, never one before
 * tax). `catalog` is the whole billing catalogue: the cards are rendered on the server.
 */
export type LandingPlanCards = Readonly<{
  catalog: MessageCatalog; locale: string; currency: BillingCurrency; place: BillingPlansPlace;
  tax: BillingPlansTax | null; plans: readonly PricingPlan[];
  /**
   * The place form above the cards, only while they need a place (no country, no postal code) or the visitor chose
   * one here. It is a client component, so its two catalogues hold just the keys it prints.
   */
  placeForm: Readonly<{
    catalog: MessageCatalog; regionCatalog: MessageCatalog; typedPostalCode: string | undefined;
  }> | null;
}>;

/** Where the landing's place form sends the place: back to these cards. */
const PLANS_ID = "plans";

export function LandingPricing({
  catalog,
  lowestPaidPrice,
  tax = "UNPRICED",
  billingOn = lowestPaidPrice !== null,
  testModeNote = null,
  plans = null
}: {
  catalog: MessageCatalog; lowestPaidPrice: string | null; tax?: PricedTax; billingOn?: boolean;
  /** The billing catalogue's test-mode note, translated by the page, while card payments run on NETOPIA's sandbox. */
  testModeNote?: string | null;
  /** The plan cards; none while billing is off or the plans cannot be read. */
  plans?: LandingPlanCards | null;
}): JSX.Element {
  return (
    <section
      id="start"
      data-landing-section="pricing"
      aria-labelledby="landing-pricing-title"
      className="lpSection lpClosing"
    >
      <div className="lpMotif" aria-hidden="true">
        <span className="lpSwatch" data-stance="pro" />
        <span className="lpMotifRule" />
        <span className="lpSwatch" data-stance="con" />
      </div>
      <h2 id="landing-pricing-title" className="lpDisplay lpClosingTitle">
        {t(catalog, "home.closingTitle")}
      </h2>
      {billingOn && plans !== null && plans.plans.length > 0 ? (
        <div id={PLANS_ID} className="lpPlans" data-landing-plans>
          {plans.placeForm === null ? null : (
            <PricingPlaceForm
              // A new answer is a new place: the picker starts from it, never from the last page's pick.
              key={`${plans.place.country ?? ""} ${plans.place.postal_code ?? ""} ${plans.place.status}`}
              catalog={plans.placeForm.catalog} regionCatalog={plans.placeForm.regionCatalog} locale={plans.locale}
              place={plans.place} typedPostalCode={plans.placeForm.typedPostalCode} action={`/#${PLANS_ID}`}
            />
          )}
          <PricingCards
            catalog={plans.catalog} locale={plans.locale} currency={plans.currency} place={plans.place}
            tax={plans.tax} plans={plans.plans} headingLevel={3}
          />
          <p className="pricingNote">{t(plans.catalog, "billing.pricing.currencyNote")}</p>
        </div>
      ) : null}
      <div style={{ display: "flex", justifyContent: "center", marginTop: "52px" }}>
        <a className="lpCta lpCtaClosing" href="/login?next=%2Fv4">
          {t(catalog, "chrome.startRound")}
          <span className="lpArrow" aria-hidden="true">
            →
          </span>
        </a>
      </div>
      <p id="pricing" className="lpPricing">
        {!billingOn ? t(catalog, "home.pricingCopyFree") : (
          <>
            {lowestPaidPrice === null || tax === "UNPRICED"
              ? t(catalog, "home.pricingCopyChoose")
              : t(catalog, PRICING_COPY[tax], { price: lowestPaidPrice })}{" "}
            <a href="/pricing">{t(catalog, "home.pricingLink")}</a>
          </>
        )}
      </p>
      {billingOn && testModeNote !== null ? <p className="lpPricing" role="note">{testModeNote}</p> : null}
      {/* Shown with the plans: while billing is off no question is published, so the line would say nothing true. */}
      {billingOn ? <p className="lpPricing lpPublicNote">{t(catalog, "home.noAudience")}</p> : null}
      {/* The short AI notice, with the link to the full text on /ai-transparency. */}
      <footer id="ai-transparency" className="lpAiTransparency">
        <AiNotice catalog={catalog} variant="strip" />
      </footer>
    </section>
  );
}
