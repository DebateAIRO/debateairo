import { describe, expect, it } from "vitest";
import {
  mapAddGapPoints, mapApplyMerge, mapAssignItemIds, mapCodeMerge, mapGroupRestsOn, type MapItemDraft, type MapPointItem, type MapRestsOn
} from "@debateai/map";

const seat = (n: number) => ({ aiRef: `preview:${String(n)}`, maker: `maker-${String(n)}` });
const draft = (n: number, claim: string, restsOn?: MapRestsOn): MapItemDraft => ({ seat: seat(n), origin: "BLIND", angleId: null, angleKind: null,
  listIndex: n, position: 0, kind: "POINT", claim, whyItMatters: "W.", leans: "context", ...(restsOn === undefined ? {} : { restsOn }) });

/** P2.2 (spec 2026-10-15 §5.2 item 2): "a group with any assumption member is an assumption" — code's merge rule. */
describe("what a point rests on, through the merge", () => {
  it("the group rule: any assumption wins; all question is question; nothing said is nothing (engine 1)", () => {
    expect(mapGroupRestsOn(["question", "assumption"])).toBe("assumption");
    expect(mapGroupRestsOn(["question", "question"])).toBe("question");
    expect(mapGroupRestsOn(["question"], "assumption")).toBe("assumption");
    expect(mapGroupRestsOn([undefined, undefined])).toBeUndefined();
  });

  it("the merger cannot turn an assumption member into a question; code merge and gap joins follow the members", () => {
    const items = mapAssignItemIds([draft(0, "Riders are workers.", "assumption"), draft(1, "Riders are workers.", "question"),
      draft(2, "Costs rise.", "question")], "seed");
    // Ids are opaque and not in draft order (mapAssignItemIds): pick them by claim.
    const idsOf = (claim: string) => items.filter((item) => item.kind === "POINT" && item.claim === claim).map((item) => item.itemId);
    const merged = mapApplyMerge({ key_points: [{ key_point_id: "k1", claim: "Riders are workers.", rests_on: "question",
      member_item_ids: idsOf("Riders are workers.") }, { key_point_id: "k2", claim: "Costs rise.", rests_on: "question", member_item_ids: idsOf("Costs rise.") }],
      answers: [] }, items);
    const byClaim = (claim: string) => merged.keyPoints.find((keyPoint) => keyPoint.claim === claim)!;
    expect(byClaim("Riders are workers.").restsOn).toBe("assumption");
    expect(byClaim("Costs rise.").restsOn).toBe("question");
    expect(mapCodeMerge(items).keyPoints.find((keyPoint) => keyPoint.claim === "Riders are workers.")!.restsOn).toBe("assumption");
    const gap = mapAssignItemIds([{ ...draft(3, "Costs rise.", "assumption"), origin: "GAP" }], "gap", { points: 3, answers: 0 }) as readonly MapPointItem[];
    const joined = mapAddGapPoints(merged, [...items, ...gap], gap).map.keyPoints.find((keyPoint) => keyPoint.claim === "Costs rise.")!;
    expect(joined.restsOn).toBe("assumption");
  });

  it("engine 1: an item, a key point and a merge carry no rests_on member at all", () => {
    const items = mapAssignItemIds([draft(0, "A."), draft(1, "B.")], "seed");
    for (const item of items) expect(Object.hasOwn(item, "restsOn")).toBe(false);
    for (const keyPoint of mapCodeMerge(items).keyPoints) expect(Object.hasOwn(keyPoint, "restsOn")).toBe(false);
  });
});
