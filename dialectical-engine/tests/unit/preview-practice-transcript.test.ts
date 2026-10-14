// The preview practice's debate transcript (tools/preview-practice/practice-transcript.ts, `--transcript`): the
// builder's shape and ledger order, the full decrypted prompt and reply text (never cut, never blanked by the report's
// redaction), the vendor body and usage beside the model's text, the named key-shape safety net over every string,
// and the whole-or-nothing write.
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PREVIEW_PROVIDER_REF_MODELS } from "@debateai/providers";
import { parsePracticeArgs } from "../../tools/preview-practice/practice.js";
import { PRACTICE_REPLY_CAP_BYTES, redactKeyShapes, redactNamedKeyShapes } from "../../tools/preview-practice/practice-redaction.js";
import {
  buildPracticeTranscript,
  buildTranscriptAttempts,
  PRACTICE_TRANSCRIPT_SCHEMA,
  serializePracticeTranscript,
  writePracticeTranscript,
  type TranscriptArtifact,
  type TranscriptLedgerRow,
  type TranscriptRunFacts
} from "../../tools/preview-practice/practice-transcript.js";

const GLM = "zai-org/GLM-5.3-Flash";
const HAIKU = "claude-haiku-5-5";
const refOf = (model: string) => Object.entries(PREVIEW_PROVIDER_REF_MODELS).find(([, id]) => id === model)![0];
const GLM_REF = refOf(GLM);
const HAIKU_REF = refOf(HAIKU);
const RUN_ID = "11111111-1111-4111-8111-111111111111";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** A long prompt, well past the report's 64 KiB cap, with a UUID and a fingerprint-like run in it (both kept). */
const LONG_MATERIAL = `${"The material block. ".repeat(4_000)}node ${id(77)} fp ${"a".repeat(64)}`;
const GLM_MESSAGES = [
  { role: "system", content: "SAFETY FRAME\nInstruction text for the judge.\n<<call-marker-7f3a>>" },
  { role: "user", content: LONG_MATERIAL }
];
const GLM_CONTENT = `{"position":"Da, cu condiții.","reason":"${"Motiv. ".repeat(12_000)}"}`;
const GLM_BODY = JSON.stringify({
  id: "chatcmpl-1", object: "chat.completion",
  choices: [{ index: 0, message: { role: "assistant", content: GLM_CONTENT, reasoning_content: "thinking..." }, finish_reason: "stop" }],
  usage: { prompt_tokens: 1200, completion_tokens: 300, prompt_tokens_details: { cached_tokens: 1000 }, completion_tokens_details: { reasoning_tokens: 40 } }
});
const HAIKU_MESSAGES = [
  { role: "system", content: "SAFETY FRAME\nInstruction text for the panel." },
  { role: "user", content: [{ type: "text", text: "Panel material.", cache_control: { type: "ephemeral" } }] }
];
/** A model that echoes a vendor key shape: the safety net blanks it, and says so. */
const HAIKU_CONTENT = "{\"steelman\":{\"summary\":\"Echo sk-ant-abcdefghijklmnop123 here.\"}}";
const HAIKU_BODY = JSON.stringify({ id: "msg_1", type: "message", content: [{ type: "text", text: HAIKU_CONTENT }],
  stop_reason: "end_turn", usage: { input_tokens: 10, cache_read_input_tokens: 90, cache_creation_input_tokens: 0, output_tokens: 20 } });

function entry(sequence: number, overrides: Partial<TranscriptLedgerRow>): TranscriptLedgerRow {
  return {
    sequence: String(sequence), ledgerEntryId: id(1000 + sequence), attemptId: id(2000 + sequence), callSiteKey: "JUDGE",
    subjectItemId: "item", stance: "NEUTRAL", actorRef: GLM_REF, outcome: "OK", modelRole: "JUDGE", thinkingLevel: "high",
    candidateId: null, startedAt: new Date("2026-10-12T10:00:00.000Z"), finishedAt: new Date("2026-10-12T10:00:02.500Z"),
    rawArtifactRef: id(3000 + sequence), ...overrides
  };
}

function artifact(sequence: number, overrides: Partial<TranscriptArtifact>): TranscriptArtifact {
  return {
    rawArtifactId: id(3000 + sequence), provider: "deepinfra", providerRef: GLM_REF, modelId: GLM, maker: "zai", modelVersion: null,
    parseStatus: "PARSED", parseErrorCode: null, metadata: { status: 200, attempt: 1, usage: { prompt_tokens: 1200, completion_tokens: 300 }, finish_reason: "stop" },
    thinkingTokens: null, rawText: GLM_BODY, parseErrorDetail: null, ...overrides
  };
}

const RUN: TranscriptRunFacts = {
  runId: RUN_ID, question: { id: "ro", text: "Întrebarea noastră de exercițiu?" }, depth: 1, registerVersion: "5",
  panel: [{ providerRef: GLM_REF, modelId: GLM, maker: "zai" }, { providerRef: HAIKU_REF, modelId: HAIKU, maker: "anthropic" }],
  satOut: [], rotation: { answerWriter: GLM_REF, answerChecker: HAIKU_REF, storyteller: GLM_REF, storyChecker: HAIKU_REF },
  startedAt: "2026-10-12T10:00:00.000Z", finishedAt: "2026-10-12T10:05:00.000Z", workItemOutcome: "COMPLETED", failureCode: null,
  answerId: id(9), answer: { served: true }, story: { outcome: "READY", failureCode: null }
};

function attempts() {
  // Handed out of order on purpose: the transcript is in ledger order (the sequence as a number, not as text).
  const entries = [
    entry(10, { actorRef: HAIKU_REF, callSiteKey: "PANEL:node-1:steelman", modelRole: null, outcome: "OK" }),
    entry(9, {}),
    entry(11, { attemptId: null, rawArtifactRef: null, outcome: "REFUSED", callSiteKey: "JUDGE:review:node-1" })
  ];
  const artifacts = new Map([
    [id(3009), artifact(9, {})],
    [id(3010), artifact(10, { provider: "anthropic", providerRef: HAIKU_REF, modelId: HAIKU, maker: "anthropic", rawText: HAIKU_BODY,
      parseStatus: "SCHEMA_FAILED", parseErrorCode: "CONTENT_SCHEMA_FAILED", parseErrorDetail: "[{\"code\":\"invalid_type\",\"path\":[\"steelman\",\"fidelity\"]}]",
      metadata: { status: 200, usage: null, finish_reason: "end_turn" } })]
  ]);
  const prompts = new Map([
    [id(2009), { promptText: JSON.stringify(GLM_MESSAGES), promptFingerprint: `sha256:${"b".repeat(64)}` }],
    [id(2010), { promptText: JSON.stringify(HAIKU_MESSAGES), promptFingerprint: `sha256:${"c".repeat(64)}` }]
  ]);
  const spend = new Map([[id(2009), [{ chargeMicros: "120", inputTokens: "1200", outputTokens: "300" }, { chargeMicros: "5", inputTokens: "0", outputTokens: "0" }]]]);
  return buildTranscriptAttempts({ entries, artifacts, prompts, spend });
}

const folders: string[] = [];
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }); });

describe("preview practice transcript: the attempts", () => {
  it("keeps ledger order, the full prompt messages as sent and the full reply, with the vendor body and usage beside it", () => {
    const list = attempts();
    expect(list.map((attempt) => attempt.sequence)).toEqual([9, 10, 11]);
    const [glm, haiku, refused] = list;
    expect(glm).toMatchObject({
      attemptId: id(2009), callSiteKey: "JUDGE", family: "JUDGE", modelRole: "JUDGE", providerRef: GLM_REF, model: GLM, maker: "zai",
      provider: "deepinfra", thinkingLevel: "high", outcome: "OK", durationMs: 2500, replyForm: null /* a stand-in prompt has no frame */,
      usage: { inputTokens: 1200, outputTokens: 300, reasoningTokens: 40, cachedInputTokens: 1000 },
      cost: { chargedMicros: "125" },
      parse: { status: "PARSED", errorCode: null, issues: [], jsonRepair: null, finishReason: "stop" }
    });
    expect(glm!.cost.estimatedNanoUsd).toMatch(/^\d+$/u);
    // Every message exactly as sent, the long material whole (past the report's cap), the reply whole.
    expect(glm!.prompt).toEqual({ fingerprint: `sha256:${"b".repeat(64)}`, messages: GLM_MESSAGES, text: null });
    expect(Buffer.byteLength(GLM_CONTENT, "utf8")).toBeGreaterThan(PRACTICE_REPLY_CAP_BYTES);
    expect(glm!.reply!.content).toBe(GLM_CONTENT);
    expect(glm!.reply!.vendorBody).toEqual(JSON.parse(GLM_BODY));
    expect(glm!.reply!.vendorUsage).toEqual(JSON.parse(GLM_BODY).usage);
    // Anthropic: the text block, the cache read counted into input as the engine counts it, the content blocks as sent.
    expect(haiku).toMatchObject({ family: "PANEL", model: HAIKU, maker: "anthropic", provider: "anthropic",
      usage: { inputTokens: 100, outputTokens: 20, cachedInputTokens: 90 }, cost: { chargedMicros: null },
      parse: { status: "SCHEMA_FAILED", errorCode: "CONTENT_SCHEMA_FAILED", issues: ["invalid_type@steelman.fidelity"], jsonRepair: null } });
    expect(haiku!.prompt!.messages).toEqual(HAIKU_MESSAGES);
    expect(haiku!.reply!.content).toBe(HAIKU_CONTENT);
    // A refused call: no prompt, no reply, the maker from the reviewed roster.
    expect(refused).toMatchObject({ family: "REVIEW", outcome: "REFUSED", prompt: null, reply: null, maker: "Z.AI", parse: { status: null } });
  });

  it("a stored reply that is not a vendor body: the text itself, no vendor body", () => {
    const [only] = buildTranscriptAttempts({ entries: [entry(1, {})], artifacts: new Map([[id(3001), artifact(1, { rawText: "{\"a\":1}" })]]),
      prompts: new Map(), spend: new Map() });
    expect(only!.reply).toEqual({ content: "{\"a\":1}", vendorBody: null, vendorUsage: null });
    expect(only!.prompt).toBeNull();
  });
});

describe("preview practice transcript: the file", () => {
  const transcript = () => buildPracticeTranscript({ run: RUN, attempts: attempts(), answer: { nodes: [{ node_id: id(77), claim_text: "Poziția A" }] },
    inspection: null, story: { outcome: "READY", body: { title: "Povestea" } }, unavailable: ["x: y"], now: new Date("2026-10-12T10:06:00.000Z") });

  it("has the run, totals, attempts, structure and the unavailable list", () => {
    const value = transcript();
    expect(Object.keys(value)).toEqual(["schema", "writtenAt", "run", "totals", "attempts", "structure", "unavailable"]);
    expect(value.schema).toBe(PRACTICE_TRANSCRIPT_SCHEMA);
    expect(value.totals).toMatchObject({ attempts: 3, withPrompt: 2, withReply: 2 });
    expect(value.totals.promptBytes).toBeGreaterThan(80_000);
    expect(value.structure).toEqual({ answer: { nodes: [{ node_id: id(77), claim_text: "Poziția A" }] }, inspection: null,
      story: { outcome: "READY", body: { title: "Povestea" } } });
  });

  it("the safety net blanks only the named key shapes and says so; ids, fingerprints and model text stay whole", () => {
    const { text, blanked } = serializePracticeTranscript(transcript());
    expect(blanked).toEqual({ "vendor-key": 2 });
    expect(text).not.toMatch(/sk-ant-abcdefghijklmnop123/u);
    expect(redactNamedKeyShapes(text).blanked).toEqual({});
    const parsed = JSON.parse(text) as { attempts: { attemptId: string; reply: { content: string } | null; prompt: { messages: unknown[]; fingerprint: string } | null }[] };
    expect(parsed.attempts[0]!.reply!.content).toBe(GLM_CONTENT);
    expect(parsed.attempts[0]!.prompt!.messages).toEqual(GLM_MESSAGES);
    expect(parsed.attempts[0]!.prompt!.fingerprint).toBe(`sha256:${"b".repeat(64)}`);
    expect(parsed.attempts[1]!.reply!.content).toContain("[REDACTED:vendor-key]");
    expect(text).toContain(RUN_ID);
    // The report's own redaction would have blanked the ids and fingerprints (why the transcript uses the named shapes).
    expect(redactKeyShapes(RUN_ID)).not.toBe(RUN_ID);
  });

  it("writes transcript.json whole (no temporary file left), readable only by its owner", () => {
    const folder = mkdtempSync(join(tmpdir(), "practice-transcript-"));
    folders.push(folder);
    const written = writePracticeTranscript(join(folder, "out"), transcript());
    expect(written.path).toBe(join(folder, "out", "transcript.json"));
    expect(readdirSync(join(folder, "out"))).toEqual(["transcript.json"]);
    expect(statSync(written.path).mode & 0o777).toBe(0o600);
    const text = readFileSync(written.path, "utf8");
    expect(written.bytes).toBe(Buffer.byteLength(text, "utf8"));
    expect(text.split("\n").length).toBe(2);
    expect((JSON.parse(text) as { attempts: unknown[] }).attempts).toHaveLength(3);
    // Written again over the first: still one whole file.
    writePracticeTranscript(join(folder, "out"), transcript());
    expect(readdirSync(join(folder, "out"))).toEqual(["transcript.json"]);
    expect(existsSync(written.path)).toBe(true);
  });

  it("holds structure.map only for a debate-shape run (today's file keeps its keys)", () => {
    expect(Object.keys(transcript().structure)).toEqual(["answer", "inspection", "story"]);
    // As P2b's readers return them (pre-flight PF-D14: the real MapChoiceRecord and MapItem forms; HAIKU_REF is this file's).
    const map = {
      choice: { opening: "MAP", marks: [],
        answers: [{ answerId: "a1", statement: "Da.", rootIndex: 0, rootNodeId: null, maker: null, filled: false }],
        alsoRaised: [{ keyPointId: "kp01", claim: "Costul.", makers: ["anthropic"] }] },
      items: [{ itemId: "pt01", seat: { aiRef: HAIKU_REF, maker: "anthropic" }, origin: "BLIND", angleId: "g1", angleKind: "PRACTICAL",
        listIndex: 0, kind: "POINT", claim: "Costul.", whyItMatters: "Banii conteaza.", leans: "context" }]
    };
    const shaped = buildPracticeTranscript({ run: RUN, attempts: attempts(), answer: null, inspection: null, story: null, unavailable: [], map,
      now: new Date("2026-10-12T10:06:00.000Z") });
    expect(Object.keys(shaped.structure)).toEqual(["answer", "inspection", "story", "map"]);
    expect(shaped.structure.map).toEqual(map);
  });
});

describe("preview practice transcript: the flag", () => {
  it("--transcript is a switch (no value)", () => {
    expect(parsePracticeArgs(["debate", "--transcript", "--depth", "1"]).switches.has("--transcript")).toBe(true);
    expect(parsePracticeArgs(["debate", "--depth", "1"]).switches.has("--transcript")).toBe(false);
  });
});
