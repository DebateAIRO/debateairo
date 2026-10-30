// Side-by-side spec §13, addition D24 (owner's answer to Q-L6, 2026-10-22: providers only, not the models, listed
// automatically): the companies the API's declared targets reach. The preview's reviewed targets name exactly the two
// reviewed companies, a loopback or private relay names none, and an unknown public host is an unchecked `host:` row
// (ruling R20). The table's companies are the ones the website's reviewed catalogue knows, so a preview company is
// never shown as an unchecked row.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PERPLEXITY_SEARCH_URL,
  PREVIEW_ANTHROPIC_BASE_URL,
  PREVIEW_DEEPINFRA_BASE_URL,
  PREVIEW_MODEL_ROWS,
  PREVIEW_PROVIDER_NAMES,
  PREVIEW_REVIEWED_PROVIDER_REFS,
  PROVIDER_COMPANY_HOSTS,
  assertPreviewTargetSet,
  parseProviderDiscoveryTargets,
  previewModelRowForRef,
  previewTargetJsonRow,
  providerCompaniesOfTargets,
  type ProviderDiscoveryTarget
} from "@debateai/providers";

/** The reviewed refs' targets exactly as the API parses `PROVIDER_DISCOVERY_TARGETS_JSON` (each ref's own row). */
function reviewedTargets(refs: readonly string[]): readonly ProviderDiscoveryTarget[] {
  return parseProviderDiscoveryTargets(JSON.stringify(refs.map(previewTargetJsonRow)), refs.map((ref) => {
    const row = previewModelRowForRef(ref)!;
    return { providerRef: ref, maker: row.maker, adapterKind: row.adapterKind };
  }));
}

/** A bare declared target at `baseUrl` (the function reads only the base URL). */
const at = (baseUrl: string, providerRef = "test:target"): ProviderDiscoveryTarget =>
  Object.freeze({ providerRef, maker: "Maker", baseUrl, model: "test-model" });

describe("providerCompaniesOfTargets (addition D24)", () => {
  it("the preview's five reviewed models, through their refs, reach Anthropic and DeepInfra", () => {
    const targets = reviewedTargets(PREVIEW_REVIEWED_PROVIDER_REFS);
    expect(new Set(targets.map((target) => target.model))).toEqual(new Set(PREVIEW_MODEL_ROWS.map((row) => row.model)));
    expect(new Set(targets.map((target) => target.model)).size).toBe(5);
    expect(providerCompaniesOfTargets(targets)).toEqual(["anthropic", "deepinfra"]);
    expect(Object.isFrozen(providerCompaniesOfTargets(targets))).toBe(true);
  });

  it("the GLM-only set reaches DeepInfra alone", () => {
    expect(providerCompaniesOfTargets(reviewedTargets(["preview:fixture-a", "preview:fixture-b"]))).toEqual(["deepinfra"]);
  });

  it("a host written with upper case or a trailing dot is the same company", () => {
    expect(providerCompaniesOfTargets([at("https://API.Anthropic.COM/v1")])).toEqual(["anthropic"]);
    expect(providerCompaniesOfTargets([at("https://api.anthropic.com./v1")])).toEqual(["anthropic"]);
    expect(providerCompaniesOfTargets([at("https://Api.DeepInfra.com./v1/openai")])).toEqual(["deepinfra"]);
    // And the parsed form of such a spelling (the parser lowercases the host and keeps the dot).
    const parsed = parseProviderDiscoveryTargets(
      JSON.stringify([{ provider_ref: "x:glm", base_url: "https://API.DEEPINFRA.COM./v1", model: "m" }]),
      [{ providerRef: "x:glm", maker: "Z.AI" }]
    );
    expect(new URL(parsed[0]!.baseUrl).hostname).toBe("api.deepinfra.com.");
    expect(providerCompaniesOfTargets(parsed)).toEqual(["deepinfra"]);
  });

  it("a loopback or private relay (local mode only) names no outside company", () => {
    for (const baseUrl of ["http://127.0.0.1:8794/v1", "http://[::1]:8443/v1", "http://localhost:8794/v1",
      "https://10.0.0.2:8443/v1", "https://192.168.1.4/v1", "http://relay.localhost:9000/v1"]) {
      expect(providerCompaniesOfTargets([at(baseUrl)]), baseUrl).toEqual([]);
    }
    expect(providerCompaniesOfTargets([at("http://127.0.0.1:8794/v1"), at(PREVIEW_DEEPINFRA_BASE_URL)])).toEqual(["deepinfra"]);
  });

  it("an unknown public host is a `host:` company (ruling R20), sorted and unique, and carries no path", () => {
    expect(providerCompaniesOfTargets([at("https://api.acme.example/v1")])).toEqual(["host:api.acme.example"]);
    expect(providerCompaniesOfTargets([
      at("https://api.zeta.example/v1"), at(PREVIEW_ANTHROPIC_BASE_URL), at("https://API.acme.example/v1"),
      at("https://api.acme.example/other/v1"), at(PREVIEW_DEEPINFRA_BASE_URL), at(PREVIEW_DEEPINFRA_BASE_URL)
    ])).toEqual(["anthropic", "deepinfra", "host:api.acme.example", "host:api.zeta.example"]);
    expect(providerCompaniesOfTargets([])).toEqual([]);
  });

  it("every reviewed connection's host is in the table, so a preview company is never an unchecked row", () => {
    for (const baseUrl of [PREVIEW_DEEPINFRA_BASE_URL, PREVIEW_ANTHROPIC_BASE_URL, ...PREVIEW_MODEL_ROWS.map((row) => row.baseUrl)]) {
      expect(Object.keys(PROVIDER_COMPANY_HOSTS), baseUrl).toContain(new URL(baseUrl).hostname);
    }
    expect(Object.isFrozen(PROVIDER_COMPANY_HOSTS)).toBe(true);
  });

  it("every company of the table is one the website's reviewed catalogue knows (apps/ui/lib/legal/pages.ts)", () => {
    const pages = readFileSync(new URL("../../apps/ui/lib/legal/pages.ts", import.meta.url), "utf8");
    const catalogue = pages.match(/const REVIEWED_PROVIDER_COMPANIES[^=]*= Object\.freeze\(\[([\s\S]*?)\]\s*as const\)/u)?.[1];
    expect(catalogue).toBeDefined();
    const keys = [...(catalogue ?? "").matchAll(/\["([a-z]+)",/gu)].map((match) => match[1]);
    expect(keys).toEqual(["anthropic", "deepinfra"]);
    for (const company of new Set(Object.values(PROVIDER_COMPANY_HOSTS))) expect(keys, company).toContain(company);
  });
});

// Perplexity plan 2026-10-30, task W2-1: web search is a search provider kind, never a model. It is no declared target,
// so it is never a debater and never a panel member (apps/runner/src/provider-topology.ts makes every declared target
// one), and it never comes into this list through the targets: the website lists Perplexity on every answer by itself
// (apps/ui/lib/legal/pages.ts PERPLEXITY_PROVIDER, owner 2026-10-27).
describe("web search is not a debater", () => {
  it("no reviewed model row, provider name or connection is Perplexity's", () => {
    expect(PREVIEW_PROVIDER_NAMES).not.toContain("perplexity");
    for (const row of PREVIEW_MODEL_ROWS) {
      expect(new URL(row.baseUrl).hostname, row.model).not.toBe(new URL(PERPLEXITY_SEARCH_URL).hostname);
      expect(row.maker, row.model).not.toBe("Perplexity");
    }
    expect(Object.keys(PROVIDER_COMPANY_HOSTS)).not.toContain(new URL(PERPLEXITY_SEARCH_URL).hostname);
  });

  it("a declared target at the search host is refused on the preview, so search can never take a seat", () => {
    const reviewed = reviewedTargets(PREVIEW_REVIEWED_PROVIDER_REFS);
    const searchTarget = Object.freeze({ ...reviewed[0]!, baseUrl: "https://api.perplexity.ai" });
    expect(() => assertPreviewTargetSet([searchTarget, ...reviewed.slice(1)])).toThrowError("PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID");
    expect(providerCompaniesOfTargets(reviewed)).toEqual(["anthropic", "deepinfra"]);
  });
});
