import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import en from "../../apps/ui/messages/en/legal.json";
import ro from "../../apps/ui/messages/ro/legal.json";

/**
 * The private preview offers five models: three open-weight models served by DeepInfra, Claude
 * Haiku 5.5 through Anthropic's API, and Gemini 3.8 Flash through Google's paid Gemini API. Its
 * build flag (NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON) names them either as the first preview's
 * list or as a per-plan object. The Model providers page must name every company that receives
 * text on that build, and a bad flag must disclose every preview provider rather than hide one.
 * Off the preview (no flag) the page is exactly the hosted-site Register.
 */
const FLAG = "NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON";
const GLM = "zai-org/GLM-5.3-Flash";
const DEEPSEEK = "deepseek-ai/DeepSeek-V4.1-Flash";
const MIMO = "XiaomiMiMo/MiMo-V2.6-Pro";
const HAIKU = "claude-haiku-5-5";
const GEMINI = "gemini-3.8-flash";
const ALL_DEEPINFRA = "GLM-5.3-Flash (Z.AI), DeepSeek-V4.1-Flash (DeepSeek), MiMo-V2.6-Pro (Xiaomi)";
const NEW_KEYS = [
  "legal.providers.ireland",
  "legal.providers.locationAnthropic",
  "legal.providers.locationGoogle",
  "legal.providers.retentionAnthropic",
  "legal.providers.retentionGoogle",
  "legal.providers.sccBasis"
] as const;

/** Text as React's static renderer escapes it. */
const escaped = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function build(flag: string | undefined) {
  vi.stubEnv(FLAG, flag);
  vi.resetModules();
  const [{ LegalProvidersBody }, pages] = await Promise.all([
    import("../../apps/ui/components/legal/LegalBodies.js"),
    import("../../apps/ui/lib/legal/pages.js")
  ]);
  const row = (key: string) => pages.PROVIDER_REGISTER.find((entry) => entry.key === key);
  return { LegalProvidersBody, pages, row, keys: pages.PROVIDER_REGISTER.map((entry) => entry.key) };
}

const HOSTED_KEYS = ["claude", "gpt", "gemini", "grok", "qwen", "support"];
const PREVIEW_KEYS = ["claude", "gpt", "gemini", "grok", "qwen", "deepinfra", "support"];

describe("off the preview (flag unset) the Register is the hosted site's, unchanged", () => {
  it("lists the placeholder rows and no preview company", async () => {
    const { keys, row, pages } = await build(undefined);
    expect(keys).toEqual(HOSTED_KEYS);
    expect(row("claude")).toBe(pages.MODEL_PROVIDERS[0]);
    expect(row("claude")?.entity).toBe("[Anthropic …]");
    expect(row("gemini")?.entity).toBe("[Google …]");
    expect(row("gemini")?.checkedOn).toBeNull();
  });
});

describe("the first preview's list form", () => {
  it("lists DeepInfra for GLM only, and keeps the Claude and Gemini placeholders", async () => {
    const { keys, row } = await build(JSON.stringify([GLM]));
    expect(keys).toEqual(PREVIEW_KEYS);
    expect(row("deepinfra")?.models).toBe("GLM-5.3-Flash (Z.AI)");
    expect(row("claude")?.entity).toBe("[Anthropic …]");
    expect(row("gemini")?.entity).toBe("[Google …]");
  });
});

describe("the per-plan object form", () => {
  it("merges both plans and names only the DeepInfra models the build offers", async () => {
    const { keys, row } = await build(JSON.stringify({ free: [GLM], premium: [DEEPSEEK, GLM] }));
    expect(keys).toEqual(PREVIEW_KEYS);
    expect(row("deepinfra")?.models).toBe("GLM-5.3-Flash (Z.AI), DeepSeek-V4.1-Flash (DeepSeek)");
    expect(row("claude")?.checkedOn).toBeNull();
    expect(row("gemini")?.checkedOn).toBeNull();
  });

  it("with all five models, shows every maker once and the checked Anthropic and Google rows", async () => {
    const { keys, row, LegalProvidersBody } = await build(
      JSON.stringify({ free: [GLM, DEEPSEEK, MIMO], premium: [HAIKU, GEMINI] })
    );
    expect(keys).toEqual(PREVIEW_KEYS);
    expect(new Set(keys).size).toBe(keys.length);
    expect(row("deepinfra")?.models).toBe(ALL_DEEPINFRA);
    expect(row("claude")).toMatchObject({
      provider: "Anthropic",
      models: "Claude Haiku 5.5",
      entity: "Anthropic Ireland, Limited",
      homeCountryKey: "legal.providers.ireland",
      locationKey: "legal.providers.locationAnthropic",
      retentionKey: "legal.providers.retentionAnthropic",
      zeroRetention: "no",
      training: "no",
      basisKey: "legal.providers.sccBasis",
      contact: "privacy@anthropic.com",
      checkedOn: "2026-10-10"
    });
    expect(row("gemini")).toMatchObject({
      provider: "Google",
      models: "Gemini 3.8 Flash",
      entity: "Google Cloud EMEA Limited",
      homeCountryKey: "legal.providers.ireland",
      locationKey: "legal.providers.locationGoogle",
      retentionKey: "legal.providers.retentionGoogle",
      zeroRetention: "no",
      training: "no",
      // The EU–US Data Privacy Framework listing could not be read: the basis stays bracketed.
      basisKey: "legal.providers.usBasis",
      contact: "legal-notices@google.com",
      checkedOn: "2026-10-10"
    });
    for (const catalog of [en, ro]) {
      const html = renderToStaticMarkup(<LegalProvidersBody legalCatalog={catalog} />);
      expect(html.match(/id="legal-provider-claude"/g)).toHaveLength(1);
      expect(html.match(/id="legal-provider-gemini"/g)).toHaveLength(1);
      expect(html).toContain(ALL_DEEPINFRA);
      expect(html).toContain("Anthropic Ireland, Limited");
      expect(html).toContain('href="mailto:privacy@anthropic.com"');
      expect(html).toContain("Google Cloud EMEA Limited");
      expect(html).toContain('href="mailto:legal-notices@google.com"');
      expect(html).not.toContain("[Anthropic …]");
      expect(html).not.toContain("[Google …]");
      for (const key of NEW_KEYS) expect(html).toContain(escaped(catalog[key as keyof typeof catalog]));
    }
  });

  it("with only Anthropic, lists no DeepInfra row", async () => {
    const { keys, row } = await build(JSON.stringify({ free: [], premium: [HAIKU] }));
    expect(keys).toEqual(HOSTED_KEYS);
    expect(row("claude")?.entity).toBe("Anthropic Ireland, Limited");
    expect(row("gemini")?.entity).toBe("[Google …]");
  });
});

describe("a malformed flag discloses every preview provider and never throws", () => {
  for (const flag of ["not json", "null", "42", "\"x\"", "{}", "[]", "[1]", "{\"free\":\"x\"}", "{\"free\":[],\"premium\":[]}", "[\"other/model\"]", JSON.stringify({ free: [GLM, "other/model"] })]) {
    it(`flag ${flag}`, async () => {
      const { keys, row } = await build(flag);
      expect(keys).toEqual(PREVIEW_KEYS);
      expect(row("deepinfra")?.models).toBe(ALL_DEEPINFRA);
      expect(row("claude")?.entity).toBe("Anthropic Ireland, Limited");
      expect(row("gemini")?.entity).toBe("Google Cloud EMEA Limited");
    });
  }
});

describe("the new Register words exist in all 35 languages", () => {
  const messages = resolve(process.cwd(), "apps/ui/messages");
  const locales = readdirSync(messages);
  it("has 35 locales", () => expect(locales).toHaveLength(35));
  for (const locale of locales) {
    it(`${locale} has every new key, filled and unbracketed`, () => {
      const catalog = JSON.parse(readFileSync(resolve(messages, locale, "legal.json"), "utf8")) as Record<string, string>;
      for (const key of NEW_KEYS) {
        expect(typeof catalog[key], `${locale} ${key}`).toBe("string");
        expect(catalog[key]?.trim(), `${locale} ${key}`).not.toBe("");
        expect(catalog[key], `${locale} ${key}`).not.toContain("[");
      }
      if (locale !== "en") {
        // Facts other than the brand names are translated, not copied from English.
        expect(catalog["legal.providers.retentionGoogle"], locale).not.toBe(en["legal.providers.retentionGoogle"]);
      }
    });
  }
});
