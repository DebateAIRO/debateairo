import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const typesSource = readFileSync(join(root, "lib", "types.ts"), "utf8");
const presentationSource = readFileSync(join(root, "lib", "debatePresentation.ts"), "utf8");
const bannerSource = readFileSync(join(root, "components", "VerdictBanner.tsx"), "utf8");
const synthesisSource = readFileSync(join(root, "components", "SynthesisPanel.tsx"), "utf8");
const pageSource = readFileSync(join(root, "app", "debate", "[id]", "DebatePageClient.tsx"), "utf8");

test("the additive web contract accepts suppressed verdicts and optional evidence-gate fields", () => {
  assert.match(
    typesSource,
    /export type VerdictBand = [^;]*"suppressed";/,
    "VerdictBand should include the coordinator's additive suppressed value"
  );
  assert.match(
    typesSource,
    /export type VerdictSummary = \{[\s\S]*verdictBand: VerdictBand;[\s\S]*basis: \{[\s\S]*preGateVerdictBand\?: VerdictBand;[\s\S]*semanticsVersion\?: string;[\s\S]*verdictState\?: "endorsed" \| "endorsed_with_caveat" \| "suppressed_no_evidence";[\s\S]*evidencePresence\?: "none" \| "extracted_unresolved";[\s\S]*suppressionReason\?:[\s\S]*caveats\?:[\s\S]*evidenceGateShadow\?:/,
    "VerdictSummary should type every new coordinator field as optional for older payloads"
  );
  assert.match(
    typesSource,
    /export type Synthesis = \{[\s\S]*verdict_gate\?:[\s\S]*state: "endorsed" \| "endorsed_with_caveat" \| "suppressed_no_evidence";[\s\S]*reason:/,
    "Synthesis should carry the additive verdict_gate wire object"
  );
});

test("VerdictBanner renders the exact withheld body and unlock hint for suppressed empirical verdicts", () => {
  assert.match(bannerSource, /suppressed: "Verdict withheld"/);
  assert.match(bannerSource, /verdict\.verdictState === "suppressed_no_evidence"/);
  assert.match(
    bannerSource,
    /No evidence was available in this run, so no endorsed verdict is shown for this empirical claim \(claim type: \{[^}]*claimType[^}]*\}\)\. The analysis map below remains available\./
  );
  assert.match(
    bannerSource,
    /To unlock an endorsed verdict: \{[^}]*unlock\?\.\[0\][^}]*\}\./,
    "Suppression should render the first real coordinator-provided unlock action"
  );
});

test("VerdictBanner renders the exact honest caveat lines", () => {
  assert.match(bannerSource, /caveat\.code === "evidence_unverified"/);
  assert.match(
    bannerSource,
    /Caveat — evidence unverified: extracted evidence has no resolved external source\./
  );
  assert.match(bannerSource, /caveat\.code === "claim_type_unknown"/);
  assert.match(
    bannerSource,
    /Caveat — claim type unestablished: this claim's type could not be determined from stored analysis, so the evidence gate was not applied\./
  );
});

test("SynthesisPanel withholds only its endorsed verdict body from the threaded synthesis gate", () => {
  assert.match(
    synthesisSource,
    /view\.verdictGate\?\.state === "suppressed_no_evidence"[\s\S]*Endorsed verdict withheld — no evidence in this run\./,
    "The panel should replace the persisted synthesis verdict only at presentation time"
  );
  assert.match(
    pageSource,
    /<SynthesisPanel[\s\S]*verdictGate=\{[\s\S]*process\.env\.NEXT_PUBLIC_VERDICT_FIRST_UI === "true" \? debate\.synthesis\?\.verdict_gate : undefined[\s\S]*\}/,
    "DebatePageClient should thread synthesis.verdict_gate only while the verdict-first UI flag is enabled"
  );
});

test("analysis-map views remain independent of verdict state", () => {
  const analysisMapBlock = pageSource.match(/\{hasTree && debate\.tree \? \([\s\S]*?\) : singleShotResult \? \(/)?.[0];
  assert.ok(analysisMapBlock, "Expected to find the DebatePageClient view-mode block");
  assert.match(analysisMapBlock, /<DebateThread/);
  assert.match(analysisMapBlock, /<DebateSplit/);
  assert.match(analysisMapBlock, /<DebateMap/);
  assert.match(analysisMapBlock, /<DebateCanvas/);
  assert.doesNotMatch(
    analysisMapBlock,
    /verdictState/,
    "Thread/Split/Map/Canvas rendering must never be conditioned on verdictState"
  );
});

test("every rendered QBAF value carries its semantics label through the sanctioned formatter", () => {
  assert.match(
    presentationSource,
    /export function formatDialecticalSupport\(value: number, semanticsVersion: string\): string \{\s*return `Dialectical support under semantics version \$\{semanticsVersion\}: \$\{value\}`;\s*\}/
  );
  assert.match(bannerSource, /formatDialecticalSupport\(verdict\.basis\.dialecticalStrength, verdict\.basis\.semanticsVersion\)/);
  assert.match(bannerSource, /convergence \(dialectical, semantics version \{verdict\.basis\.semanticsVersion/);

  const copySources = bannerSource + synthesisSource;
  assert.doesNotMatch(copySources, /refuted|false claim|probabilit/i);
});
