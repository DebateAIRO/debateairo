import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";
import test, { after } from "node:test";
import { pathToFileURL } from "node:url";

const outDir = join(process.cwd(), ".tmp-scoring-format-test");

function compileHelper() {
  rmSync(outDir, { recursive: true, force: true });
  const tscCommand = process.platform === "win32"
    ? join(process.cwd(), "node_modules", ".bin", "tsc.cmd")
    : join(process.cwd(), "node_modules", ".bin", "tsc");
  const tscArgs = [
    "lib/scoringFormat.ts",
    "--target",
    "ES2022",
    "--module",
    "NodeNext",
    "--moduleResolution",
    "NodeNext",
    "--rootDir",
    ".",
    "--outDir",
    outDir,
    "--skipLibCheck",
    "--strict",
  ];

  if (process.platform === "win32") {
    execFileSync("cmd.exe", ["/d", "/s", "/c", tscCommand, ...tscArgs], {
      cwd: process.cwd(),
      stdio: "pipe",
    });
    return;
  }

  execFileSync(tscCommand, tscArgs, { cwd: process.cwd(), stdio: "pipe" });
}

after(() => {
  rmSync(outDir, { recursive: true, force: true });
});

async function loadHelper() {
  compileHelper();
  const moduleUrl = pathToFileURL(join(outDir, "lib", "scoringFormat.js")).href;
  return import(`${moduleUrl}?cacheBust=${Date.now()}`);
}

test("formatScorePercent scales normalized backend scores to out-of-100 display values", async () => {
  const { formatScorePercent } = await loadHelper();

  assert.deepEqual(formatScorePercent(0.82), { value: 82, label: "82 out of 100" });
  assert.deepEqual(formatScorePercent(0), { value: 0, label: "0 out of 100" });
  assert.deepEqual(formatScorePercent(1), { value: 100, label: "100 out of 100" });
});

test("formatScorePercent clamps unexpected values before display", async () => {
  const { formatScorePercent } = await loadHelper();

  assert.deepEqual(formatScorePercent(-0.2), { value: 0, label: "0 out of 100" });
  assert.deepEqual(formatScorePercent(1.4), { value: 100, label: "100 out of 100" });
});

test("formatScoreBadgeLabel returns readable labels for score badges", async () => {
  const { formatScoreBadgeLabel, formatScorePercent } = await loadHelper();

  assert.equal(formatScoreBadgeLabel("Strength", "high", formatScorePercent(0.82)), "Strength high, 82 out of 100");
  assert.equal(
    formatScoreBadgeLabel("Uncertainty", "medium", formatScorePercent(0.34)),
    "Uncertainty medium, 34 out of 100",
  );
  assert.equal(formatScoreBadgeLabel("Impact", "low", formatScorePercent(0.12)), "Impact low, 12 out of 100");
});

test("formatUncertaintyPill uses the first driver's label as pill text, and joins every driver plus the numeric value/source in the title", async () => {
  const { formatUncertaintyPill, formatScorePercent } = await loadHelper();

  const result = formatUncertaintyPill(
    [
      { code: "no_evidence_refs", label: "no external evidence" },
      { code: "low_evidence_quality", label: "evidence quality low" },
    ],
    "heuristic",
    formatScorePercent(0.48),
  );

  assert.equal(result.pillText, "no external evidence");
  assert.equal(result.title, "no external evidence; evidence quality low (UNC 48 · heuristic)");
});

test("formatUncertaintyPill falls back to an honest 'uncertainty unmeasured' pill with no drivers and a heuristic source", async () => {
  const { formatUncertaintyPill, formatScorePercent } = await loadHelper();

  const result = formatUncertaintyPill([], "heuristic", formatScorePercent(0.2));

  assert.equal(result.pillText, "uncertainty unmeasured");
  // Reviewer follow-up: title uses the same parenthesized "<text> (UNC ...)"
  // form as the has-drivers case above, not a shorter special case.
  assert.equal(result.title, "uncertainty unmeasured (UNC 20 · heuristic)");
});

test("formatUncertaintyPill treats missing drivers/source the same as null (older, pre-Task-4 debates)", async () => {
  const { formatUncertaintyPill, formatScorePercent } = await loadHelper();

  const resultUndefined = formatUncertaintyPill(undefined, undefined, formatScorePercent(0.2));
  const resultNull = formatUncertaintyPill(null, null, formatScorePercent(0.2));

  assert.deepEqual(resultUndefined, resultNull);
  assert.equal(resultUndefined.pillText, "uncertainty unmeasured");
  assert.equal(resultUndefined.title, "uncertainty unmeasured (UNC 20 · heuristic)");
});

test("formatUncertaintyPill shows the judge_dispersion driver's label as pill text when uncertainty_source is dispersion", async () => {
  const { formatUncertaintyPill, formatScorePercent } = await loadHelper();

  // Mirrors what app.scoring.service._attach_plural_judge_provenance
  // actually sends: judge_dispersion is always the first driver whenever
  // uncertainty_source is "dispersion".
  const result = formatUncertaintyPill(
    [
      { code: "judge_dispersion", label: "judges disagree (spread 0.58)" },
      { code: "no_evidence_refs", label: "no external evidence" },
    ],
    "dispersion",
    formatScorePercent(0.83),
  );

  assert.equal(result.pillText, "judges disagree (spread 0.58)");
  assert.equal(result.title, "judges disagree (spread 0.58); no external evidence (UNC 83 · dispersion)");
});

test("formatUncertaintyPill falls back to the numeric+source pill for a dispersion source with no drivers (defensive; the real pipeline always supplies judge_dispersion)", async () => {
  const { formatUncertaintyPill, formatScorePercent } = await loadHelper();

  const result = formatUncertaintyPill([], "dispersion", formatScorePercent(0.83));

  assert.equal(result.pillText, "UNC 83 · dispersion");
  assert.equal(result.title, "UNC 83 · dispersion (UNC 83 · dispersion)");
});

test("formatStrengthPill adds a compact argument-only suffix and an explanatory title when strength_kind is argument_only", async () => {
  const { formatStrengthPill, formatScorePercent } = await loadHelper();

  const result = formatStrengthPill("argument_only", formatScorePercent(0.62));

  assert.equal(result.pillText, "STR 62 · argument-only");
  assert.equal(
    result.title,
    "Argument-only strength — evidence not weighted for this claim type (62 out of 100)",
  );
});

test("formatStrengthPill renders the plain pre-Task-5 pill with no title for strength_kind evidence_weighted", async () => {
  const { formatStrengthPill, formatScorePercent } = await loadHelper();

  const result = formatStrengthPill("evidence_weighted", formatScorePercent(0.62));

  assert.equal(result.pillText, "STR 62");
  assert.equal(result.title, undefined);
});

test("formatStrengthPill treats missing strength_kind the same as evidence_weighted (older, pre-Task-5 debates)", async () => {
  const { formatStrengthPill, formatScorePercent } = await loadHelper();

  const resultUndefined = formatStrengthPill(undefined, formatScorePercent(0.62));
  const resultNull = formatStrengthPill(null, formatScorePercent(0.62));

  assert.deepEqual(resultUndefined, resultNull);
  assert.equal(resultUndefined.pillText, "STR 62");
  assert.equal(resultUndefined.title, undefined);
});

// Task 13 (P1.5, evidence independence bookkeeping): formatIndependencePill
// renders the per-claim {distinct_source_count, pairs} aggregate
// (coordinator/app/evidence/independence.py via
// DebateNode.evidence_independence) as a compact pill + explanatory title,
// following the same pillText/title convention as formatUncertaintyPill/
// formatStrengthPill above. The label must say what it measures (distinct
// source-domain/method pairs) and must never read as a training-corpus-
// independence claim.

test("formatIndependencePill returns null when there is no independence data to show", async () => {
  const { formatIndependencePill } = await loadHelper();

  assert.equal(formatIndependencePill(null), null);
  assert.equal(formatIndependencePill(undefined), null);
  assert.equal(formatIndependencePill({ distinct_source_count: 0, pairs: [] }), null);
});

test("formatIndependencePill renders a single distinct source", async () => {
  const { formatIndependencePill } = await loadHelper();

  const result = formatIndependencePill({
    distinct_source_count: 1,
    pairs: [["reuters.com", "retrieval"]],
  });

  assert.equal(result.pillText, "sources: 1 distinct");
  assert.equal(
    result.title,
    "1 distinct source-domain/method pair (reuters.com (retrieved)) — measures sourcing breadth " +
      "(where evidence claims to come from), not verified accuracy or training-corpus independence.",
  );
});

test("formatIndependencePill pluralizes and lists every pair, including the null-domain model-claim bucket", async () => {
  const { formatIndependencePill } = await loadHelper();

  const result = formatIndependencePill({
    distinct_source_count: 2,
    pairs: [
      [null, "model-claim"],
      ["reuters.com", "retrieval"],
    ],
  });

  assert.equal(result.pillText, "sources: 2 distinct");
  assert.equal(
    result.title,
    "2 distinct source-domain/method pairs (no domain (model claim); reuters.com (retrieved)) — " +
      "measures sourcing breadth (where evidence claims to come from), not verified accuracy or " +
      "training-corpus independence.",
  );
});

test("formatIndependencePill degrades honestly for an unrecognized method and a null method", async () => {
  const { formatIndependencePill } = await loadHelper();

  const result = formatIndependencePill({
    distinct_source_count: 2,
    pairs: [
      ["x.com", "archived"],
      [null, null],
    ],
  });

  assert.match(result.title, /x\.com \(archived\)/);
  assert.match(result.title, /no domain \(unknown method\)/);
});

test("formatIndependencePill never claims to measure training-corpus independence", async () => {
  const { formatIndependencePill } = await loadHelper();

  const result = formatIndependencePill({
    distinct_source_count: 3,
    pairs: [
      [null, "model-claim"],
      ["apnews.com", "retrieval"],
      ["reuters.com", "retrieval"],
    ],
  });

  assert.doesNotMatch(result.pillText, /independent/i);
  assert.match(result.title, /not verified accuracy or training-corpus independence/);
});
