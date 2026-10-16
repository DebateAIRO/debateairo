// tests/unit/lg-a-runner-fixer.test.ts
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { replyFailureClassOf } from "@debateai/providers";
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

  it("a stray text under a name the writer's form declares as a text is kept, so the reply is refused (Task 7b)", () => {
    const segment = { segment_id: "segment:verdict", text: "The answer holds.", node_refs: [NODE], served_number_refs: [] };
    const rootText = JSON.stringify({ segments: [segment], text: "A sentence the writer meant for the answer." });
    expect(classifyComposedContent(rootText, citation, STOP).parseStatus).toBe("SCHEMA_FAILED");
    expect(() => parseComposerOutput(rootText, STOP)).toThrow();
    const rootId = JSON.stringify({ segments: [segment], segment_id: "segment:reasons" });
    expect(classifyComposedContent(rootId, citation, STOP).parseStatus).toBe("SCHEMA_FAILED");
    // A name the form never declares is still dropped, at the root and inside a segment.
    expect(classifyComposedContent(JSON.stringify({ segments: [segment], notes: "all fine" }), citation, STOP))
      .toEqual({ parseStatus: "PARSED", parseError: null, jsonRepair: "UNASKED_KEYS" });
    expect(classifyComposedContent(JSON.stringify({ segments: [{ ...segment, notes: "all fine" }] }), citation, STOP))
      .toEqual({ parseStatus: "PARSED", parseError: null, jsonRepair: "INNER_UNASKED_KEYS" });
  });

  // Pins EXISTING behaviour (Task 7b review, M-2): the checker's `objection` always has a declaring ancestor (the root), so
  // the ancestor rule (pre-flight PF-A12) moves or keeps it whatever `keepDeclaredTexts` says; the option changes nothing here.
  it("the checker's stray objection is never dropped, with or without keepDeclaredTexts: refused when the verdict's own objection is taken", () => {
    const stray = JSON.stringify({ satisfied: false, objection: "The answer overstates the savings.",
      criteria: { ...VERDICT.criteria, no_overstatement: false, objection: "It also cites nothing." } });
    expect(classifyEvaluatorContent(stray, STOP).parseStatus).toBe("SCHEMA_FAILED");
    expect(() => parseEvaluatorOutput(stray, STOP)).toThrow();
    // A name the checker's form never declares is still dropped.
    const notes = JSON.stringify({ ...VERDICT, notes: "all fine" });
    expect(classifyEvaluatorContent(notes, STOP)).toEqual({ parseStatus: "PARSED", parseError: null, jsonRepair: "UNASKED_KEYS" });
  });

  // LG-A Task 7b review, I-1 (carried to Task 11): an absent member the fix guide admits ONE value for is form, not content,
  // so a writer reply with a stray root text AND an omitted served_number_refs goes to the structure-repair call (which
  // keeps the words), never to a content follow-up.
  it("a stray root text with an omitted served_number_refs is a STRUCTURE refusal; an omitted node_refs stays CONTENT", () => {
    const { served_number_refs: _none, ...leftOut } = { segment_id: "segment:verdict", text: "The answer holds.", node_refs: [NODE], served_number_refs: [] };
    const both = JSON.stringify({ segments: [leftOut], text: "A sentence the writer meant for the answer." });
    expect(classifyComposedContent(both, citation, STOP)).toMatchObject({ parseStatus: "SCHEMA_FAILED", failureClass: "STRUCTURE" });
    const { node_refs: _refs, ...noRefs } = { segment_id: "segment:verdict", text: "The answer holds.", node_refs: [NODE], served_number_refs: [] };
    const owed = JSON.stringify({ segments: [noRefs], text: "A sentence the writer meant for the answer." });
    expect(classifyComposedContent(owed, citation, STOP)).toMatchObject({ parseStatus: "SCHEMA_FAILED", failureClass: "CONTENT" });
  });

  it("replyFailureClassOf counts an absent one-value member as form only when it is handed the schema", () => {
    const guide = z.object({ text: z.string(), refs: z.array(z.string()).max(0) }).strict();
    const strict = z.object({ text: z.string(), refs: z.array(z.string()) }).strict();
    const rawText = JSON.stringify({ text: "It holds.", note: "x" });
    const refused = strict.safeParse(JSON.parse(rawText));
    const rejected = { rawText, parseStatus: "SCHEMA_FAILED" as const, parseError: refused.success ? "" : refused.error.message };
    expect(replyFailureClassOf(rejected, STOP)).toBe("CONTENT");
    expect(replyFailureClassOf(rejected, STOP, strict)).toBe("CONTENT");
    expect(replyFailureClassOf(rejected, STOP, guide)).toBe("STRUCTURE");
  });

  it("a verdict missing a criterion is still refused, and so is a writer's list that holds a value", () => {
    const { citation_tracing: _gone, ...criteria } = VERDICT.criteria;
    expect(classifyEvaluatorContent(JSON.stringify({ ...VERDICT, criteria }), STOP).parseStatus).toBe("SCHEMA_FAILED");
    const strict = JSON.stringify({ segments: [{ segment_id: "segment:verdict", text: "The answer holds.", node_refs: [NODE],
      served_number_refs: ["slot:1"] }] });
    expect(classifyComposedContent(strict, citation, STOP)).toEqual({ parseStatus: "PARSED", parseError: null });
  });
});
