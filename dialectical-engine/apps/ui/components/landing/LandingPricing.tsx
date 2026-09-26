import type { JSX } from "react";
import { AiNotice } from "../AiNotice";
import { t, type MessageCatalog } from "@/lib/i18n/translate";

/* The document's closing CTA: centred, with the pro/rule/con motif above it.
   The pricing line carries the id the nav points at. */
export function LandingPricing({ catalog }: { catalog: MessageCatalog }): JSX.Element {
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
        <a className="lpCta lpCtaClosing" href="/login?next=%2Fnew">
          {t(catalog, "chrome.startRound")}
          <span className="lpArrow" aria-hidden="true">
            →
          </span>
        </a>
      </div>
      <p id="pricing" className="lpPricing">
        {t(catalog, "home.pricingCopy")}
      </p>
      <footer id="ai-transparency" className="lpAiTransparency">
        <AiNotice catalog={catalog} variant="block" body={t(catalog, "home.aiLandingBlock")} />
      </footer>
    </section>
  );
}
