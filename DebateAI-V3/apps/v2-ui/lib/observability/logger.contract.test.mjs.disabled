import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, beforeEach } from "node:test";
import { pathToFileURL } from "node:url";

const outDir = join(process.cwd(), ".tmp-observability-logger-contract-test");
const envKeys = ["DEV_OBSERVABILITY", "DEV_OBSERVABILITY_LOG_PATH", "NODE_ENV"];

function compileHelper() {
  rmSync(outDir, { recursive: true, force: true });
  const tscCommand = process.env.TSC_BIN ?? (process.platform === "win32"
      ? join(process.cwd(), "node_modules", ".bin", "tsc.cmd")
      : join(process.cwd(), "node_modules", ".bin", "tsc"));
  const tscArgs = [
    "lib/observability/logger.ts",
    "lib/observability/index.ts",
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
    "--strict"
  ];

  if (process.platform === "win32") {
    execFileSync("cmd.exe", ["/d", "/s", "/c", tscCommand, ...tscArgs], {
      cwd: process.cwd(),
      stdio: "pipe"
    });
    return;
  }

  execFileSync(tscCommand, tscArgs, { cwd: process.cwd(), stdio: "pipe" });
}

after(() => {
  rmSync(outDir, { recursive: true, force: true });
});

beforeEach(() => {
  for (const key of envKeys) {
    delete process.env[key];
  }
});

async function loadHelper() {
  compileHelper();
  const moduleUrl = pathToFileURL(join(outDir, "lib", "observability", "logger.js")).href;
  return import(`${moduleUrl}?cacheBust=${Date.now()}`);
}

function tempLogPath() {
  return join(mkdtempSync(join(tmpdir(), "developer-events-")), "events.jsonl");
}

test("suspicious logger method records an ordered warning severity", async () => {
  const logPath = tempLogPath();
  process.env.DEV_OBSERVABILITY = "true";
  process.env.DEV_OBSERVABILITY_LOG_PATH = logPath;
  const { developerLogger } = await loadHelper();

  developerLogger.suspicious("scoring.empty_output", {
    source: "scoring-response",
    message: "Successful scoring response contained no scored items.",
    rootHint: {
      suspectedLayer: "artifact",
      upstreamEventId: "api.proxy.debate_scoring",
      notes: "Scoring returned success with zero items."
    }
  });

  const event = JSON.parse(readFileSync(logPath, "utf8").trim());
  assert.equal(event.level, "warn");
  assert.equal(event.category, "suspicious");
  assert.equal(event.event, "scoring.empty_output");
  assert.deepEqual(event.rootHint, {
    suspectedLayer: "artifact",
    upstreamEventId: "api.proxy.debate_scoring",
    notes: "Scoring returned success with zero items."
  });
});

test("ordinary warning events are not suspicious category events", async () => {
  const logPath = tempLogPath();
  process.env.DEV_OBSERVABILITY = "true";
  process.env.DEV_OBSERVABILITY_LOG_PATH = logPath;
  const { developerLogger } = await loadHelper();

  developerLogger.warn("scoring.skipped", {
    source: "scoring-response",
    message: "Scoring skipped because scoring is disabled."
  });

  const event = JSON.parse(readFileSync(logPath, "utf8").trim());
  assert.equal(event.level, "warn");
  assert.equal(event.category, undefined);
});

test("redactForLog redacts api key values embedded in strings", async () => {
  const { redactForLog } = await loadHelper();

  assert.equal(redactForLog("api_key=sk-live-secret-value"), "[REDACTED]");
});
