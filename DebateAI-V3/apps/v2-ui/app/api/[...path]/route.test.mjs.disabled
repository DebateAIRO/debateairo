import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";
import test, { after, beforeEach } from "node:test";
import { pathToFileURL } from "node:url";

const outDir = join(process.cwd(), ".tmp-api-route-test");
const routePath = join("app", "api", "[...path]", "route.ts");

function compileRoute() {
  rmSync(outDir, { recursive: true, force: true });
  const tsc = process.platform === "win32"
    ? join(process.cwd(), "node_modules", ".bin", "tsc.cmd")
    : join(process.cwd(), "node_modules", ".bin", "tsc");
  const args = [
    routePath,
    "--target", "ES2022",
    "--module", "NodeNext",
    "--moduleResolution", "NodeNext",
    "--rootDir", ".",
    "--outDir", outDir,
    "--skipLibCheck",
    "--types", "node",
    "--typeRoots", join(process.cwd(), "node_modules", "@types"),
    "--strict"
  ];
  if (process.platform === "win32") {
    execFileSync("cmd.exe", ["/d", "/s", "/c", tsc, ...args], { cwd: process.cwd(), stdio: "pipe" });
    return;
  }
  execFileSync(tsc, args, { cwd: process.cwd(), stdio: "pipe" });
}

async function loadRoute() {
  compileRoute();
  const moduleUrl = pathToFileURL(join(outDir, "app", "api", "[...path]", "route.js")).href;
  return import(`${moduleUrl}?cacheBust=${Date.now()}`);
}

after(() => {
  rmSync(outDir, { recursive: true, force: true });
  delete globalThis.fetch;
  delete process.env.DIALECTICAL_API_BASE;
});

beforeEach(() => {
  process.env.DIALECTICAL_API_BASE = "http://acceptance.local:8790";
  delete globalThis.fetch;
});

test("forwards method, path, query, body, and the caller token without inventing headers", async () => {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ run_ref: "run:test", status: "QUEUED" }), {
      status: 202,
      headers: { "content-type": "application/json", "x-upstream": "kept" }
    });
  };
  const { POST } = await loadRoute();
  const response = await POST(new Request("http://web.local/api/v1/asks?mode=live", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-user-dev-token": "token:test"
    },
    body: JSON.stringify({ question_line: "What follows?" })
  }), { params: Promise.resolve({ path: ["v1", "asks"] }) });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://acceptance.local:8790/v1/asks?mode=live");
  assert.equal(calls[0].init.method, "POST");
  const forwardedHeaders = new Headers(calls[0].init.headers);
  assert.equal(forwardedHeaders.get("x-user-dev-token"), "token:test");
  assert.equal(forwardedHeaders.get("host"), null);
  assert.equal(forwardedHeaders.get("expect"), null);
  assert.deepEqual([...forwardedHeaders.keys()].sort(), ["content-type", "x-user-dev-token"]);
  assert.equal(new TextDecoder().decode(calls[0].init.body), JSON.stringify({ question_line: "What follows?" }));
  assert.equal(response.status, 202);
  assert.equal(response.headers.get("x-upstream"), "kept");
  assert.deepEqual(await response.json(), { run_ref: "run:test", status: "QUEUED" });
});

test("passes an upstream event stream through without buffering it", async () => {
  let streamController;
  const upstreamBody = new ReadableStream({
    start(controller) {
      streamController = controller;
      controller.enqueue(new TextEncoder().encode("data: first\n\n"));
    }
  });
  globalThis.fetch = async () => new Response(upstreamBody, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache" }
  });
  const { GET } = await loadRoute();

  const response = await Promise.race([
    GET(new Request("http://web.local/api/v1/runs/run%3Atest/events"), {
      params: Promise.resolve({ path: ["v1", "runs", "run:test", "events"] })
    }),
    new Promise((_, reject) => setTimeout(() => reject(new Error("proxy buffered the event stream")), 250))
  ]);
  streamController.enqueue(new TextEncoder().encode("data: second\n\n"));
  streamController.close();

  assert.equal(response.headers.get("content-type"), "text/event-stream");
  assert.equal(await response.text(), "data: first\n\ndata: second\n\n");
});

test("fails loudly when the server-only upstream base is absent", async () => {
  delete process.env.DIALECTICAL_API_BASE;
  globalThis.fetch = async () => {
    throw new Error("fetch must not run without a configured upstream");
  };
  const { GET } = await loadRoute();
  await assert.rejects(
    () => GET(new Request("http://web.local/api/v1/session"), {
      params: Promise.resolve({ path: ["v1", "session"] })
    }),
    /DIALECTICAL_API_BASE_REQUIRED/
  );
});
