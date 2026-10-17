import { describe, expect, it } from "vitest";
import {
  MAP_ANSWER_CHECK_OUTCOMES, MAP_ENGINE_LIMITS, MAP_RESTS_ON, MAP_STEPS, mapAssignItemIds, type MapItemDraft
} from "@debateai/map";
import { ENGINE_VERSION_LIMITS } from "@debateai/register";

const seat = { aiRef: "preview:a", maker: "maker-a" } as const;
const base = { seat, origin: "BLIND" as const, angleId: null, angleKind: null, listIndex: 0 };

/** Engine redesign R3 (spec 2026-10-15 §5.2): the map's engine-2 words, absent from every engine-1 object. */
describe("engine 2: the map's vocabulary", () => {
  it("names what a point rests on, the check's outcomes, its limits and the CHECK step, frozen", () => {
    expect(MAP_RESTS_ON).toEqual(["question", "assumption"]);
    // D4(b) (owner 2026-10-16, deviation 12): three tests; each failed test is named, in the order answer / fact / cost.
    expect(MAP_ANSWER_CHECK_OUTCOMES).toEqual(["PASSED", "NOT_AN_ANSWER", "ADDED_FACT", "NO_COST",
      "NOT_AN_ANSWER+ADDED_FACT", "NOT_AN_ANSWER+NO_COST", "ADDED_FACT+NO_COST", "NOT_AN_ANSWER+ADDED_FACT+NO_COST", "UNCHECKED"]);
    expect(MAP_ANSWER_CHECK_OUTCOMES).not.toContain("BOTH");
    expect(MAP_ENGINE_LIMITS).toEqual({ assumptionsMax: 3, reservesMax: 2, checkIdsMax: 8, candidatesMax: 4 });
    expect(MAP_ENGINE_LIMITS.candidatesMax).toBe(ENGINE_VERSION_LIMITS.answerCheckMax); // the row's range and the map's c1..c4 agree
    expect(MAP_STEPS.at(-1)).toBe("CHECK");
    for (const list of [MAP_RESTS_ON, MAP_ANSWER_CHECK_OUTCOMES, MAP_ENGINE_LIMITS, MAP_STEPS]) expect(Object.isFrozen(list)).toBe(true);
  });

  it("an item keeps what its point rests on when the list said it, and has no such key when it did not", () => {
    const drafts: MapItemDraft[] = [
      { ...base, position: 0, kind: "POINT", claim: "A.", whyItMatters: "W.", leans: "context", restsOn: "assumption" },
      { ...base, position: 1, kind: "POINT", claim: "B.", whyItMatters: "W.", leans: "context" },
      { ...base, position: 0, kind: "ANSWER", answer: "Yes." }
    ];
    const items = mapAssignItemIds(drafts, "seed");
    const withBasis = items.find((item) => item.kind === "POINT" && item.claim === "A.")!;
    const without = items.find((item) => item.kind === "POINT" && item.claim === "B.")!;
    expect(withBasis).toMatchObject({ restsOn: "assumption" });
    expect(Object.hasOwn(without, "restsOn")).toBe(false);
    expect(Object.hasOwn(items.find((item) => item.kind === "ANSWER")!, "restsOn")).toBe(false);
  });
});
