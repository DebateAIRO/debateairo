import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { LENGTH_GUIDANCE_START, LENGTH_SENTENCE_ANSWER_CHECKER } from "@debateai/kernel";
import { promptContractFingerprintText, readPromptFrame } from "@debateai/providers";
import { buildEvaluatorRequest, buildSynthesisDigest, toSynthesisPromptMaterial, type SynthesisDigest } from "@debateai/serve";
import {
  EVALUATOR_CONTRACTS_FINGERPRINT_TEXT, EVALUATOR_LENGTH_CONTRACTS_FINGERPRINT_TEXT, EVALUATOR_LENGTH_PROMPT_CONTRACT,
  EVALUATOR_PROMPT_CONTRACT, buildSynthesisRolePrompt,
  codePromptContractHashes
} from "../../apps/runner/src/index.js";

const CPW = LENGTH_GUIDANCE_START.charactersPerWord;

// The checker request as tests/unit/a17-synthesis-role-prompt.test.ts builds REQUESTS[2] (pre-flight PF-C5.7): a real
// EVALUATOR request with its candidate statement, so `candidate_statement` has content.
function digest(): SynthesisDigest {
  const outcome = buildSynthesisDigest({
    nodes: [{
      nodeId: "position:a", statement: "The proposal holds on cost.", finalStrength: 0.61,
      wayOfKnowing: "REASONING", marks: [], polarityRelations: [], isPosition: true, isSurvivingObjection: false
    }],
    servedRootNodeId: "position:a",
    budgetBound: 8_192
  });
  if (outcome.kind !== "DIGEST") throw new Error("the checker digest fixture must exist");
  return outcome.digest;
}
const CONTROLS = { synthesizerRoleRef: "provider:w", evaluatorRoleRef: "provider:c", evaluatorLoopMaxRounds: 3 };
const CODE_LABEL = { verdictLabel: "CONTESTED", servedNodeId: "position:a", servedStrength: 0.61, margin: 0.12, registerVersion: 5 };
const checkerRequest = () => buildEvaluatorRequest({ controls: CONTROLS, round: 1, digest: digest(), codeLabel: CODE_LABEL,
  candidateStatement: "The proposal holds." });

describe("serve.evaluator.length.v1 (spec §3.2)", () => {
  it("is v2's instruction plus the checker's sentence, with v2's answer form", () => {
    expect(EVALUATOR_LENGTH_PROMPT_CONTRACT).toEqual({ contractId: "serve.evaluator.length.v1",
      instruction: `${EVALUATOR_PROMPT_CONTRACT.instruction} ${LENGTH_SENTENCE_ANSWER_CHECKER}`, answerForm: EVALUATOR_PROMPT_CONTRACT.answerForm });
  });

  it("the conformance seal is v2 then the variant (then, since the V4 reading level, the two reader variants)", () => {
    expect(EVALUATOR_LENGTH_CONTRACTS_FINGERPRINT_TEXT).toBe([promptContractFingerprintText(EVALUATOR_PROMPT_CONTRACT),
      promptContractFingerprintText(EVALUATOR_LENGTH_PROMPT_CONTRACT)].join("\n---\n"));
    expect(EVALUATOR_CONTRACTS_FINGERPRINT_TEXT.startsWith(`${EVALUATOR_LENGTH_CONTRACTS_FINGERPRINT_TEXT}\n---\n`)).toBe(true);
    expect(codePromptContractHashes().conformance)
      .toBe(createHash("sha256").update(EVALUATOR_CONTRACTS_FINGERPRINT_TEXT).digest("hex"));
  });

  it("a checker with its own target gets the variant, answer_length then length; without one, today's v2", () => {
    const request = checkerRequest();
    // 350: OVERVIEW C-1's Standard answer words (pre-flight PF-C5.7), not the old 700 start value.
    const lengthed = readPromptFrame(buildSynthesisRolePrompt(request, "English", undefined,
      { answerWords: 350, ownWords: 150, languageCode: null, charactersPerWord: CPW }).packet);
    expect(lengthed.contractId).toBe("serve.evaluator.length.v1");
    expect(lengthed.fields.slice(-2)).toEqual([{ name: "answer_length", content: "about 350 words" }, { name: "length", content: "about 150 words" }]);
    const today = readPromptFrame(buildSynthesisRolePrompt(request, "English").packet);
    expect(today.contractId).toBe("serve.evaluator.v2");
    expect(today.fields).toEqual(toSynthesisPromptMaterial(request).map((field) => ({ name: field.name, content: field.content })));
    // A shaped run's writer target alone (ownWords null) never lengthens the checker: today's packet.
    expect(readPromptFrame(buildSynthesisRolePrompt(request, "English", undefined,
      { answerWords: 350, ownWords: null, languageCode: null, charactersPerWord: CPW }).packet).contractId).toBe("serve.evaluator.v2");
  });

  it("with a question-language lock, the lock's field rides last, after answer_length and length", () => {
    const fields = readPromptFrame(buildSynthesisRolePrompt(checkerRequest(), "English", undefined,
      { answerWords: 350, ownWords: 150, languageCode: "en", charactersPerWord: CPW }, { code: "en", name: "English" }).packet).fields;
    expect(fields.slice(-3).map((field) => field.name)).toEqual(["answer_length", "length", "question_language"]);
    expect(fields.slice(-3, -1)).toEqual([{ name: "answer_length", content: "about 350 words" }, { name: "length", content: "about 150 words" }]);
  });

  it("a zh run names both targets in characters (350 x 1.6 = 560, 150 x 1.6 = 240)", () => {
    const lengthed = readPromptFrame(buildSynthesisRolePrompt(checkerRequest(), "Chinese", undefined,
      { answerWords: 350, ownWords: 150, languageCode: "zh-Hant", charactersPerWord: CPW }).packet);
    expect(lengthed.contractId).toBe("serve.evaluator.length.v1");
    expect(lengthed.fields.slice(-2)).toEqual([{ name: "answer_length", content: "about 560 characters" },
      { name: "length", content: "about 240 characters" }]);
  });
});
