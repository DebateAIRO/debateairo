import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SUPPORT_CAPABILITIES, SUPPORT_GUIDE_LABELS } from "../../packages/support-kb/src/catalog.js";
import { supportCapabilityName } from "../../packages/support-kb/src/capability-names.js";

const root = process.cwd();
const readJson = (path: string): any => JSON.parse(readFileSync(path, "utf8"));
const local = (path: string): any => readJson(resolve(root, path));
const strings = local("tests/fixtures/sf-s05-r2-strings.json") as Record<string, any>;
const baseWords = local("tests/fixtures/sf-s05-r13-base-words.json") as Record<string, Record<string, string>>;
const purpose = local("tests/fixtures/sf-s05-s13-purpose.json").purpose_by_locale as Record<string, string>;
const locales = Object.keys(strings);
const removed = [
  "support.escalate", "support.yes", "support.no", "support.ratingQuestion",
  "support.answerRating", "support.reference", "support.summaryAdvisory",
  "support.caseOpenedNotice", "support.case.reply", "support.case.state",
  "support.case.yours", "support.case.region", "support.case.missing",
  "support.case.shredded", "support.case.human", "support.case.closed"
];
const newKeys = ["support.notice", "support.humanAddress", "support.tooLong", "support.helpUnavailable"];
const articleIds = ["support-cases", "settings-help-menus", "app-navigation", "ai-transparency"];

// W1 catches a missing or mistranslated too-long reply and the three false storage claims.
describe("S05 r2 signed words", () => {
  it.each(locales)("template file %s has the signed refusals and TOO_LONG", (locale) => {
    const actual = local(`packages/support-kb/content/templates/${locale}.json`);
    expect(typeof actual.TOO_LONG).toBe("string");
    expect(actual.TOO_LONG.length).toBeGreaterThan(0);
    expect(actual.TOO_LONG).not.toContain("{");
    for (const key of ["REFUSE_INJECTION", "REFUSE_SAFETY", "DEGRADED", "TOO_LONG"])
      expect(actual[key], `${locale}:${key}`).toBe(strings[locale].templates[key]);
  });

  // W2 catches a locale with a removed case control or without the address disclosure.
  it.each(locales)("support catalogue %s has the new keys and no retired keys", (locale) => {
    const actual = local(`apps/ui/messages/${locale}/support.json`);
    for (const key of newKeys) expect(actual[key], `${locale}:${key}`).toBe(strings[locale].support[key]);
    expect(actual["support.humanAddress"].split("{address}")).toHaveLength(2);
    for (const key of removed) expect(actual, `${locale}:${key}`).not.toHaveProperty(key);
  });

  // W3 pins the precise S03 section 13 purpose in every locale.
  it.each(locales)("legal catalogue %s uses the signed section 13 purpose", (locale) => {
    const actual = local(`apps/ui/messages/${locale}/legal.json`);
    expect(actual["legal.cookies.supportOffered.purpose"]).toBe(purpose[locale]);
  });

  // W4 catches retention and escalation promises left in any named S05-R13 member.
  it("removes every quoted untrue member from templates, catalogues and help articles", () => {
    for (const [locale, members] of Object.entries(baseWords)) {
      for (const [key, words] of Object.entries(members)) {
        let current: string;
        if (key.includes(":")) {
          const [id] = key.split(":");
          current = readFileSync(resolve(root, `packages/support-kb/content/${id}.${locale}.md`), "utf8");
        } else if (["REFUSE_INJECTION", "REFUSE_SAFETY", "DEGRADED"].includes(key)) {
          current = local(`packages/support-kb/content/templates/${locale}.json`)[key];
        } else {
          current = local(`apps/ui/messages/${locale}/${key.split(".")[0]}.json`)[key];
        }
        expect(current, `${locale}:${key}`).not.toContain(words);
      }
    }
  });

  // W5 pins every C7-owned English and Romanian catalogue byte against the signed input.
  it("uses the exact signed English and Romanian C7 catalogue words", () => {
    for (const locale of ["en", "ro"]) {
      const signed = strings[locale];
      for (const [key, value] of Object.entries(signed.templates))
        expect(local(`packages/support-kb/content/templates/${locale}.json`)[key]).toBe(value);
      for (const [key, value] of Object.entries(signed.support))
        expect(local(`apps/ui/messages/${locale}/support.json`)[key]).toBe(value);
      for (const [namespace, values] of [["home", signed.home], ["settings", signed.settings]] as const)
        for (const [key, value] of Object.entries(values))
          expect(local(`apps/ui/messages/${locale}/${namespace}.json`)[key]).toBe(value);
    }
  });

  // W6 catches stale case and escalation claims in a signed article or its recovery text.
  it("keeps the eight signed articles and sixteen recovery texts clear of stale promises", () => {
    const components = local("packages/support-kb/recovery/components.json").components as any[];
    for (const id of articleIds) for (const lang of ["en", "ro"]) {
      const article = readFileSync(resolve(root, `packages/support-kb/content/${id}.${lang}.md`), "utf8");
      const row = components.find((candidate) => candidate.id === id && candidate.lang === lang)!;
      for (const text of [article, row.modelProjection, row.fallback])
        for (const phrase of ["Escalate to a human", "asynchronous case", "case link", "Escaladați"])
          expect(text, `${id}.${lang}:${phrase}`).not.toContain(phrase);
    }
  });

  // W7 catches an old case label or search term still used by retrieval.
  it("uses the signed help-desk catalogue label, terms and guide labels", () => {
    const help = SUPPORT_CAPABILITIES.find(({ id }) => id === "help-desk")!;
    for (const locale of ["en", "ro"] as const) {
      expect(help.labels[locale]).toBe(strings[locale].catalog["help-desk.label"]);
      expect(help.searchTerms[locale]).toEqual(strings[locale].catalog["help-desk.searchTerms"]);
      const guide = SUPPORT_GUIDE_LABELS.find(({ articleId, actionId }) => articleId === "settings-help-menus" && actionId === null);
      expect(guide?.labels[locale] ?? []).toEqual(strings[locale].catalog["settings-help-menus.guideLabels"]);
      expect(help.labels[locale]).not.toMatch(/\b(?:case|cases|caz|cazuri)\b/iu);
      for (const label of guide?.labels[locale] ?? [])
        expect(label).not.toMatch(/\b(?:case|cases|caz|cazuri)\b/iu);
    }
  });

  // W8 catches any untranslated or obsolete help-desk name in the other 33 languages.
  it.each(locales.filter((locale) => locale !== "en" && locale !== "ro"))
  ("capability name %s matches the signed translation", (locale) => {
    const help = SUPPORT_CAPABILITIES.find(({ id }) => id === "help-desk")!;
    expect(supportCapabilityName(help, locale as any)).toBe(strings[locale].capability["help-desk"]);
  });
});
