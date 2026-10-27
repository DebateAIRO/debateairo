export const QUESTION_CHECK_LABELS = [
  "OWN_CRISIS",
  "METHODS_OR_ENCOURAGEMENT",
  "HARM_TO_OTHERS",
  "WEAPONS_DRUGS_TERRORISM",
  "CRIME",
  "HATE_SPEECH",
  "RELIGIOUS_INSULT",
  "SENSITIVE_TOPIC",
  "ORDINARY"
] as const;

export type QuestionCheckLabel = typeof QUESTION_CHECK_LABELS[number];

export const KEPT_LABELS = ["HARM_TO_OTHERS", "WEAPONS_DRUGS_TERRORISM"] as const;
export const CRISIS_LABELS = ["OWN_CRISIS", "METHODS_OR_ENCOURAGEMENT"] as const;
export const REFUSING_KINDS = [
  "HARM_TO_OTHERS", "WEAPONS_DRUGS_TERRORISM", "CRIME", "HATE_SPEECH", "RELIGIOUS_INSULT", "SENSITIVE_TOPIC"
] as const;
export type RefusingKind = typeof REFUSING_KINDS[number];

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
  | { outcome: "REFUSE"; kind: RefusingKind; kept: boolean }
  | { outcome: "UNAVAILABLE"; code: QuestionCheckFailureCode };
