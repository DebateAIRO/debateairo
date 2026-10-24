import type { QuestionNotStartedKind } from "@debateai/contract";

/** Terms section named by each refusal reason. Keep the locale text in home.json. */
export const TERMS_SECTION_OF_KIND: Readonly<Record<QuestionNotStartedKind, string>> = Object.freeze({
  HARM_TO_OTHERS: "7",
  WEAPONS_DRUGS_TERRORISM: "7",
  HATE_SPEECH: "7",
  RELIGIOUS_INSULT: "7",
  SENSITIVE_TOPIC: "7"
});
