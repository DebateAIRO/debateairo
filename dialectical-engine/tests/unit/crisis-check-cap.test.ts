import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as contract from "@debateai/contract";

/* Crisis check, the API cap (NV-28): the API runs the phrase lists over at most
   crisisCheckMaxChars() of the question as spelled for the check. No ordinary question within
   the 8 KB ask bound reaches it; one that does (a flood of compatibility forms) is never checked
   in part, it gets help numbers. Nothing is computed at module top level: every call goes
   through `contract.` inside a test. */

type Fixture = Readonly<{ language: string; positive: readonly string[]; negative: readonly string[] }>;

const FIXTURE_DIRECTORY = new URL("./crisis-check-fixtures/", import.meta.url);
const fixtureNames = readdirSync(FIXTURE_DIRECTORY).filter((name) => name.endsWith(".json")).sort();
const readFixture = (name: string): Fixture =>
  JSON.parse(readFileSync(new URL(name, FIXTURE_DIRECTORY), "utf8")) as Fixture;

/** The language's negatives joined with ". ", in order and cycling, as long as `${padding}. ${positive[0]}` fits the bound. */
function longQuestion(fixture: Fixture, maxBytes: number): { padding: string; question: string } {
  const suffix = fixture.positive[0]!;
  let padding = "";
  for (let i = 0; ; i += 1) {
    const next = fixture.negative[i % fixture.negative.length]!;
    const candidate = padding === "" ? next : `${padding}. ${next}`;
    if (Buffer.byteLength(`${candidate}. ${suffix}`, "utf8") > maxBytes) break;
    padding = candidate;
  }
  return { padding, question: `${padding}. ${suffix}` };
}

describe("crisis check — the API cap (NV-28)", () => {
  it("exports the API cap (NV-28)", () => {
    expect(typeof contract.crisisCheckMaxChars).toBe("function");
    expect(typeof contract.crisisCheckOverlong).toBe("function");
  });

  it("is twice the ask bound", () => {
    expect(contract.crisisCheckMaxChars()).toBe(2 * contract.askQuestionMaxBytes());
  });

  it("flags a compatibility-form flood within the byte bound", () => {
    const flood = "\u{FDFA}".repeat(2_730);
    expect(Buffer.byteLength(flood, "utf8")).toBe(8_190);
    expect(contract.crisisCheckOverlong(flood)).toBe(true);
  });

  it("never flags ordinary text at the byte bound", () => {
    expect(contract.crisisCheckOverlong("a".repeat(8_192))).toBe(false);
    expect(contract.crisisCheckOverlong("\u{BD}".repeat(4_096))).toBe(false);
  });

  for (const name of fixtureNames) {
    it(`${name.replace(/\.json$/u, "")}: checks a long legitimate question in full and still finds a crisis at its end`, () => {
      const maxBytes = contract.askQuestionMaxBytes();
      const { padding, question } = longQuestion(readFixture(name), maxBytes);
      expect(Buffer.byteLength(question, "utf8")).toBeLessThanOrEqual(maxBytes);
      expect(contract.crisisCheckOverlong(question)).toBe(false);
      expect(contract.detectCrisis(padding).crisis).toBe(false);
      expect(contract.detectCrisis(question).crisis).toBe(true);
    });
  }
});

/* The same caps over every text one request screens (crisisCheckTexts): the question line, the words typed on step 2, the
   clarify answers, the four calls before Start, a saved question and a carry-on dig. Each text is held to
   crisisCheckMaxChars(), and all of them together to crisisCheckRequestMaxChars(); past either, the answer is the crisis one,
   never a check in part. */
describe("crisis check — the caps over one request's texts", () => {
  /** The largest Start the contract allows, in ordinary spelling: the 8 KB line, seven paths, each with its title, question and four own texts. */
  function largestOrdinaryStart(): string[] {
    const L = contract.START_STEP_LIMITS;
    const texts = ["a".repeat(contract.askQuestionMaxBytes())];
    for (let path = 0; path < L.pathsMax; path += 1) {
      texts.push("t".repeat(L.pathTitleMaxChars), "q".repeat(L.pathQuestionMaxChars));
      for (let own = 0; own < L.ownWordsAndPicksPerPathMax; own += 1) texts.push("o".repeat(L.ownTextMaxChars));
    }
    return texts;
  }

  it("exports the request cap and the check, and the cap holds the largest legal Start in ordinary spelling", () => {
    expect(typeof contract.crisisCheckRequestMaxChars).toBe("function");
    expect(typeof contract.crisisCheckTexts).toBe("function");
    const largest = largestOrdinaryStart().reduce((sum, text) => sum + text.length, 0);
    expect(largest).toBe(44_032);
    expect(contract.crisisCheckRequestMaxChars()).toBeGreaterThanOrEqual(largest);
    expect(contract.crisisCheckRequestMaxChars()).toBe(3 * contract.crisisCheckMaxChars());
  });

  it("checks the largest legal Start in full: nothing flagged, and a crisis phrase in its last text is still found", () => {
    const texts = largestOrdinaryStart();
    expect(contract.crisisCheckTexts(texts)).toBe(false);
    const last = texts.length - 1;
    texts[last] = `${texts[last]!.slice(0, 900)} I want to kill myself tonight`;
    expect(contract.crisisCheckTexts(texts)).toBe(true);
  });

  it("flags a request with any one text whose spelling passes crisisCheckMaxChars()", () => {
    expect(contract.crisisCheckTexts(["Should the city build a pier?", "\u{FDFA}".repeat(1_000)])).toBe(true);
  });

  it("flags a request whose texts together pass crisisCheckRequestMaxChars(), each of them under its own cap", () => {
    // ﬃ spells as three letters: each text is 3,000 letters for the check, twenty of them 60,000.
    const texts = Array.from({ length: 20 }, () => "\u{FB03}".repeat(1_000));
    expect(texts.every((text) => !contract.crisisCheckOverlong(text))).toBe(true);
    expect(texts.some((text) => contract.detectCrisis(text).crisis)).toBe(false);
    expect(contract.crisisCheckTexts(texts)).toBe(true);
    expect(contract.crisisCheckTexts(texts.slice(0, 10))).toBe(false);
  });

  it("answers as the lists do for ordinary texts", () => {
    expect(contract.crisisCheckTexts([])).toBe(false);
    expect(contract.crisisCheckTexts(["Should the city build a pier?", "What about the fishing jobs?"])).toBe(false);
    expect(contract.crisisCheckTexts(["Should the city build a pier?", "I want to kill myself tonight"])).toBe(true);
  });
});
