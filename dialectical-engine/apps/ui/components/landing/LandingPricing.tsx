import type { JSX } from "react";

export function LandingPricing(): JSX.Element {
  return (
    <section
      id="pricing"
      data-landing-section="pricing"
      aria-labelledby="landing-pricing-title"
      style={{
        background: "var(--shell)",
        padding: "clamp(48px, 8vw, 96px) clamp(24px, 7vw, 96px)"
      }}
    >
      <p
        style={{
          color: "var(--muted)",
          fontFamily: "var(--font-mono)",
          fontSize: "var(--t-micro)",
          fontWeight: 700,
          letterSpacing: "0.12em",
          margin: "0 0 14px",
          textTransform: "uppercase"
        }}
      >
        PRICING
      </p>
      <h2
        id="landing-pricing-title"
        style={{
          color: "var(--text-strong)",
          fontFamily: "var(--font-display)",
          fontSize: "var(--t-display)",
          fontVariationSettings: "var(--fvs-display)",
          fontWeight: "var(--fw-display)",
          lineHeight: 1.08,
          margin: 0,
          maxWidth: "22ch"
        }}
      >
        Take one debate. Four turns, about nine minutes, and a transcript that tells you exactly
        where you stopped answering.
      </h2>
      <p
        style={{
          borderTop: "1px solid var(--line-strong)",
          color: "var(--text-2)",
          fontFamily: "var(--font-mono)",
          fontSize: "var(--t-lede)",
          lineHeight: 1.55,
          margin: "clamp(32px, 5vw, 56px) 0 0",
          paddingTop: "22px"
        }}
      >
        First [PLACEHOLDER] debates free, then [PLACEHOLDER] per month. Cancel whenever.
      </p>
    </section>
  );
}
