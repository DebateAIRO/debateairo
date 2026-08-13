import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, beforeEach } from "node:test";
import { pathToFileURL } from "node:url";

const outDir = join(process.cwd(), ".tmp-observability-logger-test");
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

test("developer logger writes required JSONL shape when explicitly enabled", async () => {
  const logPath = tempLogPath();
  process.env.DEV_OBSERVABILITY = "true";
  process.env.DEV_OBSERVABILITY_LOG_PATH = logPath;
  const { developerLogger } = await loadHelper();

  developerLogger.info("scoring.started", {
    source: "test",
    message: "Scoring refresh queued",
    requestId: "req-1",
    debateId: "debate-1"
  });

  const line = readFileSync(logPath, "utf8").trim();
  const event = JSON.parse(line);
  assert.match(event.timestamp, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(event.level, "info");
  assert.equal(event.event, "scoring.started");
  assert.equal(event.source, "test");
  assert.equal(event.message, "Scoring refresh queued");
  assert.equal(event.requestId, "req-1");
  assert.equal(event.debateId, "debate-1");
});

test("redactForLog redacts sensitive nested keys and truncates oversized payloads", async () => {
  const { redactForLog } = await loadHelper();

  const payload = redactForLog({
    userId: "user-1",
    Authorization: "Bearer secret-token",
    rawPrompt: "private prompt text",
    providerPayload: {
      choices: [{ message: "private provider output" }]
    },
    nested: {
      apiKey: "sk-live-secret",
      rawSecret: "Authorization: Bearer secret-token password=hunter2 sk-live-secret-value",
      notes: "x".repeat(1300),
      values: Array.from({ length: 30 }, (_, index) => index)
    }
  });

  assert.equal(payload.userId, "user-1");
  assert.equal(payload.Authorization, "[REDACTED]");
  assert.equal(payload.rawPrompt, "[REDACTED]");
  assert.equal(payload.providerPayload, "[REDACTED]");
  assert.equal(payload.nested.apiKey, "[REDACTED]");
  assert.equal(payload.nested.rawSecret, "[REDACTED]");
  assert.match(payload.nested.notes, /\[TRUNCATED 276 chars\]$/);
  assert.equal(payload.nested.values.length, 21);
  assert.equal(payload.nested.values.at(-1), "[TRUNCATED 10 items]");
});

test("redactForLog redacts sensitive error messages and stacks", async () => {
  const { redactForLog } = await loadHelper();
  const error = new Error("upstream failed with api_key=sk-live-secret-value");
  error.stack = "Error: authorization: bearer secret-token\n    at test";

  const payload = redactForLog({ error });

  assert.equal(payload.error.message, "[REDACTED]");
  assert.equal(payload.error.stack, "[REDACTED]");
});

test("developer logger stays disabled when DEV_OBSERVABILITY is false", async () => {
  const logPath = tempLogPath();
  process.env.DEV_OBSERVABILITY = "false";
  process.env.DEV_OBSERVABILITY_LOG_PATH = logPath;
  process.env.NODE_ENV = "development";
  const { developerLogger } = await loadHelper();

  developerLogger.warn("scoring.skipped", {
    source: "test",
    message: "Should not write"
  });

  assert.throws(() => readFileSync(logPath, "utf8"), /ENOENT/);
});

test("developer logger never throws when the configured sink path is invalid", async () => {
  process.env.DEV_OBSERVABILITY = "true";
  process.env.DEV_OBSERVABILITY_LOG_PATH = "\0bad-path";
  const { developerLogger } = await loadHelper();

  assert.doesNotThrow(() => {
    developerLogger.error("sink.failure", {
      source: "test",
      message: "Write failure should be swallowed",
      error: new Error("boom")
    });
  });
});
