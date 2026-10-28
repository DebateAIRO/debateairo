export const QUESTION_CHECK_FAILURE_CODES = [
  "QUESTION_CHECK_NOT_CONFIGURED",
  "QUESTION_CHECK_DOOR_REFUSED",
  "QUESTION_CHECK_TRANSPORT_FAILED",
  "QUESTION_CHECK_HTTP_STATUS",
  "QUESTION_CHECK_DEADLINE",
  "QUESTION_CHECK_ANSWER_NOT_JSON",
  "QUESTION_CHECK_ANSWER_SCHEMA",
  "QUESTION_CHECK_BUDGET_REFUSED",
  "QUESTION_CHECK_SPEND_RECORD_DOWN"
] as const;
export type QuestionCheckFailureCode = typeof QUESTION_CHECK_FAILURE_CODES[number];

export type QuestionCheckOutcome =
  | { outcome: "PASS" }
  | { outcome: "CRISIS" }
  /** `kind` is the subject id from the subjects file (V, 2026-10-28); nothing of the question is kept. */
  | { outcome: "REFUSE"; kind: string; screen: "REFUSE" | "SENSITIVE"; emergencyNumber: boolean }
  | { outcome: "UNAVAILABLE"; code: QuestionCheckFailureCode };
