// W4-7 (Perplexity plan 2026-10-30; design PERPLEXITY-DESIGN.md v2 §7.1 item 7): the answer checker reads the extracts the
// answer writer read. On a debate that read web sources, a looked-up point's cited extract rides on its digest node; the
// writer reads it under its sources variant (W4-1), and the checker now reads the same digest under its own sources
// variant: serve.evaluator.length.sources.v1 or .length.reader.sources.v1, the checker's instruction and answer form
// unchanged byte for byte. Sealed by the engine seal only; the composer and conformance seals do not move; a debate with
// no packs sends today's checker packet, byte for byte (pinned below from the code before this task).
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { LENGTH_GUIDANCE_START, type EngineCitedExtract } from "@debateai/kernel";
import { promptContractFingerprintText, readPromptFrame } from "@debateai/providers";
import {
  SYNTHESIZER_CONTRACTS_FINGERPRINT_TEXT, SYNTHESIZER_LENGTH_READER_SOURCES_CONTRACT_ID, SYNTHESIZER_LENGTH_SOURCES_CONTRACT_ID,
  buildEvaluatorRequest, buildSynthesisDigest, buildSynthesizerRequest, type DigestSourceNode, type SynthesisDigest
} from "@debateai/serve";
import {
  EVALUATOR_CONTRACT_TEXT, EVALUATOR_CONTRACTS_FINGERPRINT_TEXT, EVALUATOR_LENGTH_PROMPT_CONTRACT, EVALUATOR_LENGTH_READER_PROMPT_CONTRACT,
  buildSynthesisRolePrompt, codePromptContractHashes
} from "../../apps/runner/src/index.js";
import {
  EVALUATOR_LENGTH_READER_SOURCES_CONTRACT_ID, EVALUATOR_LENGTH_READER_SOURCES_PROMPT_CONTRACT, EVALUATOR_LENGTH_SOURCES_CONTRACT_ID,
  EVALUATOR_LENGTH_SOURCES_PROMPT_CONTRACT, EVALUATOR_SOURCES_ANSWER_FORM, EVALUATOR_SOURCES_SEALED_CONTRACTS
} from "../../apps/runner/src/answer-checker-sources.js";
import { ENGINE_SEALED_CONTRACT_IDS, engineSealedContracts } from "../../apps/runner/src/engine-contracts.js";

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
/** The composer and conformance seals as the reading level left them (tests/unit/answer-writer-v3-register-12.test.ts). */
const COMPOSER_SEAL = "6fb174d4d75ad1d39bf8246f741a7ab0ee60fc2b6d117aa228de83cfca29324d";
const CONFORMANCE_SEAL = "02e01cbfebf1eeb96e61eb9a56cdbccb7ca1f8fae32186ef7a8c72ab9834c2bd";
/**
 * Today's checker packets for a debate with no packs, printed by the code at 7cece1dc7 (before this task) with the fixed
 * random bytes below, never typed: unlengthed (v2), lengthed (length.v1), lengthed and told the level (length.reader.v1).
 */
const TODAY = Object.freeze({
  bare: "8706422c733e49fbba8789a40e885c31cbbff25696dd04ce55b09a5996f1df73",
  lengthed: "e9efb39a75bba6dd806d4a725808b5706660b2269e3df568647f3f70e19e3029",
  reader: "b356f3f76110ac32865cdf563ad0def61e28ce5ddb4c8c08e420af6d74deb579"
});

const EXTRACT: EngineCitedExtract = Object.freeze({ id: "S1-1", quote: "Starting pay is EUR 3,400 a month.", title: "Nurse pay 2026",
  site: "pay.example.de", date: "2026-01-15" });
const digestOf = (extract: boolean): SynthesisDigest => {
  const nodes: DigestSourceNode[] = [{ nodeId: "r0", statement: "Yes, the pay is higher.", finalStrength: 0.6, wayOfKnowing: "LOOKED_UP",
    marks: [], polarityRelations: [], isPosition: true, isSurvivingObjection: false, ...(extract ? { citedExtract: EXTRACT } : {}) }];
  const outcome = buildSynthesisDigest({ nodes, servedRootNodeId: "r0", budgetBound: 8_192 });
  if (outcome.kind !== "DIGEST") throw new Error("digest");
  return outcome.digest;
};
const controls = { synthesizerRoleRef: "w", evaluatorRoleRef: "c", evaluatorLoopMaxRounds: 3 };
const codeLabel = { verdictLabel: "CONTESTED", servedNodeId: "r0", servedStrength: 0.6, margin: 0.1, registerVersion: 5 };
const length = { answerWords: 120, ownWords: 60, languageCode: "en", charactersPerWord: LENGTH_GUIDANCE_START.charactersPerWord };
const fixed = (size: number): Buffer => Buffer.alloc(size, 7);
const checkerRequest = (extract: boolean) => buildEvaluatorRequest({ controls, round: 1, digest: digestOf(extract), codeLabel,
  candidateStatement: "Yes: pay.example.de says starting pay is EUR 3,400 a month." });
const writerRequest = (extract: boolean) => buildSynthesizerRequest({ controls, round: 1, digest: digestOf(extract), codeLabel, prior: null });
const digestField = (frame: ReturnType<typeof readPromptFrame>): string => frame.fields.find((field) => field.name === "digest")!.content;

describe("the checker's two sources variants: a new id each, the instruction and the form unchanged", () => {
  it("are length.v1 and length.reader.v1 under new ids, byte for byte", () => {
    expect(EVALUATOR_LENGTH_SOURCES_PROMPT_CONTRACT).toEqual({ ...EVALUATOR_LENGTH_PROMPT_CONTRACT, contractId: "serve.evaluator.length.sources.v1" });
    expect(EVALUATOR_LENGTH_READER_SOURCES_PROMPT_CONTRACT).toEqual({ ...EVALUATOR_LENGTH_READER_PROMPT_CONTRACT,
      contractId: "serve.evaluator.length.reader.sources.v1" });
    expect([EVALUATOR_LENGTH_SOURCES_CONTRACT_ID, EVALUATOR_LENGTH_READER_SOURCES_CONTRACT_ID])
      .toEqual(["serve.evaluator.length.sources.v1", "serve.evaluator.length.reader.sources.v1"]);
    // The form is held twice (the engine seal cannot import index.ts): the two are the same bytes.
    expect(EVALUATOR_SOURCES_ANSWER_FORM).toBe(EVALUATOR_CONTRACT_TEXT);
    expect(Object.isFrozen(EVALUATOR_SOURCES_SEALED_CONTRACTS)).toBe(true);
  });
});

describe("on a debate with packs, the checker reads the cited extracts the writer read", () => {
  it("lengthed: its sources variant, and the digest the writer was shown, extract and all", () => {
    const writer = readPromptFrame(buildSynthesisRolePrompt(writerRequest(true), "English", undefined, length).packet);
    const checker = readPromptFrame(buildSynthesisRolePrompt(checkerRequest(true), "English", undefined, length).packet);
    expect(writer.contractId).toBe(SYNTHESIZER_LENGTH_SOURCES_CONTRACT_ID);
    expect(checker.contractId).toBe(EVALUATOR_LENGTH_SOURCES_CONTRACT_ID);
    expect(digestField(checker)).toBe(digestField(writer));
    expect(JSON.parse(digestField(checker)).nodes[0].extract).toEqual(EXTRACT);
    // The rest of its material is today's: the label, the candidate, then its two length fields.
    expect(checker.fields.map((field) => field.name)).toEqual(["digest", "code_label", "candidate_statement", "answer_length", "length"]);
  });

  it("told the reader's level: its length-reader sources variant, the same digest as the writer's", () => {
    const writer = readPromptFrame(buildSynthesisRolePrompt(writerRequest(true), "English", undefined, length, null, "plain").packet);
    const checker = readPromptFrame(buildSynthesisRolePrompt(checkerRequest(true), "English", undefined, length, null, "plain").packet);
    expect(writer.contractId).toBe(SYNTHESIZER_LENGTH_READER_SOURCES_CONTRACT_ID);
    expect(checker.contractId).toBe(EVALUATOR_LENGTH_READER_SOURCES_CONTRACT_ID);
    expect(digestField(checker)).toBe(digestField(writer));
    expect(checker.fields.at(-1)!.name).toBe("reader");
  });

  it("an unlengthed checker with extracts is a defect, as the writer's is: refused, never sent blind", () => {
    expect(() => buildSynthesisRolePrompt(checkerRequest(true), "English")).toThrow("A checker that reads extracts is always told its length");
    expect(() => buildSynthesisRolePrompt(writerRequest(true), "English")).toThrow("A writer that reads extracts is always told its length");
  });
});

describe("a debate with no packs sends today's checker packet, byte for byte", () => {
  it("unlengthed, lengthed and told the level: the packets the code sent before this task", () => {
    // The request exactly as the pin was printed: no extract anywhere, the candidate "Yes.".
    const today = buildEvaluatorRequest({ controls, round: 1, digest: digestOf(false), codeLabel, candidateStatement: "Yes." });
    const packet = (told: typeof length | null, level: "plain" | null) =>
      sha256(JSON.stringify(buildSynthesisRolePrompt(today, "English", fixed, told ?? undefined, null, level).packet));
    expect({ bare: packet(null, null), lengthed: packet(length, null), reader: packet(length, "plain") }).toEqual(TODAY);
    expect(readPromptFrame(buildSynthesisRolePrompt(checkerRequest(false), "English", undefined, length).packet).contractId)
      .toBe("serve.evaluator.length.v1");
    expect(digestField(readPromptFrame(buildSynthesisRolePrompt(checkerRequest(false), "English", undefined, length).packet)))
      .not.toContain("extract");
  });
});

describe("the seals", () => {
  it("the engine seal appends the two after W4-2's dig planner; the composer and conformance seals do not move", () => {
    const sealed = engineSealedContracts();
    // Right after W4-2's dig planner; W5-1's final-report five follow them (appended later, same seal).
    const after = ENGINE_SEALED_CONTRACT_IDS.indexOf("web.plan-dig.v1") + 1;
    expect(sealed.slice(after, after + 2)).toEqual([...EVALUATOR_SOURCES_SEALED_CONTRACTS]);
    expect(ENGINE_SEALED_CONTRACT_IDS.slice(after - 1, after + 2)).toEqual(["web.plan-dig.v1", "serve.evaluator.length.sources.v1",
      "serve.evaluator.length.reader.sources.v1"]);
    expect(sha256(SYNTHESIZER_CONTRACTS_FINGERPRINT_TEXT)).toBe(COMPOSER_SEAL);
    expect(sha256(EVALUATOR_CONTRACTS_FINGERPRINT_TEXT)).toBe(CONFORMANCE_SEAL);
    expect(codePromptContractHashes()).toMatchObject({ composer: COMPOSER_SEAL, conformance: CONFORMANCE_SEAL });
    for (const contract of EVALUATOR_SOURCES_SEALED_CONTRACTS) {
      expect(EVALUATOR_CONTRACTS_FINGERPRINT_TEXT).not.toContain(promptContractFingerprintText(contract));
      expect(SYNTHESIZER_CONTRACTS_FINGERPRINT_TEXT).not.toContain(contract.contractId);
    }
  });
});
