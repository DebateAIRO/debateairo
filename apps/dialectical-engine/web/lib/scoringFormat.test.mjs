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
