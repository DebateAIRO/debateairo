// tests/unit/web-verbatim.test.ts
// The word-for-word quote check (Perplexity plan 2026-10-30, task W2-4; owner 2026-10-30: the code checks every extract
// against the stored page, evening out only spaces and quote marks). Made-up pages only (copyright rule of the plan).
import { describe, expect, it } from "vitest";
import {
  VERBATIM_DOUBLE_QUOTES, VERBATIM_SINGLE_QUOTES, checkVerbatimExtracts, findVerbatim, verbatimKey, verbatimPage
} from "../../packages/evidence/src/verbatim.js";

const PAGE = [
  "Harbour Town Council — Annual Transport Note",
  "",
  "In 2025 the ferry carried 1,240,000 passengers, up from 1,100,000 the year before.",
  "The council said: “The new pier paid for itself within four years.”",
  "A resident group replied that ‘the pier mostly serves visitors’ and asked for a  bus link.",
  "Critics call it a \"vanity project\"; the mayor's office disagrees."
].join("\n");

describe("the verbatim checker keeps only what the page says word for word", () => {
  it("finds an exact passage and hands back the page's own words and place", () => {
    const found = findVerbatim(PAGE, "In 2025 the ferry carried 1,240,000 passengers");
    expect(found).not.toBeNull();
    expect(found!.text).toBe("In 2025 the ferry carried 1,240,000 passengers");
    expect(PAGE.slice(found!.start, found!.end)).toBe(found!.text);
  });

  it("evens out curly against straight quotes, both ways, and keeps the page's curly ones", () => {
    const straight = findVerbatim(PAGE, "The council said: \"The new pier paid for itself within four years.\"");
    expect(straight!.text).toBe("The council said: “The new pier paid for itself within four years.”");
    expect(findVerbatim(PAGE, "replied that 'the pier mostly serves visitors'")!.text).toBe("replied that ‘the pier mostly serves visitors’");
    // The page writes straight quotes and an apostrophe; the extract curly ones.
    expect(findVerbatim(PAGE, "Critics call it a “vanity project”; the mayor’s office disagrees.")!.text)
      .toBe("Critics call it a \"vanity project\"; the mayor's office disagrees.");
  });

  it("evens out the low-high and angle quotes other languages write", () => {
    const ro = "Primarul a spus: „Podul s-a plătit singur în patru ani”, iar opoziția a răspuns «nu este adevărat».";
    expect(findVerbatim(ro, "a spus: \"Podul s-a plătit singur în patru ani\"")).not.toBeNull();
    expect(findVerbatim(ro, "a răspuns \"nu este adevărat\".")).not.toBeNull();
    for (const mark of VERBATIM_DOUBLE_QUOTES) expect(verbatimKey(`${mark}x${mark}`)).toBe("\"x\"");
    for (const mark of VERBATIM_SINGLE_QUOTES) expect(verbatimKey(`${mark}x${mark}`)).toBe("'x'");
  });

  it("evens out every run of spaces, line breaks and no-break spaces to one space", () => {
    const found = findVerbatim(PAGE, "A resident group replied");
    expect(found!.text).toBe("A resident group replied");
    expect(findVerbatim(PAGE, "asked for a bus link.")!.text).toBe("asked for a  bus link.");
    expect(findVerbatim(PAGE, "the year before. The council said:")!.text).toBe("the year before.\nThe council said:");
    expect(findVerbatim(PAGE, "  In 2025 the ferry\n")!.text).toBe("In 2025 the ferry");
  });

  it("drops a near miss: one word, punctuation, letter case, a dash or a shortened passage", () => {
    for (const nearMiss of [
      "In 2025 the ferry carried 1,250,000 passengers",          // a number changed
      "In 2025 the ferry carried 1240000 passengers",            // thousands separators dropped
      "In 2025, the ferry carried 1,240,000 passengers",          // a comma added
      "in 2025 the ferry carried 1,240,000 passengers",           // letter case
      "Harbour Town Council - Annual Transport Note",              // a hyphen for the page's dash
      "In 2025 the ferry carried ... passengers",                 // a passage shortened with dots
      "The new pier paid for itself within three years."          // a word changed
    ]) {
      expect(findVerbatim(PAGE, nearMiss), nearMiss).toBeNull();
    }
  });

  it("drops an empty extract and one longer than the page", () => {
    expect(findVerbatim(PAGE, "")).toBeNull();
    expect(findVerbatim(PAGE, " \n  ")).toBeNull();
    expect(findVerbatim("Short page.", "Short page. And more words the page never had.")).toBeNull();
  });

  it("checks a reply's extracts in order: found ones kept once, the rest counted as dropped", () => {
    const checked = checkVerbatimExtracts(PAGE, [
      "the ferry carried 1,240,000 passengers",
      "The ferry carried 1,240,000 passengers",                     // case: dropped
      "the ferry  carried 1,240,000\npassengers",                   // the same passage again: kept once
      "\"vanity project\"",
      "The pier was a success, everyone agrees."                    // not on the page: dropped
    ]);
    expect(checked.kept.map((found) => found.text)).toEqual(["the ferry carried 1,240,000 passengers", "\"vanity project\""]);
    expect(checked.dropped).toEqual(["The ferry carried 1,240,000 passengers", "The pier was a success, everyone agrees."]);
  });

  it("reads one page once for many extracts, with the same answers as the one-off check", () => {
    const page = verbatimPage(PAGE);
    for (const extract of ["the year before", "mayor's office", "four years.\"", "nowhere on the page"]) {
      expect(page.find(extract)).toEqual(findVerbatim(PAGE, extract));
    }
  });

  it("gives one key for passages that differ only in spaces and quote marks (readers 2 and 3 merge by it)", () => {
    expect(verbatimKey("  “The new pier”\n paid ")).toBe(verbatimKey("\"The new pier\" paid"));
    expect(verbatimKey("The new pier")).not.toBe(verbatimKey("the new pier"));
  });

  it("keeps characters outside the basic plane in place (the page's own span stays exact)", () => {
    const page = "Ridership 𝟐𝟎𝟐𝟓: the “record” year 🚢 for the ferry.";
    const found = findVerbatim(page, "the \"record\" year 🚢 for");
    expect(found!.text).toBe("the “record” year 🚢 for");
    expect(page.slice(found!.start, found!.end)).toBe(found!.text);
  });
});
