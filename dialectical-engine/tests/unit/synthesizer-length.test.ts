import { describe, expect, it } from "vitest";
import { promptContractFingerprintText, readPromptFrame } from "@debateai/providers";
import {
  SYNTHESIZER_CONTRACTS_FINGERPRINT_TEXT, SYNTHESIZER_LENGTH_PROMPT_CONTRACT, SYNTHESIZER_LENGTH_SENTENCE, SYNTHESIZER_PROMPT_CONTRACT
} from "@debateai/serve";
import { buildSynthesisRolePrompt, shapeWriterBound } from "../../apps/runner/src/index.js";
import { builderFromRecordedPacket, captureMomentPacket } from "../../acceptance/moment-tools.js";
import { synthesisRequestFixture } from "../support/synthesisRequestFixture.js";

describe("the answer length (spec §3.3 step 8)", () => {
  it("without a length the writer's prompt is today's, byte for byte", () => {
    const request = synthesisRequestFixture();
    const fixed = (size: number) => Buffer.alloc(size, 7);
    const today = buildSynthesisRolePrompt(request, "English", fixed);
    expect(buildSynthesisRolePrompt(request, "English", fixed, null).packet).toEqual(today.packet);
    expect(readPromptFrame(today.packet).contractId).toBe("serve.synthesizer.v3");
  });

  it("with a length it uses the length variant and adds answer_length last", () => {
    const frame = readPromptFrame(buildSynthesisRolePrompt(synthesisRequestFixture(), "English", undefined, 700).packet);
    expect(frame.contractId).toBe("serve.synthesizer.length.v1");
    expect(frame.fields.at(-1)).toEqual({ name: "answer_length", content: "about 700 words" });
    expect(SYNTHESIZER_LENGTH_PROMPT_CONTRACT.instruction).toBe(`${SYNTHESIZER_PROMPT_CONTRACT.instruction} ${SYNTHESIZER_LENGTH_SENTENCE}`);
    expect(SYNTHESIZER_LENGTH_SENTENCE).not.toMatch(/\d/u);
  });

  it("the composer fingerprint is v3 then the length variant", () => {
    expect(SYNTHESIZER_CONTRACTS_FINGERPRINT_TEXT).toBe([
      promptContractFingerprintText(SYNTHESIZER_PROMPT_CONTRACT),
      promptContractFingerprintText(SYNTHESIZER_LENGTH_PROMPT_CONTRACT)].join("\n---\n"));
  });

  it("the writer bound is the larger of the sealed bound and the length's bound", () => {
    const sealed = { maxAttempts: 3, tokenCeiling: 2_048, deadlineMs: 180_000 };
    expect(shapeWriterBound(sealed, null)).toBe(sealed);
    expect(shapeWriterBound(sealed, 12_288)).toEqual({ ...sealed, tokenCeiling: 12_288 });
    expect(shapeWriterBound({ ...sealed, tokenCeiling: 20_000 }, 8_192).tokenCeiling).toBe(20_000);
  });

  it("a recorded lengthed writer call replays as the length variant (pre-flight PF-B16)", async () => {
    const recorded = buildSynthesisRolePrompt(synthesisRequestFixture(), "the same language as the question", undefined, 700);
    const builder = builderFromRecordedPacket("ANSWER_WRITER", "COMPOSER:SYNTHESIZER:INITIAL:1", recorded.packet);
    expect(builder).toMatchObject({ family: "SYNTHESIS_WRITER", inputs: { answerWords: 700 } });
    const replayed = readPromptFrame(await captureMomentPacket(builder));
    expect(replayed.contractId).toBe("serve.synthesizer.length.v1");
    expect(replayed.fields.at(-1)).toEqual({ name: "answer_length", content: "about 700 words" });
  });
});
