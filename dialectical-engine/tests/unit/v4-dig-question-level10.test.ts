import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { addedLines, DIG_ITEM_FLOOR, digQuestion, parseDigDetail } from "../../apps/ui/lib/v4/askText.js";
import { ownViewPick, suggestionPick } from "../../apps/ui/lib/v4/suggestions.js";
import type { DigTarget, V4DigPick, V4Path } from "../../apps/ui/lib/v4/types.js";
import { askQuestionMaxBytes, DIG_LEVEL_MAX, WEB_CONTRACT_LIMITS, type DigSuggestion } from "../../packages/contract/src/index.js";

/*
 * Dig model revision (2026-10-30, D11 and section 2): digs nest to DIG_LEVEL_MAX levels, and each dig's question carries
 * the chain of the earlier questions. It must always fit the API's question limit (8,192 bytes), cutting the earlier
 * questions first and what the person digs into last: a pick's text is never cut below DIG_ITEM_FLOOR (80) characters.
 */

const CATALOG = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../apps/ui/messages/en/v4.json"), "utf8")) as Record<string, string>;
const bytes = (text: string): number => new TextEncoder().encode(text).length;
const oneLine = (text: string): string => text.replace(/\s+/g, " ").trim();
const head = (text: string, count: number): string => Array.from(oneLine(text)).slice(0, count).join("");

const ROOT = "Should I move from Cluj to Munich as a nurse, given the pay, the rent and my family?\n\n"
  + "This is about Romania.\nTime frame: the next 5 years.\nI want to make a decision.";

function path(level: number, line: string): V4Path {
  return {
    id: `n-path-${level}`, fate: "PARTLY_HELD", line, points: [], open: [], unchecked: 0,
    counts: { SURE: 0, SURE_FOR_CASE: 0, STILL_ARGUED: 0, DIDNT_HOLD: 0 }
  };
}

function suggestion(id: string, text: string): DigSuggestion {
  return { suggestion_id: id, kind: "CONTRADICTING", side: null, text, places: [`p:${id}`] };
}

/** One level's picks: `count` suggestions and own views of `size` characters (`unit` repeated), on one path. */
function picksAt(level: number, count: number, size: number, unit: string): readonly V4DigPick[] {
  return Array.from({ length: count }, (_, at) => {
    const text = `Level ${level} pick ${at}: ${unit.repeat(size)}`.slice(0, WEB_CONTRACT_LIMITS.pickTextMaxChars);
    return at % 2 === 0
      ? suggestionPick(`n-path-${level}`, suggestion(`s${level}-${at}`, text))
      : ownViewPick(`n-path-${level}`, text, at);
  });
}

/** The chain: the first debate, then DIG_LEVEL_MAX digs, each dug from the one before. Returns every level's question. */
function chain(count: number, size: number, unit: string): readonly Readonly<{ question: string; target: DigTarget }>[] {
  const levels: Array<Readonly<{ question: string; target: DigTarget }>> = [];
  let parent = ROOT;
  for (let level = 1; level <= DIG_LEVEL_MAX; level += 1) {
    const target: DigTarget = {
      kind: "picks",
      path: path(level, `The path at level ${level - 1}: ${unit.repeat(size)}`),
      picks: picksAt(level, count, size, unit)
    };
    const question = digQuestion(target, parent, CATALOG, "en");
    levels.push({ question, target });
    parent = question;
  }
  return levels;
}

function expectWithinLimitAndFloor(levels: ReturnType<typeof chain>): void {
  expect(levels).toHaveLength(DIG_LEVEL_MAX);
  for (const { question, target } of levels) {
    expect(bytes(question)).toBeLessThanOrEqual(askQuestionMaxBytes());
    if (target.kind !== "picks") throw new Error("a picks target");
    for (const pick of target.picks) {
      const text = pick.kind === "OPEN" ? pick.question.text : pick.text;
      // Never cut below the floor: at least the first 80 characters (or the whole text when shorter) are sent.
      expect(oneLine(question)).toContain(head(text, DIG_ITEM_FLOOR));
    }
  }
}

describe("a dig ten levels deep (DIG_LEVEL_MAX)", () => {
  it("the limit is 8,192 bytes and the floor 80 characters", () => {
    expect(askQuestionMaxBytes()).toBe(8192);
    expect(DIG_ITEM_FLOOR).toBe(80);
    expect(DIG_LEVEL_MAX).toBe(10);
  });

  it("short picks: every level fits whole, and the chain names every earlier question", () => {
    const levels = chain(3, 4, "rent ");
    expectWithinLimitAndFloor(levels);
    const last = levels.at(-1)!.question;
    // The first added line names its parent; the earlier ones and the first debate's own lines follow it.
    const detail = parseDigDetail(last, CATALOG);
    expect(detail).not.toBeNull();
    expect(addedLines(last).filter((line) => line.startsWith("This follows from an earlier question:"))).toHaveLength(DIG_LEVEL_MAX);
    expect(last).toContain("This is about Romania.");
    expect(last).toContain("I want to make a decision.");
  });

  it("the most picks of the longest text, at every level: it fits, and no pick is cut below 80 characters", () => {
    expectWithinLimitAndFloor(chain(WEB_CONTRACT_LIMITS.digPicksMax, 400, "chirie "));
  });

  it("the same with text of three-byte characters (each character three UTF-8 bytes)", () => {
    expectWithinLimitAndFloor(chain(WEB_CONTRACT_LIMITS.digPicksMax, 300, "家賃"));
  });

  it("Free's three picks of the longest text fit too", () => {
    expectWithinLimitAndFloor(chain(3, 1900, "x"));
  });

  it("a pick shorter than the floor is sent whole", () => {
    const levels = chain(WEB_CONTRACT_LIMITS.digPicksMax, 400, "chirie ");
    const target: DigTarget = { kind: "picks", path: path(11, "A short line."), picks: [ownViewPick("n-path-11", "Rent eats it.", 1)] };
    const question = digQuestion(target, levels.at(-1)!.question, CATALOG, "en");
    expect(bytes(question)).toBeLessThanOrEqual(askQuestionMaxBytes());
    expect(question).toContain("Rent eats it.");
  });
});
