import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildSynthesizerPromptPacket, parseComposerOutput } from "@debateai/runner";
import { buildSynthesizerRequest, SYNTHESIZER_PROMPT_CONTRACT } from "@debateai/serve";
import { promptContractFingerprintText, readPromptFrame } from "@debateai/providers";

const NODE = "11111111-1111-4111-8111-111111111111";
function packet() {
  const request = buildSynthesizerRequest({ controls: { synthesizerRoleRef: "preview:fixture-a",
    evaluatorRoleRef: "preview:fixture-b", evaluatorLoopMaxRounds: 1 }, round: 1,
    digest: { nodes: [{ nodeId: NODE, statementSummary: "A synthetic policy claim.", summaryTruncated: false,
      finalStrength: 0.6, wayOfKnowing: "REASONING", marks: [], polarityRelations: [] }],
      emphasis: { topSurvivingObjectionNodeIds: [], runnerUpPositionNodeIds: [] },
      compressionLevel: 0, summaryCharacterCap: null, byteSize: 256 },
    codeLabel: { verdictLabel: "CONTESTED", servedNodeId: NODE, servedStrength: 0.6, margin: null, registerVersion: 6 },
    prior: null });
  return buildSynthesizerPromptPacket(request, "Romanian");
}
const output = (refs: string[]) => JSON.stringify({ segments: [{ segment_id: "segment:answer",
  text: "Un răspuns ipotetic.", node_refs: [NODE], served_number_refs: refs }] });

// serve.synthesizer.v2 (owner-approved salvage of Codex commit 4f151d0aa, 2026-10-09): the
// answer form names the one served-number slot the runner emits and the identifier grammar
// its parser enforces. v1 stays sealed history (tests/unit/hs-s01-seal.test.ts).
describe("synthesizer served-number reference guidance", () => {
  it("provides the exact typed slot, grammar and conditional empty-array rule inside the system frame", () => {
    const result = packet();
    expect(readPromptFrame(result).contractId).toBe("serve.synthesizer.v2");
    const system = result.messages[0]!.content;
    expect(system).toContain("number:final-strength");
    expect(system).toContain("code_label.servedStrength");
    expect(system).toContain("^[A-Za-z0-9][A-Za-z0-9:._-]*$");
    expect(system).toContain("If a segment asserts no served number, use []");
    expect(system).toContain("Include that exact ref when the segment asserts that served number");
    expect(system).toContain("never put numeric values, percentages, expressions, or citation labels");
    expect(result.messages[1]!.content).toContain(NODE);
  });
  it("keeps empty served-number refs valid for a segment that asserts no served number", () => {
    expect(parseComposerOutput(output([])).segments[0]!.served_number_refs).toEqual([]);
  });
  it("keeps the exact final-strength ref valid and percentage or prose refs refused by the native parser", () => {
    expect(parseComposerOutput(output(["number:final-strength"])).segments[0]!.served_number_refs).toEqual(["number:final-strength"]);
    for (const invalid of ["60%", "strength=0.6", "final strength", "număr:final"]) {
      expect(() => parseComposerOutput(output([invalid]))).toThrowError(expect.objectContaining({ code: "COMPOSITION_CONTRACT_ERROR" }));
    }
  });
  it("keeps the published composer fingerprint derived from the actual framed contract", () => {
    const fingerprint = promptContractFingerprintText(SYNTHESIZER_PROMPT_CONTRACT);
    expect(fingerprint).toContain("number:final-strength");
    const digest = createHash("sha256").update(fingerprint).digest("hex");
    expect(digest).toBe("340e11a6ec58453a607114f1c31263ddfc92beb8698f70093c75b89472368b70");
    expect(packet().messages[0]!.content).toContain(SYNTHESIZER_PROMPT_CONTRACT.answerForm);
  });
});
