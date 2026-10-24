import type { QuestionCheckOutcome } from "./contract.js";
import { CRISIS_SUPPORT_OFFERED } from "@debateai/contract";
import { exhaustive } from "@debateai/kernel";

export interface AskQuestionCheck {
  check(questionLine: string): Promise<QuestionCheckOutcome>;
  keep(input: Readonly<{ questionLine: string; accountUserId: string | null }>): Promise<void>;
}

export function keepFailureCode(error: unknown): string {
  const candidate = typeof error === "object" && error !== null && "code" in error ? error.code : null;
  return typeof candidate === "string" && /^[A-Z0-9_]{1,64}$/u.test(candidate)
    ? candidate : "QUESTION_CHECK_KEEP_FAILED";
}

export function answerForOutcome(outcome: QuestionCheckOutcome, country: string | null):
  Readonly<{ status: 422 | 503; body: Readonly<Record<string, string | null>> }> | null {
  switch (outcome.outcome) {
    case "PASS": return null;
    case "CRISIS": return {
      status: 422,
      body: { error: CRISIS_SUPPORT_OFFERED, message: CRISIS_SUPPORT_OFFERED, country }
    };
    case "REFUSE": return {
      status: 422,
      body: { error: "QUESTION_NOT_STARTED", message: "QUESTION_NOT_STARTED", kind: outcome.kind }
    };
    case "UNAVAILABLE": return {
      status: 503,
      body: { error: "QUESTION_CHECK_UNAVAILABLE", message: "QUESTION_CHECK_UNAVAILABLE" }
    };
    default: return exhaustive(outcome);
  }
}
