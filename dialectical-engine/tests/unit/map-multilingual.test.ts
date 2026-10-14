// tests/unit/map-multilingual.test.ts
import { describe, expect, it } from "vitest";
import { replyLanguageExpectation } from "@debateai/kernel";
import {
  MAP_OPPOSITE_SEPARATORS, MAP_OPPOSITE_TEMPLATES, mapAddGapPoints, mapAssignItemIds, mapChooseCheck, mapChooseReplySchema,
  mapClassifyReply, mapCodeMerge, mapFinishChoice, mapItemsById, mapKeyPoint, mapNextItemNumbers, mapNormaliseText, mapOppositeTemplate,
  mapPrimarySubtag, mapWrongLanguage, type MapAngleKind, type MapChooseReply, type MapItemDraft, type MapLean, type MapPointItem,
  type MapSeat
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

// Fix round 1 (Task 2 review).
const A: MapSeat = { aiRef: "ai-a", maker: "maker-a" };
const B: MapSeat = { aiRef: "ai-b", maker: "maker-b" };
const C: MapSeat = { aiRef: "ai-c", maker: "maker-c" };
const pointDraft = (seat: MapSeat, listIndex: number, position: number, claim: string, angleKind: MapAngleKind | null = null,
  leans: MapLean = "context", origin: "BLIND" | "GAP" = "BLIND"): MapItemDraft =>
  ({ kind: "POINT", seat, origin, angleId: angleKind === null ? null : angleKind.toLowerCase(), angleKind, listIndex, position,
    claim, whyItMatters: "Why.", leans });
const answerDraft = (seat: MapSeat, listIndex: number, text: string, angleKind: MapAngleKind | null = null): MapItemDraft =>
  ({ kind: "ANSWER", seat, origin: "BLIND", angleId: null, angleKind, listIndex, position: 0, answer: text });

describe("the map's text rule: signs, emoji, Russian and Arabic", () => {
  it("drops a mark that follows no letter, so an emoji's variation selector does not split a claim", () => {
    expect(mapNormaliseText("Cost is high ✔️")).toBe(mapNormaliseText("Cost is high ✔"));
    expect(mapNormaliseText("Cost is high ✔️")).toBe("cost is high");
    expect(mapNormaliseText("⚠️")).toBe("");
  });

  it("reads Russian ё as е, but keeps Ukrainian ї", () => {
    expect(mapNormaliseText("Ёлка ещё")).toBe(mapNormaliseText("Елка еще"));
    expect(mapNormaliseText("її")).not.toBe(mapNormaliseText("іі"));
  });

  it("drops Arabic short-vowel signs (tashkeel)", () => {
    expect(mapNormaliseText("مُدَرِّسَةٌ")).toBe(mapNormaliseText("مدرسة"));
  });

  it("gives an empty tag an empty subtag, which reads the English template", () => {
    expect(mapPrimarySubtag("")).toBe("");
    expect(mapPrimarySubtag("zh_Hans")).toBe("zh");
    expect(mapOppositeTemplate("Yes", "")).toBe(`${MAP_OPPOSITE_TEMPLATES.en!.lead}: Yes`);
    expect(mapOppositeTemplate("Yes", "constructor")).toBe(`${MAP_OPPOSITE_TEMPLATES.en!.lead}: Yes`);
  });
});

describe("the opposite template's separator", () => {
  it("keeps English and Romanian as they were, puts a space before the French colon, and a full-width colon in Chinese and Japanese", () => {
    expect(mapOppositeTemplate("Yes", "en")).toBe("The opposite of this answer: Yes");
    expect(mapOppositeTemplate("Da", "ro")).toBe("Opusul acestui răspuns: Da");
    expect(mapOppositeTemplate("Oui", "fr-FR")).toBe(`${MAP_OPPOSITE_TEMPLATES.fr!.lead}\u00A0: Oui`);
    expect(mapOppositeTemplate("是", "zh-CN")).toBe(`${MAP_OPPOSITE_TEMPLATES.zh!.lead}：是`);
    expect(mapOppositeTemplate("はい", "ja")).toBe(`${MAP_OPPOSITE_TEMPLATES.ja!.lead}：はい`);
    expect(mapOppositeTemplate("Ja", "de")).toBe(`${MAP_OPPOSITE_TEMPLATES.de!.lead}: Ja`);
    expect(MAP_OPPOSITE_TEMPLATES.de!.empty).toBe("Eine andere Antwort als die obige");
    for (const tag of Object.keys(MAP_OPPOSITE_SEPARATORS)) expect(Object.keys(MAP_OPPOSITE_TEMPLATES), tag).toContain(tag);
  });
});

describe("a text that normalises to nothing matches nothing", () => {
  it("keypoints: the code merge keeps two sign-only claims (and answers) apart", () => {
    const items = mapAssignItemIds([pointDraft(A, 0, 0, "?!"), pointDraft(B, 1, 0, "…"), pointDraft(C, 2, 0, "Real claim."),
      answerDraft(A, 0, "?!"), answerDraft(B, 1, "…")], "seed-empty-merge");
    const merged = mapCodeMerge(items);
    expect(merged.keyPoints.map((keyPoint) => keyPoint.memberItemIds.length)).toEqual([1, 1, 1]);
    expect(merged.mergedAnswers.map((answer) => answer.memberItemIds.length)).toEqual([1, 1]);
  });

  it("keypoints: a sign-only gap point does not join a sign-only key point", () => {
    const blind = mapAssignItemIds([pointDraft(A, 0, 0, "?!")], "seed-empty-gap");
    const gap = mapAssignItemIds([pointDraft(B, 101, 0, "…", null, "context", "GAP")], "seed-empty-gap-2", mapNextItemNumbers(blind))
      .filter((item): item is MapPointItem => item.kind === "POINT");
    const all = [...blind, ...gap];
    const added = mapAddGapPoints(mapCodeMerge(blind), all, gap);
    expect(added.newKeyPoints).toBe(1);
    expect(added.map.keyPoints).toHaveLength(2);
  });

  it("the gap guard refuses a known ANSWER item passed as a gap item", () => {
    const items = mapAssignItemIds([answerDraft(A, 0, "No.")], "seed-guard-answer");
    const asGap = { ...items[0]!, kind: "POINT", origin: "GAP", claim: "No.", whyItMatters: "Why.", leans: "context" } as unknown as MapPointItem;
    expect(() => mapAddGapPoints({ keyPoints: [], mergedAnswers: [] }, items, [asGap])).toThrow(/MAP_GAP_ITEM_UNKNOWN/u);
  });

  it("replies: two sign-only statements are not MAP_ANSWER_DUPLICATE", () => {
    const check = mapChooseCheck(new Set(["kp01", "kp02", "kp03"]), replyLanguageExpectation("Should a city make its central buses free to ride?"));
    const content = JSON.stringify({ answers: [
      { answer_id: "a1", statement: "Yes, the plan works well.", for: ["kp01"], against: [], strongest_rival: null },
      { answer_id: "a2", statement: "?!", for: ["kp02"], against: [], strongest_rival: null },
      { answer_id: "a3", statement: "…", for: ["kp03"], against: [], strongest_rival: null }] });
    const out = mapClassifyReply(content, { finishReason: "stop" }, mapChooseReplySchema, check);
    const codes = (JSON.parse(out.classification.parseError ?? "[]") as { message: string }[]).map((issue) => issue.message);
    expect(codes).not.toContain("MAP_ANSWER_DUPLICATE");
    // Final review M-3: each is refused as an answer with no words, at its own statement, so the repair re-asks it.
    const issues = (JSON.parse(out.classification.parseError ?? "[]") as { message: string; path: (string | number)[] }[])
      .filter((issue) => issue.message === "MAP_ANSWER_NO_WORDS").map((issue) => issue.path.join("."));
    expect(issues).toEqual(["answers.1.statement", "answers.2.statement"]);
  });

  describe("choose", () => {
    const items = mapAssignItemIds([
      pointDraft(A, 0, 0, "Opposite", "OPPOSITE_CASE", "against_some_answer"),
      pointDraft(C, 2, 0, "Worry", "ASKER_WORRY", "for_some_answer"),
      pointDraft(B, 1, 0, "Practical", "PRACTICAL", "for_some_answer"),
      answerDraft(A, 0, "Yes."), answerDraft(C, 2, "?!", "OPPOSITE_CASE")
    ], "seed-empty-choose");
    const byId = mapItemsById(items);
    const idOf = (claim: string) => items.find((item) => item.kind === "POINT" && item.claim === claim)!.itemId;
    const keyPoints = [mapKeyPoint("kp01", "Opposite", [idOf("Opposite")], byId), mapKeyPoint("kp02", "Worry", [idOf("Worry")], byId),
      mapKeyPoint("kp03", "Practical", [idOf("Practical")], byId)];
    const base = { keyPoints, mergedAnswers: [], items, languageTag: "en", maxAnswers: 4, pointsPerAnswer: 3 };
    type Answer = MapChooseReply["answers"][number];
    const chosen = (answerId: string, statement: string, forIds: string[]): Answer =>
      ({ answer_id: answerId, statement, for: forIds, against: [], strongest_rival: null });

    it("first-of-each keeps every sign-only statement", () => {
      const out = mapFinishChoice({ ...base, reply: { answers: [chosen("a1", "Yes.", ["kp03"]), chosen("a2", "?!", ["kp02"]),
        chosen("a3", "…", [])] } });
      expect(out.choice.answers.map((answer) => answer.answerId)).toEqual(["a1", "a2", "a3"]);
    });

    it("a sign-only statement is not opposite just because a sign-only opposite-case answer exists", () => {
      const out = mapFinishChoice({ ...base, reply: { answers: [chosen("a1", "Yes.", ["kp03"]), chosen("a2", "…", ["kp02"])] } });
      // Not opposite: the OPPOSITE_CASE point goes against the answer with the fewest points (a1 first), not to a2's for.
      const a1 = out.choice.answers.find((answer) => answer.answerId === "a1")!;
      const a2 = out.choice.answers.find((answer) => answer.answerId === "a2")!;
      expect(a2.forKeyPointIds).toEqual(["kp02"]);
      expect(a1.againstKeyPointIds).toEqual(["kp01"]);
    });
  });
});
