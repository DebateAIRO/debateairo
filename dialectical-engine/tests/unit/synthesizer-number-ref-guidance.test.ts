import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildSynthesizerPromptPacket, parseComposerOutput } from "@debateai/runner";
import { buildSynthesizerRequest, SYNTHESIZER_PROMPT_CONTRACT, SYNTHESIZER_V2_PROMPT_CONTRACT } from "@debateai/serve";
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
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

// serve.synthesizer.v2 (owner-approved salvage of Codex commit 4f151d0aa, 2026-10-09) named the one
// served-number slot and told the writer to include it "when the segment asserts that served number",
// so the writer printed the number. serve.synthesizer.v3 (owner-approved content, 2026-10-12, practice
// debate 3) asks for no served number at all: served_number_refs is always []. The identifier grammar
// stays. v1 and v2 stay sealed history (tests/unit/hs-s01-seal.test.ts).
describe("synthesizer served-number reference guidance (serve.synthesizer.v3)", () => {
  it("sends the identifier grammar and the always-empty rule inside the system frame, and no slot to fill", () => {
    const result = packet();
    expect(readPromptFrame(result).contractId).toBe("serve.synthesizer.v3");
    const system = result.messages[0]!.content;
    expect(system).toContain("^[A-Za-z0-9][A-Za-z0-9:._-]*$");
    expect(system).toContain("served_number_refs is always [].");
    // v2's invitation to assert the served number is gone, with its slot and the material field it named.
    expect(system).not.toContain("number:final-strength");
    expect(system).not.toContain("code_label.servedStrength");
    expect(system).not.toContain("Include that exact ref when the segment asserts that served number");
    expect(result.messages[1]!.content).toContain(NODE);
  });
  it("keeps empty served-number refs valid", () => {
    expect(parseComposerOutput(output([])).segments[0]!.served_number_refs).toEqual([]);
  });
  it("leaves the parser unchanged: the exact final-strength ref still parses, prose or percentage refs refuse", () => {
    // The parser is shared with answers recorded under v1/v2; v3 changes only what the writer is asked for.
    expect(parseComposerOutput(output(["number:final-strength"])).segments[0]!.served_number_refs).toEqual(["number:final-strength"]);
    for (const invalid of ["60%", "strength=0.6", "final strength", "număr:final"]) {
      expect(() => parseComposerOutput(output([invalid]))).toThrowError(expect.objectContaining({ code: "COMPOSITION_CONTRACT_ERROR" }));
    }
  });
  it("derives the published composer fingerprint from the framed contract actually sent", () => {
    expect(sha256(promptContractFingerprintText(SYNTHESIZER_PROMPT_CONTRACT)))
      .toBe("4b141d3ab287366c4969f89e04649c5f1cc951d433206ffa0295527eba4df90f");
    // v2 history keeps its seal byte for byte (the preview's register versions 10 and 11 carry it).
    expect(sha256(promptContractFingerprintText(SYNTHESIZER_V2_PROMPT_CONTRACT)))
      .toBe("340e11a6ec58453a607114f1c31263ddfc92beb8698f70093c75b89472368b70");
    expect(packet().messages[0]!.content).toContain(SYNTHESIZER_PROMPT_CONTRACT.answerForm);
  });
});
