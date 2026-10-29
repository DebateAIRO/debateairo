import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  LENGTH_GUIDANCE_START, LENGTH_SENTENCE_ANSWER_CHECKER, READER_FIELD, READER_SENTENCE_ANSWER_CHECKER, READER_SENTENCE_STORY_CHECKER,
  READER_SENTENCE_WRITING, READER_SENTENCES, READING_LEVELS, isReadingLevel, readerField, withReaderField, type ReadingLevel
} from "@debateai/kernel";
import { promptContractFingerprintText, readPromptFrame, type PromptPacket } from "@debateai/providers";
import {
  SYNTHESIZER_CONTRACTS_FINGERPRINT_TEXT, SYNTHESIZER_INSTRUCTIONS, SYNTHESIZER_LENGTH_PROMPT_CONTRACT,
  SYNTHESIZER_LENGTH_READER_PROMPT_CONTRACT, SYNTHESIZER_LENGTH_SENTENCE, SYNTHESIZER_PROMPT_CONTRACT,
  SYNTHESIZER_READER_PROMPT_CONTRACT, buildEvaluatorRequest, buildSynthesisDigest, toSynthesisPromptMaterial,
  type SynthesisDigest
} from "@debateai/serve";
import {
  EVALUATOR_CONTRACTS_FINGERPRINT_TEXT, EVALUATOR_LENGTH_PROMPT_CONTRACT, EVALUATOR_LENGTH_READER_PROMPT_CONTRACT,
  EVALUATOR_PROMPT_CONTRACT, EVALUATOR_READER_PROMPT_CONTRACT, buildSynthesisRolePrompt, codePromptContractHashes
} from "../../apps/runner/src/index.js";
import { synthesisRequestFixture } from "../support/synthesisRequestFixture.js";

/*
 * V4 reading level reaches the writers (owner ruling N6, 2026-10-29). The person's level rides with the ask; the answer
 * writer and the storyteller get a `reader` material field (one fixed sentence per level) and one fixed instruction
 * sentence; the answer checker and the story checker are told the same level, so they never object to plain wording or to
 * expert terms. A debate asked without a level sends today's packets byte for byte. OWNER WORDING — pending approval.
 */

const CPW = LENGTH_GUIDANCE_START.charactersPerWord;
const FIXED = (size: number) => Buffer.alloc(size, 7);
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const frameOf = (packet: PromptPacket) => readPromptFrame(packet);

function digest(): SynthesisDigest {
  const outcome = buildSynthesisDigest({
    nodes: [{
      nodeId: "position:a", statement: "The proposal holds on cost.", finalStrength: 0.61,
      wayOfKnowing: "REASONING", marks: [], polarityRelations: [], isPosition: true, isSurvivingObjection: false
    }],
    servedRootNodeId: "position:a",
    budgetBound: 8_192
  });
  if (outcome.kind !== "DIGEST") throw new Error("the checker digest fixture must exist");
  return outcome.digest;
}
const checkerRequest = () => buildEvaluatorRequest({
  controls: { synthesizerRoleRef: "provider:w", evaluatorRoleRef: "provider:c", evaluatorLoopMaxRounds: 3 },
  round: 1, digest: digest(),
  codeLabel: { verdictLabel: "CONTESTED", servedNodeId: "position:a", servedStrength: 0.61, margin: 0.12, registerVersion: 5 },
  candidateStatement: "The proposal holds."
});
const WRITER_LENGTH = Object.freeze({ answerWords: 350, ownWords: null, languageCode: null, charactersPerWord: CPW });
const CHECKER_LENGTH = Object.freeze({ answerWords: 350, ownWords: 150, languageCode: null, charactersPerWord: CPW });

describe("the reader sentences (kernel; owner wording, pending approval)", () => {
  it("pins the three levels, the field name and every sentence byte for byte", () => {
    expect(READING_LEVELS).toEqual(["plain", "background", "expert"]);
    expect(READER_FIELD).toBe("reader");
    expect(READER_SENTENCES).toEqual({
      plain: "The reader wants plain words: everyday words and short sentences, no jargon; explain any term you cannot avoid.",
      background: "The reader knows the basics: name the key terms briefly and give the main reasons behind each point.",
      expert: "The reader knows the field: use precise terms, and keep the figures, sources and caveats."
    });
    expect(READER_SENTENCE_WRITING).toBe("Write for the reader described in reader.");
    expect(READER_SENTENCE_ANSWER_CHECKER).toBe(
      "The answer was written for the reader described in reader; never object to plain words or to precise terms that suit that reader.");
    expect(READER_SENTENCE_STORY_CHECKER).toBe(
      "The story was written for the reader described in reader; never object to plain words or to precise terms that suit that reader.");
  });

  it("readerField holds the level's sentence; withReaderField appends it, or returns the same array with no level", () => {
    for (const level of READING_LEVELS) {
      expect(isReadingLevel(level)).toBe(true);
      expect(readerField(level)).toEqual({ name: "reader", content: READER_SENTENCES[level] });
    }
    for (const other of ["Plain", "", "basic", null, undefined, 1]) expect(isReadingLevel(other)).toBe(false);
    expect(() => readerField("basic" as ReadingLevel)).toThrowError(new TypeError("READING_LEVEL_INVALID"));
    const material = Object.freeze([{ name: "digest", content: "x" }]);
    expect(withReaderField(material, null)).toBe(material);
    expect(withReaderField(material, undefined)).toBe(material);
    expect(withReaderField(material, "plain")).toEqual([...material, readerField("plain")]);
  });
});

describe("the answer writer told the level (new sealed variants)", () => {
  it("serve.synthesizer.reader.v1 and length.reader.v1 are v4 plus the sentences, with v4's answer form", () => {
    expect(SYNTHESIZER_READER_PROMPT_CONTRACT).toEqual({ contractId: "serve.synthesizer.reader.v1",
      instruction: `${SYNTHESIZER_INSTRUCTIONS} ${READER_SENTENCE_WRITING}`, answerForm: SYNTHESIZER_PROMPT_CONTRACT.answerForm });
    expect(SYNTHESIZER_LENGTH_READER_PROMPT_CONTRACT).toEqual({ contractId: "serve.synthesizer.length.reader.v1",
      instruction: `${SYNTHESIZER_INSTRUCTIONS} ${SYNTHESIZER_LENGTH_SENTENCE} ${READER_SENTENCE_WRITING}`,
      answerForm: SYNTHESIZER_PROMPT_CONTRACT.answerForm });
  });

  it("without a level the writer's packet is today's, byte for byte (with and without a length, with a lock)", () => {
    const request = synthesisRequestFixture();
    const lock = { code: "ro", name: "Romanian" };
    for (const length of [null, WRITER_LENGTH]) for (const language of [null, lock]) {
      const today = buildSynthesisRolePrompt(request, "English", FIXED, length, language).packet;
      expect(buildSynthesisRolePrompt(request, "English", FIXED, length, language, null).packet).toEqual(today);
      expect(frameOf(today).fields.map((field) => field.name)).not.toContain("reader");
      expect(today.messages[0]!.content).not.toContain(READER_SENTENCE_WRITING);
    }
    expect(frameOf(buildSynthesisRolePrompt(request, "English", FIXED, null, null, null).packet).contractId).toBe("serve.synthesizer.v4");
  });

  it.each(READING_LEVELS)("with %s: the reader variant, the reader field last (before question_language)", (level) => {
    const request = synthesisRequestFixture();
    const plain = buildSynthesisRolePrompt(request, "English", FIXED, null, null, level).packet;
    expect(frameOf(plain).contractId).toBe("serve.synthesizer.reader.v1");
    expect(frameOf(plain).fields).toEqual([...toSynthesisPromptMaterial(request).map((f) => ({ name: f.name, content: f.content })),
      { name: "reader", content: READER_SENTENCES[level] }]);
    expect(plain.messages[0]!.content).toContain(`${SYNTHESIZER_INSTRUCTIONS} ${READER_SENTENCE_WRITING}`);
    const lengthed = frameOf(buildSynthesisRolePrompt(request, "English", FIXED, WRITER_LENGTH, { code: "en", name: "English" }, level).packet);
    expect(lengthed.contractId).toBe("serve.synthesizer.length.reader.v1");
    expect(lengthed.fields.slice(-3)).toEqual([{ name: "answer_length", content: "about 350 words" },
      { name: "reader", content: READER_SENTENCES[level] }, expect.objectContaining({ name: "question_language" })]);
  });
});

describe("the answer checker told the level (new sealed variants)", () => {
  it("serve.evaluator.reader.v1 and length.reader.v1 are v2 plus the sentences, with v2's answer form", () => {
    expect(EVALUATOR_READER_PROMPT_CONTRACT).toEqual({ contractId: "serve.evaluator.reader.v1",
      instruction: `${EVALUATOR_PROMPT_CONTRACT.instruction} ${READER_SENTENCE_ANSWER_CHECKER}`,
      answerForm: EVALUATOR_PROMPT_CONTRACT.answerForm });
    expect(EVALUATOR_LENGTH_READER_PROMPT_CONTRACT).toEqual({ contractId: "serve.evaluator.length.reader.v1",
      instruction: `${EVALUATOR_PROMPT_CONTRACT.instruction} ${LENGTH_SENTENCE_ANSWER_CHECKER} ${READER_SENTENCE_ANSWER_CHECKER}`,
      answerForm: EVALUATOR_PROMPT_CONTRACT.answerForm });
  });

  it("without a level the checker's packet is today's, byte for byte", () => {
    const request = checkerRequest();
    for (const length of [null, CHECKER_LENGTH]) {
      const today = buildSynthesisRolePrompt(request, "English", FIXED, length).packet;
      expect(buildSynthesisRolePrompt(request, "English", FIXED, length, null, null).packet).toEqual(today);
      expect(frameOf(today).fields.map((field) => field.name)).not.toContain("reader");
    }
  });

  it("with a level: the reader variant; the reader field after answer_length and length", () => {
    const request = checkerRequest();
    const plain = frameOf(buildSynthesisRolePrompt(request, "English", FIXED, null, null, "expert").packet);
    expect(plain.contractId).toBe("serve.evaluator.reader.v1");
    expect(plain.fields.at(-1)).toEqual({ name: "reader", content: READER_SENTENCES.expert });
    const lengthed = frameOf(buildSynthesisRolePrompt(request, "English", FIXED, CHECKER_LENGTH, null, "plain").packet);
    expect(lengthed.contractId).toBe("serve.evaluator.length.reader.v1");
    expect(lengthed.fields.slice(-3)).toEqual([{ name: "answer_length", content: "about 350 words" },
      { name: "length", content: "about 150 words" }, { name: "reader", content: READER_SENTENCES.plain }]);
    // A writer target alone (ownWords null) never lengthens the checker: the reader variant without length.
    expect(frameOf(buildSynthesisRolePrompt(request, "English", FIXED, WRITER_LENGTH, null, "plain").packet).contractId)
      .toBe("serve.evaluator.reader.v1");
  });
});

describe("the seals carry every contract the code sends", () => {
  it("composer: v4, length.v3, reader.v1, length.reader.v1", () => {
    expect(SYNTHESIZER_CONTRACTS_FINGERPRINT_TEXT).toBe([
      SYNTHESIZER_PROMPT_CONTRACT, SYNTHESIZER_LENGTH_PROMPT_CONTRACT, SYNTHESIZER_READER_PROMPT_CONTRACT,
      SYNTHESIZER_LENGTH_READER_PROMPT_CONTRACT
    ].map(promptContractFingerprintText).join("\n---\n"));
    expect(codePromptContractHashes().composer).toBe(sha256(SYNTHESIZER_CONTRACTS_FINGERPRINT_TEXT));
  });

  it("conformance: v2, length.v1, reader.v1, length.reader.v1", () => {
    expect(EVALUATOR_CONTRACTS_FINGERPRINT_TEXT).toBe([
      EVALUATOR_PROMPT_CONTRACT, EVALUATOR_LENGTH_PROMPT_CONTRACT, EVALUATOR_READER_PROMPT_CONTRACT,
      EVALUATOR_LENGTH_READER_PROMPT_CONTRACT
    ].map(promptContractFingerprintText).join("\n---\n"));
    expect(codePromptContractHashes().conformance).toBe(sha256(EVALUATOR_CONTRACTS_FINGERPRINT_TEXT));
  });
});
