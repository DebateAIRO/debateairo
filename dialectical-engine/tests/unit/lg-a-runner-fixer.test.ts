// tests/unit/lg-a-runner-fixer.test.ts
import { describe, expect, it } from "vitest";
import type { SynthesisDigest } from "@debateai/serve";
import { classifyComposedContent, classifyEvaluatorContent, parseComposerOutput, parseEvaluatorOutput } from "../../apps/runner/src/index.js";

const STOP = { finishReason: "stop" } as const;
const NODE = "3f2a9c1e-7b4d-4e8f-9a01-5c6d7e8f9a0b";
/** As tests/unit/hs-structured-fence.test.ts builds it: refs are the node ids themselves. */
const citation = {
  digest: { nodes: [{ nodeId: NODE }], emphasis: {}, compressionLevel: 0, summaryCharacterCap: null, byteSize: 0 } as unknown as SynthesisDigest,
  servedNodes: [{ nodeId: NODE }],
  exemptTokens: new Set<string>()
};
const VERDICT = { satisfied: true, objection: null, criteria: { fairness_to_losers: true, statement_label_agreement: true,
  no_overstatement: true, restatement: true, citation_tracing: true } };

describe("LG-A: the answer writer and checker read every reply through the fixer", () => {
  it("GLM left served_number_refs out of both segments (2026-10-14): filled with the one value the form allows (v4, as v3)", () => {
    const reply = JSON.stringify({ segments: [
      { segment_id: "segment:verdict", text: "The answer holds.", node_refs: ["primary", NODE] },
      { segment_id: "segment:reasons", text: "Because the savings held up.", node_refs: [NODE] }
    ] });
    expect(classifyComposedContent(reply, citation, STOP)).toEqual({ parseStatus: "PARSED", parseError: null, jsonRepair: "ONLY_VALUE_FILLED" });
    expect(parseComposerOutput(reply, STOP).segments.map((segment) => segment.served_number_refs)).toEqual([[], []]);
  });

  it("the checker's extra key inside criteria is dropped; the decode's repair comes first in the list", () => {
    const extra = JSON.stringify({ ...VERDICT, criteria: { ...VERDICT.criteria, notes: "all fine" } });
    expect(classifyEvaluatorContent(extra, STOP)).toEqual({ parseStatus: "PARSED", parseError: null, jsonRepair: "INNER_UNASKED_KEYS" });
    expect(parseEvaluatorOutput(extra, STOP)).toEqual(VERDICT);
    expect(classifyEvaluatorContent(`\`\`\`json\n${extra}\n\`\`\``, STOP)).toEqual({ parseStatus: "PARSED", parseError: null,
      jsonRepair: "CODE_FENCE", jsonRepairs: ["CODE_FENCE", "INNER_UNASKED_KEYS"] });
  });

  it("a checker verdict read only through the syntax pass names its repair (L34: every repair logged)", () => {
    const trailing = JSON.stringify(VERDICT).replace(/}}$/, ",},}");
    expect(classifyEvaluatorContent(trailing, STOP)).toEqual({ parseStatus: "PARSED", parseError: null, jsonRepair: "TRAILING_COMMA" });
    expect(parseEvaluatorOutput(trailing, STOP)).toEqual(VERDICT);
  });

  it("a verdict missing a criterion is still refused, and so is a writer's list that holds a value", () => {
    const { citation_tracing: _gone, ...criteria } = VERDICT.criteria;
    expect(classifyEvaluatorContent(JSON.stringify({ ...VERDICT, criteria }), STOP).parseStatus).toBe("SCHEMA_FAILED");
    const strict = JSON.stringify({ segments: [{ segment_id: "segment:verdict", text: "The answer holds.", node_refs: [NODE],
      served_number_refs: ["slot:1"] }] });
    expect(classifyComposedContent(strict, citation, STOP)).toEqual({ parseStatus: "PARSED", parseError: null });
  });
});
