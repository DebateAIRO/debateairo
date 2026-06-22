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

test("startDebateScoringRefresh queues scoring with user bearer token", async () => {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ debate_id: "debate-1", job_id: "job-1", status: "queued" }), {
      status: 202,
      headers: { "Content-Type": "application/json" }
    });
  };
  const { startDebateScoringRefresh } = await loadHelper();

  const payload = await startDebateScoringRefresh("debate-1", "user-token");

  assert.deepEqual(payload, { debate_id: "debate-1", job_id: "job-1", status: "queued" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/debates/debate-1/scoring/jobs");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.get("Authorization"), "Bearer user-token");
});

test("getDebateScoringJobStatus reads existing queued scoring status", async () => {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ debate_id: "debate-1", job_id: "job-1", status: "running" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };
  const { getDebateScoringJobStatus } = await loadHelper();

  const payload = await getDebateScoringJobStatus("debate-1", "job-1");

  assert.deepEqual(payload, { debate_id: "debate-1", job_id: "job-1", status: "running" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/debates/debate-1/scoring/jobs/job-1");
  assert.equal(calls[0].init.method, undefined);
  assert.equal(calls[0].init.headers.has("Authorization"), false);
});
