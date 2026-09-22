import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VerdictBanner } from "../../apps/ui/components/VerdictBanner.js";
import { liveVerdictState } from "../../apps/ui/lib/v3/labels.js";
import type { VerdictSummary } from "../../apps/ui/lib/types.js";

/**
 * T11 confirm-item 4, ruled RENAME NOW by V (D77 of 2026-09-18) — the live
 * banner speaks the engine's own three words, and says nothing that is false
 * for the label it is speaking about.
 *
 * The mapping is SUPPORTED -> "supported", CONTESTED -> "contested",
 * UNSUPPORTED -> "unsupported". This test renders the REAL banner for each
 * engine label, so a mapping that typechecks but produces a state the banner
 * cannot render fails here rather than in front of a reader.
 *
 * The two retired sentences below described the OLDER EVIDENCE GATE
 * (Synthesis.verdict_gate), not the label: UNSUPPORTED means the winning
 * position's propagated strength fell below the low cut, whether or not
 * evidence was ever looked up. The banner must never say them again.
 */

/**
 * Rungs 0, 2 and 4 of the label ladder all print CONTESTED; this covers all
 * three. ORDER MATTERS: rung 2 is tested before rung 3's high cut, so a winner
 * well above the high cut still prints CONTESTED when its margin is
 * tie-adjacent — the real run of 2026-09-17 is exactly that. The tie-adjacent
 * alternative therefore leads; "not strong enough" must not be the first thing
 * that reader sees, because for that debate it is false.
 */
const CONTESTED_SENTENCE =
  "The run did not settle this either way: the positions were too close, the judges disagreed, the leading position was not strong enough, or part of the comparison was missing.";
/** Rung 1 — and only rung 1 — prints UNSUPPORTED. */
const UNSUPPORTED_SENTENCE =
  "Even the leading position here came out weak once the arguments were weighed against each other — a weak case, not a disproved one.";
const RETIRED_WITHHELD_SENTENCE = "no endorsed verdict is shown";
const RETIRED_UNLOCK_SENTENCE = "To unlock an endorsed verdict";

type EngineLabel = "SUPPORTED" | "CONTESTED" | "UNSUPPORTED";

const summary = (label: EngineLabel): VerdictSummary => ({
  verdictBand: label === "SUPPORTED" ? "supported" : label === "CONTESTED" ? "contested" : "unsupported",
  claimLanguage: `Engine label ${label} reached the banner.`,
  basis: {
    dialecticalStrength: 0.5,
    verificationStatus: null,
    convergence: null
  },
  verdictThresholdsVersion: "test-layer:t11",
  verdictState: liveVerdictState(label),
  // Older payloads still carry these; the banner must no longer speak them.
  suppressionReason: {
    claimType: "unknown",
    unlock: ["Run a second maker so a rival root exists"]
  } as VerdictSummary["suppressionReason"]
});

const render = (label: EngineLabel): string =>
  renderToStaticMarkup(<VerdictBanner verdict={summary(label)} />);

describe("T11 · the live banner speaks the engine's own three words", () => {
  it("renders SUPPORTED as the supported state, showing the claim language", () => {
    const html = render("SUPPORTED");

    expect(liveVerdictState("SUPPORTED")).toBe("supported");
    expect(html).toContain('data-verdict-state="supported"');
    expect(html).toContain("Strongly supported");
    expect(html).toContain("Engine label SUPPORTED reached the banner.");
    // The supported state carries no extra sentence at all.
    expect(html).not.toContain(CONTESTED_SENTENCE);
    expect(html).not.toContain(UNSUPPORTED_SENTENCE);
    expect(html).not.toContain(RETIRED_WITHHELD_SENTENCE);
    expect(html).not.toContain(RETIRED_UNLOCK_SENTENCE);
  });

  it("renders CONTESTED as the contested state, with the sentence true of rungs 0, 2 and 4", () => {
    const html = render("CONTESTED");

    expect(liveVerdictState("CONTESTED")).toBe("contested");
    expect(html).toContain('data-verdict-state="contested"');
    expect(html).toContain("Contested");
    expect(html).toContain("Engine label CONTESTED reached the banner.");
    expect(html).toContain(CONTESTED_SENTENCE);
    expect(html).not.toContain(UNSUPPORTED_SENTENCE);
    expect(html).not.toContain(RETIRED_WITHHELD_SENTENCE);
    expect(html).not.toContain(RETIRED_UNLOCK_SENTENCE);
  });

  it("renders UNSUPPORTED as the unsupported state, keeping the claim language and dropping the false evidence copy", () => {
    const html = render("UNSUPPORTED");

    expect(liveVerdictState("UNSUPPORTED")).toBe("unsupported");
    expect(html).toContain('data-verdict-state="unsupported"');
    // The claim language is no longer swapped out for the evidence gate's copy.
    expect(html).toContain("Engine label UNSUPPORTED reached the banner.");
    expect(html).toContain(UNSUPPORTED_SENTENCE);
    expect(html).not.toContain(CONTESTED_SENTENCE);
    // The false sentences: UNSUPPORTED is a weak case, not an absent lookup.
    expect(html).not.toContain(RETIRED_WITHHELD_SENTENCE);
    expect(html).not.toContain(RETIRED_UNLOCK_SENTENCE);
  });

  it("maps the three engine labels onto three DISTINCT banner states", () => {
    const states = (["SUPPORTED", "CONTESTED", "UNSUPPORTED"] as const).map(liveVerdictState);

    expect(new Set(states).size).toBe(3);
    expect(states).toEqual(["supported", "contested", "unsupported"]);
  });

  it("renders a state-less summary exactly as before: claim language, no state, no sentence", () => {
    const stateless: VerdictSummary = { ...summary("CONTESTED"), verdictState: undefined };

    const html = renderToStaticMarkup(<VerdictBanner verdict={stateless} />);

    expect(html).toContain("Engine label CONTESTED reached the banner.");
    expect(html).not.toContain("data-verdict-state");
    expect(html).not.toContain(CONTESTED_SENTENCE);
    expect(html).not.toContain(UNSUPPORTED_SENTENCE);
  });
});
