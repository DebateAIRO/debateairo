import type { PromptContract } from "@debateai/providers";

export const QUESTION_CHECK_CONTRACT_ID = "question.start-check.v1";

/** S04-R6 row 3, from the history edge through the V-78 stop, without its V-58 citation tag. */
export const QUESTION_CHECK_ROW_3_TEXT = "a question about violence as a subject of history, law or ethics that asks no one whether or how to harm a person is not this label, and neither is a question about violence as a subject of politics, current affairs or public policy, including whether a state, an army or the police should use force, such as \"Should NATO strike Russian bases?\", \"Should police use rubber bullets?\" or \"Should Iranian protesters take up arms against the regime?\"; a question that asks how to hurt someone, that threatens or plans an attack, or that asks whether anyone other than a state, an army or the police should kill or attack a named or identifiable person or unarmed people, is this label whatever its political aim";

export function questionCheckContract(): PromptContract {
  return {
    contractId: QUESTION_CHECK_CONTRACT_ID,
    instruction: [
      "Read the question line and select exactly one label. A question counts whether its wording is explicit or indirect. Use the first row that applies, in this order:",
      "OWN_CRISIS: The question reads as its asker, or someone close to them, thinking about ending their life or harming themselves.",
      "METHODS_OR_ENCOURAGEMENT: The question asks for methods, means, doses or places of suicide or self-harm, or for encouragement to do it.",
      `HARM_TO_OTHERS: The question threatens, plans, or asks whether or how to hurt, kill or poison another person or other people, whether or not it names or identifies anyone, including carrying out an attack on unnamed people (terrorism); ${QUESTION_CHECK_ROW_3_TEXT}.`,
      "WEAPONS_DRUGS_TERRORISM: The question asks how to make weapons, explosives, poisons or drugs, or how to support a terrorist act, or praises one; a question about carrying out an attack on people is HARM_TO_OTHERS.",
      "HATE_SPEECH: The question uses hate speech: it attacks, demeans or incites hatred against people because of who they are, or asks for content that does.",
      "RELIGIOUS_INSULT: The question uses religious insult: it insults or mocks a religion, its believers or what they hold sacred, or asks for content that does.",
      "SENSITIVE_TOPIC: The question treats suicide, self-harm, euthanasia or assisted dying as a subject of law, ethics, medicine or public health.",
      "ORDINARY: The question fits none of the rows above."
    ].join("\n"),
    answerForm: 'A single JSON object and nothing else: {"call":"<the 32 hexadecimal characters of this call\'s boundary marker>","label":"<one code>"}'
  };
}
