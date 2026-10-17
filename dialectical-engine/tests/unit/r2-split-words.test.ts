// tests/unit/r2-split-words.test.ts
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SPLIT_WORDS } from "../support/r2-split-words.js";

const LOCALES = readdirSync("apps/ui/messages", { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
const read = (locale: string, namespace: string) =>
  JSON.parse(readFileSync(`apps/ui/messages/${locale}/${namespace}.json`, "utf8")) as Record<string, string>;

describe("R2 Q1 option 1: SPLIT takes the old Contested word, CONTESTED takes the story's close-call word", () => {
  it("covers all 35 languages", () => {
    expect(LOCALES).toHaveLength(35);
    expect(Object.keys(SPLIT_WORDS).sort()).toEqual([...LOCALES].sort());
  });

  it.each(LOCALES)("%s: one word per state, the same on every surface", (locale) => {
    const home = read(locale, "home");
    const publicWords = read(locale, "public");
    const drawers = read(locale, "debateDrawers");
    const archive = JSON.parse(readFileSync(`apps/api/src/data-export/archive-messages/${locale}.json`, "utf8")) as Record<string, string>;
    const split = SPLIT_WORDS[locale]!;
    const close = publicWords["public.story.label.contested"]!;
    expect([publicWords["public.story.label.split"], home["home.verdict.split"], drawers["debateDrawers.verdict.split"], archive["archive.verdictSplit"]])
      .toEqual([split, split, split, split]);
    expect([home["home.verdict.contested"], drawers["debateDrawers.verdict.contested"], archive["archive.verdictContested"]])
      .toEqual([close, close, close]);
    expect(split).not.toBe(close);
  });

  it("changes nothing else in English (engine 1 sees only the CONTESTED rename)", () => {
    const home = read("en", "home");
    const publicWords = read("en", "public");
    const drawers = read("en", "debateDrawers");
    expect([home["home.verdict.supported"], home["home.verdict.contested"], home["home.verdict.unsupported"], home["home.verdict.split"]])
      .toEqual(["Supported", "Close call", "Unsupported", "Contested"]);
    expect([publicWords["public.story.label.supported"], publicWords["public.story.label.contested"],
      publicWords["public.story.label.unsupported"], publicWords["public.story.label.split"]])
      .toEqual(["Clear answer", "Close call", "Best guess, weak evidence", "Contested"]);
    expect([drawers["debateDrawers.verdict.contested"], drawers["debateDrawers.verdict.split"]]).toEqual(["Close call", "Contested"]);
    expect(drawers["debateDrawers.verdict.contestedExplanation"]).toBe(
      "The run did not settle this either way: the positions were too close, the judges disagreed, the leading position was not strong enough, or part of the comparison was missing.");
  });
});
