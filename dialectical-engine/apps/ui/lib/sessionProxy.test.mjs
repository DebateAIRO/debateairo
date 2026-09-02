import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import test, { after } from "node:test";
import { pathToFileURL } from "node:url";

const outDir = join(process.cwd(), ".tmp-s5-api-route-test");
const RETIRED_DEV_HEADER = ["x", "user", "dev", "token"].join("-");

async function loadRoute() {
  rmSync(outDir, { recursive: true, force: true });
  const tsc = join(process.cwd(), "node_modules", ".bin", process.platform === "win32" ? "tsc.cmd" : "tsc");
  execFileSync(tsc, [
    join("app", "api", "[...path]", "route.ts"),
    "--target", "ES2022", "--module", "NodeNext", "--moduleResolution", "NodeNext",
    "--rootDir", ".", "--outDir", outDir, "--skipLibCheck", "--types", "node",
    "--typeRoots", join(process.cwd(), "node_modules", "@types"), "--strict"
  ], { cwd: process.cwd(), stdio: "pipe" });
  mkdirSync(outDir, { recursive: true });
  copyFileSync("trusted-client-ip.mjs", join(outDir, "trusted-client-ip.mjs"));
  return import(`${pathToFileURL(join(outDir, "app", "api", "[...path]", "route.js")).href}?${Date.now()}`);
}

after(() => {
  rmSync(outDir, { recursive: true, force: true });
  delete globalThis.fetch;
  delete process.env.DIALECTICAL_API_BASE;
});

test("S5 proxy filters request cookies and response cookies/headers", async () => {
  process.env.DIALECTICAL_API_BASE = "http://api.internal:8000";
  let forwarded;
  globalThis.fetch = async (_url, init) => {
    forwarded = new Headers(init.headers);
    const headers = new Headers({
      "content-type": "application/json",
      "access-control-allow-origin": "https://evil.test",
      "x-internal": "secret"
    });
    headers.append("set-cookie", `__Host-debateai-session=${"s".repeat(43)}; Path=/; Max-Age=1209600; HttpOnly; Secure; SameSite=Lax`);
    headers.append("set-cookie", `__Host-debateai-csrf=${"c".repeat(43)}; Path=/; Max-Age=1209600; Secure; SameSite=Lax`);
    headers.append("set-cookie", "tracking=1; Path=/; Secure; SameSite=Lax");
    headers.append("set-cookie", `__Host-debateai-session=${"x".repeat(43)}; Path=/; Max-Age=1209600; HttpOnly; Secure; SameSite=Lax; Priority=High`);
    return new Response("{}", { headers });
  };
  const { POST } = await loadRoute();
  const response = await POST(new Request("https://app.test/api/v1/asks", {
    method: "POST",
    headers: {
      cookie: `private=drop; __Host-debateai-session=${"s".repeat(43)}; __Host-debateai-csrf=${"c".repeat(43)}`,
      origin: "https://app.test",
      "user-agent": "S5 Browser",
      "x-csrf-token": "c".repeat(43),
      authorization: "Bearer drop",
      [RETIRED_DEV_HEADER]: "drop",
      "x-forwarded-host": "evil.test"
    },
    body: "{}"
  }), { params: Promise.resolve({ path: ["v1", "asks"] }) });
  assert.equal(forwarded.get("cookie"), `__Host-debateai-session=${"s".repeat(43)}; __Host-debateai-csrf=${"c".repeat(43)}`);
  assert.equal(forwarded.get("origin"), "https://app.test");
  assert.equal(forwarded.get("x-csrf-token"), "c".repeat(43));
  assert.equal(forwarded.get("user-agent"), "S5 Browser");
  for (const name of ["authorization", RETIRED_DEV_HEADER, "x-forwarded-host"]) assert.equal(forwarded.get(name), null);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
  assert.equal(response.headers.get("x-internal"), null);
  assert.deepEqual(response.headers.getSetCookie().map((value) => value.split("=", 1)[0]), [
    "__Host-debateai-session", "__Host-debateai-csrf"
  ]);
});

// ---------------------------------------------------------------- L3-F1 body cap

const PROXY_CONTEXT = { params: Promise.resolve({ path: ["v1", "asks"] }) };

test("L3-F1: a declared body over 1 MiB is refused with 413 before the upstream is called; exactly 1 MiB passes", async () => {
  process.env.DIALECTICAL_API_BASE = "http://api.internal:8000";
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return new Response("{}", { headers: { "content-type": "application/json" } });
  };
  const { POST } = await loadRoute();

  const tooLarge = await POST(new Request("https://app.test/api/v1/asks", {
    method: "POST",
    headers: { "content-length": "1048577", "content-type": "application/json" },
    body: "{}"
  }), PROXY_CONTEXT);
  assert.equal(tooLarge.status, 413);
  const refusal = await tooLarge.json();
  assert.equal(refusal.error, "PAYLOAD_TOO_LARGE");
  assert.equal(typeof refusal.message, "string");
  assert.equal(fetchCalls, 0, "the upstream is never called for a refused body");

  const atCap = await POST(new Request("https://app.test/api/v1/asks", {
    method: "POST",
    headers: { "content-length": "1048576", "content-type": "application/octet-stream" },
    body: new Uint8Array(1_048_576)
  }), PROXY_CONTEXT);
  assert.equal(atCap.status, 200);
  assert.equal(fetchCalls, 1);
});

test("L3-F1: an unbounded chunked body is cut off at 1 MiB with 413 and never reaches the upstream", async () => {
  process.env.DIALECTICAL_API_BASE = "http://api.internal:8000";
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return new Response("{}");
  };
  const { POST } = await loadRoute();
  const chunk = new Uint8Array(64 * 1024).fill(1);
  let pulled = 0;
  const body = new ReadableStream({
    pull(controller) {
      pulled += 1;
      if (pulled > 256) {
        controller.close();
        return;
      }
      controller.enqueue(chunk);
    }
  });
  const response = await POST(new Request("https://app.test/api/v1/asks", {
    method: "POST",
    headers: { "content-type": "application/octet-stream" },
    body,
    duplex: "half"
  }), PROXY_CONTEXT);
  assert.equal(response.status, 413);
  assert.equal((await response.json()).error, "PAYLOAD_TOO_LARGE");
  assert.equal(fetchCalls, 0);
  assert(pulled <= 20, `the proxy stopped reading at the cap instead of draining the stream (pulled ${pulled} chunks)`);
});

test("L3-F1: a 512 KiB body is forwarded unchanged", async () => {
  process.env.DIALECTICAL_API_BASE = "http://api.internal:8000";
  let forwardedBody;
  globalThis.fetch = async (_url, init) => {
    forwardedBody = init.body;
    return new Response("{}");
  };
  const { POST } = await loadRoute();
  const payload = new Uint8Array(512 * 1024).fill(7);
  payload[0] = 1;
  payload[payload.length - 1] = 9;
  const response = await POST(new Request("https://app.test/api/v1/asks", {
    method: "POST",
    headers: { "content-type": "application/octet-stream" },
    body: payload
  }), PROXY_CONTEXT);
  assert.equal(response.status, 200);
  const bytes = new Uint8Array(await new Response(forwardedBody).arrayBuffer());
  assert.equal(bytes.length, 512 * 1024);
  assert.equal(bytes[0], 1);
  assert.equal(bytes[1], 7);
  assert.equal(bytes[bytes.length - 1], 9);
});

// ---------------------------------------------------------------- L3-F12 abort / timeout

test("L3-F12: the upstream fetch follows the client's abort signal and carries a timeout for non-stream requests", async () => {
  process.env.DIALECTICAL_API_BASE = "http://api.internal:8000";
  let seenSignal;
  globalThis.fetch = async (_url, init) => {
    seenSignal = init.signal;
    return new Response("{}");
  };
  const { GET } = await loadRoute();
  const controller = new AbortController();
  const request = new Request("https://app.test/api/v1/session", { signal: controller.signal });
  await GET(request, { params: Promise.resolve({ path: ["v1", "session"] }) });
  assert(seenSignal instanceof AbortSignal, "the upstream fetch carries a signal");
  assert.notEqual(seenSignal, request.signal, "a composite signal (client abort OR timeout) is used");
  assert.equal(seenSignal.aborted, false);
  controller.abort();
  assert.equal(seenSignal.aborted, true, "aborting the client request aborts the upstream fetch");
});

test("L3-F12: event streams get only the client's signal, never a timeout", async () => {
  process.env.DIALECTICAL_API_BASE = "http://api.internal:8000";
  let seenSignal;
  globalThis.fetch = async (_url, init) => {
    seenSignal = init.signal;
    return new Response("", { headers: { "content-type": "text/event-stream" } });
  };
  const { GET } = await loadRoute();
  for (const [path, headers] of [
    [["v1", "runs", "r1", "events"], {}],
    [["v1", "session"], { accept: "text/event-stream" }]
  ]) {
    const request = new Request(`https://app.test/api/${path.join("/")}`, { headers });
    await GET(request, { params: Promise.resolve({ path }) });
    assert.equal(seenSignal, request.signal, `${path.join("/")} follows the client signal alone`);
  }
});

test("L3-F12: an upstream timeout is reported as 504, never as a fabricated API verdict", async () => {
  process.env.DIALECTICAL_API_BASE = "http://api.internal:8000";
  globalThis.fetch = async () => {
    throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
  };
  const { GET } = await loadRoute();
  const response = await GET(new Request("https://app.test/api/v1/session"), { params: Promise.resolve({ path: ["v1", "session"] }) });
  assert.equal(response.status, 504);
  assert.equal((await response.json()).error, "API_UPSTREAM_TIMEOUT");
});
