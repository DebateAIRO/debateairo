import { describe, expect, it } from "vitest";
import { runProductLivenessProbes } from "../../apps/observation-agent/src/modules/product-liveness/probes.js";

const targets = [
  {
    component: "api", kind: "http", expected: "when_dev_stack",
    live_url: "http://127.0.0.1:8790/v1/session"
  },
  {
    component: "ui", kind: "http", expected: "when_dev_stack",
    live_url: "http://127.0.0.1:3001/login"
  },
  {
    component: "tls_front_door", kind: "http", expected: "when_dev_stack",
    live_url: "https://localhost:3000/login"
  },
  {
    component: "runner", kind: "process", expected: "when_dev_stack",
    command_contains: "apps/runner/src/main.ts"
  },
  {
    component: "kanban", kind: "http", expected: "always",
    live_url: "http://127.0.0.1:9119/"
  },
  {
    component: "evaluator_worker", kind: "fact", expected: "never",
    fact: "UNBOUND_BY_REGISTER"
  }
] as const;

function response(body: string, status: number, contentType: string): Response {
  return new Response(body, { status, headers: { "content-type": contentType } });
}

describe("OBS-02 five product probes", () => {
  it("accepts only the exact API/UI contracts, system-trust TLS, runner ps match, and 2xx-4xx Kanban", async () => {
    const requests: Array<Readonly<{ url: string; init: RequestInit }>> = [];
    let clock = 0;
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init: init ?? {} });
      const value = String(url);
      if (value === "http://127.0.0.1:8790/v1/session"
        || value === "http://127.0.0.1:3001/api/v1/session") {
        return response('{"error":"SESSION_REQUIRED"}', 401, "application/json");
      }
      if (value === "http://127.0.0.1:3001/login") {
        return response("<html>Back to the graph.</html>", 200, "text/html; charset=utf-8");
      }
      if (value === "https://localhost:3000/login") {
        return response("ok", 200, "text/html");
      }
      return response("board", 404, "text/plain");
    };

    const observations = await runProductLivenessProbes({
      targets,
      timeoutMs: 2_000,
      fetch: fetchImpl,
      listProcesses: async () => " 42 node /repo/apps/runner/src/main.ts\n",
      monotonicNow: () => { clock += 7; return clock; }
    });

    expect(observations.map(({ component, ok, lastStatus }) => ({ component, ok, lastStatus })))
      .toEqual([
        { component: "api", ok: true, lastStatus: 401 },
        { component: "ui", ok: true, lastStatus: 401 },
        { component: "tls_front_door", ok: true, lastStatus: 200 },
        { component: "runner", ok: true, lastStatus: "PRESENT" },
        { component: "kanban", ok: true, lastStatus: 404 }
      ]);
    expect(observations.map((item) => item.status?.[0])).toEqual([
      { kind: "metric", key: "probe.api.latency_ms", value: 7, unit: "MILLISECONDS" },
      { kind: "metric", key: "probe.ui.latency_ms", value: 7, unit: "MILLISECONDS" },
      { kind: "metric", key: "probe.tls_front_door.latency_ms", value: 7, unit: "MILLISECONDS" },
      { kind: "metric", key: "probe.runner.latency_ms", value: 7, unit: "MILLISECONDS" },
      { kind: "metric", key: "probe.kanban.latency_ms", value: 7, unit: "MILLISECONDS" }
    ]);
    expect(requests).toHaveLength(5);
    for (const request of requests) {
      expect(request.init.method).toBe("GET");
      expect(request.init.body).toBeUndefined();
      expect(request.init.credentials).toBeUndefined();
      expect(new Headers(request.init.headers).get("cookie")).toBeNull();
      expect(new Headers(request.init.headers).get("authorization")).toBeNull();
      expect(new Headers(request.init.headers).get("connection")).toBe("close");
      expect(new Headers(request.init.headers).get("user-agent"))
        .toBe("dialectical-engine-observation-agent");
    }
  });

  it("rejects almost-correct API/UI responses and reports TLS trust failures without disabling verification", async () => {
    const api = await runProductLivenessProbes({
      targets: targets.slice(0, 1), timeoutMs: 2_000,
      fetch: async () => response('{"error":"SESSION_REQUIRED"}\n', 401, "application/json"),
      listProcesses: async () => "", monotonicNow: () => 0
    });
    expect(api[0]).toMatchObject({ component: "api", ok: false, lastStatus: 401 });

    const ui = await runProductLivenessProbes({
      targets: targets.slice(1, 2), timeoutMs: 2_000,
      fetch: async (url) => String(url).endsWith("/login")
        ? response("Back to the graph.", 200, "text/plain")
        : response('{"error":"SESSION_REQUIRED"}', 401, "application/json"),
      listProcesses: async () => "", monotonicNow: () => 0
    });
    expect(ui[0]).toMatchObject({ component: "ui", ok: false, lastStatus: 200 });

    const tls = await runProductLivenessProbes({
      targets: targets.slice(2, 3), timeoutMs: 2_000,
      fetch: async () => {
        throw Object.assign(new Error("certificate rejected"), {
          cause: { code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE" }
        });
      },
      listProcesses: async () => "", monotonicNow: () => 0
    });
    expect(tls[0]).toMatchObject({
      component: "tls_front_door", ok: false, lastStatus: "TLS_TRUST"
    });
  });

  it("requires exact JSON and HTML media types while allowing parameters", async () => {
    const api = await runProductLivenessProbes({
      targets: targets.slice(0, 1), timeoutMs: 2_000,
      fetch: async () => response(
        '{"error":"SESSION_REQUIRED"}', 401, "application/json-patch+json"
      ),
      listProcesses: async () => "", monotonicNow: () => 0
    });
    expect(api[0]).toMatchObject({ component: "api", ok: false, lastStatus: 401 });

    const ui = await runProductLivenessProbes({
      targets: targets.slice(1, 2), timeoutMs: 2_000,
      fetch: async () => response("Back to the graph.", 200, "text/htmlish"),
      listProcesses: async () => "", monotonicNow: () => 0
    });
    expect(ui[0]).toMatchObject({ component: "ui", ok: false, lastStatus: 200 });
  });
});
