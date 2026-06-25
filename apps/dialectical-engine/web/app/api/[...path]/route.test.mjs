import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, beforeEach } from "node:test";
import { pathToFileURL } from "node:url";

const outDir = join(process.cwd(), ".tmp-api-route-test");
const routePath = join("app", "api", "[...path]", "route.ts");
const envKeys = ["DEV_OBSERVABILITY", "DEV_OBSERVABILITY_LOG_PATH", "DIALECTICAL_COORDINATOR_URL", "NODE_ENV"];
let logPath = "";

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

after(() => {
  rmSync(outDir, { recursive: true, force: true });
  delete globalThis.fetch;
  for (const key of envKeys) {
    delete process.env[key];
  }
});

beforeEach(() => {
  logPath = join(mkdtempSync(join(tmpdir(), "api-proxy-events-")), "events.jsonl");
  process.env.DEV_OBSERVABILITY = "true";
  process.env.DEV_OBSERVABILITY_LOG_PATH = logPath;
  process.env.NODE_ENV = "development";
  process.env.DIALECTICAL_COORDINATOR_URL = "http://coordinator.local:8000";
  delete globalThis.fetch;
});

async function loadRoute() {
  compileRoute();
  const moduleUrl = pathToFileURL(join(outDir, "app", "api", "[...path]", "route.js")).href;
  return import(`${moduleUrl}?cacheBust=${Date.now()}`);
}

function readLogEvents() {
  if (!existsSync(logPath)) return [];
  return readFileSync(logPath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
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

  const events = readLogEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].level, "warn");
  assert.equal(events[0].event, "api.proxy.non_ok");
  assert.equal(events[0].source, "api-proxy");
  assert.equal(events[0].context.method, "POST");
  assert.equal(events[0].context.path, "/api/debates/123?token=%5Bredacted%5D&view=full");
  assert.equal(events[0].context.upstream, "http://coordinator.local:8000/api/debates/123?token=%5Bredacted%5D&view=full");
  assert.equal(events[0].context.status, 422);
  assert.equal(events[0].context.statusText, "Unprocessable Entity");
  assert.equal(events[0].context.responseSnippet, "upstream failed because validation rejected the payload");
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

  const events = readLogEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].level, "error");
  assert.equal(events[0].event, "api.proxy.fetch_failed");
  assert.equal(events[0].context.method, "GET");
  assert.equal(events[0].context.path, "[REDACTED]");
  assert.equal(events[0].context.upstream, "[REDACTED]");
  assert.equal(events[0].context.error, "coordinator unavailable");
  assert.match(events[0].context.stack, /coordinator unavailable/);
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
  const events = readLogEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].level, "error");
  assert.equal(events[0].event, "api.proxy.non_ok");
  assert.equal(events[0].context.status, 503);
  assert.equal(events[0].context.responseSnippet, "coordinator exploded");
});

test("logs suspicious successful debate scoring responses without consuming the response body", async () => {
  const scoringPayload = {
    debate_id: "debate-123",
    status: "available",
    node_ids: ["node-1"],
    items: [],
    scored_node_count: 0
  };
  globalThis.fetch = async () =>
    new Response(JSON.stringify(scoringPayload), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  const { GET } = await loadRoute();

  const response = await GET(new Request("http://web.local/api/debates/debate-123/scoring"), {
    params: Promise.resolve({ path: ["debates", "debate-123", "scoring"] })
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), scoringPayload);
  const events = readLogEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].level, "warn");
  assert.equal(events[0].event, "scoring.empty_output");
  assert.equal(events[0].source, "scoring-response");
  assert.equal(events[0].debateId, "debate-123");
  assert.equal(events[0].operation, "api.proxy.debate_scoring");
});

test("does not log successful non-scoring proxy responses", async () => {
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
  assert.deepEqual(readLogEvents(), []);
});
