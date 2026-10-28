import type { QuestionCheckOutcome } from "./contract.js";
import { CRISIS_SUPPORT_OFFERED } from "@debateai/contract";
import { exhaustive } from "@debateai/kernel";

/** V, 2026-10-28: the check answers and keeps nothing; there is no keep step. */
export interface AskQuestionCheck {
  check(questionLine: string): Promise<QuestionCheckOutcome>;
}

export function answerForOutcome(outcome: QuestionCheckOutcome, country: string | null):
  Readonly<{ status: 422 | 503; body: Readonly<Record<string, string | boolean | null>> }> | null {
  switch (outcome.outcome) {
    case "PASS": return null;
    case "CRISIS": return {
      status: 422,
      body: { error: CRISIS_SUPPORT_OFFERED, message: CRISIS_SUPPORT_OFFERED, country }
    };
    case "REFUSE": return {
      status: 422,
      body: { error: "QUESTION_NOT_STARTED", message: "QUESTION_NOT_STARTED", kind: outcome.kind, screen: outcome.screen,
        emergency_number: outcome.emergencyNumber }
    };
    case "UNAVAILABLE": return {
      status: 503,
      body: { error: "QUESTION_CHECK_UNAVAILABLE", message: "QUESTION_CHECK_UNAVAILABLE" }
    };
    default: return exhaustive(outcome);
  }
}
