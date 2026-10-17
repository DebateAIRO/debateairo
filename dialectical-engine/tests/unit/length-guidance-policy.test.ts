import { describe, expect, it } from "vitest";
import {
  LENGTH_GUIDANCE_STEPS, LENGTH_THINKING_ROOM_KEYS, MAP_WORD_TARGET_PARTS, STORY_WORD_TARGET_FIELDS, lengthGuideForBounds
} from "@debateai/kernel";
import {
  LENGTH_GUIDANCE_POLICY_ROW_KEY, lengthAnswerWordsOf, lengthGuidanceAllowanceTokens, lengthGuidanceLargestTokens,
  lengthGuidancePolicyRow, lengthGuidancePolicyStartValues, parseLengthGuidancePolicy, readLengthGuidancePolicy,
  resolveLengthGuidance
} from "@debateai/register";

const START = lengthGuidancePolicyStartValues();
/** A plain, writable copy of the start values, changed at one dotted path. */
function changed(path: string, value: unknown): unknown {
  const copy = JSON.parse(JSON.stringify(START)) as Record<string, unknown>;
  const keys = path.split(".");
  let at: Record<string, unknown> = copy;
  for (const key of keys.slice(0, -1)) at = at[key] as Record<string, unknown>;
  if (value === undefined) delete at[keys.at(-1)!];
  else at[keys.at(-1)!] = value;
  return copy;
}
const refusal = (path: string) => new TypeError(`LENGTH_GUIDANCE_POLICY_INVALID:${path}`);

describe("lengthGuidancePolicy: the start values (spec §7, ruling L24)", () => {
  it("are the spec's numbers, the same for every plan", () => {
    expect(LENGTH_GUIDANCE_POLICY_ROW_KEY).toBe("lengthGuidancePolicy");
    const free = START.plans.free;
    expect(free.steps.opening).toEqual({ short: 180, standard: 300, detailed: 450 });
    expect(free.steps.pros_cons).toEqual({ short: 150, standard: 250, detailed: 380 });
    expect(free.steps.cross_exchange).toEqual({ short: 150, standard: 250, detailed: 380 });
    expect(free.steps.judge_panel).toEqual({ short: 120, standard: 200, detailed: 300 });
    expect(free.steps.reviewer).toEqual({ short: 70, standard: 120, detailed: 180 });
    // OVERVIEW C-1 / owner G5: the answer writer's words are 200 / 350 / 1,000 (pre-flight PF-C1.3).
    expect(free.steps.answer_writer).toEqual({ short: 200, standard: 350, detailed: 1000 });
    expect(free.steps.answer_checker).toEqual({ short: 150, standard: 150, detailed: 150 });
    expect(free.steps.story_checker).toEqual({ short: 250, standard: 250, detailed: 250 });
    // Engine INTERFACE §4.2: the comparing judges and the investigator, the same at every level (pre-flight PF-C1.1).
    expect(free.steps.comparing_judge).toEqual({ short: 80, standard: 80, detailed: 80 });
    expect(free.steps.investigator).toEqual({ short: 60, standard: 60, detailed: 60 });
    expect(free.story).toEqual({ headline: 15, summary: 120, confidence: 30, positionLine: 35, change: 60, whyReason: 100 });
    expect(free.map).toEqual({ claim: 35, whyItMatters: 35, candidateAnswer: 25, angleLabel: 8, angleFocus: 35,
      framingChallenge: 35, chosenAnswer: 35, checkReason: 40 });
    for (const plan of ["plus", "pro", "max", "premium"] as const) expect(START.plans[plan]).toEqual(free);
    // story_writer 65536: owner Q-C2; its parsing here proves the storyteller's bound reaches 65,536 (pre-flight PF-C1.2).
    expect(START.thinkingRoom).toEqual({ opening: 4096, pros_cons: 6144, cross_exchange: 6144, judge_panel: 4096, reviewer: 2048,
      answer_writer: 16384, answer_checker: 2048, story_checker: 12288, comparing_judge: 4096, investigator: 2048,
      story_writer: 65536, map: 8192 });
    expect([START.runawayMultiplier, START.tokensPerWord, START.storyLongReferenceWords]).toEqual([4, 3, 3000]);
    expect(START.charactersPerWord).toEqual({ zh: 1.6, ja: 2, th: 5 });
    expect(START.answerWriterSeesJudgeReasons).toBe(false);
    expect(Object.isFrozen(START.plans.free.steps.opening)).toBe(true);
  });

  it("names exactly the shared vocabulary's keys (no drift from the kernel)", () => {
    expect(Object.keys(START.plans.free.steps)).toEqual([...LENGTH_GUIDANCE_STEPS]);
    expect(Object.keys(START.thinkingRoom)).toEqual([...LENGTH_THINKING_ROOM_KEYS]);
    expect(Object.keys(START.plans.free.story)).toEqual([...STORY_WORD_TARGET_FIELDS]);
    expect(Object.keys(START.plans.free.map)).toEqual([...MAP_WORD_TARGET_PARTS]);
  });

  it("the kernel's request-size guide (lengthGuideForBounds) uses exactly this row's largest words and factor", () => {
    // Task 1 review, minor 3: the kernel retypes 5000 words and a factor of 10; this pins both to the row's own maxima,
    // so the bound a request is framed with can never fall below (or drift above) what a valid row can make.
    const guide = lengthGuideForBounds();
    const largestWords = guide.words;
    const largestFactor = guide.charactersPerWord.th;
    expect(guide.charactersPerWord).toEqual({ zh: largestFactor, ja: largestFactor, th: largestFactor });
    for (const [path, value] of [
      ["plans.free.steps.opening.detailed", largestWords],
      ["plans.free.steps.answer_writer.detailed", largestWords],
      ["plans.free.story.summary", largestWords],
      ["plans.free.map.claim", largestWords],
      ["charactersPerWord.th", largestFactor]
    ] as const) {
      expect(() => parseLengthGuidancePolicy(changed(path, value))).not.toThrow();
    }
    for (const [path, value] of [
      ["plans.free.steps.opening.detailed", largestWords + 1],
      ["plans.free.steps.answer_writer.detailed", largestWords + 1],
      ["plans.free.story.summary", largestWords + 1],
      ["plans.free.map.claim", largestWords + 1],
      ["charactersPerWord.th", largestFactor + 0.000001]
    ] as const) {
      expect(() => parseLengthGuidancePolicy(changed(path, value))).toThrowError(refusal(path));
    }
  });
});

describe("lengthGuidancePolicy: the parser refuses by path (spec §3.1)", () => {
  it.each([
    ["the root", 7, "$"],
    ["a wrong kind", changed("kind", "DEBATE_SHAPE_POLICY"), "kind"],
    ["a missing plan", changed("plans.premium", undefined), "plans.premium"],
    ["an extra plan", changed("plans.gold", START.plans.free), "plans"],
    ["a step word below 5", changed("plans.free.steps.opening.short", 4), "plans.free.steps.opening.short"],
    ["a step word above 5000", changed("plans.pro.steps.reviewer.detailed", 5001), "plans.pro.steps.reviewer.detailed"],
    ["a fraction of a word", changed("plans.free.steps.opening.standard", 300.5), "plans.free.steps.opening.standard"],
    ["the writer below 50", changed("plans.free.steps.answer_writer.short", 49), "plans.free.steps.answer_writer.short"],
    ["a step falling with length", changed("plans.free.steps.opening.short", 301), "plans.free.steps.opening"],
    // Short equal to Standard (350): proves the writer's rise is strict (pre-flight PF-C1.3).
    ["the writer not strictly rising", changed("plans.max.steps.answer_writer.short", 350), "plans.max.steps.answer_writer"],
    ["a story part of 4", changed("plans.free.story.headline", 4), "plans.free.story.headline"],
    ["an unknown map part", changed("plans.free.map.title", 8), "plans.free.map"],
    ["a runaway multiplier of 1", changed("runawayMultiplier", 1), "runawayMultiplier"],
    ["a runaway multiplier of 11", changed("runawayMultiplier", 11), "runawayMultiplier"],
    ["tokens per word of 1.4", changed("tokensPerWord", 1.4), "tokensPerWord"],
    ["tokens per word with 7 decimals", changed("tokensPerWord", 3.1234567), "tokensPerWord"],
    ["a missing thinking room", changed("thinkingRoom.map", undefined), "thinkingRoom.map"],
    ["a thinking room above 32768", changed("thinkingRoom.opening", 32769), "thinkingRoom.opening"],
    // Only the storyteller may go to 65,536 (owner Q-C2, ruling PF-C1.2); one above is refused (pre-flight PF-C1.2).
    ["a storyteller thinking room above 65536", changed("thinkingRoom.story_writer", 65537), "thinkingRoom.story_writer"],
    ["a story reference of 499", changed("storyLongReferenceWords", 499), "storyLongReferenceWords"],
    ["a factor for another language", changed("charactersPerWord.ko", 1.5), "charactersPerWord"],
    ["a factor of 0.4", changed("charactersPerWord.zh", 0.4), "charactersPerWord.zh"],
    // Task 2 review 3: the edges one decimal place past the six allowed, and one above the map's room.
    ["a factor with 7 decimals", changed("charactersPerWord.zh", 1.6000001), "charactersPerWord.zh"],
    ["tokens per word just above 5", changed("tokensPerWord", 5.0000001), "tokensPerWord"],
    ["the map's thinking room above 32768", changed("thinkingRoom.map", 32769), "thinkingRoom.map"],
    ["a judge-reasons switch that is a word", changed("answerWriterSeesJudgeReasons", "no"), "answerWriterSeesJudgeReasons"]
  ])("%s", (_name, value, path) => {
    expect(() => parseLengthGuidancePolicy(value)).toThrowError(refusal(path));
  });

  it("refuses an own __proto__ key by name, never drops it", () => {
    const text = JSON.stringify(START).replace('"steps":{', '"steps":{"__proto__":{"short":1},');
    expect(() => parseLengthGuidancePolicy(JSON.parse(text))).toThrowError(refusal("plans.free.steps.__proto__"));
  });
});

describe("lengthGuidancePolicy: row, read, resolution, allowance", () => {
  it("the row a publisher seals parses back to the same policy, and a blank source ref is refused", () => {
    const row = lengthGuidancePolicyRow(START, "spec 2026-10-15 §7");
    expect(row.rowKey).toBe("lengthGuidancePolicy");
    expect(parseLengthGuidancePolicy(JSON.parse(row.valueJsonText))).toEqual(START);
    expect(row.valueJsonText).toContain("\"tokensPerWord\":3");
    expect(row.valueJsonText).toContain("\"zh\":1.6");
    expect(() => lengthGuidancePolicyRow(START, " ")).toThrowError(refusal("sourceRef"));
  });

  it("reads ABSENT as null and a malformed row as a refusal", async () => {
    const poolOf = (rows: unknown[]) => ({ query: async () => ({ rows }) }) as never;
    await expect(readLengthGuidancePolicy(poolOf([]), 14)).resolves.toBeNull();
    await expect(readLengthGuidancePolicy(poolOf([{ value_json: START }]), 14)).resolves.toEqual(START);
    await expect(readLengthGuidancePolicy(poolOf([{ value_json: { kind: "LENGTH_GUIDANCE_POLICY" } }]), 14))
      .rejects.toThrowError(/^LENGTH_GUIDANCE_POLICY_INVALID:/u);
  });

  it("resolves one plan and answer length; a missing answer length reads as standard", () => {
    const detailed = resolveLengthGuidance({ policy: START, plan: "pro", answerLength: "detailed" });
    expect(detailed.steps).toEqual({ opening: 450, pros_cons: 380, cross_exchange: 380, judge_panel: 300, reviewer: 180,
      answer_writer: 1000, answer_checker: 150, story_checker: 250, comparing_judge: 80, investigator: 60 }); // pre-flight PF-C1.1, PF-C1.3
    expect(detailed.answerLength).toBe("detailed");
    const standard = resolveLengthGuidance({ policy: START, plan: "free", answerLength: undefined });
    expect(standard.answerLength).toBe("standard");
    expect(standard.steps.answer_writer).toBe(350); // pre-flight PF-C1.3
    expect(Object.isFrozen(standard.steps)).toBe(true);
    expect(lengthAnswerWordsOf(START, "plus")).toEqual({ short: 200, standard: 350, detailed: 1000 }); // pre-flight PF-C1.3
  });

  it("sizes the allowance from the guidance and finds the largest any plan and length can ask", () => {
    const standard = resolveLengthGuidance({ policy: START, plan: "free", answerLength: "standard" });
    expect(lengthGuidanceAllowanceTokens(standard, "pros_cons", 8192)).toBe(9144);
    expect(lengthGuidanceAllowanceTokens(standard, "answer_checker", 8192)).toBe(8192);
    expect(lengthGuidanceAllowanceTokens(standard, "pros_cons", 2048)).toBe(9144);
    // Pre-flight PF-C1.3: the writer's Detailed 1,000 words no longer reach the cap; Standard 350 shown too.
    expect(lengthGuidanceAllowanceTokens(resolveLengthGuidance({ policy: START, plan: "free", answerLength: "detailed" }),
      "answer_writer", 8192)).toBe(28384);
    expect(lengthGuidanceAllowanceTokens(standard, "answer_writer", 8192)).toBe(20584);
    expect(lengthGuidanceLargestTokens(START, "pros_cons", 2048)).toBe(10704);
    expect(lengthGuidanceLargestTokens(START, "opening", 2048)).toBe(9496);
  });
});
