import type { JSX } from "react";
import { ModeToggle } from "@/components/ModeToggle";

/* The document's floating glass nav: detached, centred, 34px from the top. */
export function LandingChrome(): JSX.Element {
  return (
    <header
      data-landing-section="chrome"
      style={{
        position: "absolute",
        top: "34px",
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        zIndex: 60
      }}
    >
      <div className="lpNav">
        <a
          href="/"
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 600,
            fontSize: "19px",
            letterSpacing: "-.02em",
            fontVariationSettings: "var(--fvs-display)"
          }}
        >
          DebateAI
        </a>
        <nav aria-label="Landing navigation" className="lpNavLinks">
          <a href="#method">Method</a>
          <a href="#transcripts">Transcripts</a>
          <a href="#pricing">Pricing</a>
        </nav>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <ModeToggle />
          <a className="lpCta lpCtaNav" href="/login?next=%2Fnew">
            Start a round
            <span className="lpArrow" aria-hidden="true">
              →
            </span>
          </a>
        </div>
      </div>
    </header>
  );
}
