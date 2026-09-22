import { describe, expect, it, vi } from "vitest";
import {
  createProviderDiscoveryResolver,
  type ProviderDiscoveryProbeStore
} from "../../apps/api/src/provider-discovery.js";

const NOW = new Date("2026-09-13T12:00:00.000Z");

const CONFIGURED_PROVIDERS = Object.freeze([
  Object.freeze({ providerRef: "development:openai-api", maker: "OpenAI" }),
  Object.freeze({ providerRef: "development:zai-api", maker: "Z.AI" }),
  Object.freeze({ providerRef: "development:codex-cli", maker: "OpenAI" }),
  Object.freeze({ providerRef: "development:claude-cli", maker: "Anthropic" }),
  Object.freeze({ providerRef: "development:grok-cli", maker: "xAI" })
]);

const TARGETS = Object.freeze([
  Object.freeze({
    providerRef: "development:openai-api",
    maker: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-5.6-luna"
  }),
  Object.freeze({
    providerRef: "development:zai-api",
    maker: "Z.AI",
    baseUrl: "https://api.z.ai/api/coding/paas/v4",
    model: "glm-5.3-flash"
  }),
  Object.freeze({
    providerRef: "development:codex-cli",
    maker: "OpenAI",
    baseUrl: "http://127.0.0.1:8791/v1",
    model: "gpt-5.6-sol",
    authorizationHeader: "Bearer local-codex"
  }),
  Object.freeze({
    providerRef: "development:claude-cli",
    maker: "Anthropic",
    baseUrl: "http://127.0.0.1:8792/v1",
    model: "claude-opus-5",
    authorizationHeader: "Bearer local-claude"
  }),
  Object.freeze({
    providerRef: "development:grok-cli",
    maker: "xAI",
    baseUrl: "http://127.0.0.1:8793/v1",
    model: "grok-4.7-build",
    authorizationHeader: "Bearer local-grok"
  })
]);

describe("uncredentialed provider discovery targets", () => {
  it("records each uncredentialed slot ABSENT without sending its probe", async () => {
    const targets = TARGETS;
    const recordedUrls: string[] = [];
    const recordedObservations: Parameters<ProviderDiscoveryProbeStore["record"]>[0][] = [];
    const modelByUrl = new Map(targets.map((target) => [
      `${target.baseUrl}/chat/completions`,
      target.model
    ]));
    const probes: ProviderDiscoveryProbeStore = {
      readLatest: vi.fn(async () => targets.slice(0, 2).map((target, index) => Object.freeze({
        probeEvidenceRef: `00000000-0000-4000-8000-00000000000${index + 1}`,
        providerRef: target.providerRef,
        maker: target.maker,
        state: "ABSENT" as const,
        modelId: null,
        failureCode: "PROVIDER_PROBE_FAILED",
        probedAt: new Date(NOW.getTime() - 1_000)
      }))),
      record: vi.fn(async (observation) => { recordedObservations.push(observation); })
    };
    const fetchImplementation = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      recordedUrls.push(url);
      return new Response(JSON.stringify({
        model: modelByUrl.get(url),
        choices: [{ message: { content: "OK" } }]
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const resolver = createProviderDiscoveryResolver({
      configuredProviders: CONFIGURED_PROVIDERS,
      targets,
      probes,
      probeFreshnessMs: 600_000,
      probeTimeoutMs: 1_000,
      fetchImplementation: fetchImplementation as typeof fetch,
      clock: () => NOW
    });

    await resolver();

    expect(
      recordedUrls,
      `recorded ${recordedUrls.length} URLs: ${recordedUrls.join(", ")}`
    ).toHaveLength(3);
    expect(recordedUrls.map((url) => new URL(url).host))
      .not.toContain("api.openai.com");
    expect(recordedUrls.map((url) => new URL(url).host))
      .not.toContain("api.z.ai");
    expect(recordedObservations).toHaveLength(5);
    expect(new Set(recordedObservations.map((observation) => observation.providerRef))).toEqual(new Set([
      "development:openai-api",
      "development:zai-api",
      "development:codex-cli",
      "development:claude-cli",
      "development:grok-cli"
    ]));
    for (const providerRef of ["development:openai-api", "development:zai-api"]) {
      expect(recordedObservations.find((observation) => observation.providerRef === providerRef))
        .toEqual(expect.objectContaining({
          providerRef,
          state: "ABSENT",
          modelId: null,
          failureCode: "PROVIDER_PROBE_SKIPPED_UNCREDENTIALED"
        }));
    }
  });
});
