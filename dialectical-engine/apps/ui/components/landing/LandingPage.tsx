import type { JSX } from "react";
import { LandingChrome } from "./LandingChrome";
import { LandingHero } from "./LandingHero";
import { LandingMethod } from "./LandingMethod";
import { LandingPricing } from "./LandingPricing";
import { SiteFooter } from "@/components/SiteFooter";
import type { SiteFooterBilling } from "@/lib/billing/footerBilling";
import type { PricedTax } from "@/lib/billing/format";
import type { MessageCatalog } from "@/lib/i18n/translate";

export function LandingPage({
  catalog,
  lowestPaidPrice,
  tax = "UNPRICED",
  footerBilling
}: {
  catalog: MessageCatalog; lowestPaidPrice: string | null; tax?: PricedTax; footerBilling: SiteFooterBilling;
}): JSX.Element {
  return (
    <div className="lpRoot">
      <LandingChrome catalog={catalog} />
      <LandingHero catalog={catalog} />
      {/* The sample exchange (LandingSample) showed an older debate with scores and model codes, so it is not shown. */}
      <LandingMethod catalog={catalog} />
      <LandingPricing
        catalog={catalog} lowestPaidPrice={lowestPaidPrice} tax={tax} billingOn={footerBilling.billingOn}
      />
      <SiteFooter variant="full" billing={footerBilling} />
    </div>
  );
}
