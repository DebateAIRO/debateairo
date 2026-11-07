/**
 * V4 start step, Task 14 (spec 2026-11-03 §2.6, §4.2): the ask carries, last, the proof of the question checked at Next
 * (`start_check`), the chosen paths (`start_paths`) and the carry-on box (`carry_on_to_report`, only ever true); and the
 * room read says whether the lists run, How wide's widths and the share of today each path count takes. A room read
 * estimates a new question or a dig, never both, so `start_step` never sits beside `dig_share_percent`.
 */
import { describe, expect, it } from "vitest";
import { AskRequestSchema, AskRoomResponseSchema, StartStepRoomSchema, StartStepWidthsSchema } from "@debateai/contract";

const ASK = { question_line: "q", risk_tier: "casual", tier_source: "ASKER", tier_provenance_ref: "asker:test",
  composition_budget_tier: "low", depth_params: { depth: 1 }, decision_scope: "s", as_of: "2026-10-13T00:00:00.000Z",
  steering_presets: [], plan_tier: "free", steering_annotations: [] };
const ROOM = { lists: "ON", widths: { options: [3, 5, 7], default: 5 }, share_by_paths: [2, 3, 5, 6, 8, 9, 11] };
const FITS = { room: "FITS", scope: null, resets_at: null, waiting_run_ref: null, plan_id: "PLUS" };

describe("the ask's start members", () => {
  it("adds the three keys last, each optional", () => {
    // Task 39c's saved_question_id (tests/unit/saved-questions-contract.test.ts) and Task 57e's again_of come after them.
    expect(Object.keys(AskRequestSchema.shape).slice(-5, -2)).toEqual(["start_check", "start_paths", "carry_on_to_report"]);
    for (const key of ["start_check", "start_paths", "carry_on_to_report"] as const) {
      expect(AskRequestSchema.shape[key].safeParse(undefined).success).toBe(true);
    }
    expect(AskRequestSchema.safeParse({ ...ASK, carry_on_to_report: true }).success).toBe(true);
    expect(AskRequestSchema.safeParse({ ...ASK, carry_on_to_report: false }).success).toBe(false);
    expect(AskRequestSchema.safeParse({ ...ASK, start_check: { ref: "a.b" } }).success).toBe(true);
  });
});

describe("the room's start step", () => {
  it("accepts How wide's widths and a share per path count, with or without the share", () => {
    expect(StartStepRoomSchema.safeParse(ROOM).success).toBe(true);
    const { share_by_paths: _share, ...withoutShare } = ROOM;
    expect(StartStepRoomSchema.safeParse(withoutShare).success).toBe(true);
    expect(StartStepRoomSchema.safeParse({ ...ROOM, lists: "OFF" }).success).toBe(true);
  });

  it("refuses a share list of the wrong length, widths that do not rise, a default outside them, and a share above 100", () => {
    expect(StartStepRoomSchema.safeParse({ ...ROOM, share_by_paths: [2, 3, 5, 6, 8, 9] }).success).toBe(false);
    expect(StartStepWidthsSchema.safeParse({ options: [5, 3], default: 3 }).success).toBe(false);
    expect(StartStepWidthsSchema.safeParse({ options: [3, 5, 7], default: 4 }).success).toBe(false);
    expect(StartStepWidthsSchema.safeParse({ options: [3, 5, 7, 7], default: 5 }).success).toBe(false);
    expect(StartStepRoomSchema.safeParse({ ...ROOM, share_by_paths: [2, 3, 5, 6, 8, 9, 101] }).success).toBe(false);
  });

  it("sits beside a new question's share, never beside a dig's", () => {
    expect(AskRoomResponseSchema.safeParse({ ...FITS, start_share_percent: 5, start_step: ROOM }).success).toBe(true);
    expect(AskRoomResponseSchema.safeParse({ ...FITS, dig_share_percent: 5, start_step: ROOM }).success).toBe(false);
  });
});
