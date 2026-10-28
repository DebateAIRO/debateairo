import { z } from "zod";

export const QUESTION_NOT_STARTED = "QUESTION_NOT_STARTED" as const;
export const QUESTION_CHECK_UNAVAILABLE = "QUESTION_CHECK_UNAVAILABLE" as const;
/** The refusal screens a question can get; the crisis screen travels as CRISIS_SUPPORT_OFFERED instead. */
export const QUESTION_NOT_STARTED_SCREENS = ["REFUSE", "SENSITIVE"] as const;
export type QuestionNotStartedScreen = typeof QUESTION_NOT_STARTED_SCREENS[number];
/** V, 2026-10-28: `kind` is a subject id from the API's subjects file, so a subject added there needs no client change. */
export type QuestionNotStarted = Readonly<{ kind: string; screen: QuestionNotStartedScreen; emergencyNumber: boolean }>;

export const QuestionNotStartedSchema = z.object({
  error: z.literal(QUESTION_NOT_STARTED),
  message: z.literal(QUESTION_NOT_STARTED),
  kind: z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/u),
  screen: z.enum(QUESTION_NOT_STARTED_SCREENS),
  emergency_number: z.boolean()
}).strict();
