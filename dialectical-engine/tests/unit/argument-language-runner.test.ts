import { describe, expect, it } from "vitest";

import { argumentLanguageDirective } from "@debateai/kernel";
import { appendFramedRejection, readPromptFrame, schemaFailureLocator } from "@debateai/providers";
import {
  EVALUATOR_CONTRACT_TEXT,
  buildEvaluatorPromptPacket,
  buildSynthesizerPromptPacket,
  evaluatorVerdictSchema,
  parseComposerOutput
} from "@debateai/runner";
import {
  assertEvaluatorVerdict,
  type EvaluatorRequest,
  type EvaluatorVerdict,
  type SynthesizerRequest
} from "@debateai/serve";

const SYNTHESIZER_CONTRACT_TEXT =
  "Return only JSON with a segments array of at most two {segment_id,text,node_refs,served_number_refs} entries. node_refs must name the node ids of the digest nodes whose facts the segment asserts, so every load-bearing claim traces to a digest node. Preserve the digest and add no facts. When the digest nodes a segment cites rest on reasoning alone, with no measured or looked-up evidence behind them, return at least two segments in order: the first segment states the provisional answer as a hypothesis; the second segment states the research plan that would lift it.";

const synthesizerRequest = {
  role: "SYNTHESIZER",
  stage: "INITIAL",
  roleRef: "provider:test",
  round: 1,
  instructions: "synthesizer instructions",
  digest: { nodes: [] },
  codeLabel: { label: "CONTESTED" }
} as unknown as SynthesizerRequest;

const evaluatorRequest = {
  role: "EVALUATOR",
  roleRef: "provider:test",
  round: 1,
  instructions: "evaluator instructions",
  digest: { nodes: [] },
  codeLabel: { label: "CONTESTED" },
  candidateStatement: "Candidate statement."
} as unknown as EvaluatorRequest;

describe("runner argument-language packets", () => {
  it.each([
    ["synthesizer", () => buildSynthesizerPromptPacket(synthesizerRequest, "Romanian"), SYNTHESIZER_CONTRACT_TEXT, "serve.synthesizer.v1"],
    ["evaluator", () => buildEvaluatorPromptPacket(evaluatorRequest, "Romanian"), EVALUATOR_CONTRACT_TEXT, "serve.evaluator.v1"]
  ] as const)("keeps the %s contract and language directive inside the secure frame", (
    _name,build,contract,contractId
  ) => {
    const packet = build();
    const frame = readPromptFrame(packet);
    expect(frame.contractId).toBe(contractId);
    expect(packet.messages[0]?.role).toBe("system");
    expect(packet.messages[0]?.content).toContain(contract);
    expect(packet.messages[0]?.content).toContain(argumentLanguageDirective("Romanian"));
    expect(packet.messages[1]?.role).toBe("user");

    // The same append the runner's private schema-repair path makes
    // (buildFramedRepairPrompt = appendFramedRejection(framed.packet, locator)).
    const repair = appendFramedRejection(packet, schemaFailureLocator({
      parseStatus: "SCHEMA_FAILED", parseError: "schema mismatch"
    }));
    expect(repair.messages.slice(0,packet.messages.length)).toEqual(packet.messages);
    expect(repair.messages).toHaveLength(packet.messages.length + 1);
    expect(readPromptFrame(repair).contractId).toBe(contractId);
  });

  it("rejects a localized null sentinel at the repairable evaluator schema gate", () => {
    expect(evaluatorVerdictSchema.safeParse({
      satisfied: true,
      objection: "niciuna",
      criteria: {
        fairness_to_losers: true,
        statement_label_agreement: true,
        no_overstatement: true,
        restatement: true,
        citation_tracing: true
      }
    }).success).toBe(false);
  });

  it.each([
    ["an incoherent satisfied verdict", { satisfied: true, objection: null, restatement: false }, "EVALUATOR_VERDICT_INCOHERENT"],
    ["an unsatisfied verdict without objection text", { satisfied: false, objection: null, restatement: false }, "EVALUATOR_OBJECTION_MISSING"]
  ] as const)("leaves %s to dev's single enforcement in serve synthesis", (_name, shape, code) => {
    // Scope audit B5: the schema keeps only the D2 null-literal clause; criteria
    // agreement and objection text stay a typed domain error in serve, as on dev.
    const verdict = {
      satisfied: shape.satisfied,
      objection: shape.objection,
      criteria: {
        fairness_to_losers: true,
        statement_label_agreement: true,
        no_overstatement: true,
        restatement: shape.restatement,
        citation_tracing: true
      }
    };
    const parsed = evaluatorVerdictSchema.safeParse(verdict);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    // The runner's snake_case → camelCase projection, as it hands serve the verdict.
    const projected: EvaluatorVerdict = {
      satisfied: parsed.data.satisfied,
      objection: parsed.data.objection,
      criteria: {
        fairnessToLosers: parsed.data.criteria.fairness_to_losers,
        statementLabelAgreement: parsed.data.criteria.statement_label_agreement,
        noOverstatement: parsed.data.criteria.no_overstatement,
        restatement: parsed.data.criteria.restatement,
        citationTracing: parsed.data.criteria.citation_tracing
      }
    };
    expect(() => assertEvaluatorVerdict(projected)).toThrowError(expect.objectContaining({ code }));
  });

  it.each([
    ["segment_id", { segment_id: "segment:concluzie-finală", node_refs: ["primary"], served_number_refs: [] }],
    ["node_refs", { segment_id: "segment:verdict", node_refs: ["principală"], served_number_refs: [] }],
    ["served_number_refs", { segment_id: "segment:verdict", node_refs: ["primary"], served_number_refs: ["număr:final"] }]
  ] as const)("rejects a localized %s identifier at the repairable composer schema gate", (_field, segment) => {
    expect(() => parseComposerOutput(JSON.stringify({
      segments: [{ ...segment, text: "Text natural în limba română." }]
    }))).toThrowError(expect.objectContaining({ code: "COMPOSITION_CONTRACT_ERROR" }));
  });
});
