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
