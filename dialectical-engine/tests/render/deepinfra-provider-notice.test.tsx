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
 *
 * 16 November 2026 (docs/legal/2026-11-16-deepinfra-perplexity-facts.md): the row carries what DeepInfra's Terms and
 * trust centre say for every account (United States only, nothing stored, no training, standard contractual clauses).
 * Those facts cover the models DeepInfra runs on its own servers, the only ones a debate is given through it: a model
 * DeepInfra forwards to a partner company is never seated (its preview row's `partnerServed` mark), so the Register has
 * no row for such a company.
 */
describe("the DeepInfra serving provider is disclosed when the API's targets reach it", () => {
  it("names the serving company with the facts its terms and data processing agreement state, checked and dated", () => {
    const register = providerRegister(["deepinfra"]);
    const entry = register.find((row) => row.key === "deepinfra");
    expect(entry).toBe(DEEPINFRA_PROVIDER);
    expect(entry?.provider).toBe("DeepInfra");
    expect(entry?.entity).toBe("Deep Infra Inc.");
    expect(entry?.basisKey).toBe("legal.providers.sccBasis");
    expect(entry?.locationKey).toBe("legal.providers.locationDeepInfra");
    expect(entry?.retentionKey).toBe("legal.providers.retentionDeepInfra");
    expect(entry?.zeroRetention).toBe("yes");
    expect(entry?.training).toBe("no");
    expect(entry?.checkedOn).toBe("2026-11-17");
    // Privacy 3.12: its models also write lists of what to look into before a debate starts.
    expect(entry?.purposes).toEqual(["arguments", "judging", "story", "suggestPaths"]);
    expect(entry?.purposesConfirmed).toBe(true);
    // The support chat's model stays last, after Perplexity.
    expect(register.map((row) => row.key)).toEqual(["deepinfra", "perplexity", "support"]);
    // Its location and retention say nothing about another company.
    expect(en["legal.providers.locationDeepInfra"]).toBe("The United States only");
    expect(en["legal.providers.retentionDeepInfra"]).not.toMatch(/partner|own servers/u);
  });

  it("has no row for a partner of DeepInfra, and no label for one", () => {
    for (const companies of [null, [], ["deepinfra"], ["anthropic", "deepinfra", "amazon"]]) {
      expect(providerRegister(companies).map((row) => row.key).filter((key) => key.includes("partner"))).toEqual([]);
    }
    expect(Object.keys(en).filter((key) => /partner/iu.test(key))).toEqual([]);
    const html = renderToStaticMarkup(<LegalProvidersBody legalCatalog={en} entries={providerRegister(["deepinfra"])} />);
    expect(html).not.toMatch(/partner/iu);
  });

  for (const [locale, catalog] of [["English", en], ["Romanian", ro]] as const) {
    it(`renders the named provider in ${locale} using existing page styles and labels, and no model`, () => {
      const html = renderToStaticMarkup(<LegalProvidersBody legalCatalog={catalog} entries={providerRegister(["deepinfra"])} />);
      expect(html).toContain('id="legal-provider-deepinfra"');
      expect(html).toContain("Deep Infra Inc.");
      expect(html).toContain("policy@deepinfra.com");
      expect(html).toContain("2026-11-17");
      expect(html).toContain(catalog["legal.providers.retentionDeepInfra"]);
      expect(html).not.toContain('id="legal-provider-deepinfra-partner"');
      for (const model of ["GLM-5.3-Flash", "DeepSeek-V4.1-Flash", "MiMo-V2.6-Pro", "Qwen3.8-Flash", "Z.AI"]) expect(html, model).not.toContain(model);
    });
  }
});

describe("with no answer from the API, the page lists every reviewed company", () => {
  it("lists DeepInfra, then Amazon, just before Perplexity and the support chat's model, and no model", () => {
    for (const companies of [null, []]) {
      const register = providerRegister(companies);
      expect(register.at(-1)?.key).toBe("support");
      expect(register.at(-2)?.key).toBe("perplexity");
      // Amazon Bedrock's checked row follows DeepInfra's.
      expect(register.at(-3)?.key).toBe("amazon");
      expect(register.at(-4)?.key).toBe("deepinfra");
      const html = renderToStaticMarkup(<LegalProvidersBody legalCatalog={en} entries={register} />);
      expect(html).toContain('id="legal-provider-deepinfra"');
      expect(html).toContain("Deep Infra Inc.");
      expect(html).toContain("policy@deepinfra.com");
      expect(html).not.toContain("GLM-5.3-Flash");
    }
  });
});

describe("a company list without DeepInfra", () => {
  it("names neither DeepInfra nor its partner", () => {
    for (const companies of [["anthropic"], ["host:api.acme.example"]]) {
      expect(providerRegister(companies).map((row) => row.key)).not.toContain("deepinfra");
      expect(providerRegister(companies).map((row) => row.key)).not.toContain("deepinfra-partner");
      expect(renderToStaticMarkup(<LegalProvidersBody legalCatalog={en} entries={providerRegister(companies)} />)).not.toContain("Deep Infra Inc.");
    }
  });
});
