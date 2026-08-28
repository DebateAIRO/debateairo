import { describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import {
  createProviderDiscoveryResolver,
  parseProviderDiscoveryTargets,
  type ProviderDiscoveryProbeStore
} from "../../apps/api/src/provider-discovery.js";

function configured(size: number) {
  return Array.from({ length: size }, (_, index) => Object.freeze({
    providerRef: `provider-${index + 1}`,
    maker: `maker-${index + 1}`
  }));
}

function targets(size: number): string {
  return JSON.stringify(Array.from({ length: size }, (_, index) => ({
    provider_ref: `provider-${index + 1}`,
    base_url: `http://127.0.0.1:${9100 + index}/v1`,
    model: `model-${index + 1}`,
    ...(index === 2 ? { authorization_header: "Bearer provider-three-secret" } : {})
  })));
}

describe("production provider discovery", () => {
  it("wires the active resolver into the real API entrypoint", async () => {
    const source = await readFile("apps/api/src/main.ts", "utf8");
    expect(source).toContain("createProviderDiscoveryResolver");
    expect(source).toContain("parseProviderDiscoveryTargets");
    expect(source).toContain("environment.PROVIDER_DISCOVERY_TARGETS_JSON");
    expect(source).not.toContain("now - record.probedAt.getTime() <= discoveryPolicy.probeFreshnessMs");
  });

  it("handshakes every configured target and pins every responder in configured order", async () => {
    const observations: Parameters<ProviderDiscoveryProbeStore["record"]>[0][] = [];
    const store: ProviderDiscoveryProbeStore = {
      readLatest: vi.fn(async () => Object.freeze([])),
      record: vi.fn(async (observation) => { observations.push(observation); })
    };
    const requests: Array<{ url: string; authorization: string | null; body: string }> = [];
    const fetchImplementation = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = typeof init?.body === "string" ? init.body : "";
      const authorization = new Headers(init?.headers).get("authorization");
      requests.push({ url, authorization, body });
      const match = /:(\d+)\/v1\/chat\/completions$/u.exec(url);
      const index = Number(match?.[1]) - 9099;
      if (index === 2) {
        return new Response(JSON.stringify({ error: "offline" }), {
          status: 503,
          headers: { "content-type": "application/json" }
        });
      }
      return new Response(JSON.stringify({
        id: `probe-${index}`,
        model: `model-${index}`,
        choices: [{ message: { role: "assistant", content: "OK" } }]
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const resolver = createProviderDiscoveryResolver({
      configuredProviders: configured(4),
      targets: parseProviderDiscoveryTargets(targets(4), configured(4)),
      probes: store,
      probeFreshnessMs: 600_000,
      probeTimeoutMs: 1_000,
      fetchImplementation: fetchImplementation as typeof fetch,
      clock: () => new Date("2026-08-27T12:00:00.000Z")
    });

    await expect(resolver()).resolves.toEqual([
      {
        provider_ref: "provider-1", maker: "maker-1", model_id: "model-1",
        probe_evidence_ref: expect.any(String), probed_at: "2026-08-27T12:00:00.000Z"
      },
      {
        provider_ref: "provider-3", maker: "maker-3", model_id: "model-3",
        probe_evidence_ref: expect.any(String), probed_at: "2026-08-27T12:00:00.000Z"
      },
      {
        provider_ref: "provider-4", maker: "maker-4", model_id: "model-4",
        probe_evidence_ref: expect.any(String), probed_at: "2026-08-27T12:00:00.000Z"
      }
    ]);
    expect(requests).toHaveLength(4);
    expect(observations).toHaveLength(4);
    expect(observations.map((row) => [row.providerRef, row.state])).toEqual([
      ["provider-1", "HEALTHY"], ["provider-2", "ABSENT"],
      ["provider-3", "HEALTHY"], ["provider-4", "HEALTHY"]
    ]);
    expect(requests[2]?.authorization).toBe("Bearer provider-three-secret");
    expect(requests[2]?.body).not.toContain("provider-three-secret");
  });

  it("requires an exact one-to-one target for every configured provider", () => {
    expect(() => parseProviderDiscoveryTargets(targets(1), configured(2)))
      .toThrow("PROVIDER_DISCOVERY_TARGET_SET_MISMATCH");
    expect(() => parseProviderDiscoveryTargets(JSON.stringify([
      { provider_ref: "provider-1", base_url: "http://127.0.0.1:9100/v1", model: "model-1" },
      { provider_ref: "provider-1", base_url: "http://127.0.0.1:9101/v1", model: "model-1" }
    ]), configured(2))).toThrow("PROVIDER_DISCOVERY_TARGET_DUPLICATE");
  });

  it("reprobes a fresh absence so a recovered responder joins the next handshake", async () => {
    const now = new Date("2026-08-27T12:00:00.000Z");
    const record = vi.fn(async () => undefined);
    const resolver = createProviderDiscoveryResolver({
      configuredProviders: configured(1),
      targets: parseProviderDiscoveryTargets(targets(1), configured(1)),
      probes: {
        readLatest: vi.fn(async () => [Object.freeze({
          probeEvidenceRef: "00000000-0000-4000-8000-000000000001",
          providerRef: "provider-1",
          maker: "maker-1",
          state: "ABSENT" as const,
          modelId: null,
          failureCode: "PROVIDER_PROBE_FAILED",
          probedAt: new Date(now.getTime() - 1_000)
        })]),
        record
      },
      probeFreshnessMs: 600_000,
      probeTimeoutMs: 1_000,
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        model: "model-1",
        choices: [{ message: { content: "OK" } }]
      }), { status: 200 })) as typeof fetch,
      clock: () => now
    });

    await expect(resolver()).resolves.toEqual([{
      provider_ref: "provider-1",
      maker: "maker-1",
      model_id: "model-1",
      probe_evidence_ref: expect.any(String),
      probed_at: now.toISOString()
    }]);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ state: "HEALTHY" }));
  });

  it("shares one stale discovery probe across concurrent ask handshakes", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const fetchImplementation = vi.fn(async () => {
      await gate;
      return new Response(JSON.stringify({
        model: "model-1",
        choices: [{ message: { content: "OK" } }]
      }), { status: 200 });
    });
    const store: ProviderDiscoveryProbeStore = {
      readLatest: vi.fn(async () => []),
      record: vi.fn(async () => undefined)
    };
    const resolver = createProviderDiscoveryResolver({
      configuredProviders: configured(1),
      targets: parseProviderDiscoveryTargets(targets(1), configured(1)),
      probes: store,
      probeFreshnessMs: 600_000,
      probeTimeoutMs: 1_000,
      fetchImplementation: fetchImplementation as typeof fetch,
      clock: () => new Date("2026-08-27T12:00:00.000Z")
    });

    const handshakes = Array.from({ length: 12 }, () => resolver());
    await vi.waitFor(() => expect(fetchImplementation).toHaveBeenCalledTimes(1));
    release();
    const panels = await Promise.all(handshakes);
    expect(panels.every((panel) => panel.length === 1)).toBe(true);
    expect(store.readLatest).toHaveBeenCalledTimes(1);
    expect(store.record).toHaveBeenCalledTimes(1);
  });
});
