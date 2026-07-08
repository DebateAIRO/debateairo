import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const bannerPath = join(process.cwd(), "components", "VerdictBanner.tsx");
const pageClientPath = join(process.cwd(), "app", "debate", "[id]", "DebatePageClient.tsx");
const typesPath = join(process.cwd(), "lib", "types.ts");

test("VerdictBanner exports the expected component signature", () => {
  const source = readFileSync(bannerPath, "utf8");

  assert.match(
    source,
    /import type \{ VerdictSummary \} from "@\/lib\/types";/,
    "VerdictBanner should import the additive VerdictSummary type from lib/types"
  );
  assert.match(
    source,
    /export function VerdictBanner\(\{\s*verdict\s*\}: \{ verdict: VerdictSummary \| undefined \}\)/,
    "VerdictBanner should accept an optional verdict prop with the documented shape"
  );
});

test("VerdictBanner renders null on missing/undefined verdict (honest absence)", () => {
  const source = readFileSync(bannerPath, "utf8");

  assert.match(
    source,
    /if\s*\(!verdict\)\s*(?:\{\s*)?return null;/,
    "VerdictBanner must early-return null when verdict is falsy/undefined, never a fabricated placeholder"
  );
});

test("VerdictBanner exposes a qualitative band badge with a CSS/testing hook", () => {
  const source = readFileSync(bannerPath, "utf8");

  assert.match(
    source,
    /data-verdict-band=\{verdict\.verdictBand\}/,
    "The band badge should expose a data-verdict-band attribute mirroring the data-selected convention"
  );
  assert.match(
    source,
    /Strongly supported/,
    "supported band should map to the documented 'Strongly supported' label"
  );
  assert.match(
    source,
    /Contested/,
    "contested band should map to the documented 'Contested' label"
  );
  assert.match(
    source,
    /Weakly supported/,
    "unsupported band should map to the documented 'Weakly supported' label"
  );
  assert.match(
    source,
    /Analysis unavailable/,
    "unavailable band should map to the documented 'Analysis unavailable' label, never a fabricated verdict"
  );
});

test("VerdictBanner renders claimLanguage as the leading plain-language sentence", () => {
  const source = readFileSync(bannerPath, "utf8");

  assert.match(
    source,
    /verdict\.claimLanguage/,
    "The deterministic claimLanguage sentence should be rendered"
  );
});

test("VerdictBanner confines the real dialectical strength number to a <details> element", () => {
  const source = readFileSync(bannerPath, "utf8");

  assert.match(source, /<details/, "A details/expandable element must exist for the raw numeric value");
  assert.match(source, /<summary/, "The details element should have a summary toggle");

  const detailsMatch = source.match(/<details[\s\S]*?<\/details>/);
  assert.ok(detailsMatch, "Expected to find a <details>...</details> block");
  const detailsBlock = detailsMatch[0];

  assert.match(
    detailsBlock,
    /verdict\.basis\.dialecticalStrength/,
    "The real dialecticalStrength number must be rendered only inside the details block"
  );
  assert.match(
    detailsBlock,
    /verdict\.basis\.verificationStatus/,
    "verificationStatus must be surfaced verbatim inside the details block"
  );
  assert.match(
    detailsBlock,
    /convergence/i,
    "convergence must be surfaced inside the details block"
  );

  // The raw number must NOT appear outside of the details block (never headline precision).
  const withoutDetails = source.replace(/<details[\s\S]*?<\/details>/, "");
  assert.doesNotMatch(
    withoutDetails,
    /verdict\.basis\.dialecticalStrength/,
    "The raw dialecticalStrength number must never render outside the details/expandable block"
  );
});

test("VerdictBanner never silently omits null basis values", () => {
  const source = readFileSync(bannerPath, "utf8");

  // Expect an explicit "not available"-shaped fallback string used for null basis fields,
  // e.g. `?? "not available"` or `?? "n/a"` style honest fallback (never blank/omitted).
  assert.match(
    source,
    /\?\?\s*"(?:not available|n\/a)"/i,
    "Null basis values (dialecticalStrength/verificationStatus/convergence) must render an explicit honest fallback string, never be silently omitted"
  );
});

test("web/lib/types.ts defines VerdictBand and VerdictSummary matching the coordinator wire shape exactly", () => {
  const source = readFileSync(typesPath, "utf8");

  assert.match(
    source,
    /export type VerdictBand = "supported" \| "contested" \| "unsupported" \| "unavailable";/,
    "VerdictBand must match the coordinator's verdict_summary band values exactly"
  );
  assert.match(
    source,
    /export type VerdictSummary = \{[\s\S]*verdictBand: VerdictBand;[\s\S]*claimLanguage: string;[\s\S]*basis: \{[\s\S]*dialecticalStrength: number \| null;[\s\S]*verificationStatus: string \| null;[\s\S]*convergence: Record<string, unknown> \| null;[\s\S]*\};[\s\S]*verdictThresholdsVersion: string;[\s\S]*\};/,
    "VerdictSummary must match Task 1's exact wire shape (camelCase, additive)"
  );
  assert.match(
    source,
    /verdict\?: VerdictSummary;/,
    "DebateDetail must gain an additive optional verdict field, never a required one (older cached payloads may lack the key)"
  );
});

test("DebatePageClient mounts VerdictBanner behind the NEXT_PUBLIC_VERDICT_FIRST_UI flag only", () => {
  const source = readFileSync(pageClientPath, "utf8");

  assert.match(
    source,
    /import \{ VerdictBanner \} from "@\/components\/VerdictBanner";/,
    "DebatePageClient should import VerdictBanner"
  );

  // The flag check and the VerdictBanner JSX usage must appear together within a bounded
  // proximity (same conditional expression), so the ENTIRE new section -- not just part of it --
  // is gated behind the flag.
  assert.match(
    source,
    /process\.env\.NEXT_PUBLIC_VERDICT_FIRST_UI === "true"[\s\S]{0,200}<VerdictBanner verdict=\{debate\.verdict\}[\s\S]{0,80}\/>[\s\S]{0,40}: null/,
    "The <VerdictBanner> mount must be wrapped entirely inside the NEXT_PUBLIC_VERDICT_FIRST_UI flag conditional, with a null fallback for flag-off"
  );
});
