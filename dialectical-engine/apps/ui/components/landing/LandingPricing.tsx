import type { JSX } from "react";

/* The document's closing CTA: centred, with the pro/rule/con motif above it.
   The pricing line carries the id the nav points at. */
export function LandingPricing(): JSX.Element {
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
        Your argument is only as strong as its weakest joint.
      </h2>
      <p className="lpClosingLede">
        Take one round. Four turns, about nine minutes, and a transcript that tells you exactly where
        you stopped answering.
      </p>
      <div style={{ display: "flex", justifyContent: "center", marginTop: "52px" }}>
        <a className="lpCta lpCtaClosing" href="/login?next=%2Fnew">
          Start a round
          <span className="lpArrow" aria-hidden="true">
            →
          </span>
        </a>
      </div>
      <p id="pricing" className="lpPricing">
        First [PLACEHOLDER] rounds free, then [PLACEHOLDER] per month. Cancel whenever.
      </p>
    </section>
  );
}
