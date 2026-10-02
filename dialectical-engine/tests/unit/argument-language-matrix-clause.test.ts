import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { matrixClause } from "../../packages/kernel/src/argument-language.js";

/**
 * The language detector blanks quoted spans before it scores a claim. It used this
 * pattern, which CodeQL flagged (js/polynomial-redos): on a run of unclosed openers
 * every start position rescans to the end of the text, so the time is quadratic in
 * its length. The one-pass scan must blank exactly the same spans.
 */
const QUOTED_SPAN = /«[^»]*»|„[^“”]*[“”]|“[^”]*”|‘[^’]*’|‹[^›]*›|「[^」]*」|『[^』]*』|"[^"]*"/gu;
const byPattern = (text: string): string => text.replace(QUOTED_SPAN, " ");

const MARKS = ["«", "»", "„", "“", "”", "‘", "’", "‹", "›", "「", "」", "『", "』", "\""] as const;

describe("matrixClause blanks the quoted spans the old pattern blanked", () => {
  it.each([
    ["a guillemet span", "Should «the state» pay?", "Should   pay?"],
    ["„ closed by “", "Ar trebui „statul“ să plătească?", "Ar trebui   să plătească?"],
    ["„ closed by ”", "Ar trebui „statul” să plătească?", "Ar trebui   să plătească?"],
    ["an unclosed opener kept as written", "Should «the state pay?", "Should «the state pay?"],
    ["a closer with no opener kept as written", "Should the» state pay?", "Should the» state pay?"],
    ["the first closer ends the span", "«a» b «c» d", "  b   d"],
    ["an opener inside a span is part of the span", "«a «b» c»", "  c»"],
    ["ASCII double quotes", "Is \"free\" really \"free\"?", "Is   really  ?"],
    ["CJK corner brackets", "「甲」と『乙』", " と "],
    ["an astral character inside a span", "Is «😀» fine?", "Is   fine?"]
  ])("%s", (_label, text, blanked) => {
    expect(matrixClause(text)).toBe(blanked);
    expect(byPattern(text)).toBe(blanked);
  });

  it("matches the pattern on any mix of quotation marks, letters and astral characters", () => {
    const unit = fc.constantFrom(...MARKS, "a", "b", " ", "é", "😀");
    fc.assert(
      fc.property(fc.array(unit, { maxLength: 60 }), (units) => {
        const text = units.join("");
        expect(matrixClause(text)).toBe(byPattern(text));
      }),
      { numRuns: 2000 }
    );
  });

  it("scans a long run of unclosed openers in linear time", () => {
    // 175,000 openers with no closer after them (“ comes before „, which “ would close;
    // the ASCII quote closes itself, so it has no unclosed run): a quadratic scan of this
    // would run for minutes and fail on the test's time limit; the one-pass scan returns at once.
    const unclosed = ["«", "‘", "‹", "「", "『", "“", "„"].map((opener) => opener.repeat(25_000)).join("");
    expect(matrixClause(unclosed)).toBe(unclosed);
    const closedAtTheEnd = `${"«".repeat(200_000)}»`;
    expect(matrixClause(closedAtTheEnd)).toBe(" ");
  });
});
