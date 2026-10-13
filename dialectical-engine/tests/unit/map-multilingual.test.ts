// tests/unit/map-multilingual.test.ts
import { describe, expect, it } from "vitest";
import {
  MAP_OPPOSITE_TEMPLATES, mapAddGapPoints, mapNormaliseText, mapOppositeTemplate, mapPrimarySubtag, mapWrongLanguage,
  type MapPointItem
} from "@debateai/map";
import { readdirSync } from "node:fs";

const SITE_LOCALES = readdirSync(new URL("../../apps/ui/messages/", import.meta.url), { withFileTypes: true })
  .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();

describe("the map in every language", () => {
  it("reads primary subtags, and Romanian text passes a Romanian expectation", () => {
    expect(mapPrimarySubtag("ro-RO")).toBe("ro");
    expect(mapPrimarySubtag("und")).toBe("und");
    // The branch's reply-side check (fix R-5) takes an expectation, never a tag: the question guesser stays out of the map.
    expect(mapWrongLanguage("Autobuzele gratuite ar costa orașul foarte mult în fiecare an.", { tag: "ro", script: "Latin" })).toBe(false);
  });

  it("keeps the vowel signs of non-Latin scripts and still folds Romanian diacritics", () => {
    expect(mapNormaliseText("Ș ș Ţ ţ")).toBe(mapNormaliseText("S s T t"));
    expect(mapNormaliseText("कि")).not.toBe(mapNormaliseText("क"));
    expect(mapNormaliseText("が")).not.toBe(mapNormaliseText("か"));
  });

  it("refuses a gap item that is not a GAP item of the map", () => {
    const item: MapPointItem = { itemId: "pt09", seat: { aiRef: "a", maker: "m" }, origin: "BLIND", angleId: null, angleKind: null,
      listIndex: 0, kind: "POINT", claim: "x", whyItMatters: "y", leans: "context" };
    expect(() => mapAddGapPoints({ keyPoints: [], mergedAnswers: [] }, [], [item])).toThrow(/MAP_GAP_ITEM_UNKNOWN/u);
    expect(() => mapAddGapPoints({ keyPoints: [], mergedAnswers: [] }, [item], [item])).toThrow(/MAP_GAP_ITEM_UNKNOWN/u);
  });

  it("has the opposite template in every site language, and English for anything else", () => {
    expect(Object.keys(MAP_OPPOSITE_TEMPLATES).sort()).toEqual(SITE_LOCALES);
    for (const [tag, { lead, empty }] of Object.entries(MAP_OPPOSITE_TEMPLATES)) {
      expect(lead.trim(), tag).not.toBe("");
      expect(empty.trim(), tag).not.toBe("");
      expect(`${lead} ${empty}`, tag).not.toMatch(/\d|score|grader|threshold|node/iu);
    }
    expect(mapOppositeTemplate("Da", "ro-RO")).toBe(`${MAP_OPPOSITE_TEMPLATES.ro!.lead}: Da`);
    expect(mapOppositeTemplate("", "xx")).toBe(MAP_OPPOSITE_TEMPLATES.en!.empty);
  });
});
