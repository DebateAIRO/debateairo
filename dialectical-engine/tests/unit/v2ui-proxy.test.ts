import { afterEach, beforeEach, describe, expect, it } from "vitest";

// UI-01: the restored V2 workspace must reach V3 through the same faithful
// same-origin proxy ACC-01 rev-3 approved for web/ — ported into apps/ui
// and enforced HERE, inside the default vitest include (rev-3 advisory A2:
// proxy proofs must sit in an enforced suite; `node --test` with a raw
// `[...path]` glob silently runs zero tests).
import * as route from "../../apps/ui/app/api/[...path]/route.js";

const originalFetch = globalThis.fetch;
const originalBase = process.env.DIALECTICAL_API_BASE;

beforeEach(() => {
  process.env.DIALECTICAL_API_BASE = "http://acceptance.local:8790";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalBase === undefined) delete process.env.DIALECTICAL_API_BASE;
  else process.env.DIALECTICAL_API_BASE = originalBase;
});

describe("v2-ui same-origin proxy (ported ACC-01 rev-3 route)", () => {
  it("forwards method, path, query, body, and the caller token without inventing headers", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    globalThis.fetch = (async (url: unknown, init: RequestInit = {}) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ run_ref: "run:test", status: "QUEUED" }), {
        status: 202,
        headers: { "content-type": "application/json", "x-upstream": "kept" }
      });
    }) as typeof fetch;

    const response = await route.POST(
      new Request("http://web.local/api/v1/asks?mode=live", {
        method: "POST",
        headers: { "content-type": "application/json", "x-user-dev-token": "token:test" },
        body: JSON.stringify({ question_line: "What follows?" })
      }),
      { params: Promise.resolve({ path: ["v1", "asks"] }) }
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("http://acceptance.local:8790/v1/asks?mode=live");
    expect(calls[0]!.init.method).toBe("POST");
    const forwarded = new Headers(calls[0]!.init.headers);
    expect(forwarded.get("x-user-dev-token")).toBe("token:test");
    expect(forwarded.get("host")).toBeNull();
    expect(forwarded.get("expect")).toBeNull();
    expect([...forwarded.keys()].sort()).toEqual(["content-type", "x-user-dev-token"]);
    expect(new TextDecoder().decode(calls[0]!.init.body as ArrayBuffer)).toBe(
      JSON.stringify({ question_line: "What follows?" })
    );
    expect(response.status).toBe(202);
    expect(response.headers.get("x-upstream")).toBe("kept");
    await expect(response.json()).resolves.toEqual({ run_ref: "run:test", status: "QUEUED" });
  });

  it("passes an upstream event stream through without buffering it", async () => {
    let streamController!: ReadableStreamDefaultController<Uint8Array>;
    const upstreamBody = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller;
        controller.enqueue(new TextEncoder().encode("data: first\n\n"));
      }
    });
    globalThis.fetch = (async () =>
      new Response(upstreamBody, {
        headers: { "content-type": "text/event-stream", "cache-control": "no-cache" }
      })) as typeof fetch;

    const response = await Promise.race([
      route.GET(new Request("http://web.local/api/v1/runs/run%3Atest/events"), {
        params: Promise.resolve({ path: ["v1", "runs", "run:test", "events"] })
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("proxy buffered the event stream")), 250)
      )
    ]);
    streamController.enqueue(new TextEncoder().encode("data: second\n\n"));
    streamController.close();

    expect(response.headers.get("content-type")).toBe("text/event-stream");
    await expect(response.text()).resolves.toBe("data: first\n\ndata: second\n\n");
  });

  it("passes an upstream failure through verbatim instead of masking it (DR-115)", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "UPSTREAM_EXPLODED" }), {
        status: 500,
        headers: { "content-type": "application/json" }
      })) as typeof fetch;
    const response = await route.GET(new Request("http://web.local/api/v1/session"), {
      params: Promise.resolve({ path: ["v1", "session"] })
    });
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "UPSTREAM_EXPLODED" });
  });

  it("names a transport outage as 502 without inventing an API verdict", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError("fetch failed: ECONNREFUSED");
    }) as typeof fetch;

    const response = await route.GET(new Request("http://web.local/api/v1/session"), {
      params: Promise.resolve({ path: ["v1", "session"] })
    });

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "API_UPSTREAM_UNREACHABLE",
      message: "The API upstream did not answer the proxy request."
    });
  });

  it("fails loudly when the server-only upstream base is absent", async () => {
    delete process.env.DIALECTICAL_API_BASE;
    globalThis.fetch = (async () => {
      throw new Error("fetch must not run without a configured upstream");
    }) as typeof fetch;
    await expect(
      route.GET(new Request("http://web.local/api/v1/session"), {
        params: Promise.resolve({ path: ["v1", "session"] })
      })
    ).rejects.toThrow(/DIALECTICAL_API_BASE_REQUIRED/);
  });
});
