import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const locales = [
  "ar", "bg", "cs", "da", "de", "el", "en", "es", "et", "fi", "fr", "ga", "he", "hi", "hr", "hu", "id", "it",
  "ja", "ko", "lt", "lv", "mt", "nl", "pl", "pt", "ro", "ru", "sk", "sl", "sv", "tr", "uk", "vi", "zh"
] as const;
const keys = [
  "home.questionRefusal.title", "home.questionRefusal.notStarted", "home.questionRefusal.back",
  "home.questionRefusal.automatic", "home.questionRefusal.rule",
  "home.questionRefusal.complain", "home.questionRefusal.months",
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
    // V, 2026-10-28: one shared line for every refusal, naming section 7 by its heading in this locale's Terms.
    const headings = terms.split("\n").filter((line) => line.startsWith("## 7. "));
    expect(headings, `${locale}: section 7`).toHaveLength(1);
    expect(catalog["home.questionRefusal.rule"], `${locale}: shared rule line`).toContain(headings[0]!.slice(3));
    expect(catalog["home.questionRefusal.rule"], `${locale}: a whole sentence`).toMatch(/[.。।]$/u);
  });

  // Property (V, 2026-10-28): no per-subject rule lines and no "we kept your question" line remain.
  it.each(locales)("%s holds no per-subject rule line and no kept line", (locale) => {
    const keysIn = Object.keys(read(locale).catalog);
    expect(keysIn.filter((key) => key.startsWith("home.questionRefusal.rule."))).toEqual([]);
    expect(keysIn).not.toContain("home.questionRefusal.kept");
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
