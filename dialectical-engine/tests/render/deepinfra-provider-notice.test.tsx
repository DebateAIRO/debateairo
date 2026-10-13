import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import en from "../../apps/ui/messages/en/legal.json";
import ro from "../../apps/ui/messages/ro/legal.json";

/**
 * DeepInfra serves the private preview's open-weight models, so every build that offers one of them
 * lists it in the AI Provider Register (the public build flag the new-debate form reads,
 * NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON, narrows the roster). With no flag, the real site included,
 * it names all four models (owner, 12 October 2026); the preview's GLM build names GLM alone. A build
 * that offers no DeepInfra model does not name a company that receives nothing from it.
 */
const FLAG = "NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON";
const PREVIEW_GLM = "[\"zai-org/GLM-5.3-Flash\"]";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

/** The register and its page as a build with (or without) the preview's GLM flag makes them. */
async function build(flag: string | undefined) {
  vi.stubEnv(FLAG, flag);
  vi.resetModules();
  const [{ LegalProvidersBody }, { PROVIDER_REGISTER }] = await Promise.all([
    import("../../apps/ui/components/legal/LegalBodies.js"),
    import("../../apps/ui/lib/legal/pages.js")
  ]);
  return { LegalProvidersBody, PROVIDER_REGISTER };
}

describe("the DeepInfra serving provider is disclosed on the private preview's GLM build", () => {
  it("names the serving company and selected model without inventing transfer or retention facts", async () => {
    const { PROVIDER_REGISTER } = await build(PREVIEW_GLM);
    const entry = PROVIDER_REGISTER.find(row => row.key === "deepinfra");
    expect(entry?.provider).toBe("DeepInfra");
    expect(entry?.models).toBe("GLM-5.3-Flash (Z.AI)");
    expect(entry?.entity).toBe("Deep Infra Inc.");
    expect(entry?.basisKey).toBe("legal.providers.unconfirmed");
    expect(entry?.locationKey).toBe("legal.providers.unconfirmed");
    expect(entry?.zeroRetention).toBe("unconfirmed");
    expect(entry?.purposes).not.toContain("support");
    // The support chat's model stays last.
    expect(PROVIDER_REGISTER.at(-1)?.key).toBe("support");
    expect(PROVIDER_REGISTER.at(-2)?.key).toBe("deepinfra");
  });
  for (const [locale, catalog] of [["English", en], ["Romanian", ro]] as const) {
    it(`renders the named provider in ${locale} using existing page styles and labels`, async () => {
      const { LegalProvidersBody } = await build(PREVIEW_GLM);
      const html = renderToStaticMarkup(<LegalProvidersBody legalCatalog={catalog} />);
      expect(html).toContain('id="legal-provider-deepinfra"');
      expect(html).toContain("GLM-5.3-Flash (Z.AI)");
      expect(html).toContain("Deep Infra Inc.");
      expect(html).toContain("policy@deepinfra.com");
      expect(html).toContain("2026-10-05");
    });
  }
});

describe("a build with no flag, the real site included, lists DeepInfra's four models (owner, 12 October 2026)", () => {
  it("names all four models in the register and the page, just before the support chat's model", async () => {
    const { LegalProvidersBody, PROVIDER_REGISTER } = await build(undefined);
    expect(PROVIDER_REGISTER.at(-1)?.key).toBe("support");
    expect(PROVIDER_REGISTER.at(-2)?.key).toBe("deepinfra");
    expect(PROVIDER_REGISTER.at(-2)?.models).toBe(
      "GLM-5.3-Flash (Z.AI), DeepSeek-V4.1-Flash (DeepSeek), MiMo-V2.6-Pro (Xiaomi), Qwen3.8-Flash (Alibaba)"
    );
    const html = renderToStaticMarkup(<LegalProvidersBody legalCatalog={en} />);
    expect(html).toContain('id="legal-provider-deepinfra"');
    expect(html).toContain("Deep Infra Inc.");
    expect(html).toContain("policy@deepinfra.com");
  });
});

describe("a malformed preview flag", () => {
  it("still lists DeepInfra, and never takes the pages down: the root layout imports the register", async () => {
    // The new-debate form refuses the malformed value loudly; a legal page discloses rather than hides.
    const { PROVIDER_REGISTER } = await build("[\"other/model\"]");
    expect(PROVIDER_REGISTER.map(row => row.key)).toContain("deepinfra");
  });
});
