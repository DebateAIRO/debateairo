import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Owner ruling 2026-10-29 (MORNING-2026-10-17 item 11): the debate page's note for a very large debate
 * (`DIGEST-COMPRESSED`, `debateChrome.condition.digestCompressed`) is one plain sentence that is true whether points
 * were left out or statements were only shortened. It replaces the engine words "Node summaries shortened to fit the
 * composition budget" in every language. The report's own sentence for points left out
 * (`public.report.about.mostImportantPoints`) is a different case and stays as it is.
 */
const MESSAGES = new URL("../../apps/ui/messages/", import.meta.url);
const LOCALES = readdirSync(MESSAGES).sort();
const read = (locale: string, file: string): Record<string, string> =>
  JSON.parse(readFileSync(new URL(`${locale}/${file}`, MESSAGES), "utf8")) as Record<string, string>;
const note = (locale: string): string => read(locale, "debateChrome.json")["debateChrome.condition.digestCompressed"] ?? "";

const OWNER_SENTENCE = "The debate was very large, so the answer was written from a shortened version of it.";
const OLD_ENGINE_WORDS = "Node summaries shortened to fit the composition budget";

describe("the large-debate note (owner ruling 2026-10-29)", () => {
  it("covers all 35 languages", () => {
    expect(LOCALES).toHaveLength(35);
  });

  it("is the owner's sentence in English, word for word", () => {
    expect(note("en")).toBe(OWNER_SENTENCE);
  });

  it("names no engine part in English", () => {
    for (const word of ["node", "budget", "digest", "composition", "summar", "judge", "checker", "point"]) {
      expect([word, note("en").toLowerCase().includes(word)]).toEqual([word, false]);
    }
  });

  it.each(LOCALES.filter((locale) => locale !== "en"))("%s: translated, one full sentence, never the old note", (locale) => {
    const text = note(locale);
    expect(text.length).toBeGreaterThan(10);
    expect(text).not.toBe(OWNER_SENTENCE);
    expect(text).not.toBe(OLD_ENGINE_WORDS);
    expect(text).toMatch(/[.。।]$/u);
    // Not the report's points-left-out sentence: this note is also true when nothing was left out.
    expect(text).not.toBe(read(locale, "public.json")["public.report.about.mostImportantPoints"]);
  });

  it("no catalogue keeps the old engine words", () => {
    for (const locale of LOCALES) expect([locale, JSON.stringify(read(locale, "debateChrome.json")).includes(OLD_ENGINE_WORDS)])
      .toEqual([locale, false]);
  });
});
