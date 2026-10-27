import { z } from "zod";

export const QUESTION_NOT_STARTED = "QUESTION_NOT_STARTED" as const;
export const QUESTION_CHECK_UNAVAILABLE = "QUESTION_CHECK_UNAVAILABLE" as const;
export const QUESTION_NOT_STARTED_KINDS = [
  "HARM_TO_OTHERS", "WEAPONS_DRUGS_TERRORISM", "CRIME", "HATE_SPEECH", "RELIGIOUS_INSULT", "SENSITIVE_TOPIC"
] as const;
export type QuestionNotStartedKind = typeof QUESTION_NOT_STARTED_KINDS[number];

export const QuestionNotStartedSchema = z.object({
  error: z.literal(QUESTION_NOT_STARTED),
  message: z.literal(QUESTION_NOT_STARTED),
  kind: z.enum(QUESTION_NOT_STARTED_KINDS)
}).strict();
