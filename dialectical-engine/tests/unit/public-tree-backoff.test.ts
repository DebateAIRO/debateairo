import { describe, expect, it } from "vitest";
import type { PublicDebate } from "@debateai/contract";
import type { PublicationCheckResult, PublicationContentCheck } from "../../apps/api/src/publication-check/check.js";
import { backedOffContentCheck } from "../../apps/api/src/public-tree.js";
import { crisisWordsOf } from "../../apps/ui/lib/v4/askText.js";

const request = { runId: "11111111-1111-4111-8111-111111111111", snapshot: {} as PublicDebate };

describe("a judge that is down is no cost loop", () => {
  function world(answers: readonly PublicationCheckResult[]) {
    let clock = 0;
    let calls = 0;
    const real: PublicationContentCheck = { check: async () => answers[Math.min(calls++, answers.length - 1)]! };
    return { gated: backedOffContentCheck(real, { now: () => clock, firstWaitMs: 60_000, longestWaitMs: 240_000 }), calls: () => calls, pass: (ms: number) => { clock += ms; } };
  }
  const down: PublicationCheckResult = { outcome: "UNAVAILABLE", cause: "JUDGE_DEADLINE" };

  it("waits a minute, then two, then four, and never past the longest; a sweep every 15 seconds calls nothing in between", async () => {
    const { gated, calls, pass } = world([down]);
    expect((await gated.check(request)).outcome).toBe("UNAVAILABLE");
    expect(calls()).toBe(1);
    for (let tick = 0; tick < 3; tick += 1) { pass(15_000); expect((await gated.check(request)).outcome).toBe("UNAVAILABLE"); }
    expect(calls()).toBe(1);
    pass(15_000);
    await gated.check(request);
    expect(calls()).toBe(2);
    pass(119_000);
    await gated.check(request);
    expect(calls()).toBe(2);
    pass(1_000);
    await gated.check(request);
    expect(calls()).toBe(3);
    pass(240_000);
    await gated.check(request);
    expect(calls()).toBe(4);
    pass(240_000);
    await gated.check(request);
    expect(calls()).toBe(5);
  });

  it("the first real answer ends the wait; a refusal is an answer", async () => {
    const { gated, calls, pass } = world([down, { outcome: "ALLOW" }, { outcome: "ALLOW" }]);
    await gated.check(request);
    pass(60_000);
    expect((await gated.check(request)).outcome).toBe("ALLOW");
    expect((await gated.check(request)).outcome).toBe("ALLOW");
    expect(calls()).toBe(3);
  });

  it("a check that throws counts as down", async () => {
    let calls = 0;
    let clock = 0;
    const gated = backedOffContentCheck({ check: async () => { calls += 1; throw new Error("X"); } }, { now: () => clock });
    await expect(gated.check(request)).rejects.toThrow("X");
    expect((await gated.check(request)).outcome).toBe("UNAVAILABLE");
    expect(calls).toBe(1);
    clock += 60_000;
    await expect(gated.check(request)).rejects.toThrow("X");
  });
});

describe("the crisis pop-up reads a person's own words everywhere", () => {
  const pick = (kind: string, text: string) => ({ kind, text });
  it("in a dig, on the map or on a public page, their own views and never the AI's suggestions or the dig's written question", () => {
    const parent = { picks: [pick("OWN_VIEW", "my words"), pick("NEEDS_MORE_WEB", "the AI's words")] };
    expect(crisisWordsOf("dig", "the dig's AI-written question", parent)).toEqual(["my words"]);
    expect(crisisWordsOf("dig", "the dig's AI-written question", null)).toEqual([]);
    expect(crisisWordsOf("ask", "the typed question", null)).toEqual(["the typed question"]);
  });
});
