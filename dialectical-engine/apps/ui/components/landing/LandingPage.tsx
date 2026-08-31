import type { JSX } from "react";
import { LandingChrome } from "./LandingChrome";
import { LandingHero } from "./LandingHero";
import { LandingMethod } from "./LandingMethod";
import { LandingPricing } from "./LandingPricing";
import { LandingSample } from "./LandingSample";

export function LandingPage(): JSX.Element {
  return (
    <main>
      <LandingChrome />
      <LandingHero />
      <LandingSample />
      <LandingMethod />
      <LandingPricing />
    </main>
  );
}
