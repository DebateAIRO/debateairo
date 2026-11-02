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
