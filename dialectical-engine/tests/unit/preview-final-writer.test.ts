/**
 * V4 start step, Task 2 (spec 2026-11-03 §5): one final-writer rule for v2 runs. The four final writers ask the owner's
 * F3 caps (answer 16,384, checkers 8,192, story 81,920, Free story 16,384), never more than the row's storyteller
 * ceiling (a slow row keeps 16,384, owner ruling 12 Oct); attempt 2 never asks more; the tier is FINAL_WRITER only when
 * the ask is above the row's standard output bound. End-of-debate bodies stay under 195,904 bytes, the same line as
 * the path rewrite's, so the input stays under 100,000 tokens.
 */
import { describe, expect, it } from "vitest";
import {
  PREVIEW_FINAL_WRITER_F3_CAPS, PREVIEW_FINAL_WRITER_LIMITS, PREVIEW_MODEL_ROWS, PREVIEW_V2_FINAL_SEATS, previewCallTierOf,
  previewFinalWriterAsk, previewFinalWriterRoleOf, previewModelRow, type PreviewFinalWriterPlan,
  type PreviewFinalWriterRole, type PreviewModelRow
} from "@debateai/providers";
import { INVESTIGATION_REPORT_POLICY } from "@debateai/register";
import { PATH_REWRITE_BODY_MAX_BYTES } from "../../apps/runner/src/path-rewrite-material.js";

const GLM = "zai-org/GLM-5.3-Flash";
const DEEPSEEK = "deepseek-ai/DeepSeek-V4.1-Flash";
const MIMO = "XiaomiMiMo/MiMo-V2.6-Pro";
const QWEN = "Qwen/Qwen3.8-Flash";
const HAIKU = "claude-haiku-5-5";
const ROLES: readonly PreviewFinalWriterRole[] = ["ANSWER_WRITER", "ANSWER_CHECKER", "STORYTELLER", "STORY_CHECKER"];
const PLANS: readonly PreviewFinalWriterPlan[] = ["free", "paid"];

function rowOf(model: string): PreviewModelRow {
  const row = previewModelRow(model);
  if (row === undefined) throw new Error(`no preview row for ${model}`);
  return row;
}

/** The expected [maxTokens, tier] of a role on a plan, for a fast row (Haiku, DeepSeek) or a slow one (GLM, MiMo, Qwen). */
function expected(role: PreviewFinalWriterRole, plan: PreviewFinalWriterPlan, slow: boolean): readonly [number, string] {
  if (role === "ANSWER_WRITER") return [16_384, "STANDARD"];
  if (role === "ANSWER_CHECKER" || role === "STORY_CHECKER") return [8_192, "STANDARD"];
  if (slow || plan === "free") return [16_384, "STANDARD"];
  return [81_920, "FINAL_WRITER"];
}

describe("the shared final-writer rule", () => {
  it("keeps the F3 caps equal to the report policy's ceilings", () => {
    expect(PREVIEW_FINAL_WRITER_F3_CAPS).toEqual({
      answer: INVESTIGATION_REPORT_POLICY.answerBound.tokenCeiling, checker: INVESTIGATION_REPORT_POLICY.checkerBound.tokenCeiling,
      story: INVESTIGATION_REPORT_POLICY.storyBound.tokenCeiling, freeStory: INVESTIGATION_REPORT_POLICY.freeStoryBound.tokenCeiling
    });
  });

  it("keeps end-of-debate bodies on the path rewrite's line, under 100,000 tokens", () => {
    expect(PREVIEW_FINAL_WRITER_LIMITS.inputBodyMaxBytes / 2 + 2_048).toBe(100_000);
    expect(PREVIEW_FINAL_WRITER_LIMITS.inputTokensLine).toBe(100_000);
    expect(PREVIEW_FINAL_WRITER_LIMITS.inputBodyMaxBytes).toBe(PATH_REWRITE_BODY_MAX_BYTES);
  });

  it("names the v2 final seats", () => {
    expect(PREVIEW_V2_FINAL_SEATS).toEqual({ writer: HAIKU, checker: GLM });
  });

  it("asks each row's capped tokens per role and plan; attempt 2 equals attempt 1", () => {
    for (const [model, slow] of [[HAIKU, false], [DEEPSEEK, false], [GLM, true], [MIMO, true], [QWEN, true]] as const) {
      const row = rowOf(model);
      for (const role of ROLES) {
        for (const plan of PLANS) {
          const first = previewFinalWriterAsk(row, role, 1, plan);
          expect([first.maxTokens, first.tier], `${model} ${role} ${plan}`).toEqual(expected(role, plan, slow));
          expect(previewFinalWriterAsk(row, role, 2, plan)).toEqual(first);
        }
      }
    }
  });

  it("never asks more than the row's storyteller ceiling, and FINAL_WRITER only above the row's standard bound", () => {
    for (const row of PREVIEW_MODEL_ROWS) {
      for (const role of ROLES) {
        for (const plan of PLANS) {
          const ask = previewFinalWriterAsk(row, role, 1, plan);
          expect(ask.maxTokens).toBeLessThanOrEqual(row.storytellerTokenCeiling);
          expect(ask.tier).toBe(ask.maxTokens > row.outputBound ? "FINAL_WRITER" : "STANDARD");
        }
      }
    }
  });

  it("reads the role of a call site from its key, lane and role", () => {
    expect(previewFinalWriterRoleOf({ callSiteKey: "COMPOSER:SYNTHESIZER:INITIAL:1", lane: "served", role: "SYNTHESIZER" })).toBe("ANSWER_WRITER");
    expect(previewFinalWriterRoleOf({ callSiteKey: "POST_COMPOSE_R9:EVALUATOR:1", lane: "served", role: "EVALUATOR" })).toBe("ANSWER_CHECKER");
    expect(previewFinalWriterRoleOf({ callSiteKey: "STORY:STORYTELLER:1", lane: "story", role: "SYNTHESIZER" })).toBe("STORYTELLER");
    expect(previewFinalWriterRoleOf({ callSiteKey: "STORY:CHECKER:1", lane: "story", role: "EVALUATOR" })).toBe("STORY_CHECKER");
    expect(previewFinalWriterRoleOf({ callSiteKey: "JUDGE:critic:node-1", lane: "served", role: "JUDGE" })).toBeNull();
    expect(previewFinalWriterRoleOf({ callSiteKey: "REPAIR:STRUCTURE:STORY:STORYTELLER:1", lane: "story", role: "SYNTHESIZER" })).toBeNull();
  });

  it("keeps the call tier in step with the role: FINAL_WRITER exactly for the four roles", () => {
    for (const request of [
      { callSiteKey: "COMPOSER:SYNTHESIZER:INITIAL:1", lane: "served", role: "SYNTHESIZER" },
      { callSiteKey: "STORY:CHECKER:1", lane: "story", role: "EVALUATOR" },
      { callSiteKey: "JUDGE:critic:node-1", lane: "served", role: "JUDGE" },
      { callSiteKey: "REPAIR:STRUCTURE:STORY:STORYTELLER:1", lane: "story", role: "SYNTHESIZER" },
      { callSiteKey: "STORY:STORYTELLER:1", lane: "served", role: "SYNTHESIZER" }
    ]) {
      expect(previewCallTierOf(request)).toBe(previewFinalWriterRoleOf(request) === null ? "STANDARD" : "FINAL_WRITER");
    }
  });
});
