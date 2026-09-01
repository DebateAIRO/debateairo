import type { JSX } from "react";

const SAMPLE_CARDS = [
  {
    stance: "pro",
    type: "PRO",
    base: "61%",
    final: "72%",
    model: "Model 01 · PRO",
    review: "REVIEW AGREED BY: Model 03",
    line: "var(--pro-line)"
  },
  {
    stance: "con",
    type: "CON",
    base: "66%",
    final: "58%",
    model: "Model 02 · CON",
    review: "REVIEW DISPUTED BY: Model 01",
    line: "var(--con-line)"
  },
  {
    stance: "reasoning",
    type: "REASONING",
    base: "54%",
    final: "69%",
    model: "Model 03 · REASONING",
    review: "REVIEW AGREED BY: Model 02",
    line: "var(--reasoning-line)"
  }
] as const;

export function LandingSample(): JSX.Element {
  return (
    <section
      id="transcripts"
      data-landing-section="sample"
      aria-labelledby="landing-sample-title"
      style={{
        borderBottom: "1px solid var(--line-2)",
        padding: "clamp(56px, 9vw, 112px) clamp(24px, 7vw, 96px)"
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
        ONE DEBATE, FOUR TURNS
      </p>
      <h2
        id="landing-sample-title"
        style={{
          color: "var(--text-strong)",
          fontFamily: "var(--font-display)",
          fontSize: "var(--t-display)",
          fontVariationSettings: "var(--fvs-display)",
          fontWeight: "var(--fw-display)",
          lineHeight: 1.05,
          margin: 0,
          maxWidth: "18ch"
        }}
      >
        The pressure lands on the claim, not the wording.
      </h2>
      <article
        aria-label="Sample resolution"
        style={{
          border: "1px solid var(--line-2)",
          borderRadius: "var(--r-panel)",
          marginTop: "clamp(32px, 5vw, 56px)",
          padding: "clamp(20px, 3vw, 32px)"
        }}
      >
        <p className="nodeEyebrow">RESOLUTION</p>
        <p className="nodeClaim root">The pressure lands on the claim, not the wording.</p>
        <div
          style={{
            display: "grid",
            gap: "16px",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            marginTop: "28px"
          }}
        >
          {SAMPLE_CARDS.map((card) => (
            <div
              key={card.stance}
              className="nodeWrap"
              data-bezel="shell"
              data-stance={card.stance}
              style={{
                background: "var(--shell)",
                borderRadius: "var(--r-card)",
                padding: "5px",
                position: "relative"
              }}
            >
              <article
                className="node"
                data-bezel="core"
                data-stance={card.stance}
                aria-label={`${card.type} sample card`}
                style={{ background: "var(--core)", height: "100%" }}
              >
                <span
                  data-stance={card.stance}
                  aria-hidden="true"
                  style={{
                    background: card.line,
                    borderRadius: "var(--r-tab)",
                    display: "block",
                    height: "3px",
                    margin: "-14px 0 14px"
                  }}
                />
                <div className="nodeHeader">
                  <span className="roleBadge" style={{ borderColor: card.line }}>
                    {card.type}
                  </span>
                  <span className="nodeReviewBadges">
                    <span className="scoreBadge">BASE {card.base}</span>
                    <span className="scoreBadge">FINAL {card.final}</span>
                  </span>
                </div>
                <p className="nodeEyebrow" style={{ marginBottom: "8px" }}>
                  {card.model}
                </p>
                <p
                  style={{
                    color: "var(--text-2)",
                    fontFamily: "var(--font-mono)",
                    fontSize: "var(--t-micro)",
                    lineHeight: 1.5,
                    margin: 0
                  }}
                >
                  {card.review}
                </p>
              </article>
            </div>
          ))}
        </div>
      </article>
      <p
        style={{
          color: "var(--text-2)",
          fontFamily: "var(--font-serif)",
          fontSize: "var(--t-lede)",
          lineHeight: 1.65,
          margin: "clamp(28px, 5vw, 52px) 0 0",
          maxWidth: "72ch"
        }}
      >
        The debate ends here. Nothing is declared won. You get the transcript, the two marks per
        turn, and the claim you conceded.
      </p>
    </section>
  );
}
