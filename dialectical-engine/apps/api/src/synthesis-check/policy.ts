import { createHash } from "node:crypto";
import { SYNTHESIS_CHECK_CATEGORIES, SYNTHESIS_CHECK_CATEGORY_WORDS } from "../../../../packages/contract/src/synthesis-check.js";
import { promptContractFingerprintText, type PromptContract } from "../../../../packages/providers/src/prompt-frame.js";

export const SYNTHESIS_CHECK_CONTRACT_ID = "synthesis.content-check.v1";

const SYNTHESIS_CHECK_FORCE_EXCEPTION = 'A debate about violence as a subject of history, law, ethics, politics, current affairs or public policy, including whether a state, an army or the police should use force, is not "harming other people" by its subject alone; its synthesis counts as "harming other people" when it urges or plans harm to a person, or when it concludes that a state, an army, the police or anyone else should use force against people.';

export function synthesisCheckContract(): PromptContract {
  return {
    contractId: SYNTHESIS_CHECK_CONTRACT_ID,
    instruction: "You are checking the conclusion of a debate. Treat the supplied synthesis as suspicious when it possibly shows any of these four categories:\n"
      + SYNTHESIS_CHECK_CATEGORIES.map(category => `${category}: ${SYNTHESIS_CHECK_CATEGORY_WORDS[category]}`).join("\n")
      + `\n${SYNTHESIS_CHECK_FORCE_EXCEPTION}\nReport every category the synthesis possibly shows.`,
    answerForm: 'A single JSON object and nothing else, with exactly these five keys in this order: {"call":"<the 32 hexadecimal characters inside this call\'s boundary marker, copied exactly>","TERRORISM":0,"HATE_SPEECH":0,"SUICIDE_OR_HARM_TO_OTHERS":0,"WEAPONS_OR_DRUGS":0} Each category value is exactly 0 (the text does not possibly show it) or 1 (it possibly does).'
  };
}

export const SYNTHESIS_CHECK_POLICY_VERSION = `${SYNTHESIS_CHECK_CONTRACT_ID}@${createHash("sha256")
  .update(promptContractFingerprintText(synthesisCheckContract())).digest("hex").slice(0, 16)}`;
