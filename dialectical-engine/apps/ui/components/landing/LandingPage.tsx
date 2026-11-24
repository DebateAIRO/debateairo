import type { JSX } from "react";
import { LandingChrome } from "./LandingChrome";
import { LandingHero } from "./LandingHero";
import { LandingMethod } from "./LandingMethod";
import { LandingPricing, type LandingPlanCards } from "./LandingPricing";
import { SiteFooter } from "@/components/SiteFooter";
import type { SiteFooterBilling } from "@/lib/billing/footerBilling";
import type { PricedTax } from "@/lib/billing/format";
import type { MessageCatalog } from "@/lib/i18n/translate";

export function LandingPage({
  catalog,
  lowestPaidPrice,
  tax = "UNPRICED",
  footerBilling,
  testModeNote = null,
  plans = null
}: {
  catalog: MessageCatalog; lowestPaidPrice: string | null; tax?: PricedTax; footerBilling: SiteFooterBilling;
  /** The test-mode note, already translated, while the server's card payments run on NETOPIA's sandbox; else none. */
  testModeNote?: string | null;
  /** The plan cards of the closing section; none while billing is off or the plans cannot be read. */
  plans?: LandingPlanCards | null;
}): JSX.Element {
  return (
    <div className="lpRoot">
      <LandingChrome catalog={catalog} />
      <LandingHero catalog={catalog} />
      {/* The sample exchange (LandingSample) showed an older debate with scores and model codes, so it is not shown. */}
      <LandingMethod catalog={catalog} />
      <LandingPricing
        catalog={catalog} lowestPaidPrice={lowestPaidPrice} tax={tax} billingOn={footerBilling.billingOn}
        testModeNote={testModeNote} plans={plans}
      />
      <SiteFooter variant="full" billing={footerBilling} />
    </div>
  );
}
