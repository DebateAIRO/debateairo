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
  it("lists the hosted rows and no preview company", async () => {
    const { keys, row, pages } = await build(undefined);
    expect(keys).toEqual(HOSTED_KEYS);
    // The hosted rows' companies were confirmed by the owner on 10 October 2026 (dev's 239789903); what tells
    // them apart from the preview's checked rows is the model family they name.
    expect(row("claude")).toBe(pages.MODEL_PROVIDERS.find((entry) => entry.key === "claude"));
    expect(row("gemini")).toBe(pages.MODEL_PROVIDERS.find((entry) => entry.key === "gemini"));
    expect(row("claude")?.models).toBe("Claude");
    expect(row("gemini")?.models).toBe("Gemini");
  });
});

describe("the first preview's list form", () => {
  it("lists DeepInfra for GLM only, and keeps the hosted Claude and Gemini rows", async () => {
    const { keys, row, pages } = await build(JSON.stringify([GLM]));
    expect(keys).toEqual(PREVIEW_KEYS);
    expect(row("deepinfra")?.models).toBe("GLM-5.3-Flash (Z.AI)");
    expect(row("claude")).toBe(pages.MODEL_PROVIDERS.find((entry) => entry.key === "claude"));
    expect(row("gemini")).toBe(pages.MODEL_PROVIDERS.find((entry) => entry.key === "gemini"));
  });
});

describe("the per-plan object form", () => {
  it("names the DeepInfra models the plans offer plus the two role models, and swaps in the checked rows", async () => {
    const { keys, row } = await build(JSON.stringify({ free: [GLM, HAIKU], premium: [GLM, GEMINI] }));
    expect(keys).toEqual(PREVIEW_KEYS);
    // DeepSeek is not on either plan but checks every answer and story; MiMo is used nowhere.
    expect(row("deepinfra")?.models).toBe("GLM-5.3-Flash (Z.AI), DeepSeek-V4.1-Flash (DeepSeek)");
    expect(row("claude")?.models).toBe("Claude Haiku 5.5");
    expect(row("gemini")?.models).toBe("Gemini 3.8 Flash");
  });

  it("still lists DeepInfra when the plans offer only Anthropic and Google: GLM writes and DeepSeek checks", async () => {
    const { keys, row } = await build(JSON.stringify({ free: [HAIKU, GEMINI], premium: [GEMINI, HAIKU] }));
    expect(keys).toEqual(PREVIEW_KEYS);
    expect(row("deepinfra")?.models).toBe("GLM-5.3-Flash (Z.AI), DeepSeek-V4.1-Flash (DeepSeek)");
    expect(row("claude")?.models).toBe("Claude Haiku 5.5");
    expect(row("gemini")?.models).toBe("Gemini 3.8 Flash");
  });

  it("gives DeepInfra its confirmed jobs: arguments, judging and the verdict story", async () => {
    for (const flag of [JSON.stringify([GLM]), JSON.stringify({ free: [HAIKU, GEMINI], premium: [HAIKU, GEMINI] }), "not json"]) {
      const { row } = await build(flag);
      expect(row("deepinfra")?.purposes, flag).toEqual(["arguments", "judging", "story"]);
      expect(row("deepinfra")?.purposesConfirmed, flag).toBe(true);
    }
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
      expect(html).toContain("Claude Haiku 5.5");
      expect(html).toContain("Gemini 3.8 Flash");
      for (const key of NEW_KEYS) expect(html).toContain(escaped(catalog[key as keyof typeof catalog]));
    }
  });

});

describe("a malformed flag discloses every preview provider and never throws", () => {
  const MALFORMED = [
    "not json", "null", "42", "\"x\"", "{}", "[]", "[1]", "{\"free\":\"x\"}",
    "[\"other/model\"]",
    // The first preview's list is GLM alone, once.
    JSON.stringify([GLM, GLM]), JSON.stringify([DEEPSEEK]), JSON.stringify([GLM, DEEPSEEK]),
    // A missing plan, an empty plan, extra keys, a repeated id, an unknown id.
    JSON.stringify({ free: [HAIKU] }), JSON.stringify({ premium: [GLM, HAIKU] }),
    JSON.stringify({ free: [], premium: [] }), JSON.stringify({ free: [], premium: [GLM, HAIKU] }),
    JSON.stringify({ free: [GLM, HAIKU], premium: [GLM, HAIKU], extra: [] }),
    "{\"__proto__\":[],\"free\":[\"zai-org/GLM-5.3-Flash\",\"claude-haiku-5-5\"],\"premium\":[\"zai-org/GLM-5.3-Flash\",\"claude-haiku-5-5\"]}",
    JSON.stringify({ free: [GLM, GLM, HAIKU], premium: [GLM, HAIKU] }),
    JSON.stringify({ free: [GLM, "other/model"], premium: [GLM, HAIKU] }),
    JSON.stringify({ free: [GLM, 1], premium: [GLM, HAIKU] }),
    // Two or more makers overall, but one plan names only one maker (the form refuses this too).
    JSON.stringify({ free: [GLM], premium: [DEEPSEEK, GLM] }), JSON.stringify({ free: [HAIKU], premium: [HAIKU, GEMINI] })
  ];
  for (const flag of MALFORMED) {
    it(`flag ${flag}`, async () => {
      const { keys, row } = await build(flag);
      expect(keys).toEqual(PREVIEW_KEYS);
      expect(row("deepinfra")?.models).toBe(ALL_DEEPINFRA);
      expect(row("claude")?.models).toBe("Claude Haiku 5.5");
      expect(row("gemini")?.models).toBe("Gemini 3.8 Flash");
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
      // The numbers are facts: 30 days, 7 years for safety-check results, 55 days at Google.
      expect(catalog["legal.providers.retentionAnthropic"], locale).toMatch(/30[^0-9][\s\S]*7[^0-9]|30[^0-9][\s\S]*7$/);
      expect(catalog["legal.providers.retentionGoogle"], locale).toContain("55");
      if (locale !== "en") {
        // Facts other than the brand names are translated, not copied from English.
        expect(catalog["legal.providers.retentionGoogle"], locale).not.toBe(en["legal.providers.retentionGoogle"]);
      }
    });
  }
});
