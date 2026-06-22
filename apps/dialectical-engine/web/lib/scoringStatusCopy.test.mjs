import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";
import test, { after } from "node:test";
import { pathToFileURL } from "node:url";

const outDir = join(process.cwd(), ".tmp-scoring-status-copy-test");

function compileHelper() {
  rmSync(outDir, { recursive: true, force: true });
  const tscCommand = process.platform === "win32"
    ? join(process.cwd(), "node_modules", ".bin", "tsc.cmd")
    : join(process.cwd(), "node_modules", ".bin", "tsc");
  const tscArgs = [
    "lib/scoringStatusCopy.ts",
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
  const moduleUrl = pathToFileURL(join(outDir, "lib", "scoringStatusCopy.js")).href;
  return import(`${moduleUrl}?cacheBust=${Date.now()}`);
}

test("formatScoringStatusCopy names unchecked, checking, checked, partial, failed, and cached states", async () => {
  const { formatScoringStatusCopy } = await loadHelper();

  assert.equal(formatScoringStatusCopy({ enabled: false, scoringStatus: "idle", refreshStatus: "idle" }), "Scores unchecked");
  assert.equal(formatScoringStatusCopy({ enabled: true, scoringStatus: "loading", refreshStatus: "idle" }), "Checking scores with Codex");
  assert.equal(formatScoringStatusCopy({ enabled: true, scoringStatus: "loaded", refreshStatus: "idle", responseStatus: "available" }), "Scores checked");
  assert.equal(formatScoringStatusCopy({ enabled: true, scoringStatus: "loaded", refreshStatus: "idle", responseStatus: "partial" }), "Scores partially checked");
  assert.equal(formatScoringStatusCopy({ enabled: true, scoringStatus: "error", refreshStatus: "idle", error: "Model timeout" }), "Scoring check failed: Model timeout");
  assert.equal(formatScoringStatusCopy({ enabled: true, scoringStatus: "unavailable", refreshStatus: "idle", reason: "Model unavailable" }), "Scoring check failed: Model unavailable");
  assert.equal(formatScoringStatusCopy({ enabled: true, scoringStatus: "loaded", refreshStatus: "idle", responseStatus: "available", cacheHit: true }), "Cached scores");
});

test("formatScoringStatusCopy appends last checked timestamp when real metadata provides one", async () => {
  const { formatScoringStatusCopy } = await loadHelper();

  assert.equal(
    formatScoringStatusCopy({
      enabled: true,
      scoringStatus: "loaded",
      refreshStatus: "idle",
      responseStatus: "available",
      checkedAt: "2026-06-19T14:30:45Z",
    }),
    "Scores checked - Last checked 2026-06-19 14:30 UTC"
  );
});

test("formatScoringStatusCopy appends compact provider and model label without leaking secret-looking metadata", async () => {
  const { formatScoringStatusCopy } = await loadHelper();

  assert.equal(
    formatScoringStatusCopy({
      enabled: true,
      scoringStatus: "loaded",
      refreshStatus: "idle",
      responseStatus: "available",
      provider: "Codex",
      model: "gpt-5.4",
    }),
    "Scores checked - Codex/gpt-5.4"
  );
  assert.equal(
    formatScoringStatusCopy({
      enabled: true,
      scoringStatus: "loaded",
      refreshStatus: "idle",
      responseStatus: "available",
      provider: "sk-live-secret",
      model: "gpt-5.4",
    }),
    "Scores checked - gpt-5.4"
  );
});

test("formatScoringStatusCopy marks real cache metadata as fresh or cached", async () => {
  const { formatScoringStatusCopy } = await loadHelper();

  assert.equal(
    formatScoringStatusCopy({
      enabled: true,
      scoringStatus: "loaded",
      refreshStatus: "idle",
      responseStatus: "available",
      cacheHit: false,
    }),
    "Fresh scores"
  );
  assert.equal(
    formatScoringStatusCopy({
      enabled: true,
      scoringStatus: "loaded",
      refreshStatus: "idle",
      responseStatus: "partial",
      cacheHit: false,
    }),
    "Fresh scores partially checked"
  );
  assert.equal(
    formatScoringStatusCopy({
      enabled: true,
      scoringStatus: "loaded",
      refreshStatus: "idle",
      responseStatus: "available",
      cacheHit: true,
    }),
    "Cached scores"
  );
  assert.equal(
    formatScoringStatusCopy({
      enabled: true,
      scoringStatus: "loaded",
      refreshStatus: "idle",
      responseStatus: "available",
    }),
    "Scores checked"
  );
});

test("formatScoringStatusCopy warns when explicit stale score metadata is present", async () => {
  const { formatScoringStatusCopy } = await loadHelper();

  assert.equal(
    formatScoringStatusCopy({
      enabled: true,
      scoringStatus: "loaded",
      refreshStatus: "idle",
      responseStatus: "available",
      cacheHit: false,
      staleReason: "input_hash_mismatch",
    }),
    "Scores may be stale - refresh scoring"
  );
  assert.equal(
    formatScoringStatusCopy({
      enabled: true,
      scoringStatus: "loaded",
      refreshStatus: "idle",
      responseStatus: "partial",
      cacheHit: false,
      staleReason: "input_hash_mismatch",
      checkedAt: "2026-06-19T14:30:45Z",
    }),
    "Scores may be stale - refresh scoring - Last checked 2026-06-19 14:30 UTC"
  );
});

test("formatScoringConfidenceCopy frames scores as reasoning aids instead of truth verdicts", async () => {
  const { formatScoringConfidenceCopy } = await loadHelper();

  assert.equal(formatScoringConfidenceCopy(), "Model-assisted reasoning aid, not a truth verdict.");
});
