import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import en from "../../apps/ui/messages/en/legal.json";
import ro from "../../apps/ui/messages/ro/legal.json";
import { LegalProvidersBody } from "../../apps/ui/components/legal/LegalBodies.js";
import { DEEPINFRA_PROVIDER, providerRegister } from "../../apps/ui/lib/legal/pages.js";

/**
 * DeepInfra serves the private preview's open-weight models, so the AI Provider Register lists it whenever the API's
 * declared targets reach `api.deepinfra.com` (company `deepinfra`, side-by-side spec §13 addition D24, owner
 * 2026-10-22: providers only, not the models, listed automatically), and when the API gives no answer (the whole
 * reviewed catalogue). It names the company and its checked facts, never a model. A company list without DeepInfra
 * does not name a company that receives nothing.
 */
describe("the DeepInfra serving provider is disclosed when the API's targets reach it", () => {
  it("names the serving company without inventing transfer or retention facts", () => {
    const register = providerRegister(["deepinfra"]);
    const entry = register.find((row) => row.key === "deepinfra");
    expect(entry).toBe(DEEPINFRA_PROVIDER);
    expect(entry?.provider).toBe("DeepInfra");
    expect(entry?.entity).toBe("Deep Infra Inc.");
    expect(entry?.basisKey).toBe("legal.providers.unconfirmed");
    expect(entry?.locationKey).toBe("legal.providers.unconfirmed");
    expect(entry?.zeroRetention).toBe("unconfirmed");
    expect(entry?.purposes).toEqual(["arguments", "judging", "story"]);
    expect(entry?.purposesConfirmed).toBe(true);
    // The support chat's model stays last, after Perplexity.
    expect(register.at(-1)?.key).toBe("support");
    expect(register.at(-2)?.key).toBe("perplexity");
    expect(register.at(-3)?.key).toBe("deepinfra");
  });

  for (const [locale, catalog] of [["English", en], ["Romanian", ro]] as const) {
    it(`renders the named provider in ${locale} using existing page styles and labels, and no model`, () => {
      const html = renderToStaticMarkup(<LegalProvidersBody legalCatalog={catalog} entries={providerRegister(["deepinfra"])} />);
      expect(html).toContain('id="legal-provider-deepinfra"');
      expect(html).toContain("Deep Infra Inc.");
      expect(html).toContain("policy@deepinfra.com");
      expect(html).toContain("2026-10-05");
      for (const model of ["GLM-5.3-Flash", "DeepSeek-V4.1-Flash", "MiMo-V2.6-Pro", "Qwen3.8-Flash", "Z.AI"]) expect(html, model).not.toContain(model);
    });
  }
});

describe("with no answer from the API, the page lists every reviewed company", () => {
  it("lists DeepInfra just before Perplexity and the support chat's model, and no model", () => {
    for (const companies of [null, []]) {
      const register = providerRegister(companies);
      expect(register.at(-1)?.key).toBe("support");
      expect(register.at(-2)?.key).toBe("perplexity");
      expect(register.at(-3)?.key).toBe("deepinfra");
      const html = renderToStaticMarkup(<LegalProvidersBody legalCatalog={en} entries={register} />);
      expect(html).toContain('id="legal-provider-deepinfra"');
      expect(html).toContain("Deep Infra Inc.");
      expect(html).toContain("policy@deepinfra.com");
      expect(html).not.toContain("GLM-5.3-Flash");
    }
  });
});

describe("a company list without DeepInfra", () => {
  it("does not name DeepInfra", () => {
    for (const companies of [["anthropic"], ["host:api.acme.example"]]) {
      expect(providerRegister(companies).map((row) => row.key)).not.toContain("deepinfra");
      expect(renderToStaticMarkup(<LegalProvidersBody legalCatalog={en} entries={providerRegister(companies)} />)).not.toContain("Deep Infra Inc.");
    }
  });
});
