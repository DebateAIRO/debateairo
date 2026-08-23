import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
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
  mkdirSync(outDir, { recursive: true });
  copyFileSync("trusted-client-ip.mjs", join(outDir, "trusted-client-ip.mjs"));
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

test("forwards only the exact session cookies, Origin, CSRF proof, UA and ordinary allowlist", async () => {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const headers = new Headers({
      "content-type": "application/json",
      "cache-control": "no-store",
      "x-upstream": "stripped",
      "access-control-allow-origin": "https://evil.test"
    });
    headers.append("set-cookie", `__Host-debateai-session=${"s".repeat(43)}; Path=/; Max-Age=1209600; HttpOnly; Secure; SameSite=Lax`);
    headers.append("set-cookie", `__Host-debateai-csrf=${"c".repeat(43)}; Path=/; Max-Age=1209600; Secure; SameSite=Lax`);
    headers.append("set-cookie", "attacker=1; Path=/; Secure; SameSite=Lax");
    headers.append("set-cookie", `__Host-debateai-session=${"x".repeat(43)}; Path=/; Max-Age=1209600; HttpOnly; Secure; SameSite=Lax; Priority=High`);
    return new Response(JSON.stringify({ run_ref: "run:test", status: "QUEUED" }), { status: 202, headers });
  };
  const { POST } = await loadRoute();
  const response = await POST(new Request("http://web.local/api/v1/asks?mode=live", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `unrelated=private; __Host-debateai-session=${"s".repeat(43)}; __Host-debateai-csrf=${"c".repeat(43)}`,
      origin: "https://web.local",
      "user-agent": "S5 Browser",
      "x-csrf-token": "c".repeat(43),
      authorization: "Bearer must-not-pass",
      "x-user-dev-token": "must-not-pass",
      "x-forwarded-for": "203.0.113.8"
    },
    body: JSON.stringify({ question_line: "What follows?" })
  }), { params: Promise.resolve({ path: ["v1", "asks"] }) });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://acceptance.local:8790/v1/asks?mode=live");
  assert.equal(calls[0].init.method, "POST");
  const forwardedHeaders = new Headers(calls[0].init.headers);
  assert.equal(forwardedHeaders.get("cookie"), `__Host-debateai-session=${"s".repeat(43)}; __Host-debateai-csrf=${"c".repeat(43)}`);
  assert.equal(forwardedHeaders.get("origin"), "https://web.local");
  assert.equal(forwardedHeaders.get("user-agent"), "S5 Browser");
  assert.equal(forwardedHeaders.get("x-csrf-token"), "c".repeat(43));
  assert.equal(forwardedHeaders.get("authorization"), null);
  assert.equal(forwardedHeaders.get("x-user-dev-token"), null);
  assert.equal(forwardedHeaders.get("host"), null);
  assert.equal(forwardedHeaders.get("expect"), null);
  assert.deepEqual([...forwardedHeaders.keys()].sort(), ["content-type", "cookie", "origin", "user-agent", "x-csrf-token"]);
  assert.equal(new TextDecoder().decode(calls[0].init.body), JSON.stringify({ question_line: "What follows?" }));
  assert.equal(response.status, 202);
  assert.equal(response.headers.get("x-upstream"), null);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
  const downstreamCookies = response.headers.getSetCookie();
  assert.equal(downstreamCookies.length, 2);
  assert.ok(downstreamCookies.every((value) => !value.startsWith("attacker=")));
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
