import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";
import test, { after, beforeEach } from "node:test";
import { pathToFileURL } from "node:url";

const outDir = join(process.cwd(), ".tmp-server-api-test");
const originalTimeout = process.env.DIALECTICAL_SERVER_FETCH_TIMEOUT_MS;
const originalCoordinatorUrl = process.env.DIALECTICAL_COORDINATOR_URL;

function compileHelper() {
  rmSync(outDir, { recursive: true, force: true });
  const tscCommand =
    process.platform === "win32"
      ? join(process.cwd(), "node_modules", ".bin", "tsc.cmd")
      : join(process.cwd(), "node_modules", ".bin", "tsc");
  const tscArgs = [
    "lib/serverApi.ts",
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
  delete globalThis.fetch;
  restoreEnv();
});

beforeEach(() => {
  delete globalThis.fetch;
  process.env.DIALECTICAL_SERVER_FETCH_TIMEOUT_MS = "20";
  process.env.DIALECTICAL_COORDINATOR_URL = "http://127.0.0.1:65535";
});

function restoreEnv() {
  if (originalTimeout === undefined) {
    delete process.env.DIALECTICAL_SERVER_FETCH_TIMEOUT_MS;
  } else {
    process.env.DIALECTICAL_SERVER_FETCH_TIMEOUT_MS = originalTimeout;
  }

  if (originalCoordinatorUrl === undefined) {
    delete process.env.DIALECTICAL_COORDINATOR_URL;
  } else {
    process.env.DIALECTICAL_COORDINATOR_URL = originalCoordinatorUrl;
  }
}

async function loadHelper() {
  compileHelper();
  const moduleUrl = pathToFileURL(join(outDir, "lib", "serverApi.js")).href;
  return import(`${moduleUrl}?cacheBust=${Date.now()}`);
}

// Contract (updated): a coordinator SSR timeout is a TRANSIENT signal, not a
// bare user-facing throw. getDebateServer resolves to a discriminated result so
// the debate page can render a pending/loading state and let client-side
// polling/stream retry, instead of a fatal dead-end screen. See serverApi.ts
// classifyCoordinatorFetchError and app/debate/[id]/page.tsx.
test("getDebateServer classifies a coordinator timeout as a transient pending result instead of throwing", async () => {
  globalThis.fetch = () => new Promise(() => {});
  const { getDebateServer } = await loadHelper();

  const result = await Promise.race([
    getDebateServer("debate-1"),
    new Promise((_, reject) => setTimeout(() => reject(new Error("test timed out before server API did")), 200)),
  ]);

  assert.equal(result.ok, false);
  assert.equal(result.kind, "pending");
  assert.match(result.message, /timed out after 20ms/);
});

test("getDebateServer classifies a definitive 404 as a not_found result", async () => {
  globalThis.fetch = async () =>
    new Response("debate not found", { status: 404, statusText: "Not Found" });
  const { getDebateServer } = await loadHelper();

  const result = await getDebateServer("missing-debate");

  assert.equal(result.ok, false);
  assert.equal(result.kind, "not_found");
  assert.equal(result.status, 404);
});

test("getDebateServer returns an ok result carrying the debate payload on success", async () => {
  const payload = { id: "debate-1", topic: "Test", status: "complete" };
  globalThis.fetch = async () =>
    new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
  const { getDebateServer } = await loadHelper();

  const result = await getDebateServer("debate-1");

  assert.equal(result.ok, true);
  assert.equal(result.debate.id, "debate-1");
});

test("a non-404 coordinator HTTP failure is treated as transient (pending), not fatal", async () => {
  globalThis.fetch = async () =>
    new Response("coordinator exploded", { status: 503, statusText: "Service Unavailable" });
  const { getDebateServer } = await loadHelper();

  const result = await getDebateServer("debate-1");

  assert.equal(result.ok, false);
  assert.equal(result.kind, "pending");
  assert.equal(result.status, 503);
});
