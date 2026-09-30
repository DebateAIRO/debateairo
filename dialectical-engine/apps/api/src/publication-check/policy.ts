import { createHash } from "node:crypto";
import { promptContractFingerprintText, type PromptContract } from "../../../../packages/providers/src/prompt-frame.js";
import { CONTENT_RULE_TEXT } from "../../../../packages/providers/src/content-rule.js";

export const PUBLICATION_CHECK_CONTRACT_ID = "publication.content-check.v1";
// Rules 1 and 2 of the rule of record, taken from S01's one product constant (S01 SPEC-v2 R1; S02 PLAN S02-A).
export const PUBLICATION_CHECK_RULES_1_2 = CONTENT_RULE_TEXT.split("\n").filter(line => line.startsWith("1. ") || line.startsWith("2. ")).join("\n");
export const PUBLICATION_CHECK_TEXT_OF_RECORD = "Judge the text by what it does, not by the words it contains. Text that quotes hateful statements in order to analyse or refute them, explains what a slur means, debates how historical events are legally classified, or argues a policy position is ALLOWED. Answer BLOCK when any part itself does what rule 1 or rule 2 forbids. Answer UNSURE when you cannot decide between ALLOW and BLOCK. Answer ALLOW otherwise. Set possibly_illegal to true only when the text publicly incites violence or hatred against a group or denies, justifies or grossly trivialises a genocide or crime against humanity established by a court.";

export function publicationCheckContract(): PromptContract {
  return {
    contractId: PUBLICATION_CHECK_CONTRACT_ID,
    instruction: "You are the publication check of DebateAI. The material is text that its owner asked to publish. Decide whether it may be published under these rules:"
      + "\n\n" + PUBLICATION_CHECK_RULES_1_2 + "\n\n" + PUBLICATION_CHECK_TEXT_OF_RECORD,
    // FIX-HS2-v V-21: `call` binds the answer to this call (verdict.ts judgeCallValue); the frame names the marker.
    answerForm: 'A single JSON object and nothing else: {"call":"<the 32 hexadecimal characters inside this call\'s boundary marker, copied exactly>","verdict":"ALLOW"|"BLOCK"|"UNSURE","rules":[1 or 2, each at most once],"parts":[names of the material fields that do what rule 1 or rule 2 forbids, each at most once],"possibly_illegal":true|false}'
  };
}

export const PUBLICATION_CHECK_POLICY_VERSION = `${PUBLICATION_CHECK_CONTRACT_ID}@${createHash("sha256")
  .update(promptContractFingerprintText(publicationCheckContract())).digest("hex").slice(0, 16)}`;
