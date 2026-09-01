import type { JSX } from "react";

export function LandingHero(): JSX.Element {
  return (
    <section
      data-landing-section="hero"
      aria-labelledby="landing-hero-title"
      style={{
        borderBottom: "1px solid var(--line-2)",
        padding: "clamp(64px, 11vw, 144px) clamp(24px, 7vw, 96px)"
      }}
    >
      <p
        style={{
          color: "var(--con-text)",
          fontFamily: "var(--font-mono)",
          fontSize: "var(--t-micro)",
          fontWeight: 700,
          letterSpacing: "0.12em",
          margin: "0 0 24px",
          textTransform: "uppercase"
        }}
      >
        PRACTICE, NOT PERFORMANCE
      </p>
      <h1
        id="landing-hero-title"
        style={{
          color: "var(--text-strong)",
          fontFamily: "var(--font-display)",
          fontSize: "var(--t-hero)",
          fontVariationSettings: "var(--fvs-display)",
          fontWeight: "var(--fw-display)",
          letterSpacing: "-0.045em",
          lineHeight: 0.92,
          margin: 0,
          maxWidth: "12ch"
        }}
      >
        Find the weakest claim in your own argument.
      </h1>
      <p
        style={{
          color: "var(--text-2)",
          fontFamily: "var(--font-serif)",
          fontSize: "var(--t-lede)",
          lineHeight: 1.65,
          margin: "clamp(28px, 4vw, 48px) 0 0",
          maxWidth: "68ch"
        }}
      >
        You argue. An opponent trained to locate the softest point in your reasoning presses on it
        until the claim holds or gives. Every turn is scored on evidence and on whether you actually
        answered the question — never on how well it was phrased.
      </p>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "12px",
          marginTop: "32px"
        }}
      >
        <a
          href="/login?next=%2Fnew"
          style={{
            background: "var(--text-strong)",
            border: "1px solid var(--text-strong)",
            borderRadius: "var(--r-btn)",
            color: "var(--core)",
            fontFamily: "var(--font-sans)",
            fontWeight: 700,
            padding: "13px 18px",
            textDecoration: "none"
          }}
        >
          Start a debate
        </a>
        <a
          href="#transcripts"
          style={{
            border: "1px solid var(--line-strong)",
            borderRadius: "var(--r-btn)",
            color: "var(--text-strong)",
            fontFamily: "var(--font-sans)",
            fontWeight: 700,
            padding: "13px 18px",
            textDecoration: "none"
          }}
        >
          Read a scored transcript
        </a>
      </div>
      <ul
        aria-label="Debate practice facts"
        style={{
          borderTop: "1px solid var(--line-2)",
          color: "var(--muted)",
          display: "flex",
          flexWrap: "wrap",
          fontFamily: "var(--font-mono)",
          fontSize: "var(--t-micro)",
          gap: "12px clamp(20px, 4vw, 48px)",
          listStyle: "none",
          margin: "clamp(40px, 7vw, 80px) 0 0",
          padding: "20px 0 0"
        }}
      >
        <li>Four turns per debate</li>
        <li>[PLACEHOLDER] debates argued this week</li>
        <li>No audience, no ranking board</li>
      </ul>
    </section>
  );
}
