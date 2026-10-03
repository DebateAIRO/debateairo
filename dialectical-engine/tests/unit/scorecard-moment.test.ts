import { describe, expect, it } from "vitest";
import { appendFramedRejection, buildFramedPrompt, type FramedPrompt } from "@debateai/providers";
import {
  MOMENT_JSON_SCHEMA,
  MomentFileSchema,
  PUBLISHED_JSON_SCHEMA_FILES,
  REPLAY_RESULT_JSON_SCHEMA,
  ReplayResultSchema,
  canonicalPromptFingerprint,
  momentIdFor,
  type MomentFile
} from "@debateai/scorecard";
import { FIXTURE_PROMPT_CONTRACT } from "../support/framed-packet.js";

const bytesOf = (fill: number) => (size: number): Buffer => Buffer.alloc(size, fill);

function frame(question: string, randomBytes?: (size: number) => Buffer): FramedPrompt {
  return buildFramedPrompt({
    contract: FIXTURE_PROMPT_CONTRACT,
    material: [{ name: "question_line", content: question }, { name: "statement", content: "The same statement." }],
    ...(randomBytes === undefined ? {} : { randomBytes })
  });
}

const fingerprintOf = (framed: FramedPrompt): string => canonicalPromptFingerprint(framed.packet.messages);

describe("canonicalPromptFingerprint — the same prompt, whatever its per-call fence and canary", () => {
  it("gives two frames of the same content with different fences the same fingerprint", () => {
    const first = frame("Is the claim true?", bytesOf(0x11));
    const second = frame("Is the claim true?", bytesOf(0x22));
    expect(first.fence).not.toBe(second.fence);
    expect(first.canary).not.toBe(second.canary);
    expect(first.packet.messages).not.toEqual(second.packet.messages);
    expect(fingerprintOf(first)).toBe(fingerprintOf(second));
  });

  it("does the same for two frames minted by the real CSPRNG", () => {
    expect(fingerprintOf(frame("Is the claim true?"))).toBe(fingerprintOf(frame("Is the claim true?")));
  });

  it("gives different content, or a different instruction, a different fingerprint", () => {
    expect(fingerprintOf(frame("Is the claim true?", bytesOf(0x11)))).not.toBe(fingerprintOf(frame("Is the claim false?", bytesOf(0x11))));
    const otherInstruction = buildFramedPrompt({
      contract: { ...FIXTURE_PROMPT_CONTRACT, instruction: "Another fixture instruction." },
      material: [{ name: "question_line", content: "Is the claim true?" }, { name: "statement", content: "The same statement." }],
      randomBytes: bytesOf(0x11)
    });
    expect(fingerprintOf(otherInstruction)).not.toBe(fingerprintOf(frame("Is the claim true?", bytesOf(0x11))));
  });

  it("masks only the frame's own tokens: a fence-shaped string inside the material is content", () => {
    const quoting = (hex: string): FramedPrompt => frame(`Quote: #|DEBATEAI-FENCE-${hex}|#`, bytesOf(0x33));
    expect(fingerprintOf(quoting("a".repeat(32)))).not.toBe(fingerprintOf(quoting("b".repeat(32))));
  });

  it("masks the fence in a repair turn too", () => {
    const repaired = (fill: number) => appendFramedRejection(frame("Is the claim true?", bytesOf(fill)).packet, { code: "SCHEMA_FAILED", path: "edges" });
    expect(canonicalPromptFingerprint(repaired(0x11).messages)).toBe(canonicalPromptFingerprint(repaired(0x22).messages));
    expect(canonicalPromptFingerprint(repaired(0x11).messages)).not.toBe(fingerprintOf(frame("Is the claim true?", bytesOf(0x11))));
  });

  it("is a sha256 hex digest, and never throws on messages that carry no frame", () => {
    expect(fingerprintOf(frame("q", bytesOf(0x11)))).toMatch(/^[0-9a-f]{64}$/u);
    expect(canonicalPromptFingerprint([{ role: "user", content: "plain" }])).toMatch(/^[0-9a-f]{64}$/u);
  });
});

describe("MomentFileSchema and ReplayResultSchema", () => {
  const builder = { family: "JUDGE_ASSESS" as const, inputs: { questionLine: "Is the claim true?", statement: "It is." } };
  const contractHash = "a".repeat(64);
  const moment = (): MomentFile => ({
    kind: "DEBATEAI_MOMENT",
    formatVersion: 1,
    momentId: momentIdFor({ role: "JUDGE", contractHash, builder }),
    role: "JUDGE",
    language: "en",
    contractHash,
    builder,
    graderContext: { question: "Is the claim true?", excerpts: [{ label: "statement", text: "It is." }] },
    recorded: {
      providerRef: "provider:openai", maker: "OpenAI", modelId: "model-openai", thinkingLevel: null, replyText: "{}", promptFingerprint: null
    },
    source: {
      runId: "11111111-1111-4111-8111-111111111111",
      callSiteKey: "PANEL:root:provider:openai",
      exportedAt: "2026-09-26T12:00:00.000Z",
      engineCommit: null
    }
  });
  const replay = {
    kind: "DEBATEAI_REPLAY_RESULT",
    formatVersion: 1,
    momentId: momentIdFor({ role: "JUDGE", contractHash, builder }),
    candidate: { providerRef: "provider:anthropic", maker: "Anthropic", modelId: "model-anthropic", thinkingLevel: "medium" },
    outcome: "OK",
    replyText: "{}",
    parsed: {},
    usage: { reportedInputTokens: 14_000, outputTokens: 120, thinkingTokens: 40 },
    promptTokensEstimate: 900,
    seconds: 4.2,
    promptFingerprint: "b".repeat(64),
    fingerprintMatchesRecorded: null,
    contractHashMatches: true,
    startedAt: "2026-09-26T12:00:01.000Z"
  };

  it("reads a moment whose id is the sha256 of its canonical {role, contractHash, builder}", () => {
    expect(MomentFileSchema.parse(moment())).toEqual(moment());
  });

  it("refuses a moment whose id does not match its content", () => {
    expect(MomentFileSchema.safeParse({ ...moment(), momentId: "c".repeat(64) }).success).toBe(false);
    expect(MomentFileSchema.safeParse({ ...moment(), builder: { ...builder, inputs: { questionLine: "Another?" } } }).success).toBe(false);
  });

  it("derives the same id whatever the key order of the builder inputs", () => {
    expect(momentIdFor({ role: "JUDGE", contractHash, builder: { family: "JUDGE_ASSESS", inputs: { b: 1, a: 2 } } }))
      .toBe(momentIdFor({ role: "JUDGE", contractHash, builder: { family: "JUDGE_ASSESS", inputs: { a: 2, b: 1 } } }));
  });

  it("is closed: an unknown key or a role outside the seven is refused", () => {
    expect(MomentFileSchema.safeParse({ ...moment(), extra: true }).success).toBe(false);
    expect(MomentFileSchema.safeParse({ ...moment(), role: "EVALUATOR" }).success).toBe(false);
  });

  it("reads a replay result and refuses an outcome outside its vocabulary", () => {
    expect(ReplayResultSchema.parse(replay)).toEqual(replay);
    expect(ReplayResultSchema.safeParse({ ...replay, outcome: "MAYBE" }).success).toBe(false);
    expect(ReplayResultSchema.safeParse({ ...replay, promptFingerprint: "short" }).success).toBe(false);
  });

  it("publishes both as JSON Schema files next to the scorecard's", () => {
    expect(Object.keys(PUBLISHED_JSON_SCHEMA_FILES)).toEqual(["scorecard.schema.json", "moment.schema.json", "replay-result.schema.json"]);
    expect(PUBLISHED_JSON_SCHEMA_FILES["moment.schema.json"]).toBe(MOMENT_JSON_SCHEMA);
    expect(PUBLISHED_JSON_SCHEMA_FILES["replay-result.schema.json"]).toBe(REPLAY_RESULT_JSON_SCHEMA);
  });
});
