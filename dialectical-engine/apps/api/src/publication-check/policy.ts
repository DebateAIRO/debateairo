import { createHash } from "node:crypto";
import { promptContractFingerprintText, type PromptContract } from "../../../../packages/providers/src/prompt-frame.js";

export const PUBLICATION_CHECK_CONTRACT_ID = "publication.content-check.v1";
// S02-only copy. TEST assembly replaces it with S01 CONTENT_RULE_TEXT lines 1–2.
export const TEMPORARY_CONTENT_RULES_1_2 = "1. Never produce content that attacks, dehumanises, or incites hatred, discrimination or violence against people because of race, colour, ethnicity, national origin, descent, language, religion, sex, gender identity, sexual orientation, age, disability, health status, social origin or political opinion. Do not call a group vermin, disease or subhuman; do not claim a group is inferior by nature; do not call for its exclusion, expulsion or harm.\n2. Never deny, justify or trivialise the Holocaust or other genocides and crimes against humanity established by courts. You may analyse historical and legal debates about how events are classified.";
export const PUBLICATION_CHECK_TEXT_OF_RECORD = "Judge the text by what it does, not by the words it contains. Text that quotes hateful statements in order to analyse or refute them, explains what a slur means, debates how historical events are legally classified, or argues a policy position is ALLOWED. Answer BLOCK when any part itself does what rule 1 or rule 2 forbids. Answer UNSURE when you cannot decide between ALLOW and BLOCK. Answer ALLOW otherwise. Set possibly_illegal to true only when the text publicly incites violence or hatred against a group or denies, justifies or grossly trivialises a genocide or crime against humanity established by a court.";

export function publicationCheckContract(): PromptContract {
  return {
    contractId: PUBLICATION_CHECK_CONTRACT_ID,
    instruction: "You are the publication check of DebateAI. The material is text that its owner asked to publish. Decide whether it may be published under these rules:"
      + "\n\n" + TEMPORARY_CONTENT_RULES_1_2 + "\n\n" + PUBLICATION_CHECK_TEXT_OF_RECORD,
    // FIX-HS2-v V-21: `call` binds the answer to this call (verdict.ts judgeCallValue); the frame names the marker.
    // FIX-HS2-v2 (REV-S02-v-ui-product N1): the form states every verdict/field combination parseJudgeAnswer refuses
    // (verdict.ts, the three `verdict ===` lines), so an honest judge is never UNAVAILABLE for a rule it was not told.
    answerForm: 'A single JSON object and nothing else: {"call":"<the 32 hexadecimal characters inside this call\'s boundary marker, copied exactly>","verdict":"ALLOW"|"BLOCK"|"UNSURE","rules":[1 or 2, each at most once],"parts":[names of the material fields that do what rule 1 or rule 2 forbids, each at most once],"possibly_illegal":true|false}'
      + ' With "ALLOW", rules and parts are empty and possibly_illegal is false. With "BLOCK", rules and parts each name at least one entry. With "UNSURE", rules is empty.'
  };
}

export const PUBLICATION_CHECK_POLICY_VERSION = `${PUBLICATION_CHECK_CONTRACT_ID}@${createHash("sha256")
  .update(promptContractFingerprintText(publicationCheckContract())).digest("hex").slice(0, 16)}`;
