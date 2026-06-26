import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test, { after, beforeEach } from "node:test";
import { pathToFileURL } from "node:url";

const outDir = join(process.cwd(), ".tmp-api-route-test");
const routePath = join("app", "api", "[...path]", "route.ts");
const loggerCalls = [];

function compileRoute() {
  rmSync(outDir, { recursive: true, force: true });
  const tscCommand =
    process.env.TSC ||
    (process.platform === "win32"
      ? join(process.cwd(), "node_modules", ".bin", "tsc.cmd")
      : join(process.cwd(), "node_modules", ".bin", "tsc"));
  const tscArgs = [
    routePath,
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
    "--types",
    "node",
    "--typeRoots",
    process.env.TYPE_ROOTS || join(process.cwd(), "node_modules", "@types"),
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

function installLoggerStub() {
  const loggerPath = join(outDir, "lib", "observability", "logger");
  mkdirSync(dirname(loggerPath), { recursive: true });
  writeFileSync(
    loggerPath,
    [
      "exports.Logger = {",
      "  warn(event, payload) { globalThis.__apiProxyLoggerCalls.push({ level: 'warn', event, payload }); },",
      "  error(event, payload) { globalThis.__apiProxyLoggerCalls.push({ level: 'error', event, payload }); }",
      "};"
    ].join("\n")
  );
}

after(() => {
  rmSync(outDir, { recursive: true, force: true });
  delete globalThis.fetch;
  delete globalThis.__apiProxyLoggerCalls;
});

beforeEach(() => {
  loggerCalls.length = 0;
  globalThis.__apiProxyLoggerCalls = loggerCalls;
  process.env.NODE_ENV = "development";
  process.env.DIALECTICAL_COORDINATOR_URL = "http://coordinator.local:8000";
  delete globalThis.fetch;
});

async function loadRoute() {
  compileRoute();
  installLoggerStub();
  const moduleUrl = pathToFileURL(join(outDir, "app", "api", "[...path]", "route.js")).href;
  return import(`${moduleUrl}?cacheBust=${Date.now()}`);
}

test("logs upstream non-2xx responses without consuming the response body", async () => {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return new Response("upstream failed because validation rejected the payload", {
      status: 422,
      statusText: "Unprocessable Entity",
      headers: { "Content-Type": "text/plain" }
    });
  };
  const { POST } = await loadRoute();

  const response = await POST(
    new Request("http://web.local/api/debates/123?token=secret-token&view=full", {
      method: "POST",
      body: "client-body"
    }),
    { params: Promise.resolve({ path: ["debates", "123"] }) }
  );

  assert.equal(response.status, 422);
  assert.equal(response.statusText, "Unprocessable Entity");
  assert.equal(await response.text(), "upstream failed because validation rejected the payload");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://coordinator.local:8000/api/debates/123?token=secret-token&view=full");
  assert.equal(loggerCalls.length, 1);
  assert.equal(loggerCalls[0].level, "warn");
  assert.equal(loggerCalls[0].event, "api.proxy.non_ok");
  assert.deepEqual(loggerCalls[0].payload, {
    method: "POST",
    path: "/api/debates/123?token=%5Bredacted%5D&view=full",
    upstream: "http://coordinator.local:8000/api/debates/123?token=%5Bredacted%5D&view=full",
    upstreamPath: "/api/debates/123?token=%5Bredacted%5D&view=full",
    status: 422,
    statusText: "Unprocessable Entity",
    responseSnippet: "upstream failed because validation rejected the payload"
  });
});

test("logs thrown upstream fetch errors and rethrows them", async () => {
  const fetchError = new Error("coordinator unavailable");
  globalThis.fetch = async () => {
    throw fetchError;
  };
  const { GET } = await loadRoute();

  await assert.rejects(
    () =>
      GET(new Request("http://web.local/api/workers?api_key=secret"), {
        params: Promise.resolve({ path: ["workers"] })
      }),
    fetchError
  );

  assert.equal(loggerCalls.length, 1);
  assert.equal(loggerCalls[0].level, "error");
  assert.equal(loggerCalls[0].event, "api.proxy.fetch_failed");
  assert.equal(loggerCalls[0].payload.method, "GET");
  assert.equal(loggerCalls[0].payload.path, "/api/workers?api_key=%5Bredacted%5D");
  assert.equal(loggerCalls[0].payload.upstream, "http://coordinator.local:8000/api/workers?api_key=%5Bredacted%5D");
  assert.equal(loggerCalls[0].payload.upstreamPath, "/api/workers?api_key=%5Bredacted%5D");
  assert.equal(loggerCalls[0].payload.error, "coordinator unavailable");
  assert.match(loggerCalls[0].payload.stack, /coordinator unavailable/);
});

test("logs upstream 5xx non-2xx responses at error level", async () => {
  globalThis.fetch = async () =>
    new Response("coordinator exploded", {
      status: 503,
      statusText: "Service Unavailable",
      headers: { "Content-Type": "text/plain" }
    });
  const { GET } = await loadRoute();

  const response = await GET(new Request("http://web.local/api/health"), {
    params: Promise.resolve({ path: ["health"] })
  });

  assert.equal(response.status, 503);
  assert.equal(await response.text(), "coordinator exploded");
  assert.equal(loggerCalls.length, 1);
  assert.equal(loggerCalls[0].level, "error");
  assert.equal(loggerCalls[0].event, "api.proxy.non_ok");
  assert.equal(loggerCalls[0].payload.status, 503);
  assert.equal(loggerCalls[0].payload.responseSnippet, "coordinator exploded");
});

test("does not log successful proxy responses", async () => {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  const { GET } = await loadRoute();

  const response = await GET(new Request("http://web.local/api/health"), {
    params: Promise.resolve({ path: ["health"] })
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(loggerCalls.length, 0);
});
