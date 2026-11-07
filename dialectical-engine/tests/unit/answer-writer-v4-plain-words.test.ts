import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { LENGTH_GUIDANCE_START } from "@debateai/kernel";
import { promptContractFingerprintText, readPromptFrame } from "@debateai/providers";
import {
  SYNTHESIZER_ANSWER_FORM,
  SYNTHESIZER_CONTRACT_ID,
  SYNTHESIZER_CONTRACTS_FINGERPRINT_TEXT,
  SYNTHESIZER_INSTRUCTIONS,
  SYNTHESIZER_LENGTH_CONTRACT_ID,
  SYNTHESIZER_LENGTH_PROMPT_CONTRACT,
  SYNTHESIZER_LENGTH_READER_PROMPT_CONTRACT,
  SYNTHESIZER_LENGTH_SENTENCE,
  SYNTHESIZER_LENGTH_V1_CONTRACT_ID,
  SYNTHESIZER_LENGTH_V1_PROMPT_CONTRACT,
  SYNTHESIZER_LENGTH_V1_SENTENCE,
  SYNTHESIZER_LENGTH_V2_CONTRACT_ID,
  SYNTHESIZER_LENGTH_V2_PROMPT_CONTRACT,
  SYNTHESIZER_PROMPT_CONTRACT,
  SYNTHESIZER_READER_PROMPT_CONTRACT,
  SYNTHESIZER_V3_ANSWER_FORM,
  SYNTHESIZER_V3_CONTRACT_ID,
  SYNTHESIZER_V3_CONTRACTS_FINGERPRINT_TEXT,
  SYNTHESIZER_V3_PROMPT_CONTRACT,
  SYNTHESIZER_V4_CONTRACTS_FINGERPRINT_TEXT
} from "@debateai/serve";
import { buildSynthesisRolePrompt, buildSynthesizerPromptPacket, codePromptContractHashes } from "../../apps/runner/src/index.js";
import { synthesisRequestFixture } from "../support/synthesisRequestFixture.js";

/**
 * The owner's blind reading (2026-10-15): in Romanian answers the writer translated v3's English rule word for
 * word. "says plainly that it is not yet settled" came back as «și acesta nu este încă așezat» (the wrong sense of
 * "settled") and "what evidence would settle it" as the heading-like «Ce ar putea stabili întrebarea:». The owner
 * approved option 1: the first segment says, in natural words of the question's language, that the answer may still
 * change; the second says what evidence would decide it; both are ordinary sentences, never a translation of the
 * instructions. v3 is sealed (register 12's composer row, and with its length variant the 9a46af29... row), so the new
 * wording is serve.synthesizer.v4 with its length variant serve.synthesizer.length.v2; v3 and length.v1 stay as
 * history, byte for byte.
 */
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

/** serve.synthesizer.v3, as shipped (register 12), one literal. */
const V3_FORM =
  "Return only JSON with a segments array of at most two {segment_id,text,node_refs,served_number_refs} entries. "
  + "node_refs lists the ids of the points whose facts the segment states, copied exactly. Add no facts. "
  + "When the points a segment relies on rest on reasoning alone, with nothing measured or looked up behind them, "
  + "return two segments in order: the first gives the provisional answer and says plainly that it is not yet "
  + "settled; the second says what evidence would settle it. Never start a segment with a heading or a label. "
  + "segment_id and every node_refs entry must be an ASCII identifier matching ^[A-Za-z0-9][A-Za-z0-9:._-]*$; "
  + "copy ids exactly and never translate identifiers. served_number_refs is always [].";

/** v3's one clause the owner replaced, and the owner-approved replacement (option 1, 2026-10-15). */
const V3_CLAUSE = "the first gives the provisional answer and says plainly that it is not yet settled; "
  + "the second says what evidence would settle it.";
const V4_CLAUSE = "the first gives the provisional answer and says plainly, in natural words of the question's "
  + "language, that it may still change; the second says what evidence would decide it. Write both as ordinary "
  + "sentences in that language, never as a translation of these instructions.";

/** serve.synthesizer.v4, one literal. */
const V4_FORM =
  "Return only JSON with a segments array of at most two {segment_id,text,node_refs,served_number_refs} entries. "
  + "node_refs lists the ids of the points whose facts the segment states, copied exactly. Add no facts. "
  + "When the points a segment relies on rest on reasoning alone, with nothing measured or looked up behind them, "
  + "return two segments in order: the first gives the provisional answer and says plainly, in natural words of the "
  + "question's language, that it may still change; the second says what evidence would decide it. Write both as "
  + "ordinary sentences in that language, never as a translation of these instructions. Never start a segment with "
  + "a heading or a label. "
  + "segment_id and every node_refs entry must be an ASCII identifier matching ^[A-Za-z0-9][A-Za-z0-9:._-]*$; "
  + "copy ids exactly and never translate identifiers. served_number_refs is always [].";

const NEW_SENTENCES = [
  "says plainly, in natural words of the question's language, that it may still change",
  "the second says what evidence would decide it.",
  "Write both as ordinary sentences in that language, never as a translation of these instructions."
] as const;
const GONE = ["it is not yet settled", "would settle it"] as const;

/**
 * composerContractHash: v3 alone (register 12), v3 + length.v1 (the debate-shape practice value), v4 + length.v2 (history
 * since the V4 reading level), and v4 + length.v3 + reader.v1 + length.reader.v1 (owner N6 and 17 Oct #5, 2026-10-29).
 */
const COMPOSER_V3 = "4b141d3ab287366c4969f89e04649c5f1cc951d433206ffa0295527eba4df90f";
const COMPOSER_V3_LENGTH_V1 = "9a46af295fe2c32c3ce386253dbedb6061004b564b68acdf25a3eccf08b25662";
const COMPOSER_V4_LENGTH_V2 = "879d2c5d0213832fe466537603e5171e53248cce41188473550616d2dd5b4a47";
const COMPOSER_READER = "6fb174d4d75ad1d39bf8246f741a7ab0ee60fc2b6d117aa228de83cfca29324d";

describe("answer writer v4: the provisional answer in plain words of the question's language (owner, 2026-10-15)", () => {
  it("v4's form is v3's with only the owner's clause replaced, every other sentence unchanged", () => {
    expect(SYNTHESIZER_CONTRACT_ID).toBe("serve.synthesizer.v4");
    expect(SYNTHESIZER_PROMPT_CONTRACT.contractId).toBe("serve.synthesizer.v4");
    expect(SYNTHESIZER_ANSWER_FORM).toBe(V4_FORM);
    expect(V3_FORM.split(V3_CLAUSE)).toHaveLength(2);
    expect(V3_FORM.replace(V3_CLAUSE, V4_CLAUSE)).toBe(V4_FORM);
    expect(SYNTHESIZER_PROMPT_CONTRACT).toEqual({
      contractId: "serve.synthesizer.v4", instruction: SYNTHESIZER_INSTRUCTIONS, answerForm: V4_FORM
    });
    // length.v2 (v4's first length variant) is sealed history; length.v3 names "the length" (owner 17 Oct #5).
    expect(SYNTHESIZER_LENGTH_V2_CONTRACT_ID).toBe("serve.synthesizer.length.v2");
    expect(SYNTHESIZER_LENGTH_V2_PROMPT_CONTRACT).toEqual({
      contractId: "serve.synthesizer.length.v2",
      instruction: `${SYNTHESIZER_INSTRUCTIONS} ${SYNTHESIZER_LENGTH_V1_SENTENCE}`,
      answerForm: V4_FORM
    });
    expect(SYNTHESIZER_LENGTH_CONTRACT_ID).toBe("serve.synthesizer.length.v3");
    expect(SYNTHESIZER_LENGTH_PROMPT_CONTRACT).toEqual({
      contractId: "serve.synthesizer.length.v3",
      instruction: `${SYNTHESIZER_INSTRUCTIONS} ${SYNTHESIZER_LENGTH_SENTENCE}`,
      answerForm: V4_FORM
    });
  });

  it.each([
    ["the writer without a length", () => buildSynthesisRolePrompt(synthesisRequestFixture(), "Romanian").packet, "serve.synthesizer.v4"],
    ["the writer with a length", () => buildSynthesisRolePrompt(synthesisRequestFixture(), "Romanian", undefined, { answerWords: 700,
      ownWords: null, languageCode: null, charactersPerWord: LENGTH_GUIDANCE_START.charactersPerWord }).packet,
      "serve.synthesizer.length.v3"],
    ["the runner's writer packet", () => buildSynthesizerPromptPacket(synthesisRequestFixture(), "Romanian"), "serve.synthesizer.v4"]
  ] as const)("%s is SENT the new sentences and never v3's words", (_name, build, contractId) => {
    const packet = build();
    expect(readPromptFrame(packet).contractId).toBe(contractId);
    const system = packet.messages[0]!.content;
    expect(system).toContain(V4_FORM);
    for (const sentence of NEW_SENTENCES) expect(system).toContain(sentence);
    for (const gone of GONE) expect(system).not.toContain(gone);
  });

  it("keeps serve.synthesizer.v3 and serve.synthesizer.length.v1 as history, byte for byte, with their seals", () => {
    expect(SYNTHESIZER_V3_CONTRACT_ID).toBe("serve.synthesizer.v3");
    expect(SYNTHESIZER_V3_ANSWER_FORM).toBe(V3_FORM);
    expect(SYNTHESIZER_V3_PROMPT_CONTRACT).toEqual({
      contractId: "serve.synthesizer.v3", instruction: SYNTHESIZER_INSTRUCTIONS, answerForm: V3_FORM
    });
    expect(SYNTHESIZER_LENGTH_V1_CONTRACT_ID).toBe("serve.synthesizer.length.v1");
    expect(SYNTHESIZER_LENGTH_V1_PROMPT_CONTRACT).toEqual({
      contractId: "serve.synthesizer.length.v1",
      instruction: `${SYNTHESIZER_INSTRUCTIONS} ${SYNTHESIZER_LENGTH_V1_SENTENCE}`,
      answerForm: V3_FORM
    });
    expect(sha256(promptContractFingerprintText(SYNTHESIZER_V3_PROMPT_CONTRACT))).toBe(COMPOSER_V3);
    expect(SYNTHESIZER_V3_CONTRACTS_FINGERPRINT_TEXT).toBe([
      promptContractFingerprintText(SYNTHESIZER_V3_PROMPT_CONTRACT),
      promptContractFingerprintText(SYNTHESIZER_LENGTH_V1_PROMPT_CONTRACT)].join("\n---\n"));
    expect(sha256(SYNTHESIZER_V3_CONTRACTS_FINGERPRINT_TEXT)).toBe(COMPOSER_V3_LENGTH_V1);
  });

  it("keeps v4 + length.v2 as history (879d2c5d...), and moves composerContractHash to the reading-level text, which the runner checks the register against", () => {
    expect(SYNTHESIZER_V4_CONTRACTS_FINGERPRINT_TEXT).toBe([
      promptContractFingerprintText(SYNTHESIZER_PROMPT_CONTRACT),
      promptContractFingerprintText(SYNTHESIZER_LENGTH_V2_PROMPT_CONTRACT)].join("\n---\n"));
    expect(sha256(SYNTHESIZER_V4_CONTRACTS_FINGERPRINT_TEXT)).toBe(COMPOSER_V4_LENGTH_V2);
    expect(SYNTHESIZER_CONTRACTS_FINGERPRINT_TEXT).toBe([
      promptContractFingerprintText(SYNTHESIZER_PROMPT_CONTRACT),
      promptContractFingerprintText(SYNTHESIZER_LENGTH_PROMPT_CONTRACT),
      promptContractFingerprintText(SYNTHESIZER_READER_PROMPT_CONTRACT),
      promptContractFingerprintText(SYNTHESIZER_LENGTH_READER_PROMPT_CONTRACT)].join("\n---\n"));
    const composer = sha256(SYNTHESIZER_CONTRACTS_FINGERPRINT_TEXT);
    expect(composer).not.toBe(COMPOSER_V3);
    expect(composer).not.toBe(COMPOSER_V3_LENGTH_V1);
    expect(composer).not.toBe(COMPOSER_V4_LENGTH_V2);
    expect(composer).toBe(COMPOSER_READER);
    expect(codePromptContractHashes().composer).toBe(COMPOSER_READER);
  });
});
