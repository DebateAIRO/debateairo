import { exhaustive, lengthCallStepOf } from "@debateai/kernel";
import type { PreviewCallTier, PreviewModelRow } from "./preview-models.js";

/**
 * V4 start step, Task 2 (spec 2026-11-03 §5): THE ONE FINAL-WRITER RULE for a v2 run (shape receipt DR-185-shape-v2).
 * The call policy sends it (Task 3) and the start-of-debate estimate prices it (Task 4), so the two can never disagree.
 * R22's v1 runs keep their own terms; nothing here changes them.
 */
export type PreviewFinalWriterRole = "ANSWER_WRITER" | "ANSWER_CHECKER" | "STORYTELLER" | "STORY_CHECKER";
/** The plan side of the rule: Free's story is the short one. */
export type PreviewFinalWriterPlan = "free" | "paid";

/**
 * End-of-debate bodies (owner rulings of 29 and 30 Oct: input under 100,000 tokens): at most 195,904 bytes, the path
 * rewrite's line (`PATH_REWRITE_BODY_MAX_BYTES`), which at 2 bytes per token plus the 2,048-token frame is 100,000.
 */
export const PREVIEW_FINAL_WRITER_LIMITS = Object.freeze({ inputBodyMaxBytes: 195_904, inputTokensLine: 100_000 } as const);

/**
 * The owner's F3 caps (30 Oct: 16K for the answer, 80K for the story), equal to the report policy's ceilings
 * (INVESTIGATION_REPORT_POLICY in @debateai/register, which this package does not import; a test pins the two together).
 */
export const PREVIEW_FINAL_WRITER_F3_CAPS = Object.freeze({ answer: 16_384, checker: 8_192, story: 81_920, freeStory: 16_384 } as const);

/** The seats a v2 run's final writers sit in: Haiku writes, GLM checks. */
export const PREVIEW_V2_FINAL_SEATS = Object.freeze({ writer: "claude-haiku-5-5", checker: "zai-org/GLM-5.3-Flash" } as const);

/**
 * Which final writer a call is, from its call-site key, lane and role: the answer writer and checker on the served lane
 * (SYNTHESIZER / EVALUATOR), the storyteller and story checker on the story lane (the same roles). Null for every other
 * call, LG-A's structure-repair calls included.
 */
export function previewFinalWriterRoleOf(request: Readonly<{ callSiteKey: string; lane: string; role: string }>): PreviewFinalWriterRole | null {
  const step = lengthCallStepOf(request.callSiteKey, request.lane);
  if (request.lane === "served") {
    if (step === "answer_writer" && request.role === "SYNTHESIZER") return "ANSWER_WRITER";
    if (step === "answer_checker" && request.role === "EVALUATOR") return "ANSWER_CHECKER";
  }
  if (request.lane === "story") {
    if (step === "story_writer" && request.role === "SYNTHESIZER") return "STORYTELLER";
    if (step === "story_checker" && request.role === "EVALUATOR") return "STORY_CHECKER";
  }
  return null;
}

/** The F3 cap of a role on a plan. */
function f3CapOf(role: PreviewFinalWriterRole, plan: PreviewFinalWriterPlan): number {
  switch (role) {
    case "ANSWER_WRITER": return PREVIEW_FINAL_WRITER_F3_CAPS.answer;
    case "ANSWER_CHECKER": case "STORY_CHECKER": return PREVIEW_FINAL_WRITER_F3_CAPS.checker;
    case "STORYTELLER": return plan === "free" ? PREVIEW_FINAL_WRITER_F3_CAPS.freeStory : PREVIEW_FINAL_WRITER_F3_CAPS.story;
    default: return exhaustive(role);
  }
}

/**
 * What a v2 final writer asks: the F3 cap of its role and plan, never more than the row's storyteller ceiling (a slow
 * row keeps 16,384, owner ruling 12 Oct). Attempt 2 asks the same, never more. The tier is FINAL_WRITER only when the
 * ask is above the row's standard output bound.
 */
export function previewFinalWriterAsk(row: PreviewModelRow, role: PreviewFinalWriterRole, attempt: 1 | 2,
  plan: PreviewFinalWriterPlan): Readonly<{ maxTokens: number; tier: PreviewCallTier }> {
  void attempt;
  const maxTokens = Math.min(f3CapOf(role, plan), row.storytellerTokenCeiling);
  return Object.freeze({ maxTokens, tier: maxTokens > row.outputBound ? "FINAL_WRITER" : "STANDARD" });
}
