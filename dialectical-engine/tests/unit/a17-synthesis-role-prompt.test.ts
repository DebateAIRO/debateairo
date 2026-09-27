import { describe, expect, it } from "vitest";
import { buildFramedPrompt } from "@debateai/providers";
import {
  EVALUATOR_PROMPT_CONTRACT,
  buildSynthesisRolePrompt,
  classifySynthesisRoleContent
} from "@debateai/runner";
import {
  SYNTHESIZER_PROMPT_CONTRACT,
  buildEvaluatorRequest,
  buildSynthesisDigest,
  buildSynthesizerRequest,
  toSynthesisPromptMaterial,
  type EvaluatorRequest,
  type SynthesisDigest,
  type SynthesizerRequest
} from "@debateai/serve";

/**
 * Model scorecard A17 (spec §2.9) — replay must call "the same prompt-builder
 * code the live runner uses". The synthesis packets were built INSIDE two
 * runner closures; they now come from one exported function, and this proves
 * the move changed no byte: with the frame's randomness injected identically,
 * the extracted builder and the closure body it replaced emit the same packet.
 */
function seededBytes(): (size: number) => Buffer {
  let counter = 0;
  return (size) => {
    counter += 1;
    return Buffer.alloc(size, counter);
  };
}

/** The body both runner closures carried before A17, with the seam's randomness injected. */
function closureOutput(request: SynthesizerRequest | EvaluatorRequest, randomBytes: (size: number) => Buffer) {
  return buildFramedPrompt({
    contract: request.role === "SYNTHESIZER" ? SYNTHESIZER_PROMPT_CONTRACT : EVALUATOR_PROMPT_CONTRACT,
    material: toSynthesisPromptMaterial(request),
    randomBytes
  });
}

function digest(): SynthesisDigest {
  const outcome = buildSynthesisDigest({
    nodes: [{
      nodeId: "position:a", statement: "The proposal holds on cost.", finalStrength: 0.61,
      wayOfKnowing: "REASONING", marks: [], polarityRelations: [], isPosition: true, isSurvivingObjection: false
    }],
    servedRootNodeId: "position:a",
    budgetBound: 8_192
  });
  if (outcome.kind !== "DIGEST") throw new Error("the A17 digest fixture must exist");
  return outcome.digest;
}

const CONTROLS = { synthesizerRoleRef: "provider:w", evaluatorRoleRef: "provider:c", evaluatorLoopMaxRounds: 3 };
const CODE_LABEL = { verdictLabel: "CONTESTED", servedNodeId: "position:a", servedStrength: 0.61, margin: 0.12, registerVersion: 5 };

const REQUESTS: readonly (readonly [string, SynthesizerRequest | EvaluatorRequest])[] = [
  ["SYNTHESIZER:INITIAL", buildSynthesizerRequest({ controls: CONTROLS, round: 1, digest: digest(), codeLabel: CODE_LABEL, prior: null })],
  ["SYNTHESIZER:RETRY", buildSynthesizerRequest({
    controls: CONTROLS, round: 2, digest: digest(), codeLabel: CODE_LABEL,
    prior: { objection: "Round 1 overstates the cost evidence.", candidateRef: "artifact:round-1" }
  })],
  ["EVALUATOR", buildEvaluatorRequest({
    controls: CONTROLS, round: 1, digest: digest(), codeLabel: CODE_LABEL, candidateStatement: "The proposal holds."
  })]
];

describe("A17 · buildSynthesisRolePrompt is the closures' builder, byte for byte", () => {
  it.each(REQUESTS)("%s: same packet, fence, canary, contract and material", (_name, request) => {
    const extracted = buildSynthesisRolePrompt(request, seededBytes());
    const closure = closureOutput(request, seededBytes());
    expect(JSON.stringify(extracted.packet)).toBe(JSON.stringify(closure.packet));
    expect([extracted.fence, extracted.canary, extracted.contractId]).toEqual([closure.fence, closure.canary, closure.contractId]);
    expect(extracted.material).toEqual(closure.material);
  });

  it("frames the writer with the synthesizer contract and the checker with the runner's evaluator contract", () => {
    expect(buildSynthesisRolePrompt(REQUESTS[0]![1]).contractId).toBe(SYNTHESIZER_PROMPT_CONTRACT.contractId);
    expect(EVALUATOR_PROMPT_CONTRACT.contractId).toBe("serve.evaluator.v1");
    expect(buildSynthesisRolePrompt(REQUESTS[2]![1]).contractId).toBe(EVALUATOR_PROMPT_CONTRACT.contractId);
  });
});

describe("A17 · classifySynthesisRoleContent is the live classification", () => {
  const composition = JSON.stringify({ segments: [
    { segment_id: "segment:verdict", text: "The proposal holds.", node_refs: ["primary"], served_number_refs: [] }
  ] });
  const verdict = JSON.stringify({
    satisfied: true, objection: null,
    criteria: { fairness_to_losers: true, statement_label_agreement: true, no_overstatement: true, restatement: true, citation_tracing: true }
  });

  it("accepts each role's own answer form and refuses the other's", () => {
    expect(classifySynthesisRoleContent("SYNTHESIZER", composition)).toEqual({ parseStatus: "PARSED", parseError: null });
    expect(classifySynthesisRoleContent("EVALUATOR", verdict)).toEqual({ parseStatus: "PARSED", parseError: null });
    expect(classifySynthesisRoleContent("SYNTHESIZER", verdict).parseStatus).toBe("SCHEMA_FAILED");
    expect(classifySynthesisRoleContent("EVALUATOR", composition).parseStatus).toBe("SCHEMA_FAILED");
    expect(classifySynthesisRoleContent("EVALUATOR", "not json").parseStatus).toBe("PARSE_FAILED");
  });
});
