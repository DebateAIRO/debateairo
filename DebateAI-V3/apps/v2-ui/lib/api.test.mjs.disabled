import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";
import test, { after, beforeEach } from "node:test";
import { pathToFileURL } from "node:url";

const outDir = join(process.cwd(), ".tmp-api-test");

function compileHelper() {
  rmSync(outDir, { recursive: true, force: true });
  const tscCommand =
    process.platform === "win32"
      ? join(process.cwd(), "node_modules", ".bin", "tsc.cmd")
      : join(process.cwd(), "node_modules", ".bin", "tsc");
  const tscArgs = [
    "lib/api.ts",
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
  delete globalThis.fetch;
});

beforeEach(() => {
  delete globalThis.fetch;
});

async function loadHelper() {
  compileHelper();
  const moduleUrl = pathToFileURL(join(outDir, "lib", "api.js")).href;
  return import(`${moduleUrl}?cacheBust=${Date.now()}`);
}

test("api helper does not expose normal scoring refresh or polling helpers", async () => {
  const helper = await loadHelper();

  assert.equal("startDebateScoringRefresh" in helper, false);
  assert.equal("getDebateScoringJobStatus" in helper, false);
});

test("submitScoringFeedback posts up and changed down votes with user bearer token", async () => {
  const calls = [];
  const responses = [
    { debate_id: "debate-1", node_id: "node-1", vote: "up", current_user_vote: "up", feedback_summary: { node_id: "node-1", up: 1, down: 0 } },
    { debate_id: "debate-1", node_id: "node-1", vote: "down", current_user_vote: "down", feedback_summary: { node_id: "node-1", up: 0, down: 1 } }
  ];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(responses[calls.length - 1]), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };
  const { submitScoringFeedback } = await loadHelper();

  const upPayload = await submitScoringFeedback("debate-1", "node-1", "up", "user-token");
  const downPayload = await submitScoringFeedback("debate-1", "node-1", "down", "user-token");

  assert.deepEqual(upPayload, responses[0]);
  assert.deepEqual(downPayload, responses[1]);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "/api/debates/debate-1/scoring/nodes/node-1/feedback");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.get("Authorization"), "Bearer user-token");
  assert.deepEqual(JSON.parse(calls[0].init.body), { vote: "up" });
  assert.equal(calls[1].url, "/api/debates/debate-1/scoring/nodes/node-1/feedback");
  assert.equal(calls[1].init.method, "POST");
  assert.equal(calls[1].init.headers.get("Authorization"), "Bearer user-token");
  assert.deepEqual(JSON.parse(calls[1].init.body), { vote: "down" });
});
