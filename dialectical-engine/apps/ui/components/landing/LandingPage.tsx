import type { JSX } from "react";
import { LandingChrome } from "./LandingChrome";
import { LandingHero } from "./LandingHero";
import { LandingMethod } from "./LandingMethod";
import { LandingPricing } from "./LandingPricing";
import { LandingSample } from "./LandingSample";
import { SiteFooter } from "@/components/SiteFooter";
import type { MessageCatalog } from "@/lib/i18n/translate";

export function LandingPage({
  catalog,
  lowestPaidPrice
}: { catalog: MessageCatalog; lowestPaidPrice: string | null }): JSX.Element {
  return (
    <main className="lpRoot">
      <LandingChrome catalog={catalog} />
      <LandingHero catalog={catalog} />
      <LandingSample catalog={catalog} />
      <LandingMethod catalog={catalog} />
      <LandingPricing catalog={catalog} lowestPaidPrice={lowestPaidPrice} />
      <SiteFooter variant="full" />
    </main>
  );
}
