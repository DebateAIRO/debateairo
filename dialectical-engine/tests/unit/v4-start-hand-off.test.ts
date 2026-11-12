import { afterEach, describe, expect, it } from "vitest";
import { clearHandOff, handOffFor, handOffStart, START_HAND_OFF_MS, type StartHandOff } from "../../apps/ui/lib/v4/startHandOff.js";

/*
 * So there is no blank page while the map takes long: after Start's Undo window the ask page hands the question and its
 * paths to the map page in this tab's memory only, for START_HAND_OFF_MS. The map page finds its own run's hand-off while
 * it is young, and never another run's. All words are made up.
 */

const T = 1_800_000_000_000;

function handOff(runId: string, at: number, questionLine = "Should the town build a new bridge?"): StartHandOff {
  return {
    runId, questionLine, level: "plain", at,
    paths: [
      { title: "The cost to the town", question: "Can the town pay for it?", tag: null },
      { title: "Traffic on the old bridge", question: "Does the old bridge carry too much?", tag: "ADDED" }
    ]
  };
}

afterEach(() => {
  clearHandOff("run-1");
  clearHandOff("run-2");
});

describe("the hand-off between Start and the map (page memory only)", () => {
  it("lives for a minute", () => {
    expect(START_HAND_OFF_MS).toBe(60_000);
  });

  it("is found for its own run while it is young", () => {
    const given = handOff("run-1", T);
    handOffStart(given);
    expect(handOffFor("run-1", T)).toEqual(given);
    expect(handOffFor("run-1", T + 59_999)).toEqual(given);
  });

  it("is never another run's", () => {
    handOffStart(handOff("run-1", T));
    expect(handOffFor("run-2", T)).toBeNull();
  });

  it("is gone once it is older than START_HAND_OFF_MS", () => {
    handOffStart(handOff("run-1", T));
    expect(handOffFor("run-1", T + 60_001)).toBeNull();
  });

  it("a second hand-off replaces the first", () => {
    handOffStart(handOff("run-1", T, "The first question?"));
    const second = handOff("run-2", T + 5_000, "The second question?");
    handOffStart(second);
    expect(handOffFor("run-1", T + 5_000)).toBeNull();
    expect(handOffFor("run-2", T + 5_000)).toEqual(second);
    const again = handOff("run-2", T + 6_000, "The second question, asked again?");
    handOffStart(again);
    expect(handOffFor("run-2", T + 6_000)).toEqual(again);
  });

  it("clearHandOff clears only its own run's", () => {
    handOffStart(handOff("run-1", T));
    clearHandOff("run-2");
    expect(handOffFor("run-1", T)).not.toBeNull();
    clearHandOff("run-1");
    expect(handOffFor("run-1", T)).toBeNull();
  });
});
