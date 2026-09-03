import type { JSX } from "react";

export function LandingHero(): JSX.Element {
  return (
    <section
      data-landing-section="hero"
      aria-labelledby="landing-hero-title"
      className="lpSection lpHero"
    >
      <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "40px" }}>
        <span aria-hidden="true" style={{ width: "26px", height: "1px", background: "var(--pro)" }} />
        <p className="lpEyebrow">Practice, not performance</p>
      </div>
      <h1 id="landing-hero-title" className="lpDisplay lpHeroTitle">
        Find the weakest joint in your own argument.
      </h1>
      <p className="lpLede">
        You argue. An opponent trained to locate the softest point in your reasoning presses on it
        until the joint holds or gives. Every turn is scored on evidence and on whether you actually
        answered the question — never on how well it was phrased.
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: "16px", marginTop: "52px", flexWrap: "wrap" }}>
        <a className="lpCta lpCtaHero" href="/login?next=%2Fnew">
          Start a round
          <span className="lpArrow" aria-hidden="true">
            →
          </span>
        </a>
        <a className="lpCtaGhost" href="#transcripts">
          Read a scored transcript
        </a>
      </div>
      <ul aria-label="Debate practice facts" className="lpStatBar">
        <li>Four turns per round</li>
        <li aria-hidden="true" className="lpStatRule" />
        <li>[PLACEHOLDER] rounds argued this week</li>
        <li aria-hidden="true" className="lpStatRule" />
        <li>No audience, no ranking board</li>
      </ul>
    </section>
  );
}
