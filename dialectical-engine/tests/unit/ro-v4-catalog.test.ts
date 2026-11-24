/*
 * The Romanian V4 catalogue (apps/ui/messages/ro/v4.json) and how it is loaded.
 *
 * Romanian is the one language besides English with its own V4 file; every other language reads the English one. The
 * file must keep the repository's catalogue contract (the same keys as English, Romanian's three plural forms, the same
 * placeholders), and the loader lays it over the English file, so a key the translation lacks shows English text rather
 * than the raw key (t() has no English backstop for the v4 namespace).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LOCALES } from "../../apps/ui/lib/i18n/locales.js";
import { t, tPlural } from "../../apps/ui/lib/i18n/translate.js";

type Catalog = Record<string, string>;
type CatalogModule = Readonly<{ default: Readonly<Catalog> }>;

const messages = resolve(import.meta.dirname, "../../apps/ui/messages");
const raw = (locale: string): string => readFileSync(resolve(messages, locale, "v4.json"), "utf8");
const english = JSON.parse(raw("en")) as Catalog;
const romanian = JSON.parse(raw("ro")) as Catalog;

const placeholders = (value: string): string[] =>
  [...new Set([...value.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map((match) => match[1]!))].sort();
const pluralRoots = Object.keys(english)
  .filter((key) => key.endsWith(".one") && Object.hasOwn(english, `${key.slice(0, -4)}.other`))
  .map((key) => key.slice(0, -4));

// The UI's own modules are compiled with the UI tsconfig, not the root one, so they are imported by a path held in a variable.
const contractModule: string = "../../apps/ui/lib/i18n/catalogContractAssertions.mjs";
const serverModule: string = "../../apps/ui/lib/i18n/server.js";

describe("ro/v4.json keeps the catalogue contract", () => {
  it("passes the repository's own contract against en/v4.json", async () => {
    const { assertLocalizedCatalog } = await import(contractModule) as {
      assertLocalizedCatalog: (input: { english: Catalog; localized: Catalog; locale: string; namespace: string }) => void;
    };
    expect(() => assertLocalizedCatalog({ english, localized: romanian, locale: "ro", namespace: "v4" })).not.toThrow();
  });

  it("gives every plural root exactly the forms one, few and other", () => {
    expect(pluralRoots.length).toBeGreaterThan(20);
    expect(new Intl.PluralRules("ro").resolvedOptions().pluralCategories.slice().sort()).toEqual(["few", "one", "other"]);
    for (const root of pluralRoots) {
      const forms = Object.keys(romanian).filter((key) => key.startsWith(`${root}.`) && /^(zero|one|two|few|many|other)$/u.test(key.slice(root.length + 1)));
      expect(forms.sort(), root).toEqual([`${root}.few`, `${root}.one`, `${root}.other`]);
    }
  });

  it("keeps every placeholder of the English text (.few as .other)", () => {
    for (const [key, value] of Object.entries(romanian)) {
      const reference = Object.hasOwn(english, key) ? english[key]! : romanian[`${key.slice(0, -4)}.other`]!;
      expect(placeholders(value), key).toEqual(placeholders(reference));
    }
  });

  it("lists the keys in the English order, two-space indented, with a closing newline, like the other ro catalogues", () => {
    const order = Object.keys(english).flatMap((key) =>
      key.endsWith(".other") && pluralRoots.includes(key.slice(0, -6)) ? [`${key.slice(0, -6)}.few`, key] : [key]);
    expect(Object.keys(romanian)).toEqual(order);
    expect(raw("ro")).toBe(`${JSON.stringify(romanian, null, 2)}\n`);
  });

  it("writes Romanian letters and quotes: ș and ț with a comma, „ ” quotes, IA for AI", () => {
    for (const [key, value] of Object.entries(romanian)) {
      expect(value, key).not.toMatch(/[şţŞŢ]/u);
      expect(value, key).not.toContain("\"");
      if (key.startsWith("v4.askText.") || key.startsWith("v4.digText.")) continue;
      expect(value, key).not.toContain("“");
      expect(value, key).not.toMatch(/\bAI\b|AI-/u);
    }
  });

  it("keeps the dig and ask templates in English, because lib/v4/askText.ts reads them back to recognise a dig written on an English page", () => {
    // A page in any other language writes a dig without this framing, so these lines are never shown in Romanian.
    const templates = Object.keys(english).filter((key) => key.startsWith("v4.askText.") || key.startsWith("v4.digText."));
    expect(templates.length).toBeGreaterThan(15);
    for (const key of templates) expect(romanian[key], key).toBe(english[key]);
  });
});

describe("the v4 namespace loader", () => {
  it("serves Romanian readers the Romanian file over the English one", async () => {
    const { loadNamespace } = await import(serverModule) as { loadNamespace: (locale: string, namespace: string) => Promise<Catalog> };
    const loaded = await loadNamespace("ro", "v4");
    expect(loaded).toEqual({ ...english, ...romanian });
    expect(loaded["v4.ask.continue"]).toBe("Mai departe");
    for (const key of Object.keys(english)) expect(loaded[key], key).toBeTruthy();
  });

  it("serves English, regional choices included, the English file, and every other language its own file over English", async () => {
    const { loadNamespace } = await import(serverModule) as { loadNamespace: (locale: string, namespace: string) => Promise<Catalog> };
    for (const code of ["en", "en-US", "en-GB"]) expect(await loadNamespace(code, "v4"), code).toEqual(english);
    const others = LOCALES.map(({ code }) => code).filter((code) => code !== "en" && code !== "ro");
    expect(others).toHaveLength(33);
    const templates = (key: string): boolean => key.startsWith("v4.askText.") || key.startsWith("v4.digText.");
    for (const code of others) {
      const loaded = await loadNamespace(code, "v4");
      const own = JSON.parse(raw(code)) as Catalog;
      for (const key of Object.keys(english)) expect(loaded[key], `${code} ${key}`).toBeTruthy();
      for (const [key, value] of Object.entries(own)) expect(loaded[key], `${code} ${key}`).toBe(value);
      // Its own words, not English: the title of the ask screen is translated in every language.
      expect(loaded["v4.ask.title"], code).not.toBe(english["v4.ask.title"]);
      // The dig and ask templates stay in English in every catalogue (lib/v4/askText.ts reads them back).
      for (const key of Object.keys(english).filter(templates)) expect(own[key], `${code} ${key}`).toBe(english[key]);
    }
  });

  it("shows the English text, never the raw key, for a key the Romanian file lacks", async () => {
    const { overEnglish } = await import(serverModule) as {
      overEnglish: (translated: Promise<CatalogModule>, base: Promise<CatalogModule>) => Promise<CatalogModule>;
    };
    const partial: Catalog = { "v4.ask.continue": "Mai departe", "v4.start.pathCount.few": "{count} căi" };
    const merged = (await overEnglish(Promise.resolve({ default: partial }), Promise.resolve({ default: english }))).default;
    expect(t(merged, "v4.ask.continue")).toBe("Mai departe");
    expect(t(merged, "v4.ask.title")).toBe(english["v4.ask.title"]);
    expect(t(merged, "v4.ask.title")).not.toBe("v4.ask.title");
    // Romanian's "few" form when it exists; the English form underneath when it does not.
    expect(tPlural(merged, "v4.start.pathCount", 3, "ro")).toBe("3 căi");
    expect(tPlural(merged, "v4.start.pathCount", 1, "ro")).toBe("1 path");
  });

  it("chooses Romanian's three plural forms by number", () => {
    const loaded = { ...english, ...romanian };
    expect(tPlural(loaded, "v4.start.pathCount", 1, "ro")).toBe("1 cale");
    expect(tPlural(loaded, "v4.start.pathCount", 0, "ro")).toBe("0 căi");
    expect(tPlural(loaded, "v4.start.pathCount", 7, "ro")).toBe("7 căi");
    expect(tPlural(loaded, "v4.start.pathCount", 20, "ro")).toBe("20 de căi");
    expect(tPlural(loaded, "v4.start.pathCount", 101, "ro")).toBe("101 căi");
  });
});
