import type { JSX } from "react";
import { AiNotice } from "../AiNotice";
import type { PricedTax } from "@/lib/billing/format";
import { t, type MessageCatalog } from "@/lib/i18n/translate";

/* The document's closing CTA: centred, with the pro/rule/con motif above it.
   The pricing line carries the id the nav points at. Terms §12 ("Our prices are
   shown before tax, as price + VAT"): it names the lowest price before tax, with
   the visitor's tax by name, none to add, or tax added where it applies. */
const PRICING_COPY: Readonly<Record<PricedTax, string>> = Object.freeze({
  ADDED: "home.pricingCopyPlusTax", NONE: "home.pricingCopyNoTax", UNPRICED: "home.pricingCopyChoose"
});

export function LandingPricing({
  catalog,
  lowestPaidPrice,
  tax = "UNPRICED",
  taxName = null,
  billingOn = lowestPaidPrice !== null
}: {
  catalog: MessageCatalog; lowestPaidPrice: string | null; tax?: PricedTax; taxName?: string | null; billingOn?: boolean;
}): JSX.Element {
  // ADDED names the tax; an answer without its name (only a hand-made one) says it is added where it applies.
  const copy = tax === "ADDED" && taxName === null ? "UNPRICED" : tax;
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
      <p className="lpClosingLede">
        {t(catalog, "home.closingLede")}
      </p>
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
            {lowestPaidPrice === null
              ? t(catalog, "home.pricingCopyFree")
              : t(catalog, PRICING_COPY[copy], { price: lowestPaidPrice, taxName: taxName ?? "" })}{" "}
            <a href="/pricing">{t(catalog, "home.pricingLink")}</a>
          </>
        )}
      </p>
      <footer id="ai-transparency" className="lpAiTransparency">
        <AiNotice catalog={catalog} variant="block" body={t(catalog, "home.aiLandingBlock")} />
      </footer>
    </section>
  );
}
