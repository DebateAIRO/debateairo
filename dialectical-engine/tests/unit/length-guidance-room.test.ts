import { describe, expect, it } from "vitest";
import { AskRoomResponseSchema } from "@debateai/contract";
import { debateShapePolicyStartValues, lengthGuidancePolicyStartValues } from "@debateai/register";
import { lengthAnswerWordsFor } from "../../apps/api/src/length-guidance-ask.js";

const FITS = { room: "FITS", scope: null, resets_at: null, waiting_run_ref: null, plan_id: null } as const;

describe("the room read and the length row (spec §3.8; controller ruling Q9)", () => {
  it("today's body is unchanged and still parses", () => {
    expect(AskRoomResponseSchema.parse(FITS)).toEqual(FITS);
  });

  it("carries the answer words and the length switch as their own members", () => {
    const body = { ...FITS, answer_words: { short: 200, standard: 350, detailed: 1000 }, length_settings: true };
    expect(AskRoomResponseSchema.parse(body)).toEqual(body);
    for (const bad of [{ ...FITS, length_settings: false }, { ...FITS, answer_words: { short: 200, standard: 350 } },
      { ...FITS, answer_words: { short: 49, standard: 350, detailed: 1000 } }]) {
      expect(AskRoomResponseSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });

  // Pre-flight PF-C2.1 / PF-C2.6: OVERVIEW C-1's 200 / 350 / 1,000 from both rows (the shape row's since Task 4 Step 3a).
  it("the words come from the length row, else the shape row, else nowhere", () => {
    expect(lengthAnswerWordsFor(lengthGuidancePolicyStartValues(), undefined, "pro")).toEqual({ short: 200, standard: 350, detailed: 1000 });
    expect(lengthAnswerWordsFor(undefined, debateShapePolicyStartValues(), "free")).toEqual({ short: 200, standard: 350, detailed: 1000 });
    expect(lengthAnswerWordsFor(undefined, undefined, "free")).toBeNull();
  });
});
