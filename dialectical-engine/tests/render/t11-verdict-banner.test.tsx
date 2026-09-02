import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VerdictBanner } from "../../apps/ui/components/VerdictBanner.js";
import { liveVerdictState } from "../../apps/ui/lib/v3/labels.js";
import type { VerdictSummary } from "../../apps/ui/lib/types.js";

/**
 * T11 confirm-item 4 — the live banner renders each mapped state.
 *
 * The mapping is VOCABULARY WIRING: SUPPORTED -> endorsed,
 * CONTESTED -> endorsed_with_caveat, UNSUPPORTED -> suppressed_no_evidence. This
 * test renders the REAL banner for each engine label, so a mapping that
 * typechecks but produces a state the banner cannot render fails here rather
 * than in front of a reader.
 */

const summary = (label: "SUPPORTED" | "CONTESTED" | "UNSUPPORTED"): VerdictSummary => ({
  verdictBand: label === "SUPPORTED" ? "supported" : label === "CONTESTED" ? "contested" : "unsupported",
  claimLanguage: `Engine label ${label} reached the banner.`,
  basis: {
    dialecticalStrength: 0.5,
    verificationStatus: null,
    convergence: null
  },
  verdictThresholdsVersion: "test-layer:t11",
  verdictState: liveVerdictState(label),
  suppressionReason: {
    claimType: "unknown",
    unlock: ["Run a second maker so a rival root exists"]
  } as VerdictSummary["suppressionReason"]
});

describe("T11 · the live banner renders every mapped verdict state", () => {
  it("renders SUPPORTED as the endorsed state, showing the claim language", () => {
    const html = renderToStaticMarkup(<VerdictBanner verdict={summary("SUPPORTED")} />);

    expect(liveVerdictState("SUPPORTED")).toBe("endorsed");
    expect(html).toContain("Strongly supported");
    expect(html).toContain("Engine label SUPPORTED reached the banner.");
    // Only the suppressed state replaces the claim language with the withheld copy.
    expect(html).not.toContain("no endorsed verdict is shown");
  });

  it("renders CONTESTED as the caveated state, showing the claim language", () => {
    const html = renderToStaticMarkup(<VerdictBanner verdict={summary("CONTESTED")} />);

    expect(liveVerdictState("CONTESTED")).toBe("endorsed_with_caveat");
    expect(html).toContain("Contested");
    expect(html).toContain("Engine label CONTESTED reached the banner.");
    expect(html).not.toContain("no endorsed verdict is shown");
  });

  it("renders UNSUPPORTED as the suppressed state, withholding the endorsement", () => {
    const html = renderToStaticMarkup(<VerdictBanner verdict={summary("UNSUPPORTED")} />);

    expect(liveVerdictState("UNSUPPORTED")).toBe("suppressed_no_evidence");
    // The suppressed branch is the one that swaps the copy — this is what makes
    // the third pairing observable rather than merely typed.
    expect(html).toContain("no endorsed verdict is shown");
    expect(html).toContain("To unlock an endorsed verdict");
    expect(html).not.toContain("Engine label UNSUPPORTED reached the banner.");
  });

  it("maps the three engine labels onto three DISTINCT banner states", () => {
    const states = (["SUPPORTED", "CONTESTED", "UNSUPPORTED"] as const).map(liveVerdictState);

    expect(new Set(states).size).toBe(3);
    expect(states).toEqual(["endorsed", "endorsed_with_caveat", "suppressed_no_evidence"]);
  });
});
