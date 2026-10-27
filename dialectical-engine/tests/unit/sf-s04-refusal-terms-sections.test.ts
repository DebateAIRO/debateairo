import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { QUESTION_NOT_STARTED_KINDS } from "../../packages/contract/src/question-check.js";

const locales = [
  "ar", "bg", "cs", "da", "de", "el", "en", "es", "et", "fi", "fr", "ga", "he", "hi", "hr", "hu", "id", "it",
  "ja", "ko", "lt", "lv", "mt", "nl", "pl", "pt", "ro", "ru", "sk", "sl", "sv", "tr", "uk", "vi", "zh"
] as const;
const keys = [
  "home.questionRefusal.title", "home.questionRefusal.notStarted", "home.questionRefusal.back",
  "home.questionRefusal.automatic", "home.questionRefusal.rule.HARM_TO_OTHERS",
  "home.questionRefusal.rule.WEAPONS_DRUGS_TERRORISM", "home.questionRefusal.rule.CRIME", "home.questionRefusal.rule.HATE_SPEECH",
  "home.questionRefusal.rule.RELIGIOUS_INSULT", "home.questionRefusal.rule.SENSITIVE_TOPIC",
  "home.questionRefusal.complain", "home.questionRefusal.months", "home.questionRefusal.kept",
  "home.questionRefusal.helpNumbers", "home.questionRefusal.unavailableTitle",
  "home.questionRefusal.unavailable", "home.harmHelpLine.helpline"
] as const;
const english = read("en").catalog;
const placeholders = (text: string) => [...text.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/gu)].map((match) => match[1]).sort();

function read(locale: string): { catalog: Record<string, string>; terms: string } {
  const root = process.cwd();
  return {
    catalog: JSON.parse(readFileSync(join(root, "apps/ui/messages", locale, "home.json"), "utf8")) as Record<string, string>,
    terms: readFileSync(join(root, "apps/ui/legal", locale, "terms-of-service.md"), "utf8")
  };
}

describe("refusal words match each locale's Terms", () => {
  it.each(locales)("every rule string in %s contains its Terms section heading", async (locale) => {
    const { catalog, terms } = read(locale);
    for (const key of keys) {
      expect(catalog[key], `${locale}: ${key} exists`).toEqual(expect.any(String));
      expect(placeholders(catalog[key]!), `${locale}: ${key} placeholders`).toEqual(placeholders(english[key]!));
    }
    expect(catalog["home.questionRefusal.back"]).toBe(catalog["home.crisisSupport.back"]);
    const map = await import("../../apps/ui/lib/questionRefusal.js").catch(() => null);
    expect(map, "Terms section map is shipped").not.toBeNull();
    for (const kind of QUESTION_NOT_STARTED_KINDS) {
      const section = map!.TERMS_SECTION_OF_KIND[kind];
      const headings = terms.split("\n").filter((line) => line.startsWith(`## ${section}. `));
      expect(headings, `${locale}: section ${section}`).toHaveLength(1);
      const heading = headings[0]!.slice(3);
      expect(catalog[`home.questionRefusal.rule.${kind}`], `${locale}: ${kind}`).toContain(heading);
    }
  });

  it.each(locales)("home.questionRefusal.months in %s is its Terms complaint limit", (locale) => {
    const { catalog, terms } = read(locale);
    const lines = terms.split("\n").filter((line) => line.startsWith("**") && line.includes("office@dezbatere.ro"));
    expect(lines, `${locale}: complaint paragraph`).toHaveLength(1);
    const bold = [...lines[0]!.matchAll(/\*\*([^*]+)\*\*/gu)].map((match) => match[1]);
    expect(bold, `${locale}: heading and limit`).toHaveLength(2);
    expect(catalog["home.questionRefusal.months"]).toBe(bold[1]);
  });
});
