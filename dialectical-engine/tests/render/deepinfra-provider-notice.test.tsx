import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LegalProvidersBody } from "../../apps/ui/components/legal/LegalBodies.js";
import { PROVIDER_REGISTER } from "../../apps/ui/lib/legal/pages.js";
import en from "../../apps/ui/messages/en/legal.json";
import ro from "../../apps/ui/messages/ro/legal.json";

describe("the configured DeepInfra serving provider is disclosed", () => {
  it("names the serving company and selected model without inventing transfer or retention facts", () => {
    const entry = PROVIDER_REGISTER.find(row => row.key === "deepinfra");
    expect(entry?.provider).toBe("DeepInfra");
    expect(entry?.models).toBe("GLM-5.3-Flash (Z.AI)");
    expect(entry?.entity).toBe("Deep Infra Inc.");
    expect(entry?.basisKey).toBe("legal.providers.unconfirmed");
    expect(entry?.locationKey).toBe("legal.providers.unconfirmed");
    expect(entry?.zeroRetention).toBe("unconfirmed");
    expect(entry?.purposes).not.toContain("support");
  });
  for (const [locale, catalog] of [["English", en], ["Romanian", ro]] as const) {
    it(`renders the named provider in ${locale} using existing page styles and labels`, () => {
      const html = renderToStaticMarkup(<LegalProvidersBody legalCatalog={catalog} />);
      expect(html).toContain('id="legal-provider-deepinfra"');
      expect(html).toContain("GLM-5.3-Flash (Z.AI)");
      expect(html).toContain("Deep Infra Inc.");
      expect(html).toContain("policy@deepinfra.com");
      expect(html).toContain("2026-10-05");
    });
  }
});
