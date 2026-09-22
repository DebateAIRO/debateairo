import { describe, expect, it } from "vitest";

import { argumentLanguageDirective } from "@debateai/kernel";
import {
  EVALUATOR_CONTRACT_TEXT,
  buildEvaluatorPromptPacket,
  buildSchemaRepairPacket,
  buildSynthesizerPromptPacket
} from "@debateai/runner";
import type { EvaluatorRequest, SynthesizerRequest } from "@debateai/serve";

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
    ["synthesizer", () => buildSynthesizerPromptPacket(synthesizerRequest, "Romanian"), SYNTHESIZER_CONTRACT_TEXT],
    ["evaluator", () => buildEvaluatorPromptPacket(evaluatorRequest, "Romanian"), EVALUATOR_CONTRACT_TEXT]
  ] as const)("keeps the %s contract first and puts the directive second", (_name, build, contract) => {
    const packet = build();
    expect(packet.messages[0]).toEqual({ role: "system", content: contract });
    expect(packet.messages[1]).toEqual({
      role: "system",
      content: argumentLanguageDirective("Romanian")
    });
    expect(packet.messages[2]?.role).toBe("user");

    const repair = buildSchemaRepairPacket(packet, "schema mismatch");
    expect(repair.messages.slice(0, 3)).toEqual(packet.messages);
    expect(repair.messages[1]).toEqual(packet.messages[1]);
  });
});
