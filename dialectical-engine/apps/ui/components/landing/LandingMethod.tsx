import type { JSX } from "react";

const METHOD_STEPS = [
  {
    number: "01",
    title: "Models argue",
    body: "Five frontier models build the tree — pro, con, and the reasoning that binds them."
  },
  {
    number: "02",
    title: "They review each other",
    body: "Every claim is cross-reviewed by a rival model: agree or dispute, on the record."
  },
  {
    number: "03",
    title: "You challenge",
    body: "Flag any sentence; the graph spawns a focused rebuttal where you pointed."
  },
  {
    number: "04",
    title: "Verdict with receipts",
    body: "Scores, condition marks, and replay handles — every number traces to its source."
  }
] as const;

export function LandingMethod(): JSX.Element {
  return (
    <section
      id="method"
      data-landing-section="method"
      aria-labelledby="landing-method-title"
      style={{
        borderBottom: "1px solid var(--line-2)",
        padding: "clamp(56px, 9vw, 112px) clamp(24px, 7vw, 96px)"
      }}
    >
      <p
        style={{
          color: "var(--con-text)",
          fontFamily: "var(--font-mono)",
          fontSize: "var(--t-micro)",
          fontWeight: 700,
          letterSpacing: "0.12em",
          margin: "0 0 14px",
          textTransform: "uppercase"
        }}
      >
        METHOD
      </p>
      <h2
        id="landing-method-title"
        style={{
          color: "var(--text-strong)",
          fontFamily: "var(--font-display)",
          fontSize: "var(--t-display)",
          fontVariationSettings: "var(--fvs-display)",
          fontWeight: "var(--fw-display)",
          lineHeight: 1.05,
          margin: 0
        }}
      >
        THE METHOD
      </h2>
      <p
        style={{
          color: "var(--text-2)",
          fontFamily: "var(--font-serif)",
          fontSize: "var(--t-lede)",
          lineHeight: 1.6,
          margin: "20px 0 0"
        }}
      >
        Four steps, then you do it again tomorrow.
      </p>
      <p
        style={{
          color: "var(--muted)",
          fontFamily: "var(--font-serif)",
          lineHeight: 1.6,
          margin: "10px 0 0",
          maxWidth: "68ch"
        }}
      >
        The arena is built for repetition, not for a performance you prepare for once.
      </p>
      <ol
        style={{
          borderTop: "1px solid var(--line-2)",
          listStyle: "none",
          margin: "clamp(32px, 5vw, 56px) 0 0",
          padding: 0
        }}
      >
        {METHOD_STEPS.map((step) => (
          <li
            key={step.number}
            style={{
              borderBottom: "1px solid var(--line-2)",
              display: "grid",
              gap: "12px clamp(20px, 4vw, 56px)",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
              padding: "clamp(22px, 3vw, 34px) 0"
            }}
          >
            <span
              style={{
                color: "var(--con-text)",
                fontFamily: "var(--font-mono)",
                fontSize: "var(--t-lede)",
                fontWeight: 700
              }}
            >
              {step.number}
            </span>
            <h3
              style={{
                color: "var(--text-strong)",
                fontFamily: "var(--font-display)",
                fontSize: "var(--t-title)",
                fontWeight: "var(--fw-display)",
                lineHeight: 1.15,
                margin: 0
              }}
            >
              {step.title}
            </h3>
            <p
              style={{
                color: "var(--text-2)",
                fontFamily: "var(--font-serif)",
                lineHeight: 1.6,
                margin: 0
              }}
            >
              {step.body}
            </p>
          </li>
        ))}
      </ol>
      <div
        style={{
          alignItems: "center",
          display: "flex",
          flexWrap: "wrap",
          gap: "20px",
          justifyContent: "space-between",
          marginTop: "clamp(32px, 5vw, 56px)"
        }}
      >
        <p
          style={{
            color: "var(--text-strong)",
            fontFamily: "var(--font-display)",
            fontSize: "var(--t-title)",
            lineHeight: 1.25,
            margin: 0,
            maxWidth: "34ch"
          }}
        >
          Your argument is only as strong as its weakest claim.
        </p>
        <a
          href="/login?next=%2Fnew"
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
          Start a debate
        </a>
      </div>
    </section>
  );
}
