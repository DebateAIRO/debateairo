import { createHash } from "node:crypto";
import { z } from "zod";
import { DEBATE_ROLES, type DebateRole } from "@debateai/kernel";

/**
 * MOMENT and REPLAY-RESULT files (model-scorecard design §2.9): the exchange format between
 * `moment:export`, `moment:replay` and the private evaluator. Closed (`.strict()`): both are
 * written by this engine's own tools, so an unknown key is a wrong file, not a newer one.
 */
export const MOMENT_BUILDER_FAMILIES = [
  "JUDGE_JUDGE", "JUDGE_REVIEW", "JUDGE_ASSESS", "SYNTHESIS_WRITER", "SYNTHESIS_CHECKER"
] as const;
export type MomentBuilderFamily = typeof MOMENT_BUILDER_FAMILIES[number];

export const REPLAY_OUTCOMES = ["OK", "FAILED", "TIMED_OUT", "REFUSED", "CONTEXT_TOO_LARGE", "USAGE_CAP"] as const;
export type ReplayOutcome = typeof REPLAY_OUTCOMES[number];

const sha256HexText = z.string().regex(/^[0-9a-f]{64}$/u);

export const MomentBuilderSchema = z.object({
  family: z.enum(MOMENT_BUILDER_FAMILIES),
  /** Exactly what the step's prompt builder consumed; the replay tool validates it per family. */
  inputs: z.unknown()
}).strict();
export type MomentBuilder = z.infer<typeof MomentBuilderSchema>;

/** Sorted keys, no whitespace, `undefined` members dropped; a non-finite number or a non-JSON value throws. */
function canonicalMomentJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("MOMENT_CANONICAL_JSON_INVALID");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((member: unknown) => canonicalMomentJson(member)).join(",")}]`;
  if (typeof value === "object") {
    const members = Object.entries(value)
      .filter(([, member]) => member !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${members.map(([key, member]) => `${JSON.stringify(key)}:${canonicalMomentJson(member)}`).join(",")}}`;
  }
  throw new TypeError("MOMENT_CANONICAL_JSON_INVALID");
}

/** The moment's identity: sha256 hex of the canonical JSON of {role, contractHash, builder}. */
export function momentIdFor(moment: Readonly<{ role: DebateRole; contractHash: string; builder: MomentBuilder }>): string {
  return createHash("sha256")
    .update(canonicalMomentJson({ role: moment.role, contractHash: moment.contractHash, builder: moment.builder }), "utf8")
    .digest("hex");
}

export const MomentFileSchema = z.object({
  kind: z.literal("DEBATEAI_MOMENT"),
  formatVersion: z.literal(1),
  momentId: sha256HexText,
  role: z.enum(DEBATE_ROLES),
  language: z.enum(["ro", "en"]).nullable(),
  /** The sealed family hash; test fixtures use non-hash strings, so any non-empty text. */
  contractHash: z.string().min(1),
  builder: MomentBuilderSchema,
  graderContext: z.object({
    question: z.string(),
    excerpts: z.array(z.object({ label: z.string().min(1), text: z.string() }).strict())
  }).strict(),
  recorded: z.object({
    providerRef: z.string().min(1),
    maker: z.string().min(1),
    modelId: z.string().min(1),
    thinkingLevel: z.string().min(1).nullable(),
    replyText: z.string(),
    promptFingerprint: sha256HexText.nullable()
  }).strict().nullable(),
  source: z.object({
    runId: z.string().min(1),
    callSiteKey: z.string().min(1),
    exportedAt: z.iso.datetime(),
    engineCommit: z.string().regex(/^[0-9a-f]{7,64}$/u).nullable()
  }).strict()
}).strict().superRefine((moment, context) => {
  let expected: string | null = null;
  try {
    expected = momentIdFor(moment);
  } catch {
    expected = null;
  }
  if (expected !== moment.momentId) {
    context.addIssue({
      code: "custom",
      path: ["momentId"],
      message: "momentId must be the sha256 of the canonical JSON of {role, contractHash, builder}"
    });
  }
});
export type MomentFile = z.infer<typeof MomentFileSchema>;

export const ReplayResultSchema = z.object({
  kind: z.literal("DEBATEAI_REPLAY_RESULT"),
  formatVersion: z.literal(1),
  momentId: sha256HexText,
  candidate: z.object({
    providerRef: z.string().min(1),
    maker: z.string().min(1),
    modelId: z.string().min(1),
    thinkingLevel: z.string().min(1)
  }).strict(),
  outcome: z.enum(REPLAY_OUTCOMES),
  replyText: z.string().nullable(),
  parsed: z.unknown(),
  usage: z.object({
    /** What the CLI reported; never used for money (agy, codex and grok add ~14-18k of their own). */
    reportedInputTokens: z.number().int().min(0).nullable(),
    outputTokens: z.number().int().min(0).nullable(),
    thinkingTokens: z.number().int().min(0).nullable()
  }).strict(),
  /** Our own prompt's size, counted locally (M4 consequence 2). */
  promptTokensEstimate: z.number().int().min(0),
  seconds: z.number().min(0),
  promptFingerprint: sha256HexText,
  fingerprintMatchesRecorded: z.boolean().nullable(),
  contractHashMatches: z.boolean(),
  startedAt: z.iso.datetime()
}).strict();
export type ReplayResult = z.infer<typeof ReplayResultSchema>;

/**
 * The per-call tokens of packages/providers/src/prompt-frame.ts, by their exact spelling there:
 * the fence is `#|DEBATEAI-FENCE-` + 32 lowercase hex (16 CSPRNG bytes, `fenceToken`) + `|#`;
 * the canary is `DBAI-CANARY-` + 24 lowercase hex (12 bytes). `#` is written bare because a
 * unicode pattern refuses `\#`; `|` is a syntax character, so it is escaped.
 */
const FRAME_FENCE_TOKEN = /#\|DEBATEAI-FENCE-[0-9a-f]{32}\|#/u;
const FRAME_CANARY_TOKEN = /DBAI-CANARY-[0-9a-f]{24}/u;
const MASKED_FENCE = "#|DEBATEAI-FENCE-<per-call>|#";
const MASKED_CANARY = "DBAI-CANARY-<per-call>";

function maskFrameTokens(content: string, fence: string | null, canary: string | null): string {
  const unfenced = fence === null ? content : content.split(fence).join(MASKED_FENCE);
  return canary === null ? unfenced : unfenced.split(canary).join(MASKED_CANARY);
}

/**
 * "Same prompt" across calls (design §2.9): sha256 hex of the messages with the frame's OWN
 * fence and canary masked.
 *
 * The two tokens are found the way the door finds them — the first of each in the system
 * message (`assertFramedPrompt`) — and only those exact tokens are masked, in every message
 * (a repair turn reuses the fence). The builder guarantees this touches nothing else: the
 * instruction may not contain either prefix (PROMPT_INSTRUCTION_RESERVED_TOKEN), and the
 * material may contain neither the declared fence (PROMPT_FRAME_FENCE_FORGED) nor the canary
 * (checked at mint). A fence-SHAPED string a question quotes is therefore content, and is kept.
 * Messages that carry no frame are hashed as they are.
 */
export function canonicalPromptFingerprint(messages: readonly Readonly<{ role: string; content: string }>[]): string {
  const system = messages.find((message) => message.role === "system")?.content ?? "";
  const fence = FRAME_FENCE_TOKEN.exec(system)?.[0] ?? null;
  const canary = FRAME_CANARY_TOKEN.exec(system)?.[0] ?? null;
  const masked = messages.map((message) => [message.role, maskFrameTokens(message.content, fence, canary)]);
  return createHash("sha256").update(JSON.stringify(masked), "utf8").digest("hex");
}
