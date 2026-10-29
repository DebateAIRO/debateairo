import { describe, expect, it } from "vitest";
import { LENGTH_GUIDANCE_START } from "@debateai/kernel";
import { buildFramedPrompt, promptContractFingerprintText, readPromptFrame, type PromptContract } from "@debateai/providers";
import { canonicalPromptFingerprint } from "@debateai/scorecard";
import {
  SYNTHESIZER_CONTRACTS_FINGERPRINT_TEXT, SYNTHESIZER_INSTRUCTIONS, SYNTHESIZER_LENGTH_PROMPT_CONTRACT, SYNTHESIZER_LENGTH_SENTENCE,
  SYNTHESIZER_LENGTH_V1_SENTENCE, SYNTHESIZER_LENGTH_V2_PROMPT_CONTRACT, SYNTHESIZER_LENGTH_READER_PROMPT_CONTRACT,
  SYNTHESIZER_PROMPT_CONTRACT, SYNTHESIZER_READER_PROMPT_CONTRACT, SYNTHESIZER_V4_CONTRACTS_FINGERPRINT_TEXT,
  synthesizerAnswerLengthField, toSynthesisPromptMaterial
} from "@debateai/serve";
import { buildSynthesisRolePrompt, shapeWriterBound } from "../../apps/runner/src/index.js";
import { builderFromRecordedPacket, captureMomentPacket } from "../../acceptance/moment-tools.js";
import { synthesisRequestFixture } from "../support/synthesisRequestFixture.js";

// Answer writer v4 (owner-approved wording, 2026-10-15): the current writer contract is serve.synthesizer.v4 and its
// length variant serve.synthesizer.length.v3 (owner 17 Oct #5, 2026-10-29: the sentence names "the length", so the zh / ja /
// th field, which names characters, never reads "words"); length.v2, v3 and length.v1 are sealed history
// (tests/unit/answer-writer-v4-plain-words.test.ts).
describe("the answer length (spec §3.3 step 8)", () => {
  it("without a length the writer's prompt is today's, byte for byte", () => {
    const request = synthesisRequestFixture();
    const fixed = (size: number) => Buffer.alloc(size, 7);
    const today = buildSynthesisRolePrompt(request, "English", fixed);
    expect(buildSynthesisRolePrompt(request, "English", fixed, null).packet).toEqual(today.packet);
    expect(readPromptFrame(today.packet).contractId).toBe("serve.synthesizer.v4");
  });

  it("with a length it uses the length variant and adds answer_length last", () => {
    const frame = readPromptFrame(buildSynthesisRolePrompt(synthesisRequestFixture(), "English", undefined, { answerWords: 700, ownWords: null, languageCode: null, charactersPerWord: LENGTH_GUIDANCE_START.charactersPerWord }).packet);
    expect(frame.contractId).toBe("serve.synthesizer.length.v3");
    expect(frame.fields.at(-1)).toEqual({ name: "answer_length", content: "about 700 words" });
    expect(SYNTHESIZER_LENGTH_PROMPT_CONTRACT.instruction).toBe(`${SYNTHESIZER_PROMPT_CONTRACT.instruction} ${SYNTHESIZER_LENGTH_SENTENCE}`);
    expect(SYNTHESIZER_LENGTH_SENTENCE).not.toMatch(/\d/u);
  });

  it("the length sentence names the length, never words (owner 17 Oct #5; owner wording, pending approval)", () => {
    expect(SYNTHESIZER_LENGTH_SENTENCE).toBe("Write the answer in about the length named in answer_length; "
      + "it is a target, never a reason to leave out a point the answer needs.");
    expect(SYNTHESIZER_LENGTH_SENTENCE).not.toMatch(/\bwords?\b/u);
    // Everything after the first clause is length.v2's sentence, byte for byte.
    expect(SYNTHESIZER_LENGTH_SENTENCE.slice(SYNTHESIZER_LENGTH_SENTENCE.indexOf(";")))
      .toBe(SYNTHESIZER_LENGTH_V1_SENTENCE.slice(SYNTHESIZER_LENGTH_V1_SENTENCE.indexOf(";")));
    expect(SYNTHESIZER_LENGTH_SENTENCE.indexOf(";")).toBeGreaterThan(-1);
    // A zh / ja / th writer: the field names characters and no sentence of the instruction says words.
    for (const languageCode of ["zh-Hans", "ja", "th"]) {
      const packet = buildSynthesisRolePrompt(synthesisRequestFixture(), "Chinese", undefined,
        { answerWords: 350, ownWords: null, languageCode, charactersPerWord: LENGTH_GUIDANCE_START.charactersPerWord }).packet;
      expect(readPromptFrame(packet).fields.at(-1)?.content).toMatch(/^about [0-9]+ characters$/u);
      expect(packet.messages[0]!.content).toContain(SYNTHESIZER_LENGTH_SENTENCE);
      expect(packet.messages[0]!.content).not.toContain("number of words");
    }
  });

  it("keeps length.v2 as sealed history, byte for byte", () => {
    expect(SYNTHESIZER_LENGTH_V1_SENTENCE).toBe("Write the answer in about the number of words named in answer_length; "
      + "it is a target, never a reason to leave out a point the answer needs.");
    expect(SYNTHESIZER_LENGTH_V2_PROMPT_CONTRACT).toEqual({ contractId: "serve.synthesizer.length.v2",
      instruction: `${SYNTHESIZER_INSTRUCTIONS} ${SYNTHESIZER_LENGTH_V1_SENTENCE}`, answerForm: SYNTHESIZER_PROMPT_CONTRACT.answerForm });
    expect(SYNTHESIZER_V4_CONTRACTS_FINGERPRINT_TEXT).toBe([
      promptContractFingerprintText(SYNTHESIZER_PROMPT_CONTRACT),
      promptContractFingerprintText(SYNTHESIZER_LENGTH_V2_PROMPT_CONTRACT)].join("\n---\n"));
  });

  it("the composer fingerprint is the current contract (v4), the length variant, then the two reader variants", () => {
    expect(SYNTHESIZER_CONTRACTS_FINGERPRINT_TEXT).toBe([
      promptContractFingerprintText(SYNTHESIZER_PROMPT_CONTRACT),
      promptContractFingerprintText(SYNTHESIZER_LENGTH_PROMPT_CONTRACT),
      promptContractFingerprintText(SYNTHESIZER_READER_PROMPT_CONTRACT),
      promptContractFingerprintText(SYNTHESIZER_LENGTH_READER_PROMPT_CONTRACT)].join("\n---\n"));
  });

  it("the writer bound is the larger of the sealed bound and the length's bound", () => {
    const sealed = { maxAttempts: 3, tokenCeiling: 2_048, deadlineMs: 180_000 };
    expect(shapeWriterBound(sealed, null)).toBe(sealed);
    expect(shapeWriterBound(sealed, 12_288)).toEqual({ ...sealed, tokenCeiling: 12_288 });
    expect(shapeWriterBound({ ...sealed, tokenCeiling: 20_000 }, 8_192).tokenCeiling).toBe(20_000);
  });

  it("refuses a writer bound that is not a positive whole number, and an answer length that is not one", () => {
    const sealed = { maxAttempts: 3, tokenCeiling: 2_048, deadlineMs: 180_000 };
    for (const invalid of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53]) {
      expect(() => shapeWriterBound(sealed, invalid), String(invalid)).toThrowError(new TypeError("SHAPE_WRITER_BOUND_INVALID"));
      expect(() => synthesizerAnswerLengthField(invalid), String(invalid)).toThrowError(new TypeError("SYNTHESIZER_ANSWER_LENGTH_INVALID"));
    }
  });

  it("a recorded lengthed writer call replays as the length variant (pre-flight PF-B16)", async () => {
    const recorded = buildSynthesisRolePrompt(synthesisRequestFixture(), "the same language as the question", undefined, { answerWords: 700, ownWords: null, languageCode: null, charactersPerWord: LENGTH_GUIDANCE_START.charactersPerWord });
    const builder = builderFromRecordedPacket("ANSWER_WRITER", "COMPOSER:SYNTHESIZER:INITIAL:1", recorded.packet);
    expect(builder).toMatchObject({ family: "SYNTHESIS_WRITER", inputs: { answerWords: 700 } });
    const replayedPacket = await captureMomentPacket(builder);
    const replayed = readPromptFrame(replayedPacket);
    expect(replayed.contractId).toBe("serve.synthesizer.length.v3");
    expect(replayed.fields.at(-1)).toEqual({ name: "answer_length", content: "about 700 words" });
    // export-moment's self-check 2: the live builder, fed the read-back inputs, sends the recorded prompt again.
    expect(canonicalPromptFingerprint(replayedPacket.messages)).toBe(canonicalPromptFingerprint(recorded.packet.messages));
  });

  /** A writer packet recorded under `contract` with today's material plus `extra` fields. */
  const recordedWith = (contract: PromptContract, extra: readonly { name: string; content: string }[]) => buildFramedPrompt({
    contract, material: [...toSynthesisPromptMaterial(synthesisRequestFixture()), ...extra]
  }).packet;

  it.each([
    ["the length variant without answer_length", SYNTHESIZER_LENGTH_PROMPT_CONTRACT, [], "MOMENT_FIELD_UNEXPECTED"],
    ["v4 with answer_length", SYNTHESIZER_PROMPT_CONTRACT, [{ name: "answer_length", content: "about 700 words" }], "MOMENT_FIELD_UNEXPECTED"],
    ["an unreadable answer_length (words, not digits)", SYNTHESIZER_LENGTH_PROMPT_CONTRACT,
      [{ name: "answer_length", content: "about seven words" }], "MOMENT_RECORDED_PROMPT_UNREADABLE"],
    ["an answer_length of zero", SYNTHESIZER_LENGTH_PROMPT_CONTRACT,
      [{ name: "answer_length", content: "about 0 words" }], "MOMENT_RECORDED_PROMPT_UNREADABLE"]
  ] as const)("refuses to replay %s", (_name, contract, extra, code) => {
    expect(() => builderFromRecordedPacket("ANSWER_WRITER", "COMPOSER:SYNTHESIZER:INITIAL:1", recordedWith(contract, extra)))
      .toThrowError(expect.objectContaining({ code }));
  });
});
