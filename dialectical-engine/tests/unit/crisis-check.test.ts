import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileCrisisPattern, detectCrisis, normalizeForCrisisCheck, normalizeKeepingAccents } from "@debateai/contract";
import { CRISIS_LEXICONS } from "../../packages/contract/src/crisis-lexicon/index.js";

/* Crisis check (V, 2026-09-30): a question that reads as a person in crisis becomes a
   help-numbers screen, never a debate. Every interface language carries a phrase list and a
   fixture of questions that must and must not trip it. */

type Fixture = Readonly<{ language: string; positive: readonly string[]; negative: readonly string[] }>;

const FIXTURE_DIRECTORY = new URL("./crisis-check-fixtures/", import.meta.url);
const fixtures: readonly Fixture[] = readdirSync(FIXTURE_DIRECTORY)
  .filter((name) => name.endsWith(".json"))
  .map((name) => JSON.parse(readFileSync(new URL(name, FIXTURE_DIRECTORY), "utf8")) as Fixture);

describe("crisis check — normalisation", () => {
  it("folds case, accents, apostrophes and space", () => {
    expect(normalizeForCrisisCheck("  Vreau  SĂ mă   SINUCID ")).toBe("vreau sa ma sinucid");
    expect(normalizeForCrisisCheck("I’m suicidal")).toBe("i'm suicidal");
    expect(normalizeForCrisisCheck("ＫＩＬＬ myself")).toBe("kill myself");
    expect(normalizeForCrisisCheck("ki\u200Bll my\u00ADself")).toBe("kill myself");
    expect(detectCrisis("k\u0456ll myself").crisis).toBe(true);
    expect(normalizeForCrisisCheck("Zabiję się, chcę umrzeć, ølł")).toBe("zabije sie, chce umrzec, oll");
  });

  it("keeps the marks that are part of a letter outside Latin, Greek and Cyrillic", () => {
    expect(normalizeForCrisisCheck("死にたい")).toBe("死にたい");
    expect(normalizeForCrisisCheck("죽고 싶다")).toBe("죽고 싶다");
    expect(normalizeForCrisisCheck("मरना चाहता हूँ")).toBe("मरना चाहता हूँ".normalize("NFKC"));
  });

  it("keeps accents for patterns that ask for it, where an accent is the whole difference", () => {
    expect(normalizeKeepingAccents("Có nên TỰ TỬ không?")).toBe("có nên tự tử không?");
    expect(compileCrisisPattern("tự tử", "keep").test(normalizeKeepingAccents("có nên tự tử không"))).toBe(true);
    expect(compileCrisisPattern("tự tử", "keep").test(normalizeKeepingAccents("có nên từ từ không"))).toBe(false);
    expect(detectCrisis("có nên từ từ không?").crisis).toBe(false);
    expect(detectCrisis("tôi muốn tự tử").crisis).toBe(true);
  });

  it("gives a Unicode word edge to \\b", () => {
    expect(compileCrisisPattern(String.raw`\bsinucid\b`).test(normalizeForCrisisCheck("ma sinucid"))).toBe(true);
    expect(compileCrisisPattern(String.raw`\bsinucid\b`).test(normalizeForCrisisCheck("sinucideri"))).toBe(false);
    expect(compileCrisisPattern(String.raw`\bубить себя\b`).test(normalizeForCrisisCheck("хочу убить себя"))).toBe(true);
    expect(compileCrisisPattern(String.raw`\bانتحر\b`).test(normalizeForCrisisCheck("هل انتحر؟"))).toBe(true);
    expect(compileCrisisPattern(String.raw`\bमरना\b`).test(normalizeForCrisisCheck("मुझे मरना।"))).toBe(true);
  });
});

describe("crisis check — every language", () => {
  const languages = CRISIS_LEXICONS.map((lexicon) => lexicon.language);

  it("has one list per interface language, and a fixture for each", () => {
    expect(new Set(languages).size).toBe(35);
    expect(fixtures.map((fixture) => fixture.language).sort()).toEqual([...languages].sort());
  });

  it("writes every pattern in the allowed syntax", () => {
    for (const lexicon of CRISIS_LEXICONS) {
      expect(lexicon.patterns.length, lexicon.language).toBeGreaterThanOrEqual(8);
      for (const entry of lexicon.patterns) {
        expect(entry.pattern, `${lexicon.language}: ${entry.pattern}`).not.toMatch(/\\[A-Zpk]/u);
        expect(() => compileCrisisPattern(entry.pattern), `${lexicon.language}: ${entry.pattern}`).not.toThrow();
      }
    }
  });

  for (const fixture of fixtures) {
    it(`${fixture.language}: offers help for every crisis question`, () => {
      expect(fixture.positive.length).toBeGreaterThanOrEqual(15);
      const missed = fixture.positive.filter((question) => !detectCrisis(question).crisis);
      expect(missed).toEqual([]);
    });

    it(`${fixture.language}: lets every ordinary or policy question through`, () => {
      expect(fixture.negative.length).toBeGreaterThanOrEqual(12);
      const caught = fixture.negative
        .map((question) => ({ question, check: detectCrisis(question) }))
        .filter(({ check }) => check.crisis);
      expect(caught).toEqual([]);
    });
  }
});
