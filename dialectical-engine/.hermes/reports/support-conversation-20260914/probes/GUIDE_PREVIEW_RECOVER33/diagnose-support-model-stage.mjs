import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { loadDevelopmentCommandEnvironment } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine/packages/register/src/runtime-environment.ts";
import { createDevelopmentAuthStackOperations } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine/apps/runner/src/dev-auth-stack.ts";
import { loadDevelopmentAuthStackProfile } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine/apps/runner/src/dev-auth-stack-profile.ts";

const productRoot = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const outputPath = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/evidence/GUIDE_PREVIEW_RECOVER33-handshake-diagnostic.json";
const allowed = new Set([
  "HERMES_CREDENTIAL_OWNER_UNVERIFIED",
  "HERMES_CREDENTIAL_CUSTODY_INVALID",
  "HERMES_ZAI_CREDENTIAL_INVALID",
  "HERMES_CLI_FAILED",
  "HERMES_CLI_TIMEOUT",
  "HERMES_CLI_OUTPUT_INVALID",
  "HERMES_CLI_HANDSHAKE_INVALID",
  "CLI_RELAY_STDOUT_LIMIT"
]);
function portFree() {
  const result = spawnSync("/usr/sbin/lsof", ["-nP", "-iTCP:8894", "-sTCP:LISTEN", "-Fp"], { encoding: "utf8" });
  return result.status === 1 && result.stdout.length === 0;
}
function processGone(pid) {
  const result = spawnSync("/bin/ps", ["-p", String(pid), "-o", "pid="], { encoding: "utf8" });
  return result.status === 1 && result.stdout.trim().length === 0;
}
const startedAtUtc = new Date().toISOString();
const preRelayPortFree = portFree();
const failedRuntimeProcessGone = processGone(82483);
assert.equal(preRelayPortFree, true, "HERMES_DIAGNOSTIC_PORT_OCCUPIED");
assert.equal(failedRuntimeProcessGone, true, "HERMES_DIAGNOSTIC_FAILED_PROCESS_PRESENT");
let relay;
let outcomeCode = "HERMES_DIAGNOSTIC_UNKNOWN";
let status = "FAILED";
try {
  const commandEnvironment = loadDevelopmentCommandEnvironment();
  const profile = loadDevelopmentAuthStackProfile(commandEnvironment);
  assert.equal(profile.name, "support-preview", "HERMES_DIAGNOSTIC_PROFILE_INVALID");
  const operations = createDevelopmentAuthStackOperations(productRoot, commandEnvironment, profile);
  relay = await operations.startSupportModelRelay();
  outcomeCode = "HERMES_DIAGNOSTIC_READY";
  status = "PASSED";
} catch (error) {
  const candidate = error instanceof Error ? error.message : "";
  outcomeCode = allowed.has(candidate) ? candidate : "HERMES_DIAGNOSTIC_UNKNOWN";
} finally {
  if (relay !== undefined) await relay.stop();
}
const postRelayPortFree = portFree();
const result = Object.freeze({
  schemaVersion: 1,
  node: "GUIDE_PREVIEW_RECOVER33",
  ticket: "t_21dbe7b0",
  revision: "0d34f82f4a2188d0ce1db04655b693798ffd2169",
  diagnosticStage: "startSupportModelRelay",
  status,
  outcomeCode,
  handshakeAttempts: 1,
  paidFixedPromptModelAttempts: 1,
  supportSessionsCreated: 0,
  supportMessagesSent: 0,
  timeoutMs: 180000,
  preRelayPortFree,
  postRelayPortFree,
  failedRuntimeProcessGone,
  rawStdoutRetained: false,
  rawStderrRetained: false,
  rawExceptionRetained: false,
  credentialOrEnvironmentValuesRetained: false,
  startedAtUtc,
  completedAtUtc: new Date().toISOString()
});
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, { flag: "wx", mode: 0o600 });
console.log(JSON.stringify({ status, outcomeCode, handshakeAttempts: 1, preRelayPortFree, postRelayPortFree }));
if (status !== "PASSED" || !postRelayPortFree) process.exitCode = 1;
