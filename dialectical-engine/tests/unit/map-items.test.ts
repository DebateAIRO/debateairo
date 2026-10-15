import { describe, expect, it } from "vitest";
import { replyLanguageExpectation } from "@debateai/kernel";
import {
  mapAssignItemIds,
  mapItemsById,
  mapKeyPoint,
  mapMergedAnswer,
  mapNextItemNumbers,
  mapNormaliseText,
  mapRaisedBy,
  mapRankKeyPoints,
  mapWrongLanguage,
  type MapItemDraft,
  type MapSeat
} from "@debateai/map";

const A: MapSeat = { aiRef: "ai-a", maker: "maker-a" };
const B: MapSeat = { aiRef: "ai-b", maker: "maker-b" };
const C: MapSeat = { aiRef: "ai-c", maker: "maker-c" };
const A2: MapSeat = { aiRef: "ai-a2", maker: "maker-a" };

function point(seat: MapSeat, listIndex: number, position: number, claim: string,
  origin: "BLIND" | "SHOWN" | "GAP" = "BLIND", angleKind: "OPPOSITE_CASE" | "ASKER_WORRY" | null = null,
  leans: "for_some_answer" | "against_some_answer" | "context" = "context"): MapItemDraft {
  return { kind: "POINT", seat, origin, angleId: angleKind === null ? null : angleKind.toLowerCase(), angleKind, listIndex, position,
    claim, whyItMatters: "It could change the answer.", leans };
}

describe("map text: normalisation for grouping", () => {
  it("ignores case, punctuation and spacing", () => {
    expect(mapNormaliseText("  The COST — is high!  ")).toBe(mapNormaliseText("the cost is high"));
  });

  it("reads Romanian letters with or without diacritics, comma or cedilla, alike", () => {
    expect(mapNormaliseText("Țara și școala")).toBe("tara si scoala");
    expect(mapNormaliseText("Ţara şi şcoala")).toBe("tara si scoala");
    expect(mapNormaliseText("„Costul” e mare")).toBe(mapNormaliseText("\"Costul\" e mare"));
  });
});

describe("map text: the wrong-language check (the kernel's reply-side verdict, ruling R-5)", () => {
  const RO = replyLanguageExpectation("Ar trebui România să adopte euro în următorii cinci ani?");
  const EN = replyLanguageExpectation("Should a city make its central buses free to ride?");
  const english = "The cost of the change is high and it should be paid by the state because the people want it.";
  const romanian = "Costul schimbării este mare și ar trebui plătit de stat pentru că oamenii vor asta.";

  it("flags English for a Romanian question, and Romanian for an English one", () => {
    expect(mapWrongLanguage(english, RO)).toBe(true);
    expect(mapWrongLanguage(romanian, EN)).toBe(true);
  });

  it("accepts the question's language, and lets an empty or short (UNSURE) text pass", () => {
    expect(mapWrongLanguage(romanian, RO)).toBe(false);
    expect(mapWrongLanguage(english, EN)).toBe(false);
    expect(mapWrongLanguage("", RO)).toBe(false);
    expect(mapWrongLanguage("Yes, it is.", RO)).toBe(false);
  });

  it("never refuses when the question's writing system is unknown", () => {
    expect(mapWrongLanguage(english, { tag: "und", script: null })).toBe(false);
  });
});

describe("map items: opaque ids", () => {
  const drafts: MapItemDraft[] = [0, 1, 2].flatMap((listIndex) => [0, 1, 2].map((position) =>
    point([A, B, C][listIndex]!, listIndex, position, `Point ${String(listIndex)}-${String(position)}`)));

  it("numbers points pt01.. and answers ca01.., short enough to survive the practice redaction", () => {
    const items = mapAssignItemIds([...drafts, { kind: "ANSWER", seat: A, origin: "BLIND", angleId: null, angleKind: null,
      listIndex: 0, position: 0, answer: "Yes." }], "seed-1");
    expect(items.filter((item) => item.kind === "POINT").map((item) => item.itemId).sort())
      .toEqual(["pt01", "pt02", "pt03", "pt04", "pt05", "pt06", "pt07", "pt08", "pt09"]);
    expect(items.filter((item) => item.kind === "ANSWER").map((item) => item.itemId)).toEqual(["ca01"]);
    expect(items.every((item) => item.itemId.length <= 8)).toBe(true);
  });

  it("is the same for the same seed, and the numbering does not follow the lists for every seed", () => {
    const once = mapAssignItemIds(drafts, "seed-1").map((item) => `${item.itemId}:${item.seat.aiRef}`);
    expect(mapAssignItemIds(drafts, "seed-1").map((item) => `${item.itemId}:${item.seat.aiRef}`)).toEqual(once);
    const grouped = ["seed-1", "seed-2", "seed-3", "seed-4", "seed-5"].every((seed) => {
      const byId = [...mapAssignItemIds(drafts, seed)].sort((a, b) => a.itemId.localeCompare(b.itemId));
      return byId.map((item) => item.listIndex).join("") === "000111222";
    });
    expect(grouped).toBe(false);
  });

  it("continues the numbering after earlier items", () => {
    const first = mapAssignItemIds(drafts, "seed-1");
    expect(mapNextItemNumbers(first)).toEqual({ points: 9, answers: 0 });
    const gap = mapAssignItemIds([point(B, 101, 0, "A new point", "GAP")], "seed-gap", mapNextItemNumbers(first));
    expect(gap.map((item) => item.itemId)).toEqual(["pt10"]);
  });
});

describe("map items: who raised what (computed by code, blind and gap kept apart)", () => {
  const items = mapAssignItemIds([
    point(A, 0, 0, "Shared", "BLIND", "OPPOSITE_CASE", "against_some_answer"),
    point(A2, 1, 0, "Shared", "BLIND", null, "against_some_answer"),
    point(B, 2, 0, "Shared", "BLIND", null, "for_some_answer"),
    point(C, 101, 0, "Shared", "GAP"),
    point(C, 3, 0, "Seen", "SHOWN")
  ], "seed-raise");
  const byId = mapItemsById(items);
  const ids = (claim: string) => items.filter((item) => item.kind === "POINT" && item.claim === claim).map((item) => item.itemId);

  it("counts distinct makers, blind apart from gap; a shown item counts only among all makers", () => {
    expect(mapRaisedBy(ids("Shared"), byId)).toEqual({ blindMakers: ["maker-a", "maker-b"], gapMakers: ["maker-c"],
      makers: ["maker-a", "maker-b", "maker-c"] });
    expect(mapRaisedBy(ids("Seen"), byId)).toEqual({ blindMakers: [], gapMakers: [], makers: ["maker-c"] });
  });

  it("builds a key point with its fixed angle kinds and its lean", () => {
    const keyPoint = mapKeyPoint("kp01", "Shared", ids("Shared"), byId);
    expect(keyPoint.fixedAngleKinds).toEqual(["OPPOSITE_CASE"]);
    expect(keyPoint.leansAgainst).toBe(true);
    expect(keyPoint.blindMakers).toHaveLength(2);
  });

  it("ranks by blind makers, then all makers, then members, then id", () => {
    const one = mapKeyPoint("kp02", "Seen", ids("Seen"), byId);
    const shared = mapKeyPoint("kp01", "Shared", ids("Shared"), byId);
    expect(mapRankKeyPoints([one, shared]).map((keyPoint) => keyPoint.keyPointId)).toEqual(["kp01", "kp02"]);
  });

  it("builds a merged answer that knows when it came from an OPPOSITE_CASE list", () => {
    const answers = mapAssignItemIds([{ kind: "ANSWER", seat: A, origin: "BLIND", angleId: "opp", angleKind: "OPPOSITE_CASE",
      listIndex: 0, position: 0, answer: "No." }], "seed-answer");
    const merged = mapMergedAnswer("an01", "No.", answers.map((item) => item.itemId), mapItemsById(answers));
    expect(merged.fromOppositeCase).toBe(true);
    expect(merged.blindMakers).toEqual(["maker-a"]);
  });
});
