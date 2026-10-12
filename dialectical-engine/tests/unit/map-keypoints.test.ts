import { describe, expect, it } from "vitest";
import {
  mapAddGapPoints,
  mapApplyMerge,
  mapAssignItemIds,
  mapCodeMerge,
  mapItemsById,
  mapNextItemNumbers,
  mapSingletonMap,
  type MapItem,
  type MapItemDraft,
  type MapPointItem,
  type MapSeat
} from "@debateai/map";

const A: MapSeat = { aiRef: "ai-a", maker: "maker-a" };
const B: MapSeat = { aiRef: "ai-b", maker: "maker-b" };
const C: MapSeat = { aiRef: "ai-c", maker: "maker-c" };
const p = (seat: MapSeat, listIndex: number, position: number, claim: string, origin: "BLIND" | "GAP" = "BLIND"): MapItemDraft =>
  ({ kind: "POINT", seat, origin, angleId: null, angleKind: null, listIndex, position, claim, whyItMatters: "Why.", leans: "context" });
const a = (seat: MapSeat, listIndex: number, answer: string): MapItemDraft =>
  ({ kind: "ANSWER", seat, origin: "BLIND", angleId: null, angleKind: null, listIndex, position: 0, answer });
const items: readonly MapItem[] = mapAssignItemIds([
  p(A, 0, 0, "Fares pay for repairs."), p(B, 1, 0, "fares pay for REPAIRS"), p(B, 1, 1, "Free rides cut traffic."),
  a(A, 0, "No."), a(B, 1, "no")
], "seed-kp");
const idOf = (text: string) => items.find((item) => (item.kind === "POINT" ? item.claim : item.answer) === text)!.itemId;

describe("map key points: the code merge (MAP_MERGE_FALLBACK)", () => {
  it("groups claims identical after normalisation; everything else stays its own point", () => {
    const merged = mapCodeMerge(items);
    expect(merged.keyPoints.map((keyPoint) => keyPoint.memberItemIds.length).sort()).toEqual([1, 2]);
    expect(merged.keyPoints.map((keyPoint) => keyPoint.keyPointId)).toEqual(["kp01", "kp02"]);
    const fares = merged.keyPoints.find((keyPoint) => keyPoint.memberItemIds.length === 2)!;
    expect(fares.blindMakers).toEqual(["maker-a", "maker-b"]);
    expect(merged.mergedAnswers).toHaveLength(1);
    expect(merged.mergedAnswers[0]!.answerId).toBe("an01");
  });
});

describe("map key points: apply the merge AI's groups", () => {
  it("numbers its groups in its order, uses its claims, and keeps left-out items as their own points", () => {
    const applied = mapApplyMerge({
      key_points: [{ key_point_id: "x", claim: "Fares fund repairs.", member_item_ids: [idOf("Fares pay for repairs."), idOf("fares pay for REPAIRS")] }],
      answers: [{ answer_id: "y", answer: "No.", member_item_ids: [idOf("No.")] }]
    }, items);
    expect(applied.keyPoints.map((keyPoint) => `${keyPoint.keyPointId}:${keyPoint.claim}`)).toEqual(["kp01:Fares fund repairs.", "kp02:Free rides cut traffic."]);
    expect(applied.mergedAnswers.map((answer) => `${answer.answerId}:${answer.answer}`)).toEqual(["an01:No.", "an02:no"]);
    expect([...applied.omittedItemIds].sort()).toEqual([idOf("Free rides cut traffic."), idOf("no")].sort());
  });
});

describe("map key points: snowball singletons (arm A)", () => {
  it("makes every point its own key point and groups answers by text", () => {
    const single = mapSingletonMap(items);
    expect(single.keyPoints).toHaveLength(3);
    expect(single.mergedAnswers).toHaveLength(1);
  });
});

describe("map key points: gap additions", () => {
  it("joins a gap point that restates a key point (as a gap maker) and counts only new ones", () => {
    const start = mapCodeMerge(items);
    const gapItems = mapAssignItemIds([p(C, 101, 0, "Fares pay for repairs!", "GAP"), p(C, 101, 1, "Night buses matter.", "GAP")],
      "seed-gap", mapNextItemNumbers(items)) as readonly MapPointItem[];
    const added = mapAddGapPoints(start, [...items, ...gapItems], gapItems);
    expect(added.newKeyPoints).toBe(1);
    const fares = added.map.keyPoints.find((keyPoint) => keyPoint.memberItemIds.includes(idOf("Fares pay for repairs.")))!;
    expect(fares.gapMakers).toEqual(["maker-c"]);
    expect(fares.blindMakers).toEqual(["maker-a", "maker-b"]);
    expect(added.map.keyPoints.at(-1)!.keyPointId).toBe("kp03");
  });

  it("numbers gap points and gap answers after the points AND answers already made, so no id is reused", () => {
    // mapNextItemNumbers must be given ALL items so far: a points-only list would hand out ca01 again.
    const gap = mapAssignItemIds([
      p(C, 101, 0, "Fares pay for repairs!", "GAP"),
      p(C, 101, 1, "Night buses matter.", "GAP"),
      { kind: "ANSWER", seat: C, origin: "GAP", angleId: null, angleKind: null, listIndex: 101, position: 0, answer: "Yes." }
    ], "seed-gap-ids", mapNextItemNumbers(items));
    const existing = new Set(items.map((item) => item.itemId));
    expect(gap.filter((item) => existing.has(item.itemId))).toEqual([]);
    expect(gap.filter((item) => item.kind === "ANSWER").map((item) => item.itemId)).toEqual(["ca03"]);
    const gapPoints = gap.filter((item): item is MapPointItem => item.kind === "POINT");
    // mapAddGapPoints builds mapItemsById over items plus gap items, so any collision would throw here.
    const added = mapAddGapPoints(mapCodeMerge(items), [...items, ...gapPoints], gapPoints);
    expect(added.newKeyPoints).toBe(1);
  });
});

describe("map items: a duplicate item id is refused, never overwritten", () => {
  it("throws MAP_ITEM_ID_DUPLICATE when two items share an itemId", () => {
    const first = items[0]!;
    expect(() => mapItemsById([first, first])).toThrow(TypeError);
    expect(() => mapItemsById([first, first])).toThrow("MAP_ITEM_ID_DUPLICATE");
    expect(() => mapCodeMerge([first, first])).toThrow("MAP_ITEM_ID_DUPLICATE");
  });

  it("accepts a list whose ids are all distinct", () => {
    expect(mapItemsById(items).size).toBe(items.length);
  });
});
