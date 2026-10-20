import { z } from "zod";

export const SYNTHESIS_CHECK_CATEGORIES = Object.freeze([
  "TERRORISM", "HATE_SPEECH", "SUICIDE_OR_HARM_TO_OTHERS", "WEAPONS_OR_DRUGS"
] as const);
export type SynthesisCheckCategory = typeof SYNTHESIS_CHECK_CATEGORIES[number];

export const SYNTHESIS_CHECK_CATEGORY_WORDS: Readonly<Record<SynthesisCheckCategory, string>> = Object.freeze({
  TERRORISM: "Possible terrorism",
  HATE_SPEECH: "hate speech of any kind",
  SUICIDE_OR_HARM_TO_OTHERS: "tendencies to suicide or harming other people",
  WEAPONS_OR_DRUGS: "crafting weapons or drugs"
});

export const SYNTHESIS_CHECK_FAILURE_CODES = Object.freeze([
  "NOT_CONFIGURED", "DOOR_REFUSED", "TRANSPORT_FAILED", "HTTP_STATUS", "DEADLINE",
  "ANSWER_NOT_JSON", "ANSWER_SCHEMA", "MONEY_REFUSED", "UNEXPECTED"
] as const);
export type SynthesisCheckFailureCode = typeof SYNTHESIS_CHECK_FAILURE_CODES[number];

export const SYNTHESIS_VERDICTS = Object.freeze(["CLEAR", "FLAGGED", "NO_SYNTHESIS", "UNAVAILABLE"] as const);
export type SynthesisVerdict = typeof SYNTHESIS_VERDICTS[number];

export const SynthesisFlagSchema = z.object({ verdict: z.literal("FLAGGED") }).strict();
export type SynthesisFlag = z.infer<typeof SynthesisFlagSchema>;
export const SynthesisCheckHoldSchema = z.literal("CHECKING");
export const RemovalNoticeTakeSchema = z.object({ notice: z.boolean() }).strict();
export type RemovalNoticeTake = z.infer<typeof RemovalNoticeTakeSchema>;

export type SynthesisCheckOutcome =
  | Readonly<{ verdict: "CLEAR" | "NO_SYNTHESIS"; categories: readonly [] }>
  | Readonly<{ verdict: "FLAGGED"; categories: readonly SynthesisCheckCategory[] }>
  | Readonly<{ verdict: "UNAVAILABLE"; categories: readonly []; failureCode: SynthesisCheckFailureCode }>;

export const PUBLICATION_APPROVAL_REQUIRED = "PUBLICATION_APPROVAL_REQUIRED" as const;
export const DEBATE_REMOVED_BY_CHECK = "DEBATE_REMOVED_BY_CHECK" as const;

export function removesDebate(outcome: SynthesisCheckOutcome): boolean {
  return outcome.verdict === "FLAGGED" && outcome.categories.includes("SUICIDE_OR_HARM_TO_OTHERS");
}
