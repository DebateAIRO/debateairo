import { describe, expect, it } from "vitest";
import { parseProviderDiscoveryTargets } from "../../packages/providers/src/index.js";

function parsedBaseUrl(baseUrl: string): string | undefined {
  const configuredProviders = [Object.freeze({
    providerRef: "development:remote-api",
    maker: "Z.AI"
  })];
  const targets = parseProviderDiscoveryTargets(JSON.stringify([{
    provider_ref: "development:remote-api",
    base_url: baseUrl,
    model: "remote-model"
  }]), configuredProviders);
  return targets[0]?.baseUrl;
}

describe("provider discovery base URL admission", () => {
  it.each([
    ["a remote HTTPS path", "https://api.z.ai/api/coding/paas/v4", "https://api.z.ai/api/coding/paas/v4"],
    ["the OpenAI v1 path", "https://api.openai.com/v1", "https://api.openai.com/v1"],
    ["a loopback relay v1 path", "http://127.0.0.1:8795/v1", "http://127.0.0.1:8795/v1"],
    ["all trailing slashes removed", "https://api.z.ai/api/coding/paas/v4//", "https://api.z.ai/api/coding/paas/v4"]
  ])("returns %s exactly", (_caseName, source, expected) => {
    expect(parsedBaseUrl(source)).toBe(expected);
  });

  it.each([
    ["a username", "https://user@api.z.ai/api/coding/paas/v4"],
    ["a password", "https://user:secret@api.z.ai/api/coding/paas/v4"],
    ["a query", "https://api.z.ai/api/coding/paas/v4?q=1"],
    ["a fragment", "https://api.z.ai/api/coding/paas/v4#f"],
    ["a non-HTTP(S) scheme", "ftp://api.z.ai/v4"]
  ])("refuses %s", (_caseName, source) => {
    expect(() => parsedBaseUrl(source))
      .toThrow("PROVIDER_DISCOVERY_TARGET_BASE_URL_INVALID");
  });
});
