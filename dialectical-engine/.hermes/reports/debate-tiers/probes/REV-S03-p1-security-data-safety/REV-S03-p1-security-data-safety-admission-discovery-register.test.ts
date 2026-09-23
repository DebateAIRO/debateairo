/**
 * REV-S03-p1-security-data-safety — the reviewer's OWN probes, built from the CLAIM.
 * Temporary: written at slice head cc014550, deleted before the seat's handoff.
 * No socket, no provider call, no .local read: every key value below is this seat's fake.
 */
import { describe, expect, it } from "vitest";
import { validateModelConfig } from "@debateai/model-config";
import { parseProviderDiscoveryTargets } from "@debateai/providers";
import { createProviderDiscoveryResolver } from "../../apps/api/src/provider-discovery.js";
import {
  buildDevelopmentDeploymentRegisterRows,
  developmentPlanTierRosters
} from "../../apps/runner/src/dev-deployment-register.js";
import { parseDevelopmentProviderPanelTargets } from "../../apps/runner/src/dev-provider-panel.js";

const FAKE_KEY = "FAKEKEY-rev-s03-p1-security-DO-NOT-USE";

function apiFile(freeBaseUrl: string, zaiBaseUrl = "https://api.z.ai/api/coding/paas/v4"): unknown {
  const openai = { api: "openai", model: "gpt-5.6-luna", base_url: freeBaseUrl, key: "OPENAI_API_KEY" };
  const zai = { api: "zai", model: "glm-5.3-flash", base_url: zaiBaseUrl, key: "ZAI_API_KEY" };
  return { free: [openai, zai], premium: [openai, zai] };
}

function loaderAdmits(baseUrl: string): boolean {
  try {
    validateModelConfig(apiFile(baseUrl), { isCliInstalled: () => true });
    return true;
  } catch {
    return false;
  }
}

function wireAdmits(baseUrl: string): boolean {
  try {
    parseProviderDiscoveryTargets(
      JSON.stringify([{
        provider_ref: "probe:one",
        base_url: baseUrl,
        model: "m-1",
        authorization_header: `Bearer ${FAKE_KEY}`
      }]),
      [{ providerRef: "probe:one", maker: "OpenAI" }]
    );
    return true;
  } catch {
    return false;
  }
}

describe("PROBE A — base-URL admission, file loader vs discovery wire", () => {
  it("records which URL shapes each gate admits", () => {
    const cases: readonly string[] = [
      "https://api.openai.com/v1",
      "https://user:pw@api.openai.com/v1",
      "https://198.51.100.9/v1",
      "https://provider.internal/v1",
      "https://api.openai.com/v1/../../admin",
      "http://api.openai.com/v1",
      "http://198.51.100.9/v1",
      "https://аpi.openai.com/v1",
      "https://api.openai.com/v1?key=leak",
      "https://api.openai.com/v1#frag",
      "https://api.openai.com"
    ];
    const table = cases.map((url) => ({
      url,
      loader: loaderAdmits(url),
      wire: wireAdmits(url)
    }));
    // eslint-disable-next-line no-console
    console.log(`ADMISSION_TABLE=${JSON.stringify(table, null, 1)}`);
    expect(table.length).toBe(cases.length);
  });
});

describe("PROBE B — uncredentialed discovery never opens a socket", () => {
  const store = () => {
    const recorded: string[] = [];
    return {
      recorded,
      readLatest: async () => [],
      record: async (observation: { providerRef: string; state: string; failureCode: string | null }) => {
        recorded.push(`${observation.providerRef}:${observation.state}:${String(observation.failureCode)}`);
      }
    };
  };

  it("skips the probe for a target with no bearer", async () => {
    const probes = store();
    let calls = 0;
    const resolver = createProviderDiscoveryResolver({
      configuredProviders: [{ providerRef: "probe:nokey", maker: "OpenAI" }],
      targets: parseProviderDiscoveryTargets(
        JSON.stringify([{ provider_ref: "probe:nokey", base_url: "https://api.openai.com/v1", model: "m-1" }]),
        [{ providerRef: "probe:nokey", maker: "OpenAI" }]
      ),
      probes: probes as never,
      probeFreshnessMs: 600_000,
      probeTimeoutMs: 1_000,
      fetchImplementation: (async () => {
        calls += 1;
        throw new Error("PROBE_FETCH_MUST_NOT_BE_CALLED");
      }) as unknown as typeof fetch
    });
    const panel = await resolver();
    // eslint-disable-next-line no-console
    console.log(`UNCREDENTIALED_CALLS=${calls} PANEL=${JSON.stringify(panel)} RECORDED=${JSON.stringify(probes.recorded)}`);
    expect(calls).toBe(0);
    expect(panel).toEqual([]);
  });

  it("ATTACK: a fresh HEALTHY record admits a target that now carries NO bearer", async () => {
    const probes = {
      recorded: [] as string[],
      readLatest: async () => [{
        probeEvidenceRef: "11111111-1111-4111-8111-111111111111",
        providerRef: "probe:nokey",
        maker: "OpenAI",
        state: "HEALTHY" as const,
        modelId: "m-1",
        failureCode: null,
        probedAt: new Date()
      }],
      record: async (observation: { providerRef: string; state: string }) => {
        probes.recorded.push(`${observation.providerRef}:${observation.state}`);
      }
    };
    let calls = 0;
    const resolver = createProviderDiscoveryResolver({
      configuredProviders: [{ providerRef: "probe:nokey", maker: "OpenAI" }],
      targets: parseProviderDiscoveryTargets(
        JSON.stringify([{ provider_ref: "probe:nokey", base_url: "https://api.openai.com/v1", model: "m-1" }]),
        [{ providerRef: "probe:nokey", maker: "OpenAI" }]
      ),
      probes: probes as never,
      probeFreshnessMs: 600_000,
      probeTimeoutMs: 1_000,
      fetchImplementation: (async () => {
        calls += 1;
        throw new Error("PROBE_FETCH_MUST_NOT_BE_CALLED");
      }) as unknown as typeof fetch
    });
    const panel = await resolver();
    // eslint-disable-next-line no-console
    console.log(`STALE_ADMISSION calls=${calls} panelSize=${panel.length} recorded=${JSON.stringify(probes.recorded)} panel=${JSON.stringify(panel)}`);
    expect(calls).toBe(0);
  });
});

describe("PROBE C — the probe response is buffered before it is bounded", () => {
  it("measures how many bytes reach the process before MAX_PROBE_RESPONSE_BYTES rejects", async () => {
    const CHUNK = 1024 * 1024;
    const CHUNKS = 64; // 64 MiB, 1024x the declared 64 KiB cap
    let delivered = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (delivered >= CHUNK * CHUNKS) {
          controller.close();
          return;
        }
        delivered += CHUNK;
        controller.enqueue(new Uint8Array(CHUNK).fill(0x61));
      }
    });
    const probes = {
      records: [] as { state: string; failureCode: string | null }[],
      readLatest: async () => [],
      record: async (observation: { state: string; failureCode: string | null }) => {
        probes.records.push({ state: observation.state, failureCode: observation.failureCode });
      }
    };
    const resolver = createProviderDiscoveryResolver({
      configuredProviders: [{ providerRef: "probe:flood", maker: "OpenAI" }],
      targets: parseProviderDiscoveryTargets(
        JSON.stringify([{
          provider_ref: "probe:flood",
          base_url: "https://api.openai.com/v1",
          model: "m-1",
          authorization_header: `Bearer ${FAKE_KEY}`
        }]),
        [{ providerRef: "probe:flood", maker: "OpenAI" }]
      ),
      probes: probes as never,
      probeFreshnessMs: 600_000,
      probeTimeoutMs: 60_000,
      fetchImplementation: (async () => new Response(body, {
        status: 200,
        headers: { "content-type": "application/json" }
      })) as unknown as typeof fetch
    });
    const panel = await resolver();
    // eslint-disable-next-line no-console
    console.log(`FLOOD_BYTES_DELIVERED=${delivered} (cap is 65536) panelSize=${panel.length} records=${JSON.stringify(probes.records)}`);
    expect(panel).toEqual([]);
  }, 120_000);
});

describe("PROBE D — what the probe request carries, verbatim", () => {
  it("records the URL, headers and body of the outgoing health probe", async () => {
    const seen: { url: string; headers: Record<string, string>; body: string }[] = [];
    const probes = { readLatest: async () => [], record: async () => undefined };
    const resolver = createProviderDiscoveryResolver({
      configuredProviders: [{ providerRef: "probe:body", maker: "Z.AI" }],
      targets: parseProviderDiscoveryTargets(
        JSON.stringify([{
          provider_ref: "probe:body",
          base_url: "https://api.z.ai/api/coding/paas/v4",
          model: "glm-5.3-flash",
          authorization_header: `Bearer ${FAKE_KEY}`
        }]),
        [{ providerRef: "probe:body", maker: "Z.AI" }]
      ),
      probes: probes as never,
      probeFreshnessMs: 600_000,
      probeTimeoutMs: 5_000,
      fetchImplementation: (async (url: string, init: RequestInit) => {
        seen.push({
          url: String(url),
          headers: init.headers as Record<string, string>,
          body: String(init.body)
        });
        return new Response(JSON.stringify({
          model: "glm-5.3-flash",
          choices: [{ message: { content: "OK" } }]
        }), { status: 200, headers: { "content-type": "application/json" } });
      }) as unknown as typeof fetch
    });
    const panel = await resolver();
    // eslint-disable-next-line no-console
    console.log(`PROBE_REQUEST=${JSON.stringify(seen, null, 1)}`);
    // eslint-disable-next-line no-console
    console.log(`PROBE_PANEL=${JSON.stringify(panel)}`);
    expect(seen.length).toBe(1);
  });
});

describe("PROBE E — the register rows carry no bearer", () => {
  it("greps every published value for this seat's fake key", () => {
    const configuredProviders = [
      { providerRef: "development:openai-free-api", adapterKind: "openai-compatible-http" as const, maker: "OpenAI" },
      { providerRef: "development:zai-free-api", adapterKind: "openai-compatible-http" as const, maker: "Z.AI" }
    ];
    const panel = parseDevelopmentProviderPanelTargets(
      JSON.stringify([
        {
          provider_ref: "development:openai-free-api",
          base_url: "https://api.openai.com/v1",
          model: "gpt-5.6-luna",
          authorization_header: `Bearer ${FAKE_KEY}`
        },
        {
          provider_ref: "development:zai-free-api",
          base_url: "https://api.z.ai/api/coding/paas/v4",
          model: "glm-5.3-flash",
          authorization_header: `Bearer ${FAKE_KEY}`
        }
      ]),
      configuredProviders
    );
    const config = validateModelConfig(apiFile("https://api.openai.com/v1"), { isCliInstalled: () => true });
    const rows = buildDevelopmentDeploymentRegisterRows(panel, developmentPlanTierRosters(config));
    const serialized = JSON.stringify(rows);
    // eslint-disable-next-line no-console
    console.log(`REGISTER_ROWS=${serialized}`);
    // eslint-disable-next-line no-console
    console.log(`PANEL_TARGETS_JSON_CARRIES_KEY=${panel.targetsJson.includes(FAKE_KEY)}`);
    expect(serialized).not.toContain(FAKE_KEY);
    expect(serialized).not.toContain("Bearer");
  });
});
