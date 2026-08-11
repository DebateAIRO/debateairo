import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

// W2: tauCoverage-gated verdict honesty. Below the coordinator's declared
// coverage threshold the wire band is "insufficient_scoring"; the flag-gated
// banner must render honest neutral copy for it, and unknown/future bands
// must degrade without crashing.

const root = process.cwd();
const typesSource = readFileSync(join(root, "lib", "types.ts"), "utf8");
const bannerSource = readFileSync(join(root, "components", "VerdictBanner.tsx"), "utf8");

test("VerdictBand includes the additive insufficient_scoring value", () => {
  assert.match(
    typesSource,
    /export type VerdictBand = [^;]*"insufficient_scoring"[^;]*;/,
    "VerdictBand should include the coordinator's additive insufficient_scoring value"
  );
});

test("VerdictSummary basis types the additive tau coverage fields as optional", () => {
  assert.match(
    typesSource,
    /basis: \{[\s\S]*tauCoverage\?: number;[\s\S]*tauSourceMajority\?: "judge_strength" \| "default";[\s\S]*\};/,
    "basis.tauCoverage / basis.tauSourceMajority must be optional (older payloads lack them)"
  );
});

test("Synthesis verdict_gate mirrors the served band via an optional verdictBand key", () => {
  assert.match(
    typesSource,
    /verdict_gate\?: \{[\s\S]*state: "endorsed" \| "endorsed_with_caveat" \| "suppressed_no_evidence";[\s\S]*reason: VerdictSuppressionReason \| null;[\s\S]*verdictBand\?: VerdictBand;[\s\S]*\} \| null;/,
    "verdict_gate should carry the additive optional verdictBand mirror"
  );
});

test("VerdictBanner maps insufficient_scoring to honest neutral copy", () => {
  assert.match(
    bannerSource,
    /insufficient_scoring: "Not enough judge scoring"/,
    "insufficient_scoring must render a neutral honest label, never a supportive one"
  );
});

test("VerdictBanner never crashes on unknown bands (verbatim fallback)", () => {
  assert.match(
    bannerSource,
    /BAND_LABELS\[verdict\.verdictBand\] \?\? verdict\.verdictBand/,
    "Unknown/future band values must fall back to rendering the raw band value, never throw"
  );
});

test("VerdictBanner surfaces the judge-score coverage inside the details block", () => {
  const detailsMatch = bannerSource.match(/<details[\s\S]*?<\/details>/);
  assert.ok(detailsMatch, "Expected a <details>...</details> block");
  assert.match(
    detailsMatch[0],
    /typeof verdict\.basis\.tauCoverage === "number" \? verdict\.basis\.tauCoverage : "not available"/,
    "tauCoverage must render its real value (0 included) with an explicit honest fallback"
  );
});
