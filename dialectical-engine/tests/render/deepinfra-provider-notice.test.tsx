import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import en from "../../apps/ui/messages/en/legal.json";
import ro from "../../apps/ui/messages/ro/legal.json";
import { LegalProvidersBody } from "../../apps/ui/components/legal/LegalBodies.js";
import { DEEPINFRA_PARTNER_PROVIDER, DEEPINFRA_PROVIDER, providerRegister } from "../../apps/ui/lib/legal/pages.js";

/**
 * DeepInfra serves the private preview's open-weight models, so the AI Provider Register lists it whenever the API's
 * declared targets reach `api.deepinfra.com` (company `deepinfra`, side-by-side spec §13 addition D24, owner
 * 2026-10-22: providers only, not the models, listed automatically), and when the API gives no answer (the whole
 * reviewed catalogue). It names the company and its checked facts, never a model. A company list without DeepInfra
 * does not name a company that receives nothing.
 *
 * 16 November 2026 (docs/legal/2026-11-16-deepinfra-perplexity-facts.md): the row carries what DeepInfra's Terms and
 * trust centre say for every account (United States only, nothing stored, no training, standard contractual clauses),
 * and the company DeepInfra forwards its one partner model to follows it in a row of its own, every fact "[to confirm]".
 */
describe("the DeepInfra serving provider is disclosed when the API's targets reach it", () => {
  it("names the serving company with the facts its published terms give, checked and dated", () => {
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
    expect(entry?.checkedOn).toBe("2026-11-16");
    // Privacy 3.12: its models also write lists of what to look into before a debate starts.
    expect(entry?.purposes).toEqual(["arguments", "judging", "story", "suggestPaths"]);
    expect(entry?.purposesConfirmed).toBe(true);
    // The support chat's model stays last, after Perplexity; DeepInfra's partner follows DeepInfra.
    expect(register.map((row) => row.key)).toEqual(["deepinfra", "deepinfra-partner", "perplexity", "support"]);
  });

  it("gives the company DeepInfra forwards one model to a row of its own, and claims nothing about it", () => {
    const partner = providerRegister(["deepinfra"]).find((row) => row.key === "deepinfra-partner");
    expect(partner).toBe(DEEPINFRA_PARTNER_PROVIDER);
    expect(partner).toMatchObject({
      provider: null,
      nameKey: "legal.providers.deepinfraPartnerName",
      entity: "[…]",
      homeCountryKey: "legal.providers.unconfirmed",
      locationKey: "legal.providers.unconfirmed",
      retentionKey: "legal.providers.unconfirmed",
      zeroRetention: "unconfirmed",
      training: "unconfirmed",
      basisKey: "legal.providers.unconfirmed",
      contact: "[…]",
      checkedOn: null
    });
    // The partner model is a panel member and one of the AIs that suggest what to look into; it writes no verdict story.
    expect(partner?.purposes).toEqual(["arguments", "judging", "suggestPaths"]);
    expect(partner?.models).toBe("Qwen3.8-Flash (Alibaba)");
    const html = renderToStaticMarkup(<LegalProvidersBody legalCatalog={en} entries={providerRegister(["deepinfra"])} />);
    const section = html.slice(html.indexOf('id="legal-provider-deepinfra-partner"'), html.indexOf('id="legal-provider-perplexity"'));
    expect(section).toContain(en["legal.providers.deepinfraPartnerName"].replace("'", "&#x27;"));
    // Neither "No" (training) nor "Yes" (zero retention) is claimed for a company nobody has checked.
    expect(section).not.toContain(`<td>${en["legal.providers.no"]}</td>`);
    expect(section).not.toContain(`<td>${en["legal.providers.yes"]}</td>`);
    expect(section).toContain(en["legal.providers.notChecked"]);
    expect(section).not.toContain("Qwen");
  });

  for (const [locale, catalog] of [["English", en], ["Romanian", ro]] as const) {
    it(`renders the named provider in ${locale} using existing page styles and labels, and no model`, () => {
      const html = renderToStaticMarkup(<LegalProvidersBody legalCatalog={catalog} entries={providerRegister(["deepinfra"])} />);
      expect(html).toContain('id="legal-provider-deepinfra"');
      expect(html).toContain("Deep Infra Inc.");
      expect(html).toContain("policy@deepinfra.com");
      expect(html).toContain("2026-11-16");
      expect(html).toContain(catalog["legal.providers.retentionDeepInfra"]);
      expect(html).toContain('id="legal-provider-deepinfra-partner"');
      for (const model of ["GLM-5.3-Flash", "DeepSeek-V4.1-Flash", "MiMo-V2.6-Pro", "Qwen3.8-Flash", "Z.AI"]) expect(html, model).not.toContain(model);
    });
  }
});

describe("with no answer from the API, the page lists every reviewed company", () => {
  it("lists DeepInfra and its partner just before Perplexity and the support chat's model, and no model", () => {
    for (const companies of [null, []]) {
      const register = providerRegister(companies);
      expect(register.at(-1)?.key).toBe("support");
      expect(register.at(-2)?.key).toBe("perplexity");
      expect(register.at(-3)?.key).toBe("deepinfra-partner");
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
