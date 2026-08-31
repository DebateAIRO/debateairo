import type { JSX } from "react";
import { ModeToggle } from "@/components/ModeToggle";

export function LandingChrome(): JSX.Element {
  return (
    <header data-landing-section="chrome">
      <ModeToggle />
    </header>
  );
}
