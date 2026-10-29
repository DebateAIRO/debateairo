import { createHash, randomUUID } from "node:crypto";
import { networkInterfaces } from "node:os";
import { z } from "zod";
import { THINKING_LEVEL_DEFAULT_ONLY, TypedDomainError, isDebateRole, lengthCallStepOf, type DebateRole, type ProviderCallAdmission } from "@debateai/kernel";
import { assertFramedPrompt, buildFramedPatchPrompt } from "./prompt-frame.js";
import { PATCH_KEY_NOT_REQUESTED, mergePatchReply, planPatchFollowUp, type PatchFollowUpPlan } from "./patch-follow-up.js";
import { scanPromptTripwires } from "./prompt-tripwire.js";
import {
  ANTHROPIC_MESSAGES_HTTP_ADAPTER_KIND,
  ANTHROPIC_MESSAGES_PATH,
  PROVIDER_CONTENT_REFUSED,
  PROVIDER_PACKET_UNSUPPORTED,
  PROVIDER_REPLY_UNSUPPORTED,
  anthropicMessagesRequestBody,
  anthropicMessagesRequestHeaders,
  assertAnthropicCredentialShape,
  isAnthropicHostPairing,
  isAnthropicThinkingControl,
  readAnthropicMessagesReply
} from "./anthropic-messages.js";
import { previewModelRowForEndpoint, previewSamplingMembers } from "./preview-models.js";
import { ProviderSentBilledFailure, ProviderUnbilledRefusal } from "./unbilled-refusal.js";
import { contentRepairsOf, type ModelJsonRepair, type ModelReplyFacts } from "./model-json.js";
import { replyWordCount } from "./reply-words.js";
import { replyFailureClassOf, type ReplyFailureClass } from "./reply-fixer.js";
import { contentFollowUpSentence } from "./content-follow-up.js";

// T9 (goal 232-235): SYNTHESIZER and EVALUATOR are NAMED PROVIDER ROLES,
// not organ aliases. A debater's model may hold either role; the CALL is
// fresh-context, and the ledger records which role made it under its own
// name rather than under COMPOSER/CONFORMANCE, which mean other things.
export const MODEL_ROLES = [
  "JUDGE", "COMPOSER", "CONFORMANCE", "CLASSIFIER", "SYNTHESIZER", "EVALUATOR"
] as const;
export type TypedRole = typeof MODEL_ROLES[number];
/**
 * `story` (verdict story, spec §8): the post-settle storyteller and checker
 * calls. The runner's gateway pairs it with the `STORY:` call-site namespace,
 * and a story call spends the story's own allowance, never the run's. A lane is
 * never persisted: `migrations/0015_s12.sql`'s `lane` CHECK belongs to
 * `scorecard.routing_decision`, the settlement router's own record.
 */
export type Lane = "served" | "uniform-panel" | "critic-exempt" | "evaluator" | "story";

export interface CallBound {
  readonly maxAttempts: number;
  readonly tokenCeiling: number;
  readonly deadlineMs: number;
}

export interface PromptPacket {
  readonly messages: readonly {
    readonly role: "system" | "user" | "assistant";
    readonly content: string;
  }[];
}

/**
 * `jsonRepair` (story format robustness, 2026-10-12): the one repair the tolerant decode
 * (`decodeModelJson`) needed before the content passed its checks, so repairs can be counted.
 * Absent for content that was strict JSON, and for every classifier that does not use the decode.
 *
 * LG-A (INTERFACE §2.2): `jsonRepairs` is every repair in order, present only when there were two or more (read it
 * with `contentRepairsOf`). `failureClass` is set by a classifier that knows its refusal's class (`ReplyFailureClass`).
 */
export type ContentClassification =
  | { readonly parseStatus: "PARSED"; readonly parseError: null; readonly jsonRepair?: ModelJsonRepair;
      readonly jsonRepairs?: readonly ModelJsonRepair[] }
  | { readonly parseStatus: "PARSE_FAILED" | "SCHEMA_FAILED"; readonly parseError: string;
      readonly failureClass?: ReplyFailureClass };

/**
 * Refused-repair salvage (2026-10-16, A1): a STRUCTURE reply A1 rescued in code (`structureSalvageFor`,
 * ./structure-repair.ts): the content the step's own check accepted and that check's classification, A1's drops named on it.
 */
export type StructureSalvaged = Readonly<{ content: string; classification: ContentClassification }>;

/**
 * Refused-repair salvage (2026-10-16, B): a routed call's first reply as its ProviderStructureUnrepairedError recorded it —
 * the refusal, its artifact and ledger row, and whether that POST's body carried the material's cache mark — so the
 * follow-up B can be sent as the same call's second POST and, when it does not do, the call ends with these facts.
 */
export type StructureFirstReply = Readonly<{ rejected: RejectedProviderContent; rawArtifactRef: string; ledgerEntryRef: string; materialMarked: boolean }>;

/**
 * Refused-repair salvage (2026-10-16, B): the one follow-up to the ORIGINAL AI. PATCH asks only the members the step's
 * refusal names (`plan`, built on A's object) and merges the reply into it; FULL re-asks the whole answer with the step's
 * own repair packet (`buildRepairPacket`), when A found no object at all.
 */
export type StructureFollowUp =
  | Readonly<{ form: "PATCH"; plan: PatchFollowUpPlan; first: StructureFirstReply }>
  | Readonly<{ form: "FULL"; first: StructureFirstReply }>;

/**
 * W10/1 (`board/W10-call-budget-truthfulness.md`, audit
 * `audits/token-budget-reasoning.md`): the OpenAI-compatible completion that
 * was cut off at `max_tokens` reports it, and until this row existed nobody
 * read it. A truncated body fails the contract classifier exactly as bad JSON
 * does, so the two were recorded under one name and a length failure looked
 * like a model that cannot follow a schema.
 */
export const PROVIDER_FINISH_REASON_LENGTH = "length" as const;
export const PROVIDER_CONTENT_LENGTH_EXCEEDED = "LENGTH_EXCEEDED" as const;

/**
 * Model scorecard §2.2 (rulings R1, R7) — THE TWO WIRE SPELLINGS a connection
 * reads a thinking level from. The target declares which one; the gateway never
 * guesses. `reasoning_effort` is the OpenAI-compatible body member for vendor
 * APIs; `x_thinking_level` is this engine's extension (the `x_` prefix follows
 * `usage.x_cost_usd`), read only by the CLI relays under `acceptance/`.
 */
export const THINKING_PARAMETERS = ["reasoning_effort", "x_thinking_level"] as const;
export type ThinkingParameter = typeof THINKING_PARAMETERS[number];

/** A vendor level name is ONE lower-case code token: never a flag, never prose. */
export const THINKING_LEVEL_TOKEN = /^[a-z][a-z0-9_-]{0,31}$/u;

/**
 * Model scorecard — the typed refusals of the thinking level, the context
 * window and a subscription's usage cap. Each is deterministic, so none is
 * retried (see the short-circuit list and the cap stop in `call`).
 *  · The level and window refusals reach the caller UNWRAPPED: they are the
 *    engine's own refusals, never a transport failure, so they never move a
 *    seat to its backup (ruling R4).
 *  · The usage cap reaches the caller as today's `ProviderCallFailedError`, with
 *    the cap as its `cause` (pre-flight ruling F11): every caller that halts a
 *    member on a relay failure keeps doing so, and the seat caller reads the cap
 *    off `cause` to switch at once (ruling R4).
 */
export const PROVIDER_THINKING_LEVEL_UNSUPPORTED = "PROVIDER_THINKING_LEVEL_UNSUPPORTED" as const;
export const PROVIDER_THINKING_LEVEL_CHANGED = "PROVIDER_THINKING_LEVEL_CHANGED" as const;
export const PROVIDER_CONTEXT_WINDOW_EXCEEDED = "PROVIDER_CONTEXT_WINDOW_EXCEEDED" as const;
export const PROVIDER_USAGE_CAP = "PROVIDER_USAGE_CAP" as const;
/** The relay's own marker on its 429 (`acceptance/relay-core.ts`), carried in `x_cli_relay_error`. */
export const CLI_RELAY_USAGE_CAP = "CLI_RELAY_USAGE_CAP" as const;
/** The relay's markers on its 413 and 400 refusals (A8), carried in `x_cli_relay_error` (R1, pre-flight fix F1). */
export const CLI_RELAY_CONTEXT_WINDOW_EXCEEDED = "CLI_RELAY_CONTEXT_WINDOW_EXCEEDED" as const;
export const CLI_RELAY_THINKING_LEVEL_UNSUPPORTED = "CLI_RELAY_THINKING_LEVEL_UNSUPPORTED" as const;

/**
 * How a provider's content was REFUSED. `LENGTH_EXCEEDED` is its own member and
 * is never collapsed into `PARSE_FAILED`.
 *
 * It is deliberately NOT a `raw_artifact.parse_status` value: that column's
 * CHECK constraint seals four names (`migrations/0004_s04.sql:14-21`) and the
 * erasure-redaction constraint pins their `parse_error` pairs
 * (`migrations/0040_account_erasure.sql:338-340`). Widening the column is a
 * migration this ticket does not own, so the truncation travels on the typed
 * refusal and in the artifact's unconstrained `metadata.finish_reason`.
 */
export type ProviderContentRejectionStatus =
  | "PARSE_FAILED"
  | "SCHEMA_FAILED"
  | typeof PROVIDER_CONTENT_LENGTH_EXCEEDED;

export interface RejectedProviderContent {
  readonly rawText: string;
  readonly parseStatus: ProviderContentRejectionStatus;
  readonly parseError: string;
  /** LG-A (L33): set only on a routed call's rejection, so the step's own repair packet says in plain words what is missing. */
  readonly failureClass?: ReplyFailureClass;
}

export interface ProviderCallRequest {
  readonly runId: string | null;
  readonly subjectItemId: string;
  readonly callSiteKey: string;
  readonly role: TypedRole;
  readonly lane: Lane;
  readonly bound: CallBound;
  readonly contractHash: string;
  readonly providerRef: string;
  readonly packet: PromptPacket;
  readonly preferredResponseFormat?: "json_object";
  /**
   * `reply` (story format robustness, 2026-10-12): how this reply ended, so a classifier can refuse to
   * repair an answer cut off at its token ceiling. Always passed by this gateway; a classifier that
   * gets none must treat the ending as unknown.
   */
  readonly classifyContent?: (content: string, reply?: ModelReplyFacts) => ContentClassification;
  readonly buildRepairPacket?: (rejected: RejectedProviderContent) => PromptPacket;
  /**
   * L4-F8: re-evaluated before EVERY attempt, so a run-wide model-attempt ceiling checked once
   * by the caller cannot be overshot by the gateway's own retry/repair loop. It throws to refuse;
   * the refusal propagates untouched and no ledger row is written for the refused attempt.
   * May be asynchronous: the shipped composition consults the run's pinned ceiling in the
   * database (DL4-F3).
   */
  readonly assertAttemptAllowed?: () => void | Promise<void>;
  /**
   * Preview retry fix, option B (spec 2026-10-11 §1.1): how many POSTs THIS gateway call may send, at
   * most `bound.maxAttempts`. `bound.maxAttempts` stays the step's lifetime allowance, which the
   * counting gateway turns into what is left (`remaining`), so the two limits never meet in one
   * number. The preview's call policy sets 1 (its storyteller's repair call: 2); absent means
   * `bound.maxAttempts`, which is hosted and local byte for byte. A positive whole number.
   */
  readonly maxAttemptsThisCall?: number;
  /**
   * All-steps format robustness (2026-10-12): true when the POSTs of THIS call after its first may be spent only on a
   * reply this call's classifier refused (a repair packet, or a length retry): a transport failure (a timeout, a vendor
   * error, the gate's refusal, billed or not) ends the call after its row, as a one-POST call would. Set only by the
   * preview's call policy for a structured step's one repair try, so its one 60-second resend after an unbilled refusal
   * stays the one resend. Absent: every failure may use the call's attempts, which is hosted and local byte for byte.
   * Never sent.
   */
  readonly retryOnlyAfterContentRejection?: boolean;
  /**
   * LG-A (spec 2026-10-15, L32, L33; INTERFACE §2.4-§2.5): set ONLY by `withStructureRepair` (./structure-repair.ts), never
   * by a step. A routed call sends at most 2 POSTs. Its first reply's class decides the one follow-up: STRUCTURE ends the
   * call with ProviderStructureUnrepairedError (the wrapper sends the structure-repair call); CONTENT gets one PATCH, or a
   * full re-ask when no member can be named; EMPTY a full re-ask; CUT_OFF today's length retry. Every follow-up states in
   * plain words what is missing (`machine_rejection_reason`). Absent: today's loop, byte for byte. Never sent.
   * Refused-repair salvage (2026-10-16): with `structureFollowUp` the same call is continued instead: its one remaining POST,
   * the follow-up B, is sent alone as attempt 2.
   */
  readonly structureRepairRouted?: boolean;
  /**
   * Refused-repair salvage (2026-10-16, B): set ONLY by `withStructureRepair` (./structure-repair.ts), after its
   * structure-repair call did not do, never by a step. Requires `structureRepairRouted: true` and `classifyContent`
   * (TypeError otherwise, before anything is sent). The call is the routed call's continuation: exactly one POST, the
   * follow-up (PATCH or FULL) to the original AI, recorded as attempt 2 at the repair thinking level, its body marked as
   * the first POST's was (`first.materialMarked`). A PATCH reply must keep to the asked members (the whole answer again
   * is never accepted). A follow-up that cannot go out (over its packet cap or the window, or a packet the wire or the
   * builder refuses) sends nothing and ends as today's ProviderContentUnacceptedError with the first reply's facts, as
   * does a PATCH reply that could not be merged. Absent: today's loop, byte for byte. Never sent.
   */
  readonly structureFollowUp?: StructureFollowUp;
  /**
   * Refused-repair salvage (2026-10-16, A1): set ONLY by `withStructureRepair` (./structure-repair.ts, `structureSalvageFor`),
   * never by a step. On a routed call's first reply of class STRUCTURE, before its artifact is written, A1 reads the reply in
   * code with no call; a reply it rescues is accepted as the original AI's own OK row (no structure-repair call). Null: no
   * rescue, the routed rule goes on. Absent: today's loop, byte for byte. Never sent.
   */
  readonly structureSalvage?: (content: string, reply: ModelReplyFacts | undefined) => StructureSalvaged | null;
  /**
   * Run resilience (spec 2026-10-12, fix (b)): whose attempts the step's allowance counts. "actor" — set only by
   * the preview's call policy (`withPreviewProviderCallPolicy`) — counts the asking maker's own rows
   * (`providerRef`), so each maker that a fallback moves a call to has its own allowance at the call site. Absent
   * means the whole call site, which is hosted and local byte for byte. Never sent.
   */
  readonly attemptScope?: "actor";
  /**
   * V-28: the money bound for THIS call. Per request and not per gateway,
   * because the price is the target's but the SPEND is the run's, and a gateway
   * is built once per target and then serves every run that reaches it.
   * Absent = no money bound, which is local mode byte-for-byte.
   */
  readonly costEnvelope?: ProviderCostEnvelopeSeam;
  /**
   * Debate shape (controller ruling T12-R0, the owner's "always an answer" rule): money, in micro-units, this call
   * must leave unspent under its phase's ceiling — root 0's worst-case call, named by every map call, so the map can
   * never take the room a started debate needs for its first position. Handed to the money seam with the projection
   * (`assertCallAllowed`), which refuses the call that would cut into it before it is sent. Absent: today's decision,
   * byte for byte. Never sent.
   */
  readonly keepRoomMicros?: number;
  /**
   * Model scorecard §2.2 (rulings R1, R7): the candidate's thinking level, in
   * the connection's own vocabulary. Absent or DEFAULT_ONLY puts nothing on the
   * wire. A level this connection did not declare is refused before the call is
   * sent (PROVIDER_THINKING_LEVEL_UNSUPPORTED) — never run at another level.
   */
  readonly thinkingLevel?: string;
  /**
   * Spec 2026-10-12 §4.4 (the owner's `slip_fix`): the thinking level of this call's REPAIR POSTs (the patch follow-up
   * and the full re-ask), when it differs from `thinkingLevel`. Resolved, like `thinkingLevel`, before anything is
   * sent; absent = every POST of the call runs at `thinkingLevel` (today's behaviour on every lane).
   */
  readonly repairThinkingLevel?: string;
  /**
   * Length guidance L14/L25 (spec 2026-10-15 §3.3): set ONLY by the preview's call policy (withPreviewProviderCallPolicy),
   * never by a caller. When an attempt is cut off at its allowance and the vendor's thinking count is above that
   * allowance minus `answerRoomTokens`, the length retries of this call run at `lowerThinkingLevel` (resolved and refused,
   * like `thinkingLevel`, before anything is sent); null means the call is already at its lowest level. Absent: every
   * length retry runs at `thinkingLevel`, today's behaviour on every lane. Never sent.
   */
  readonly lengthRetry?: Readonly<{ answerRoomTokens: number; lowerThinkingLevel: string | null }>;
  /**
   * Length guidance L29 (spec 2026-10-15 §3.5): this call's request size cap, at most 1 MiB, in place of the module's
   * 256 KiB (MAX_PROVIDER_REQUEST_PACKET_BYTES). Set ONLY by the preview's call policy, only for the four final writers.
   * Absent: today's cap, hosted and local byte for byte. Never sent.
   */
  readonly packetByteCap?: number;
  /**
   * Length guidance L26: this call's largest max_tokens (length retries included), in place of the target's own
   * (`maxOutputTokens`). Set ONLY by the preview's call policy, only for the four final writers. Never sent.
   */
  readonly outputTokenCap?: number;
  /**
   * Model scorecard §2.1 (ruling R5): the debate job this call does, in the
   * scorecard's seven-role vocabulary (`@debateai/kernel` DEBATE_ROLES).
   * RECORDED on every attempt's ledger row, never sent. Optional on the type
   * because the dormant evaluator lane has none; `role` above is the T9
   * provider identity and stays exactly as it is.
   */
  readonly modelRole?: DebateRole;
  /** Model scorecard §2.3: the scorecard candidate holding this seat. Recorded, never sent. */
  readonly candidateId?: string | null;
  /** Model scorecard §2.3: the scorecard version the seat's assignment came from. Recorded, never sent. */
  readonly scorecardVersion?: number | null;
  /**
   * Length guidance (spec 2026-10-15 §3.6; INTERFACE §3.1): the words this call's AI was told to aim at (the sum of the
   * parts for a call told several). Recorded on every attempt's artifact (`raw_artifact.guided_words`) and NEVER sent.
   * Read by one thing only: the preview wrapper's length retry (`previewLengthRetryOf`, owner Q-C5), which sizes the
   * call's L25 answer room from it; nothing checks a reply against it. Absent = no target told (every call without the
   * length row).
   */
  readonly guidedWords?: number;
  /**
   * Length guidance L25 (pre-flight PF-C5.11): the most guided words this call's ONE reply can hold, for a call whose reply
   * holds several told items (a map angles, list, snowball or gap call: `MapStepSpec.replyWordsCeiling`). NEVER sent and never
   * recorded; read only by the preview wrapper's length retry (`previewLengthRetryOf`), which sizes a map call's answer room
   * from it. Absent = no such ceiling (every other call, and the map's merge and choose).
   */
  readonly replyWordsCeiling?: number;
  /**
   * Length guidance L27 (spec 2026-10-15 §3.6, INTERFACE §3.2): counts the words of this call's replies when only a part
   * of the answer is to be counted (LG-D: the storyteller's short version). Absent: `replyWordCount` over the whole reply.
   * Information only: a counter that throws or answers anything but a whole number records null. Never sent.
   */
  readonly actualWordsOf?: (content: string) => number | null;
}

export class ProviderCallFailedError extends TypedDomainError {
  override readonly code = "PROVIDER_CALL_FAILED";
  override readonly cause: unknown;

  constructor(
    cause: unknown,
    readonly attempts: number,
    readonly lastOutcome: "TIMED_OUT" | "FAILED",
    readonly lastLedgerEntryRef: string
  ) {
    super("PROVIDER_CALL_FAILED", "PROVIDER_CALL_FAILED");
    this.name = "ProviderCallFailedError";
    this.cause = cause;
  }
}

/**
 * Engine redesign R1d (spec 2026-10-15 §7.2 item 11 (c); pre-flight PF-D6.5): how a call that ended cut off at its
 * allowance ran out of room — how many of its attempts were cut off (`cutOffs`), and whether the last cut-off ran at the
 * lowest thinking level THIS call can run at (`lastAtLowestLevel`): the length retry's one-level-lower level (LG-B, L25),
 * or the call's own level when it has no lower one (`lengthRetry` absent, or its `lowerThinkingLevel` null). Facts only:
 * the story's backup storyteller reads them (`@debateai/story` backup.ts); nothing decides a retry by them.
 */
export type ProviderOutOfRoomFacts = Readonly<{ cutOffs: number; lastAtLowestLevel: boolean }>;

export class ProviderContentUnacceptedError extends TypedDomainError {
  override readonly code = "PROVIDER_CONTENT_UNACCEPTED";

  constructor(
    readonly attempts: number,
    readonly lastParseStatus: ProviderContentRejectionStatus,
    readonly lastParseError: string,
    readonly lastRawArtifactRef: string,
    readonly lastLedgerEntryRef: string,
    /** R1d: set by the gateway only when the call ended LENGTH_EXCEEDED; null on every other refusal (and every double). */
    readonly outOfRoom: ProviderOutOfRoomFacts | null = null
  ) {
    super("PROVIDER_CONTENT_UNACCEPTED", lastParseError);
    this.name = "ProviderContentUnacceptedError";
  }
}

export const PROVIDER_STRUCTURE_UNREPAIRED = "PROVIDER_STRUCTURE_UNREPAIRED" as const;

/**
 * LG-A (L32): a routed call's FIRST reply could not be read into its form by code (class STRUCTURE). The gateway ends the
 * call after that attempt's FAILED row and artifact, with no format re-ask; `withStructureRepair` catches it and sends the
 * one structure-repair call. It never leaves the wrapper: when the repair does not do, the wrapper throws today's
 * ProviderContentUnacceptedError built from these same facts. `reply` names who wrote the content (the original AI).
 * The attempt's ledger row stays FAILED whatever the repair call does (Task 10 review): the repair call's own row is
 * the call's one OK row, so the terminal facts never count a call twice.
 */
export class ProviderStructureUnrepairedError extends TypedDomainError {
  override readonly code = PROVIDER_STRUCTURE_UNREPAIRED;

  /**
   * Refused-repair salvage (2026-10-16, B): `materialMarked` is whether this attempt's body carried the material's cache
   * mark, so the follow-up B (`structureFollowUp.first.materialMarked`) repeats that body's marks and reads the cache.
   */
  constructor(
    readonly rejected: RejectedProviderContent,
    readonly attempts: number,
    readonly lastRawArtifactRef: string,
    readonly lastLedgerEntryRef: string,
    readonly reply: Readonly<Pick<ProviderCallResult, "provider" | "model" | "maker" | "modelVersion" | "thinkingLevel" | "reasoningTokens">>,
    readonly materialMarked: boolean = false
  ) {
    super(PROVIDER_STRUCTURE_UNREPAIRED, rejected.parseError);
    this.name = "ProviderStructureUnrepairedError";
  }
}

/**
 * Multi-model preview, PR B: the wire a call went out on. Recorded on the call
 * result and the raw artifact (`raw_artifact.provider` is free text).
 */
export type ProviderWireKind = "openai-compatible-http" | typeof ANTHROPIC_MESSAGES_HTTP_ADAPTER_KIND;

export interface ProviderCallResult {
  readonly rawArtifactRef: string;
  readonly ledgerEntryRef: string;
  readonly content: string;
  readonly provider: ProviderWireKind;
  readonly model: string;
  readonly maker: string;
  readonly modelVersion: string;
  /** Model scorecard §2.2: the level the call ran at — the relay's echo, else the level sent, else DEFAULT_ONLY. */
  readonly thinkingLevel?: string;
  /** Model scorecard §2.3: the vendor-reported thinking tokens of the accepted attempt; null when not reported. */
  readonly reasoningTokens?: number | null;
  /**
   * Role rotation (spec 2026-10-11 Part 3): repair packets sent before the accepted reply since the original
   * packet was last sent (0: the accepted reply answered the original packet). A length retry re-sends the
   * original packet, is not a repair, and starts the count again at 0 (Task 12). A gateway or double that
   * builds its own result and leaves it out means 0.
   */
  readonly repairAttempts?: number;
  /**
   * Patch follow-up (owner design, 2026-10-12): the form of the follow-up the accepted reply answered — "PATCH" when
   * it was the short follow-up and `content` is the first reply with the patch merged in, "FULL" when it was the
   * step's full re-ask. Absent when the accepted reply answered the original packet (or a gateway or double builds
   * its own result). STRUCTURE (LG-A) when the structure-repair call put the reply into its form; `content` is that
   * repaired reply and the identity and refs are the original AI's (ProviderStructureUnrepairedError).
   */
  readonly repairForm?: "PATCH" | "FULL" | "STRUCTURE";
  /**
   * Length guidance L27: the accepted attempt's answer tokens (its output minus its thinking; its output when the vendor
   * counted the thinking outside it), its cached input tokens as the vendor reported them, and the words its accepted
   * content holds. Null when not reported or not countable; absent from a gateway or double that builds its own result.
   */
  readonly answerTokens?: number | null;
  readonly cachedInputTokens?: number | null;
  readonly actualWords?: number | null;
}

export interface ProviderGateway {
  call(request: ProviderCallRequest): Promise<ProviderCallResult>;
}

const MAX_PROVIDER_TARGETS = 32;
const MAX_PROVIDER_TARGET_CONFIG_BYTES = 64 * 1024;
/** Model scorecard §2.2: the most level names one connection may declare. */
const MAX_TARGET_THINKING_LEVELS = 16;

export type ProviderDiscoveryTarget = Readonly<{
  providerRef: string;
  maker: string;
  baseUrl: string;
  model: string;
  authorizationHeader?: string;
  /**
   * V-9(2) / task 10b: an absolute path to the vendor's credential FILE, one per
   * vendor per environment. It is the DECLARED form; `resolveProviderTargetCredentials`
   * turns it into `authorizationHeader` in memory and drops the path, so nothing
   * downstream can re-open it and no gateway carries a file name.
   */
  authorizationFile?: string;
  /**
   * V-28: this vendor's price, in USD micro-units per MILLION tokens — the unit
   * every vendor publishes. Integers, because money is never a float, and BOTH
   * sides or neither, because input and output are priced differently and half a
   * price cannot bill a call.
   *
   * Optional here and REQUIRED in hosted mode (`assertHostedProviderTargets`): a
   * local relay or loopback model server costs no money, so demanding a price of
   * it would be an outage rather than a protection.
   */
  inputPriceMicrosPerMillionTokens?: number;
  outputPriceMicrosPerMillionTokens?: number;
  /**
   * Model scorecard §2.2 (ruling R7): how THIS connection carries a thinking
   * level and which levels it can set, in the vendor's own names. Both or
   * neither. A target that declares neither is DEFAULT_ONLY: a request that
   * names a level is refused before it is sent.
   */
  thinkingParameter?: ThinkingParameter;
  thinkingLevels?: readonly string[];
  /**
   * Model scorecard §2.10: this connection's context window in tokens (the pi
   * GLM relay declares 1 000 000). Absent = no pre-send window check.
   */
  contextWindowTokens?: number;
  /**
   * Multi-model preview, PR B: the NATIVE wire this target speaks, taken from
   * its configuredProviderSet register row (never from the target JSON, so the
   * sealed register stays the one authority on which adapter serves a vendor).
   * Absent = the OpenAI-compatible wire, which is every target before this.
   */
  adapterKind?: typeof ANTHROPIC_MESSAGES_HTTP_ADAPTER_KIND;
}>;

/**
 * The target's price in the shape `@debateai/budget` charges with, or `null`
 * when the target declares none. One reader, so no call site re-derives the
 * field names or the unit.
 */
export function providerTargetPrice(target: ProviderDiscoveryTarget): Readonly<{
  inputMicrosPerMillionTokens: number;
  outputMicrosPerMillionTokens: number;
}> | null {
  if (target.inputPriceMicrosPerMillionTokens === undefined
    || target.outputPriceMicrosPerMillionTokens === undefined) {
    return null;
  }
  return Object.freeze({
    inputMicrosPerMillionTokens: target.inputPriceMicrosPerMillionTokens,
    outputMicrosPerMillionTokens: target.outputPriceMicrosPerMillionTokens
  });
}

/**
 * Model scorecard §2.2 / §2.10: the target's thinking capability and window in
 * the shape the gateway consumes, so no composition root re-derives the field
 * names. Empty for a target that declares neither.
 */
export type ProviderTargetGatewayControls = Readonly<{
  thinking?: Readonly<{ parameter: ThinkingParameter; levels: readonly string[] }>;
  contextWindowTokens?: number;
  supportsJsonObjectResponse?: boolean;
  adapterKind?: typeof ANTHROPIC_MESSAGES_HTTP_ADAPTER_KIND;
}>;

/** The reviewed preview row behind an endpoint and model, if any (contract A §1; PR B adds Anthropic's). */
function reviewedPreviewRow(endpoint:string,model:string) {
  return previewModelRowForEndpoint(endpoint,model);
}
/** Row-driven: only a reviewed row whose json_object is true (a DeepInfra row) may send response_format. */
function isJsonObjectResponseTarget(endpoint:string,model:string):boolean {
  return reviewedPreviewRow(endpoint,model)?.jsonObject === true;
}
export function providerTargetGatewayControls(target: ProviderDiscoveryTarget): ProviderTargetGatewayControls {
  return Object.freeze({
    ...(target.thinkingParameter === undefined || target.thinkingLevels === undefined ? {} : {
      thinking: Object.freeze({ parameter: target.thinkingParameter, levels: target.thinkingLevels })
    }),
    ...(target.contextWindowTokens === undefined ? {} : { contextWindowTokens: target.contextWindowTokens }),
    ...(isJsonObjectResponseTarget(target.baseUrl,target.model)?{supportsJsonObjectResponse:true}:{}),
    ...(target.adapterKind === undefined ? {} : { adapterKind: target.adapterKind })
  });
}

/** An integer price in micro-units per million tokens, or a typed refusal. */
function providerTargetPriceAmount(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0
    || value > Number.MAX_SAFE_INTEGER) {
    throw new TypeError("PROVIDER_DISCOVERY_TARGET_PRICE_INVALID");
  }
  return value;
}

/** Model scorecard §2.2: one of the two wire spellings, or a typed refusal. */
function providerTargetThinkingParameter(value: unknown): ThinkingParameter {
  if (typeof value !== "string" || !(THINKING_PARAMETERS as readonly string[]).includes(value)) {
    throw new TypeError("PROVIDER_DISCOVERY_TARGET_THINKING_INVALID");
  }
  return value as ThinkingParameter;
}

/** Model scorecard §2.2: 1..16 distinct level tokens, or a typed refusal. */
function providerTargetThinkingLevels(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_TARGET_THINKING_LEVELS
    || value.some((level) => typeof level !== "string" || !THINKING_LEVEL_TOKEN.test(level))
    || new Set(value).size !== value.length) {
    throw new TypeError("PROVIDER_DISCOVERY_TARGET_THINKING_INVALID");
  }
  return Object.freeze([...value] as string[]);
}

/**
 * Model scorecard §2.10: a positive whole number of tokens within the
 * usage-counter bound. One rule for the target parser and the gateway
 * constructor (task review fix round 1, finding 4).
 */
function isContextWindowTokens(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= MAX_USAGE_COUNTER;
}

function providerTargetContextWindow(value: unknown): number {
  if (!isContextWindowTokens(value)) {
    throw new TypeError("PROVIDER_DISCOVERY_TARGET_CONTEXT_WINDOW_INVALID");
  }
  return value;
}

function requiredProviderTargetText(value: unknown, code: string): string {
  if (typeof value !== "string" || value.trim() === "" || value !== value.trim()) {
    throw new TypeError(code);
  }
  return value;
}

function normalizedProviderBaseUrl(value: unknown): string {
  const source = requiredProviderTargetText(
    value,
    "PROVIDER_DISCOVERY_TARGET_BASE_URL_INVALID"
  );
  let parsed: URL;
  try {
    parsed = new URL(source);
  } catch {
    throw new TypeError("PROVIDER_DISCOVERY_TARGET_BASE_URL_INVALID");
  }
  if ((parsed.protocol !== "http:" && parsed.protocol !== "https:")
    || parsed.username !== ""
    || parsed.password !== ""
    || parsed.search !== ""
    || parsed.hash !== "") {
    throw new TypeError("PROVIDER_DISCOVERY_TARGET_BASE_URL_INVALID");
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/u, "");
  if (!parsed.pathname.endsWith("/v1") && parsed.toString() !== "https://api.deepinfra.com/v1/openai") {
    throw new TypeError("PROVIDER_DISCOVERY_TARGET_BASE_URL_INVALID");
  }
  return parsed.toString().replace(/\/$/u, "");
}

export function parseProviderDiscoveryTargets(
  source: string,
  /**
   * `adapterKind` is the register row's. `anthropic-messages-http` marks the
   * target native; an OpenAI-compatible kind (or none) keeps the OpenAI wire,
   * exactly as before PR B; any other kind is refused rather than silently sent
   * over the OpenAI wire (review fix, 2026-10-10).
   */
  configuredProviders: readonly Readonly<{ providerRef: string; maker: string; adapterKind?: string }>[]
): readonly ProviderDiscoveryTarget[] {
  if (Buffer.byteLength(source, "utf8") > MAX_PROVIDER_TARGET_CONFIG_BYTES) {
    throw new TypeError("PROVIDER_DISCOVERY_TARGETS_INVALID");
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(source);
  } catch {
    throw new TypeError("PROVIDER_DISCOVERY_TARGETS_INVALID");
  }
  if (!Array.isArray(decoded) || decoded.length < 1 || decoded.length > MAX_PROVIDER_TARGETS) {
    throw new TypeError("PROVIDER_DISCOVERY_TARGETS_INVALID");
  }
  const configuredByRef = new Map<string, string>();
  const nativeRefs = new Set<string>();
  for (const configured of configuredProviders) {
    const providerRef = requiredProviderTargetText(
      configured.providerRef,
      "CONFIGURED_PROVIDER_INVALID"
    );
    const maker = requiredProviderTargetText(configured.maker, "CONFIGURED_PROVIDER_INVALID");
    if (configuredByRef.has(providerRef)) throw new TypeError("CONFIGURED_PROVIDER_DUPLICATE");
    configuredByRef.set(providerRef, maker);
    if (configured.adapterKind !== undefined
      && !BUILT_IN_PROVIDER_ADAPTERS.some((adapter) => adapter.adapterKind === configured.adapterKind)) {
      throw new TypeError("PROVIDER_ADAPTER_KIND_UNKNOWN");
    }
    if (configured.adapterKind === ANTHROPIC_MESSAGES_HTTP_ADAPTER_KIND) nativeRefs.add(providerRef);
  }
  const targetsByRef = new Map<string, ProviderDiscoveryTarget>();
  for (const candidate of decoded) {
    if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
      throw new TypeError("PROVIDER_DISCOVERY_TARGETS_INVALID");
    }
    const row = candidate as Readonly<Record<string, unknown>>;
    if (Object.keys(row).some((key) => ![
      "provider_ref", "base_url", "model", "authorization_header", "authorization_file",
      // V-28: the vendor's price, declared beside the vendor.
      "input_price_micros_per_million", "output_price_micros_per_million",
      // Model scorecard §2.2 / §2.10: the thinking capability and the window.
      "thinking_parameter", "thinking_levels", "context_window_tokens"
    ].includes(key))) {
      throw new TypeError("PROVIDER_DISCOVERY_TARGETS_INVALID");
    }
    // Both sides or neither. A target with one half declared is an operator's
    // half-finished edit, and billing a call at half its price is worse than
    // refusing to start: the envelope would under-count every call for as long
    // as nobody noticed.
    const declaresInputPrice = row.input_price_micros_per_million !== undefined;
    const declaresOutputPrice = row.output_price_micros_per_million !== undefined;
    if (declaresInputPrice !== declaresOutputPrice) {
      throw new TypeError("PROVIDER_DISCOVERY_TARGET_PRICE_INVALID");
    }
    const price = declaresInputPrice
      ? Object.freeze({
          inputPriceMicrosPerMillionTokens:
            providerTargetPriceAmount(row.input_price_micros_per_million),
          outputPriceMicrosPerMillionTokens:
            providerTargetPriceAmount(row.output_price_micros_per_million)
        })
      : undefined;
    // Model scorecard §2.2: both or neither, exactly as the price. Half a
    // declaration is an operator's unfinished edit, and a guessed wire member is
    // a call the vendor refuses.
    const declaresThinkingParameter = row.thinking_parameter !== undefined;
    if (declaresThinkingParameter !== (row.thinking_levels !== undefined)) {
      throw new TypeError("PROVIDER_DISCOVERY_TARGET_THINKING_INVALID");
    }
    const thinking = declaresThinkingParameter
      ? Object.freeze({
          thinkingParameter: providerTargetThinkingParameter(row.thinking_parameter),
          thinkingLevels: providerTargetThinkingLevels(row.thinking_levels)
        })
      : undefined;
    const contextWindow = row.context_window_tokens === undefined
      ? undefined
      : Object.freeze({ contextWindowTokens: providerTargetContextWindow(row.context_window_tokens) });
    const providerRef = requiredProviderTargetText(
      row.provider_ref,
      "PROVIDER_DISCOVERY_TARGET_PROVIDER_REF_INVALID"
    );
    if (targetsByRef.has(providerRef)) {
      throw new TypeError("PROVIDER_DISCOVERY_TARGET_DUPLICATE");
    }
    const maker = configuredByRef.get(providerRef);
    if (maker === undefined) throw new TypeError("PROVIDER_DISCOVERY_TARGET_SET_MISMATCH");
    const native = nativeRefs.has(providerRef);
    const baseUrl = normalizedProviderBaseUrl(row.base_url);
    // Review fix: the wire and the host are tied both ways, so a vendor key is
    // never sent over the wrong wire and this wire's body never to another host.
    if (!isAnthropicHostPairing(native, baseUrl)) {
      throw new TypeError("PROVIDER_ADAPTER_HOST_MISMATCH");
    }
    // PR B: the Anthropic wire carries a level as `output_config.effort`, and
    // only the levels its contract lists; anything else is an operator's
    // declaration the vendor (or the preview gate) would refuse on every call.
    if (native && thinking !== undefined && !isAnthropicThinkingControl({
      parameter: thinking.thinkingParameter, levels: thinking.thinkingLevels
    })) {
      throw new TypeError("PROVIDER_DISCOVERY_TARGET_THINKING_INVALID");
    }
    const authorizationHeader = row.authorization_header === undefined
      ? undefined
      : requiredProviderTargetText(
          row.authorization_header,
          "PROVIDER_DISCOVERY_AUTHORIZATION_INVALID"
        );
    // V-9(2): a vendor's credential is named ONE way. Two declarations are an
    // operator's half-finished migration off the inline form, and guessing which
    // one is live is exactly how a retired key keeps being used.
    if (authorizationHeader !== undefined && row.authorization_file !== undefined) {
      throw new TypeError("PROVIDER_DISCOVERY_AUTHORIZATION_CONFLICT");
    }
    const authorizationFile = row.authorization_file === undefined
      ? undefined
      : requiredProviderTargetText(
          row.authorization_file,
          "PROVIDER_DISCOVERY_AUTHORIZATION_FILE_INVALID"
        );
    // Absolute, because a credential resolved against whatever directory the
    // unit happened to start in is not a credential anyone can audit.
    if (authorizationFile !== undefined && !authorizationFile.startsWith("/")) {
      throw new TypeError("PROVIDER_DISCOVERY_AUTHORIZATION_FILE_INVALID");
    }
    targetsByRef.set(providerRef, Object.freeze({
      providerRef,
      maker,
      baseUrl,
      model: requiredProviderTargetText(row.model, "PROVIDER_DISCOVERY_TARGET_MODEL_INVALID"),
      ...(authorizationHeader === undefined ? {} : { authorizationHeader }),
      ...(authorizationFile === undefined ? {} : { authorizationFile }),
      ...(price === undefined ? {} : price),
      ...(thinking === undefined ? {} : thinking),
      ...(contextWindow === undefined ? {} : contextWindow),
      ...(native ? { adapterKind: ANTHROPIC_MESSAGES_HTTP_ADAPTER_KIND } : {})
    }));
  }
  if (targetsByRef.size !== configuredByRef.size) {
    throw new TypeError("PROVIDER_DISCOVERY_TARGET_SET_MISMATCH");
  }
  return Object.freeze([...configuredByRef.keys()].map((providerRef) => {
    const target = targetsByRef.get(providerRef);
    if (target === undefined) throw new TypeError("PROVIDER_DISCOVERY_TARGET_SET_MISMATCH");
    return target;
  }));
}

/**
 * The four exact spellings L4-F7 has always PERMITTED as a cleartext relay host.
 *
 * It stays a narrow permit-list ON PURPOSE. Widening it would ADMIT more `http:`
 * targets in a local production deployment, which relaxes a floor; the hosted
 * rule below is a DENY-list, where the broad reading is the strict one. Two sets,
 * opposite polarity, each chosen so that the stricter reading wins.
 */
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "[::1]", "localhost"]);

/** 8 groups of an IPv6 address, or `undefined` if `value` is not one. */
function ipv6Groups(value: string): readonly number[] | undefined {
  if (!value.includes(":")) return undefined;
  let text = value;
  // A trailing dotted-quad (`::ffff:127.0.0.1`) is two more groups.
  const dotted = /:((?:\d{1,3}\.){3}\d{1,3})$/u.exec(text);
  if (dotted !== null) {
    const octets = ipv4Octets(dotted[1]!);
    if (octets === undefined) return undefined;
    const high = ((octets[0]! << 8) | octets[1]!).toString(16);
    const low = ((octets[2]! << 8) | octets[3]!).toString(16);
    text = `${text.slice(0, dotted.index)}:${high}:${low}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return undefined;
  const part = (half: string) => (half === "" ? [] : half.split(":"));
  const head = part(halves[0]!);
  const tail = halves.length === 2 ? part(halves[1]!) : [];
  const explicit = [...head, ...tail];
  if (explicit.some((group) => !/^[0-9a-f]{1,4}$/u.test(group))) return undefined;
  if (halves.length === 1) {
    return explicit.length === 8 ? explicit.map((group) => Number.parseInt(group, 16)) : undefined;
  }
  if (explicit.length > 7) return undefined;
  return [
    ...head.map((group) => Number.parseInt(group, 16)),
    ...Array.from({ length: 8 - explicit.length }, () => 0),
    ...tail.map((group) => Number.parseInt(group, 16))
  ];
}

/** Four octets of a dotted-quad, or `undefined`. Node canonicalises every other IPv4 form to this. */
function ipv4Octets(value: string): readonly number[] | undefined {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/u.exec(value);
  if (match === null) return undefined;
  const octets = match.slice(1, 5).map((part) => Number(part));
  return octets.every((octet) => octet <= 255) ? octets : undefined;
}

/**
 * Names that mean this machine on the kit's own platform: `localhost` plus the
 * three aliases a stock Debian/Ubuntu `/etc/hosts` ships with. `.localhost` is
 * handled as a suffix below — RFC 6761 reserves the whole subtree.
 */
const THIS_MACHINE_NAMES = new Set([
  "localhost", "localhost.localdomain", "ip6-localhost", "ip6-loopback"
]);

/**
 * An IPv4 address that cannot leave this machine or this link:
 * `127.0.0.0/8` (loopback), `0.0.0.0/8` ("this network", which the stack treats
 * as the local host) and `169.254.0.0/16` (link-local, where a relay bound to the
 * web server's own autoconfigured address would sit).
 */
function isThisMachineIpv4(octets: readonly number[]): boolean {
  return octets[0] === 127
    || octets[0] === 0
    || (octets[0] === 169 && octets[1] === 254);
}

/**
 * C-I3 — an IPv4 address that cannot be a paid vendor's public API, because it
 * is not routable on the public internet at all: `10/8`, `172.16/12` and
 * `192.168/16` (RFC 1918) plus `100.64/10` (RFC 6598, carrier-grade NAT, which
 * is also where several hosts put their private networking).
 */
function isPrivateNetworkIpv4(octets: readonly number[]): boolean {
  return octets[0] === 10
    || (octets[0] === 172 && octets[1]! >= 16 && octets[1]! <= 31)
    || (octets[0] === 192 && octets[1] === 168)
    || (octets[0] === 100 && octets[1]! >= 64 && octets[1]! <= 127);
}

/** Case, a trailing dot and the brackets of an IPv6 literal, normalised away once. */
function normalizedHostLiteral(hostname: string): string {
  const bare = hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
  return bare.toLowerCase().replace(/\.$/u, "");
}

/**
 * C-I3 — the same question as `isThisMachineHost`, one network out: is this
 * address on a PRIVATE network? Decided on the parsed literal, in the same
 * three families and the same order, so the two predicates cannot drift.
 */
function isPrivateNetworkHost(host: string): boolean {
  const octets = ipv4Octets(host);
  if (octets !== undefined) return isPrivateNetworkIpv4(octets);
  const groups = ipv6Groups(host);
  if (groups === undefined) return false;
  // fc00::/7 — unique local addresses (RFC 4193), the IPv6 private range.
  if ((groups[0]! & 0xfe00) === 0xfc00) return true;
  const leadingZeroes = groups.slice(0, 5).every((group) => group === 0);
  if (leadingZeroes && (groups[5] === 0xffff || groups[5] === 0)) {
    return isPrivateNetworkIpv4([
      groups[6]! >> 8, groups[6]! & 0xff, groups[7]! >> 8, groups[7]! & 0xff
    ]);
  }
  return false;
}

/**
 * One canonical key per literal ADDRESS, or `undefined` for a name.
 *
 * `10.0.0.2`, `[::ffff:10.0.0.2]` and `[::ffff:a00:2]` are one address written
 * three ways, and an interface reports only the first; keying them the same way
 * is what makes the comparison below independent of the spelling.
 */
function literalAddressKey(host: string): string | undefined {
  const octets = ipv4Octets(host);
  if (octets !== undefined) return `v4:${octets.join(".")}`;
  const groups = ipv6Groups(host);
  if (groups === undefined) return undefined;
  const leadingZeroes = groups.slice(0, 5).every((group) => group === 0);
  if (leadingZeroes && (groups[5] === 0xffff || groups[5] === 0)) {
    return `v4:${[
      groups[6]! >> 8, groups[6]! & 0xff, groups[7]! >> 8, groups[7]! & 0xff
    ].join(".")}`;
  }
  return `v6:${groups.join(":")}`;
}

/**
 * The address keys of a list of interface addresses. A scoped IPv6 address
 * (`fe80::1%en0`) names its interface in the zone id, which is not part of the
 * address, so the zone is dropped before the address is keyed.
 */
export function thisMachineAddressKeys(addresses: readonly string[]): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const address of addresses) {
    if (typeof address !== "string") continue;
    const key = literalAddressKey(normalizedHostLiteral(address.split("%")[0] ?? ""));
    if (key !== undefined) keys.add(key);
  }
  return keys;
}

/**
 * C-I3 — THIS HOST'S OWN ADDRESSES, READ ONCE AT START-UP.
 *
 * A hosted deployment answers on a PUBLIC address of its own, so no range check
 * can cover the case that matters most: `https://<the VPS's own address>/v1` is
 * a relay on the web server, and it is in no private range. The addresses are
 * read from `os.networkInterfaces()` — a local syscall, never DNS — ONCE, when
 * this module loads, so the hosted check stays a pure decision on the literal
 * address and no per-target lookup is introduced.
 */
const THIS_MACHINE_INTERFACE_ADDRESS_KEYS: ReadonlySet<string> = thisMachineAddressKeys(
  Object.values(networkInterfaces())
    .flatMap((entries) => entries ?? [])
    .map((entry) => entry.address)
);

/**
 * V-9(c), review finding 1 — "is this address THIS MACHINE?", decided on the
 * PARSED address rather than on the spelling.
 *
 * It reads the LITERAL address written in the target's `base_url` and performs
 * NO NAME RESOLUTION: a public hostname whose A record points at `127.0.0.1` is
 * admitted here, and the operator is told so in the kit (README §11). A
 * resolved-address check is a separate control this function does not pretend to
 * be.
 *
 * The four-spelling permit-list above, read as a deny-list, admitted every alias
 * of loopback: `127.0.0.2`, `127.1`, `localhost.`, `relay.localhost`,
 * `[::ffff:127.0.0.1]` (which Node normalises to `[::ffff:7f00:1]`), `0.0.0.0`
 * and `[::]`. `https:` is no backstop on a host that installs its own CA
 * (`NODE_EXTRA_CA_CERTS`) and already runs internal TLS on loopback, so a TLS
 * relay on any of those aliases would have passed the hosted check.
 *
 * Refused: `127.0.0.0/8`, `0.0.0.0/8` and `169.254.0.0/16`; `::`, `::1` and
 * `fe80::/10`; an IPv4-mapped or IPv4-compatible IPv6 form of any of the IPv4
 * ranges; and the names `localhost`, `localhost.localdomain`, `ip6-localhost`,
 * `ip6-loopback` or anything under `.localhost`. Case and one trailing dot are
 * normalised away first.
 *
 * NOT refused: a real vendor whose name merely looks loopback-ish, such as
 * `127.0.0.1.vendor.example`, `notlocalhost.example` or
 * `localhost.localdomain.example`; and addresses just outside each range, such as
 * `169.253.0.1`, `1.0.0.1`, `[fe00::1]` and `[fec0::1]`. A deny-list that refused
 * those would be an outage rather than a protection.
 */
export function isThisMachineHost(hostname: string): boolean {
  const host = normalizedHostLiteral(hostname);
  if (THIS_MACHINE_NAMES.has(host) || host.endsWith(".localhost")) return true;
  const octets = ipv4Octets(host);
  if (octets !== undefined) return isThisMachineIpv4(octets);
  const groups = ipv6Groups(host);
  if (groups === undefined) return false;
  // fe80::/10 — the link-local block, where an interface's autoconfigured
  // address lives. A relay bound to the web server's own fe80: address is on
  // this machine by any reading.
  if ((groups[0]! & 0xffc0) === 0xfe80) return true;
  const leadingZeroes = groups.slice(0, 5).every((group) => group === 0);
  if (leadingZeroes && groups[5] === 0 && groups[6] === 0 && groups[7] === 1) return true;
  // `::ffff:a.b.c.d` (mapped) and `::a.b.c.d` (compatible) both carry an IPv4
  // address in the last two groups — `::` itself is `::0.0.0.0` — so the same
  // IPv4 decision settles them. That is what keeps the two families in step.
  if (leadingZeroes && (groups[5] === 0xffff || groups[5] === 0)) {
    return isThisMachineIpv4([
      groups[6]! >> 8, groups[6]! & 0xff, groups[7]! >> 8, groups[7]! & 0xff
    ]);
  }
  return false;
}

/**
 * C-I3 (final review, area C) — WHAT A HOSTED VENDOR TARGET MAY NOT NAME.
 *
 * `isThisMachineHost` alone stopped at loopback, `0.0.0.0/8` and link-local. It
 * therefore ADMITTED the two shapes a hosted operator is most likely to reach
 * for: a relay one hop away on the private side (`https://10.0.0.2:8443/v1`,
 * `192.168/16`, `172.16/12`, CGNAT `100.64/10`, ULA `fc00::/7`, and every
 * IPv4-mapped spelling of those), and the web server's OWN routable address.
 * Neither can be a paid vendor's public API, and both are the local-mode relay
 * path V-9(c) ruled must not run hosted.
 *
 * Three clauses, all decided on the parsed LITERAL address and with
 * no name resolution anywhere:
 *
 *  1. this machine, exactly as before — nothing that was refused is admitted now;
 *  2. the private ranges, which are unroutable on the public internet;
 *  3. the addresses this host actually holds, read once from
 *     `os.networkInterfaces()` at start-up.
 *
 * A NAME is still never resolved: `127.0.0.1.nip.io`, or any public name whose
 * A record points inward, is admitted and is the operator's responsibility —
 * the kit's §11 says so in as many words, and a resolved-address check is a
 * separate control this function does not pretend to be.
 *
 * `ownAddressKeys` is a parameter so the class can be driven deterministically
 * in a test; the shipped call sites take the start-up set.
 */
export function isRefusedHostedProviderHost(
  hostname: string,
  ownAddressKeys: ReadonlySet<string> = THIS_MACHINE_INTERFACE_ADDRESS_KEYS
): boolean {
  if (isThisMachineHost(hostname)) return true;
  const host = normalizedHostLiteral(hostname);
  if (isPrivateNetworkHost(host)) return true;
  const key = literalAddressKey(host);
  return key !== undefined && ownAddressKeys.has(key);
}

/**
 * L4-F7: in production a cleartext `http:` base URL may only point at a loopback relay; any
 * other `http:` target would carry the bearer `authorization_header` and every prompt off-box
 * unencrypted. `https:` targets and non-production environments are untouched.
 *
 * V-9(c): this is the LOCAL deployment's floor and nothing else. Local mode is a supported
 * product path — the command-line relays and loopback model servers — so loopback `http:` stays
 * lawful here, byte-for-byte as before the mode existed. The hosted deployment's own rule is
 * `assertHostedProviderTargets`, and `assertDeploymentProviderTargets` picks between them.
 */
export function assertProductionProviderTargets(
  targets: readonly ProviderDiscoveryTarget[],
  nodeEnv: string | undefined
): void {
  if (nodeEnv !== "production") return;
  for (const target of targets) {
    const parsed = new URL(target.baseUrl);
    if (parsed.protocol === "http:" && !LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase())) {
      throw new TypeError(`PROVIDER_BASE_URL_TLS_REQUIRED:${target.providerRef}`);
    }
  }
}

/**
 * V-9(c) / task 10a — the HOSTED deployment's provider rule.
 *
 * The commercial website reaches paid vendor APIs and nothing else:
 *
 * - every base URL is `https:` — a cleartext hop would carry the vendor credential and every
 *   prompt in the clear, and there is no loopback exception here (see below);
 * - no target whose base URL NAMES this machine or a private network
 *   (`isRefusedHostedProviderHost`: loopback and its aliases, the RFC 1918 ranges, CGNAT, ULA,
 *   and this host's own interface addresses read once at start-up) — a relay or a local model
 *   server on the web server, or one hop away on its private side, is precisely the local-mode
 *   path V ruled must not run hosted (V-30(1) says the same for the support chat). Every clause
 *   is decided on the parsed LITERAL address and not on the spelling, and NONE does name
 *   resolution: a public hostname pointed at loopback is admitted and is the operator's
 *   responsibility — README §11 says so, and it is the one sentence there this rule does not
 *   cover;
 * - no credential inline in `PROVIDER_DISCOVERY_TARGETS_JSON`. Hosted credentials live in
 *   custody-checked FILES (`authorization_file`, task 10b), so a bearer token can never sit in
 *   an `EnvironmentFile`, in `/proc/<pid>/environ` or in a process listing.
 *
 * Every refusal names the provider ref and NOTHING of the credential.
 */
export function assertHostedProviderTargets(
  targets: readonly ProviderDiscoveryTarget[]
): void {
  for (const target of targets) {
    const parsed = new URL(target.baseUrl);
    if (parsed.protocol !== "https:") {
      throw new TypeError(`PROVIDER_BASE_URL_TLS_REQUIRED:${target.providerRef}`);
    }
    // C-I3: one code for the whole class. `PROVIDER_TARGET_LOOPBACK_REFUSED` is
    // the name every pinned copy of the error alphabet already carries, and a
    // private-range target is refused for the same reason a loopback one is.
    if (isRefusedHostedProviderHost(parsed.hostname)) {
      throw new TypeError(`PROVIDER_TARGET_LOOPBACK_REFUSED:${target.providerRef}`);
    }
    if (target.authorizationHeader !== undefined) {
      throw new TypeError(`PROVIDER_INLINE_CREDENTIAL_REFUSED:${target.providerRef}`);
    }
  }
}

/**
 * V-28 — A HOSTED DEBATE TARGET MUST DECLARE ITS PRICE.
 *
 * Without one its calls cannot be billed against the per-run or the daily
 * envelope, so its spend is unbounded in exactly the way V-28(3) refuses to
 * allow — and unbounded SILENTLY, since every call would charge zero. Same
 * fail-closed reasoning as the vendor that reports no usage, one step earlier:
 * refuse at boot, where the operator can fix the declaration, rather than
 * mid-debate.
 *
 * DELIBERATELY SEPARATE from `assertHostedProviderTargets`. That function is the
 * URL-and-credential rule, and the support chat's own model target goes through
 * it too (V-30, `parseSupportModelTargetJson`) — but the support chat keeps its
 * OWN spend accounting on `support.message`, which task 12 owns and task 11 was
 * told not to duplicate, so nothing would read a price declared on it. A
 * requirement nobody consumes is configuration theatre. The rule therefore lives
 * with the control that consumes it, and the two shipped roots call it on the
 * DEBATE targets beside the mode decision.
 */
export function assertPricedProviderTargets(
  targets: readonly ProviderDiscoveryTarget[],
  mode: "hosted" | "local"
): void {
  if (mode !== "hosted") return;
  for (const target of targets) {
    const price = providerTargetPrice(target);
    if (price === null) {
      throw new TypeError(`PROVIDER_TARGET_PRICE_REQUIRED:${target.providerRef}`);
    }
    /**
     * C2 (review round 2) — A DECLARED PRICE OF ZERO IS NOT A PRICE.
     *
     * Zero is a lawful integer and it PROPAGATES: every projection and every
     * charge comes back 0, the run's total never moves, and both ceilings bound
     * nothing — silently, with every other check green. One mistyped line in the
     * target declaration and the whole control is off. The floor is one
     * micro-unit per million tokens (1e-6 USD per million), far below any real
     * vendor and impossible to reach by accident.
     */
    if (price.inputMicrosPerMillionTokens < 1 || price.outputMicrosPerMillionTokens < 1) {
      throw new TypeError(`PROVIDER_TARGET_PRICE_ZERO:${target.providerRef}`);
    }
  }
}

/**
 * The ONE decision both shipped composition roots take over their parsed targets. The mode comes
 * from the register loader (`DEPLOYMENT_MODE`), so it is resolved before the first target is read.
 */
export function assertDeploymentProviderTargets(
  targets: readonly ProviderDiscoveryTarget[],
  deployment: Readonly<{ mode: "hosted" | "local"; nodeEnv: string | undefined }>
): void {
  if (deployment.mode === "hosted") {
    assertHostedProviderTargets(targets);
    return;
  }
  assertProductionProviderTargets(targets, deployment.nodeEnv);
}

/**
 * Nothing was provisioned at the declared path. It gets its OWN top-level
 * refusal rather than a line in the `UNUSABLE` bucket, because the operator
 * action differs: provision the file, rather than inspect the one that is there.
 */
const PROVIDER_CREDENTIAL_ABSENT_CODE = "PROVIDER_CREDENTIAL_FILE_ABSENT";

/**
 * The refusal codes `resolveProviderTargetCredentials` will repeat; anything else
 * is UNKNOWN. This is an INVENTORY of what the shipped reader can emit, and the
 * kit's §11 table is pinned against it, so the two cannot drift.
 *
 * `KEK_UNRESOLVED` was dropped here: `readCustodyAuthorizationHeader` translates
 * it to `PROVIDER_CREDENTIAL_FILE_ABSENT` at source, so nothing on this path can
 * produce it any more and listing it would promise an operator a code they will
 * never see. `CUSTODY_GROUP_UNRESOLVED` stays: the group is resolved eagerly at
 * boot today, but `@debateai/crypto`'s own reader deliberately carries that error
 * through its catch rather than collapsing it, and if that resolution ever
 * becomes lazy the operator must still be told the real reason instead of UNKNOWN.
 */
const PROVIDER_CREDENTIAL_REFUSAL_CODES = Object.freeze([
  "SECRET_CUSTODY_INVALID",
  "CUSTODY_GROUP_UNRESOLVED",
  "PROVIDER_CREDENTIAL_FILE_INVALID"
] as const);

/** One printable header line — the same shape `@debateai/crypto` enforces on the file. */
const PRINTABLE_HEADER_LINE = /^[\x20-\x7e]+$/u;

function providerCredentialRefusalCode(error: unknown): string {
  const code = (error as Readonly<{ code?: unknown }>)?.code;
  return typeof code === "string"
    && (PROVIDER_CREDENTIAL_REFUSAL_CODES as readonly string[]).includes(code)
    ? code
    : "UNKNOWN";
}

/**
 * V-9(2) / task 10b — the ONE place a declared credential FILE becomes an
 * in-memory `authorization` header.
 *
 * `readAuthorizationHeader` is the seam: the shipped composition roots pass
 * `readCustodyAuthorizationHeader` from `@debateai/crypto`, so the file is read
 * under the same custody contract as every key file and the bytes are zeroed
 * after the header is built. Nothing here opens a file, which is what keeps this
 * decision testable without one.
 *
 * The resolved target DROPS `authorizationFile`: after this, no gateway, probe,
 * log line or error carries a credential path, and nothing downstream can re-open
 * it. A refusal names the provider ref and a code from a CLOSED set — never the
 * path, never the thrown message, never a byte of the credential.
 */
export function resolveProviderTargetCredentials(
  targets: readonly ProviderDiscoveryTarget[],
  readAuthorizationHeader: (path: string) => string
): readonly ProviderDiscoveryTarget[] {
  return Object.freeze(targets.map((target) => {
    if (target.authorizationFile === undefined) return target;
    const { authorizationFile, ...rest } = target;
    let authorizationHeader: string;
    try {
      authorizationHeader = readAuthorizationHeader(authorizationFile);
    } catch (error) {
      if ((error as Readonly<{ code?: unknown }>)?.code === PROVIDER_CREDENTIAL_ABSENT_CODE) {
        throw new TypeError(`PROVIDER_AUTHORIZATION_FILE_ABSENT:${target.providerRef}`);
      }
      throw new TypeError(
        `PROVIDER_AUTHORIZATION_FILE_UNUSABLE:${target.providerRef}:${providerCredentialRefusalCode(error)}`
      );
    }
    if (typeof authorizationHeader !== "string"
      || !PRINTABLE_HEADER_LINE.test(authorizationHeader)
      || authorizationHeader !== authorizationHeader.trim()) {
      throw new TypeError(
        `PROVIDER_AUTHORIZATION_FILE_UNUSABLE:${target.providerRef}:PROVIDER_CREDENTIAL_FILE_INVALID`
      );
    }
    return Object.freeze({ ...rest, authorizationHeader });
  }));
}

export interface ProviderAdapterRegistration {
  readonly providerRef: string;
  readonly adapterKind: string;
  readonly maker: string;
}

export const OPENAI_COMPATIBLE_HTTP_ADAPTER_KIND = "openai-compatible-http" as const;
export const BUILT_IN_PROVIDER_ADAPTERS = Object.freeze([
  Object.freeze({ adapterKind: OPENAI_COMPATIBLE_HTTP_ADAPTER_KIND, implementation: "OpenAICompatibleProviderGateway" }),
  Object.freeze({ adapterKind: "vllm-openai-compatible-http", implementation: "VllmOpenAICompatibleProviderGateway" }),
  // Multi-model preview, PR B: the native Messages wire (./anthropic-messages.ts).
  Object.freeze({ adapterKind: ANTHROPIC_MESSAGES_HTTP_ADAPTER_KIND, implementation: "AnthropicMessagesProviderGateway" })
] as const);

export function selectProviderAdapter(
  providerRef: string,
  configured: readonly ProviderAdapterRegistration[]
): ProviderAdapterRegistration {
  const selected = configured.find((candidate) => candidate.providerRef === providerRef);
  if (selected === undefined) throw new TypeError(`Configured provider is unresolved: ${providerRef}`);
  if (selected.maker.trim().length === 0 || selected.adapterKind.trim().length === 0) {
    throw new TypeError(`Configured provider has incomplete adapter metadata: ${providerRef}`);
  }
  return Object.freeze({ ...selected });
}

/** LG-A (INTERFACE §4): what one attempt sent — the step's own packet, the short follow-up, the full re-ask, the structure-repair call, or a cut-off reply's resend. */
export type ReplyForm = "ORIGINAL" | "PATCH" | "FULL" | "STRUCTURE" | "LENGTH_RETRY";

export interface RawArtifactInput {
  readonly artifactId: string;
  readonly attemptId: string;
  readonly runId: string | null;
  readonly providerRef: string;
  readonly provider: ProviderWireKind;
  readonly model: string;
  readonly maker: string;
  readonly modelVersion: string | null;
  readonly rawText: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly parseStatus: "PARSED" | "UNPARSED" | "PARSE_FAILED" | "SCHEMA_FAILED";
  readonly parseError?: string | null;
  readonly inputHash: string;
  readonly contractHash: string;
  readonly contentHash: string;
  /** Model scorecard §2.3: the vendor-reported thinking tokens of this attempt; null when not reported. */
  readonly thinkingTokens?: number | null;
  /** LG-A (INTERFACE §4, migration 0120): every repair the accepted reply needed, in order; null when none. Codes only. */
  readonly replyRepairs?: readonly ModelJsonRepair[] | null;
  /** LG-A: the class of a refused reply (`replyFailureClassOf`); null for an accepted one. */
  readonly replyFailureClass?: ReplyFailureClass | null;
  /** LG-A: what this attempt sent. */
  readonly replyForm?: ReplyForm | null;
  /** LG-B writes it (the vendor's cached input count). */
  readonly cachedInputTokens?: number | null;
  /** LG-C writes it (the words the AI was guided to). */
  readonly guidedWords?: number | null;
  /** LG-B writes it (the words the AI wrote). */
  readonly actualWords?: number | null;
}

export interface ProviderLedgerInput {
  readonly runId: string | null;
  readonly attemptId: string;
  readonly actionKind: "MODEL_CALL";
  readonly callSiteKey: string;
  readonly subjectItemId: string;
  readonly stanceAtAction: "UNASSIGNED";
  /** REFUSED: a `ProviderUnbilledRefusal` (nothing billed); no attempt count includes it (spec 2026-10-11 §1.2). */
  readonly outcome: "OK" | "FAILED" | "TIMED_OUT" | "REFUSED";
  readonly inputHash: string;
  readonly contractHash: string;
  readonly actorRef: string;
  readonly rawArtifactRef: string | null;
  readonly startedAt: Date;
  readonly finishedAt: Date;
  /** Model scorecard §2.1: the debate job; null for a caller that names none. */
  readonly modelRole?: DebateRole | null;
  /** Model scorecard §2.3: the scorecard candidate and the scorecard version of the seat. */
  readonly candidateId?: string | null;
  readonly scorecardVersion?: number | null;
  /** Model scorecard §2.2: the level the attempt ran at (the relay's echo, else the level sent) or DEFAULT_ONLY. */
  readonly thinkingLevel?: string | null;
}

/**
 * Model scorecard §2.3 — the exact prompt of ONE attempt, handed to the
 * composition before the attempt is sent. `promptText` is the `messages`
 * member exactly as it is serialised into the request body; `messages` is the
 * same value, for the canonical fingerprint the composition computes. The
 * gateway never stores it itself: the store is the run's content envelope.
 */
export interface CallPromptRecordInput {
  readonly runId: string;
  readonly attemptId: string;
  readonly promptText: string;
  readonly messages: PromptPacket["messages"];
}

/**
 * V-28 (DL4-F2) — THE MONEY SEAM.
 *
 * The gateway holds the two facts only it knows (the exact bytes about to be
 * sent, and this attempt's own token bound) and the usage the vendor reported;
 * the POLICY — prices, ceilings, the running total, whether this deployment
 * requires reported usage — lives entirely behind this interface, in
 * `@debateai/budget`. That is what keeps this package free of the ledger and
 * keeps every money rule testable without a database.
 *
 * Both members may refuse by throwing a typed error. A refusal from
 * `assertCallAllowed` is raised BEFORE the request is sent, so nothing is
 * recorded for it — exactly like `assertAttemptAllowed`. A refusal from
 * `recordCall` is raised AFTER a call that has already been made and paid for,
 * so the attempt is in the ledger with its artifact first. Neither is retried:
 * see `PROVIDER_COST_ENVELOPE_REFUSAL_CODES`.
 */
export interface ProviderCostEnvelopeSeam {
  readonly assertCallAllowed: (projection: Readonly<{
    /** Bytes of the request body that is about to be sent, measured exactly. */
    requestBytes: number;
    /** This attempt's `max_tokens`, which a length retry raises (W10/2). */
    completionTokenCeiling: number;
    /** T12-R0: the request's `keepRoomMicros`, only when it names one: money the call must leave unspent. */
    keepRoomMicros?: number;
  }>) => void | ProviderCallAdmission | Promise<void | ProviderCallAdmission>;
  /**
   * CHARGE what the vendor billed. Called for every attempt that produced a
   * response body, whatever the engine then decides about it, and it NEVER
   * refuses: it records money already taken, and a refusal here would be a
   * reason not to record it (I4). An attempt that was sent and never got this
   * far is charged by `recordUnanswered` instead (NV-50).
   */
  readonly recordCall: (observed: Readonly<{
    providerRef: string;
    admission?: ProviderCallAdmission;
    /**
     * The vendor's usage block EXACTLY as it arrived — not the strict parse.
     * A malformed count does not make a billed call free (Important 1), so the
     * policy reads this leniently and uses `projection` for what it cannot
     * read. `undefined` means the answer carried no usage member at all.
     */
    usage: unknown;
    /** This attempt's own pre-send maximum, the two facts `assertCallAllowed` got. */
    projection: Readonly<{ requestBytes: number; completionTokenCeiling: number }>;
    /**
     * Model scorecard §2.3: the gateway attempt this charge pays for — the id
     * its artifact already carries and its ledger row will carry
     * (`ledger.model_spend.attempt_id`). The gateway always passes it.
     */
    attemptId?: string;
  }>) => void | Promise<void>;
  /**
   * NV-50 (security audit run 3): called once for an attempt that was SENT, may
   * have been billed (`mayHaveBeenBilled`), and never reached `recordCall` — a
   * deadline, a dropped connection, a reply that could not be read or stored.
   * `usage` is the body's usage block when a body was read, else undefined; the
   * policy charges it, or else `projection`'s maximum, before the next attempt is
   * admitted. A throw means the charge could not be recorded, and the call then
   * stops: no attempt is sent while an earlier one's money is unrecorded.
   * Optional: a seam without it keeps the old behaviour.
   */
  readonly recordUnanswered?: (observed: Readonly<{
    providerRef: string;
    admission?: ProviderCallAdmission;
    usage: unknown;
    projection: Readonly<{ requestBytes: number; completionTokenCeiling: number }>;
    attemptId: string;
  }>) => void | Promise<void>;
  /**
   * The HOSTED requirement, asked only of a SUCCESSFUL completion: a vendor that
   * answered and reported no usage cannot be billed, so nothing that follows can
   * be bounded. Separate from `recordCall` because an error page reports no
   * usage either, and a transport failure must not be renamed as an unbillable
   * vendor (I4).
   */
  readonly assertUsageReported: (observed: Readonly<{
    providerRef: string;
    usage: unknown;
  }>) => void | Promise<void>;
}

export interface OpenAICompatibleGatewayOptions {
  readonly supportsJsonObjectResponse?: boolean;
  /**
   * Multi-model preview, PR B: the wire this gateway speaks. Absent = the
   * OpenAI-compatible `/chat/completions` wire, byte for byte as before. With
   * `anthropic-messages-http` the SAME attempt loop posts the Messages body to
   * `/messages` and reads the reply through ./anthropic-messages.ts; nothing
   * else about the loop changes. `providerTargetGatewayControls` sets it from
   * the target, so a composition root needs no change of its own.
   */
  readonly adapterKind?: typeof ANTHROPIC_MESSAGES_HTTP_ADAPTER_KIND;
  readonly endpoint: string;
  readonly model: string;
  readonly maker: string;
  readonly authorizationHeader?: string;
  readonly persistRawArtifact: (artifact: RawArtifactInput) => Promise<string>;
  readonly appendLedgerEntry: (entry: ProviderLedgerInput) => Promise<string>;
  readonly assertNoOpenWriteTransaction: () => void;
  readonly fetchImplementation?: typeof fetch;
  /** L4-F8: seam for the bounded backoff between HTTP attempts; real time by default. */
  readonly sleepImplementation?: (milliseconds: number) => Promise<void>;
  /**
   * Model scorecard §2.2: from the target's `thinking_parameter` /
   * `thinking_levels` (`providerTargetGatewayControls`). Absent = the
   * connection is DEFAULT_ONLY.
   */
  readonly thinking?: Readonly<{ parameter: ThinkingParameter; levels: readonly string[] }>;
  /** Model scorecard §2.10: from the target's `context_window_tokens`. Absent = no window check. */
  readonly contextWindowTokens?: number;
  /**
   * Contract A §2 (preview multi-model, 2026-10-10): the target's largest `max_tokens`. Every
   * attempt's bound, a length retry's raised one included, is clamped to it before the body is
   * built, so the guarded fetch never sees a bound its row refuses. Absent = no clamp.
   */
  readonly maxOutputTokens?: number;
  /**
   * Length guidance L30 (LG-B): on the Anthropic wire only, send the first user turn's material with the cache mark
   * (anthropic-messages.ts anthropicCacheableMessages). Set by `previewTargetGatewayControls` for the preview's Anthropic
   * rows. Absent: today's body. Refused on any other wire.
   */
  readonly cacheFirstUserTurn?: boolean;
  /**
   * Model scorecard §2.3: records each attempt's prompt just before it is sent.
   * Optional: the unit doubles and a gateway with no debate run record none.
   * The runner's `createPostgresProviderGateway` always supplies it
   * (`ledger.call_prompt`, through the run's content envelope).
   */
  readonly persistCallPrompt?: (prompt: CallPromptRecordInput) => Promise<void>;
}

/**
 * V-28: refusals the money seam raises. Neither is repaired by asking again — a
 * ceiling already reached is still reached one backoff later, and a vendor that
 * reports no usage will report none on the retry — so both leave the attempt
 * loop unwrapped rather than being absorbed into it and re-emerging as
 * PROVIDER_CALL_FAILED after the ceiling is spent, which is the confusion the
 * model-identity short-circuit exists to avoid.
 */
export const PROVIDER_COST_ENVELOPE_REFUSAL_CODES = Object.freeze([
  "RUN_COST_ENVELOPE_MONEY_REACHED",
  "PROVIDER_USAGE_UNREPORTED",
  // Round 2, Critical B: a charge that cannot be computed exactly is raised
  // HERE, inside the attempt loop, and a retry would be a second billed call
  // for the same unrepresentable number.
  "COST_ENVELOPE_CHARGE_UNREPRESENTABLE",
  "INTERNAL_PROVIDER_FRAME_INVALID",
  "INTERNAL_PROVIDER_SETTLEMENT_UNCERTAIN",
  // B9 (budget spec §2.9): the seam's shared wall raises the day mid-run under
  // the new settings, before sending; retrying a day that is spent would be as
  // pointless as retrying a run that is.
  "DAILY_COST_ENVELOPE_REACHED",
  // B9: and one of the run owner's windows, the same way.
  "PERSON_ALLOWANCE_REACHED"
] as const);

/**
 * NV-50: the causes Node's fetch gives a connection that was NEVER established (refused, no such host, a lookup that
 * failed for now, no route, the connect deadline). Nothing reached the vendor, so nothing was billed.
 */
const NEVER_CONNECTED_CAUSES: ReadonlySet<string> = new Set([
  "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "EHOSTUNREACH", "ENETUNREACH", "UND_ERR_CONNECT_TIMEOUT"
]);

/** NV-50, rule 5's exception: a fetch failure whose cause says the connection was never made. */
function neverConnected(error: unknown): boolean {
  if (!(error instanceof TypeError)) return false;
  const code = (error as { cause?: { code?: unknown } }).cause?.code;
  return typeof code === "string" && NEVER_CONNECTED_CAUSES.has(code);
}

/**
 * NV-50 — MAY THIS FAILED ATTEMPT HAVE BEEN BILLED? Asked only of an attempt that was sent (the line before the fetch
 * ran) and never reached `recordCall`. The rules, in order:
 *  1. a `ProviderUnbilledRefusal` provably cost nothing: no;
 *  2. the fetch returned, so the vendor answered (a body-read, parse, artifact-store or any later failure): yes;
 *  3. a `ProviderSentBilledFailure` (the preview gate sent the call and booked its maximum): yes;
 *  4. any other typed error raised from inside the fetch: no. Node's fetch never throws one; only an in-process wrapper
 *     does (the preview's guarded fetch and its gate RPC, which the hosted preview runner uses beside the money seam).
 *     Its doubtful outcomes (STOPPED, a lost reply) are short-circuit codes, booked by the gate's own ledger;
 *  5. a `TypeError`: only Node's own network failure, "fetch failed", and only when its cause is not a connection that
 *     was never made. Any other TypeError is fetch's argument check or the preview wrapper's own refusal: nothing left;
 *  6. anything else (a deadline's TimeoutError or AbortError, an unknown throw): yes, conservatively.
 */
function mayHaveBeenBilled(error: unknown, fetchReturned: boolean): boolean {
  if (error instanceof ProviderUnbilledRefusal) return false;
  if (fetchReturned) return true;
  if (error instanceof ProviderSentBilledFailure) return true;
  if (error instanceof TypedDomainError) return false;
  if (error instanceof TypeError) return error.message === "fetch failed" && !neverConnected(error);
  return true;
}

/** L4-F3: a provider body is streamed and abandoned past this many bytes; nothing of it is persisted. */
const MAX_PROVIDER_RESPONSE_BYTES = 4 * 1024 * 1024;
/**
 * L4-F2: the serialised request packet is bounded before it is sent. The structural ceiling counts
 * attempts, not tokens, so an unbounded packet turns one ask into unbounded model spend. An
 * oversized packet is a refused attempt — recorded, never sent, never retried.
 */
const MAX_PROVIDER_REQUEST_PACKET_BYTES = 256 * 1024;
/** L29: the largest per-call cap a request may name (`packetByteCap`); the preview gate's own outer request bound. */
const MAX_PROVIDER_REQUEST_PACKET_BYTES_CEILING = 1024 * 1024;
/** Patch follow-up: room left in the packet cap for the body's other members around the messages. */
const PATCH_PACKET_HEADROOM_BYTES = 4 * 1024;
/** L4-F8: bounded exponential backoff between HTTP attempts — 250 ms x 2^n, capped at 4 s. */
const PROVIDER_BACKOFF_BASE_MS = 250;
const PROVIDER_BACKOFF_CAP_MS = 4_000;
const MAX_PROVIDER_MODEL_CHARS = 256;
const MAX_USAGE_COUNTER = 2 ** 31 - 1;

/**
 * Model scorecard §2.10 — THE ONE LOCAL PROMPT-SIZE ESTIMATE: characters / 4,
 * rounded up, summed over every message's content. It is the common rule of
 * thumb for English on BPE vocabularies, simple and deterministic on purpose,
 * not a tokenizer. It UNDER-counts dense text (JSON, Romanian diacritics,
 * code), which is why it is NEVER the window wall (R1: the wall is
 * `estimateWindowTokens` below). It sizes estimates only — the replay tool's
 * `promptTokensEstimate` and the relays' informational overhead line — and it
 * never prices money (that is `@debateai/budget`'s byte projection).
 */
const PROMPT_CHARACTERS_PER_TOKEN = 4;

export function estimatePromptTokens(messages: PromptPacket["messages"]): number {
  let characters = 0;
  for (const message of messages) characters += message.content.length;
  return Math.ceil(characters / PROMPT_CHARACTERS_PER_TOKEN);
}

/**
 * Model scorecard §2.10, assembler reconciliation R1 — THE WINDOW WALL: UTF-8
 * bytes / 2, rounded up, summed over every message's content. It is the SAME
 * rule the relays apply before spawning (`acceptance/relay-core.ts`
 * `exceedsContextWindow`) and the project's conservative floor
 * (`@debateai/budget` projects a request at 2 bytes per token). It over-counts
 * English on purpose so Romanian diacritics and JSON never overflow a declared
 * window (pi/GLM declares 1M; a scorecard candidate may declare far less). It
 * is never reported as a size and never prices money.
 */
const WINDOW_BYTES_PER_TOKEN = 2;

export function estimateWindowTokens(messages: PromptPacket["messages"]): number {
  let bytes = 0;
  for (const message of messages) bytes += Buffer.byteLength(message.content, "utf8");
  return Math.ceil(bytes / WINDOW_BYTES_PER_TOKEN);
}

/** One bounded counter read leniently from a usage object's member, or null. */
function usageCounterIn(details: unknown, key: string): number | null {
  if (typeof details !== "object" || details === null || Array.isArray(details)) return null;
  const value = (details as Readonly<Record<string, unknown>>)[key];
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= MAX_USAGE_COUNTER ? value : null;
}

/**
 * Model scorecard §2.3 — the thinking tokens the vendor reported, read LENIENTLY off the RAW usage block: OpenAI's
 * spelling `completion_tokens_details.reasoning_tokens` (DeepInfra, and the relays, which adopt it) or a top-level
 * `reasoning_tokens` — the larger when both are there, exactly as the preview gate charges them (length guidance LG-B,
 * preview_budget_helper.py account_response) — else Anthropic's `output_tokens_details.thinking_tokens` (Haiku, spec
 * 2026-10-12 §4.6). Thinking is already inside `output_tokens` / `completion_tokens`, so reading it changes no charge.
 * `null` means not reported: never a guess and never a default zero, because a vendor that says nothing has not said "none".
 */
export function reportedReasoningTokens(rawUsage: unknown): number | null {
  if (typeof rawUsage !== "object" || rawUsage === null || Array.isArray(rawUsage)) return null;
  const usage = rawUsage as Readonly<Record<string, unknown>>;
  const reported = [usageCounterIn(usage.completion_tokens_details, "reasoning_tokens"), usageCounterIn(usage, "reasoning_tokens")]
    .filter((value): value is number => value !== null);
  return reported.length > 0 ? Math.max(...reported) : usageCounterIn(usage.output_tokens_details, "thinking_tokens");
}

/**
 * Length guidance L27 (INTERFACE §3.1): the input tokens the vendor served from its prompt cache, read off the RAW usage
 * block before the Anthropic reply folds them into `prompt_tokens` (anthropic-messages.ts anthropicUsageAsEngineUsage):
 * DeepInfra's `prompt_tokens_details.cached_tokens`, else a top-level `cached_tokens`, else Anthropic's
 * `cache_read_input_tokens`. Null when not reported. Information only. The gate reads a top-level `cached_tokens` only
 * when `prompt_tokens_details` is an object (preview_budget_helper.py account_response); this reader also takes it
 * alone, so for a vendor that sends only that member the practice table's cached column can differ from the gate's log.
 */
export function reportedCachedInputTokens(rawUsage: unknown): number | null {
  if (typeof rawUsage !== "object" || rawUsage === null || Array.isArray(rawUsage)) return null;
  const usage = rawUsage as Readonly<Record<string, unknown>>;
  return usageCounterIn(usage.prompt_tokens_details, "cached_tokens") ?? usageCounterIn(usage, "cached_tokens")
    ?? usageCounterIn(usage, "cache_read_input_tokens");
}

/**
 * Length guidance L27: the answer's own tokens, the output count minus the thinking; the output count itself when the
 * thinking is larger (the vendor counted it outside, as the gate's billed_output_tokens reads it). Null when either count
 * is unknown.
 */
export function answerTokensOf(completion: unknown, reasoning: number | null): number | null {
  if (typeof completion !== "number" || !Number.isSafeInteger(completion) || completion < 0 || reasoning === null) return null;
  return reasoning <= completion ? completion - reasoning : completion;
}

/** Length guidance L27: one reply's words by the request's own counter, else `replyWordCount`; null when unknown. Never throws. */
function replyWordsOf(request: ProviderCallRequest, content: string | null, reply: ModelReplyFacts): number | null {
  if (content === null) return null;
  let words: number | null;
  try {
    words = request.actualWordsOf !== undefined ? request.actualWordsOf(content) : replyWordCount(content, reply);
  } catch {
    return null;
  }
  return words !== null && Number.isSafeInteger(words) && words >= 0 && words <= MAX_USAGE_COUNTER ? words : null;
}

/**
 * `echoRequired` (task review fix round 1, finding 2 — fail closed): a CLI relay
 * (`x_thinking_level`) states on every 200 the level it ran at (the relay
 * contract, Task A8), so a level SENT to one must come back verbatim. An API
 * vendor (`reasoning_effort`) never echoes, and there the level sent is the
 * level used. Nothing was sent at DEFAULT_ONLY, so nothing is required back.
 */
type ResolvedThinkingLevel = Readonly<{
  wire: Readonly<Record<string, string>>;
  sent: string;
  echoRequired: boolean;
}>;

/** Model scorecard §2.2: the one body member a requested level becomes, or the refusal. */
function resolveThinkingLevel(
  requested: string | undefined,
  control: OpenAICompatibleGatewayOptions["thinking"],
  providerRef: string
): ResolvedThinkingLevel {
  if (requested === undefined || requested === THINKING_LEVEL_DEFAULT_ONLY) {
    return Object.freeze({ wire: Object.freeze({}), sent: THINKING_LEVEL_DEFAULT_ONLY, echoRequired: false });
  }
  if (!THINKING_LEVEL_TOKEN.test(requested) || control === undefined || !control.levels.includes(requested)) {
    throw new TypedDomainError(
      PROVIDER_THINKING_LEVEL_UNSUPPORTED,
      `${providerRef} cannot set the requested thinking level`
    );
  }
  return Object.freeze({
    wire: Object.freeze({ [control.parameter]: requested }),
    sent: requested,
    echoRequired: control.parameter === "x_thinking_level"
  });
}

/** Model scorecard §2.2: the level a relay says it ran at — a token or DEFAULT_ONLY, else nothing. */
function echoedThinkingLevel(decoded: unknown): string | null {
  if (typeof decoded !== "object" || decoded === null || Array.isArray(decoded)) return null;
  const value = (decoded as Readonly<Record<string, unknown>>).x_thinking_level;
  if (typeof value !== "string") return null;
  return value === THINKING_LEVEL_DEFAULT_ONLY || THINKING_LEVEL_TOKEN.test(value) ? value : null;
}

/** Model scorecard R4: the relay's typed error marker on a refused call, if any. */
function relayErrorCode(decoded: unknown): string | null {
  if (typeof decoded !== "object" || decoded === null || Array.isArray(decoded)) return null;
  const value = (decoded as Readonly<Record<string, unknown>>).x_cli_relay_error;
  return typeof value === "string" ? value : null;
}

/**
 * Model scorecard §2.3: ONE token — the pattern 0090's
 * ledger_entry_candidate_id_token CHECK holds, character for character (the
 * scorecard's own identifierText, packages/scorecard/src/schema.ts, after the
 * 0090 fix round 1: the first character is a letter or a digit).
 */
const CANDIDATE_ID_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@/+-]{0,127}$/u;

/**
 * Model scorecard §2.1/§2.3: the record fields are checked BEFORE anything is
 * sent. The ledger's CHECKs would otherwise refuse the row only after a paid
 * call, and an unrecorded paid call is the one thing this ledger must not have.
 */
function assertProviderCallRecord(request: ProviderCallRequest): void {
  const role = request.modelRole;
  const candidate = request.candidateId;
  const version = request.scorecardVersion;
  const guided = request.guidedWords;
  const ceiling = request.replyWordsCeiling;
  if ((role !== undefined && !isDebateRole(role))
    || (candidate !== undefined && candidate !== null && !CANDIDATE_ID_TOKEN.test(candidate))
    || (version !== undefined && version !== null
      && (!Number.isSafeInteger(version) || version < 1 || version > MAX_USAGE_COUNTER))
    || (guided !== undefined
      && (!Number.isSafeInteger(guided) || guided < 1 || guided > MAX_USAGE_COUNTER))
    || (ceiling !== undefined
      && (!Number.isSafeInteger(ceiling) || ceiling < 1 || ceiling > MAX_USAGE_COUNTER))) {
    throw new TypeError("PROVIDER_CALL_RECORD_INVALID");
  }
}

/** Delay before `attempt` (only attempts after the first back off). */
function providerBackoffMs(attempt: number): number {
  return Math.min(PROVIDER_BACKOFF_BASE_MS * 2 ** (attempt - 2), PROVIDER_BACKOFF_CAP_MS);
}

function realSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, milliseconds); });
}

const usageCounter = z.number().int().min(0).max(MAX_USAGE_COUNTER);
/**
 * L4-F3 / C-I1 — THE FOUR MEMBERS ARE BOUNDED; THE REST ARE DROPPED, NOT REFUSED.
 *
 * Each counter is still exactly what it was: a non-negative safe integer no
 * larger than 2^31-1, refused by name when it is anything else. What changed is
 * the treatment of a member this engine does not know. `.strict()` refused the
 * whole block for one of them — and OpenAI's `chat/completions` has carried
 * `prompt_tokens_details` and `completion_tokens_details` on every 200 for two
 * years. That refusal did not stop at the acceptance decision: `reportedUsage`
 * is read through this same schema, so a real vendor's answer CHARGED NOTHING,
 * moved neither ceiling, and was retried until the attempt bound was spent —
 * every attempt billed by the vendor and invisible to the ledger (C-I1).
 *
 * Zod STRIPS by default, so the parsed value still carries only the four
 * bounded members: nothing unbounded reaches `raw_artifact.metadata.usage`, and
 * the L4-F3 property the strictness was there for — no unbounded vendor text is
 * persisted from the usage block — is kept by construction rather than by
 * refusing the answer. A malformed COUNTER is still `PROVIDER_USAGE_INVALID`.
 */
const usageSchema = z.object({
  prompt_tokens: usageCounter.optional(),
  completion_tokens: usageCounter.optional(),
  total_tokens: usageCounter.optional(),
  x_cost_usd: z.number().nonnegative().optional()
});

const modelIdSchema = z.string().min(1).max(MAX_PROVIDER_MODEL_CHARS);

const responseSchema = z.object({
  id: z.string().min(1),
  model: modelIdSchema,
  usage: usageSchema.nullable().optional(),
  choices: z.array(z.object({
    message: z.object({ content: z.string() }),
    // W10/1: carried, never required — a provider that omits it is still a
    // lawful response, and its absence is recorded as absent rather than as
    // "not truncated".
    finish_reason: z.string().nullable().optional()
  })).min(1)
});

/**
 * W10/1: the finish reason read LENIENTLY, off the decoded body, so a response
 * the strict schema rejects still records why it was cut off. The strict parse
 * happens later and throws; this read must survive it.
 */
const observedFinishReasonSchema = z.object({
  choices: z.array(z.object({ finish_reason: z.string().nullable().optional() }).passthrough()).min(1)
}).passthrough();

/**
 * V-6 fix round 1 / 5c. What the artifact RECORDS as `finish_reason`. An
 * encrypted run's `raw_artifact.metadata_json` accepts only engine tokens
 * (migration 0069), and the vendor writes this string. A value that is already
 * a short token is kept verbatim; any other value becomes
 * `UNRECOGNIZED:sha256:<first 16 hex>` of itself — typed, deterministic, and
 * never the vendor's free text — so one odd vendor string cannot block
 * persisting an artifact whose charge is recorded right after it. The gateway's
 * own decisions (the `length` truncation) still read the observed value.
 */
export function recordableFinishReason(observed: string | null): string | null {
  if (observed === null) return null;
  if (/^[A-Za-z0-9_.:-]{1,64}$/.test(observed)) return observed;
  return `UNRECOGNIZED:sha256:${createHash("sha256").update(observed, "utf8").digest("hex").slice(0, 16)}`;
}

function observedFinishReason(decoded: unknown): string | null {
  const parsed = observedFinishReasonSchema.safeParse(decoded);
  return parsed.success ? parsed.data.choices[0]!.finish_reason ?? null : null;
}

/** Reclaim resume: one recorded reply as the gateway read it — its message content (null: none) and how it ended. */
export type RecordedProviderReply = Readonly<{ content: string | null; reply: ModelReplyFacts }>;

/**
 * Reclaim resume (docs/superpowers/specs/2026-10-14-reclaim-resume-design.md): a RECORDED vendor reply — an attempt's
 * `raw_artifact.raw_text`, the vendor's own bytes, and its `raw_artifact.provider` — read back exactly as this gateway
 * read it when it arrived: an Anthropic reply normalised, the strict body's message content, and its finish reason.
 */
export function readRecordedProviderReply(rawText: string, provider: string): RecordedProviderReply {
  let decoded: unknown;
  try {
    decoded = JSON.parse(rawText);
  } catch {
    decoded = null;
  }
  if (provider === ANTHROPIC_MESSAGES_HTTP_ADAPTER_KIND) {
    const native = readAnthropicMessagesReply(decoded);
    if (native.failure) return Object.freeze({ content: null, reply: Object.freeze({ finishReason: null }) });
    decoded = native.normalized;
  }
  const strict = responseSchema.safeParse(decoded);
  return Object.freeze({
    content: strict.success ? strict.data.choices[0]!.message.content : null,
    reply: Object.freeze({ finishReason: observedFinishReason(decoded) })
  });
}

/**
 * Reclaim resume: the content a RECORDED call handed back, rebuilt from its recorded replies, as the gateway decided
 * it. `accepted` is the reply of the call's OK attempt; `answered` is the reply of the attempt right before it when
 * the OK attempt was a repair and that one answered the call's original packet (null otherwise). When `answered` could
 * be patched (`planPatchFollowUp`) and the OK reply merges into it as an accepted answer, the OK attempt was the patch
 * and the merge is the content (`mergePatchReply`); otherwise the OK reply itself, when the step's classifier accepts
 * it. Null when neither holds: the call cannot be replayed and is made again. The classifier runs on the returned
 * content last, as the gateway runs it, so a step that remembers its reading (`rememberingAcceptedReply`) has it.
 *
 * Refused-repair salvage (2026-10-16; pre-flight PF-S2): with the structure readers (`structureReplayReaders`, passed only on
 * a run whose structure-repair route is wired), a call the first copy's gateway rescued or followed up is rebuilt as that
 * gateway decided it. An `answered` reply of class STRUCTURE (measured as the gateway measures it) never got today's
 * patch live: its second POST was B, built from A's base, so the plan is B's (`structureFollowUpPlan`) only. An OK reply
 * with no `answered` that the step refuses was A1's rescue (`structureSalvage`). Without the readers: today's rebuild.
 */
export function rebuildRecordedCallContent(input: Readonly<{
  accepted: RecordedProviderReply;
  answered: RecordedProviderReply | null;
  classifyContent?: (content: string, reply?: ModelReplyFacts) => ContentClassification;
  structureSalvage?: (content: string, reply: ModelReplyFacts) => StructureSalvaged | null;
  structureFollowUpPlan?: (content: string, reply: ModelReplyFacts) => PatchFollowUpPlan | null;
}>): string | null {
  const { accepted, answered, classifyContent, structureSalvage, structureFollowUpPlan } = input;
  if (accepted.content === null) return null;
  if (classifyContent === undefined) return accepted.content;
  if (answered !== null && answered.content !== null && answered.reply.finishReason !== PROVIDER_FINISH_REASON_LENGTH) {
    const first = classifyContent(answered.content, answered.reply);
    // As the gateway reads it live: a class that cannot be read is no class (never STRUCTURE), so today's patch rebuild.
    let structureClass = false;
    try {
      structureClass = structureFollowUpPlan !== undefined
        && (first.parseStatus === "PARSE_FAILED" || first.parseStatus === "SCHEMA_FAILED")
        && (first.failureClass ?? replyFailureClassOf({ rawText: answered.content, parseStatus: first.parseStatus,
          parseError: first.parseError }, answered.reply)) === "STRUCTURE";
    } catch {
      structureClass = false;
    }
    const plan = structureClass && structureFollowUpPlan !== undefined
      ? structureFollowUpPlan(answered.content, answered.reply)
      : first.parseStatus === "SCHEMA_FAILED"
        ? planPatchFollowUp({ content: answered.content, reply: answered.reply, parseStatus: first.parseStatus, parseError: first.parseError })
        : null;
    const merged = plan === null ? null : mergePatchReply(plan, accepted.content, accepted.reply);
    if (merged !== null && merged.ok && classifyContent(merged.content, accepted.reply).parseStatus === "PARSED") return merged.content;
  }
  if (classifyContent(accepted.content, accepted.reply).parseStatus === "PARSED") return accepted.content;
  // A1's rescue: its salvage runs the step's classifier last, on the content it returns.
  return answered === null && structureSalvage !== undefined ? structureSalvage(accepted.content, accepted.reply)?.content ?? null : null;
}

/**
 * W10/2 (D58 — the outcome is the ticket's, the mechanism is this seat's): the
 * bound a retry asks for after `n` length failures on the same call.
 *
 * At the base a truncation routed to the schema-repair path, which APPENDS a
 * correction and reuses the same bound: attempt 2 had a longer input, the
 * identical `max_tokens`, and the same schema to satisfy — output at least as
 * long as the one just cut. Attempts 2 and 3 were byte-identical requests, so
 * all three calls burned producing one failure, reported as a contract error.
 *
 * The escalation is LINEAR in the number of length failures, so every attempt
 * of a truncating call is distinct and the worst case is bounded by
 * `maxAttempts` (3 attempts → at most 3x the sealed ceiling). The SEALED
 * `tokenCeiling` itself is untouched: this is a per-attempt ask made only after
 * a measured truncation, never a new default.
 */
export function lengthRetryTokenCeiling(sealedTokenCeiling: number, lengthFailures: number): number {
  if (!Number.isInteger(lengthFailures) || lengthFailures < 0) {
    throw new TypeError("PROVIDER_LENGTH_RETRY_FAILURE_COUNT_INVALID");
  }
  return sealedTokenCeiling * (lengthFailures + 1);
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function contentParseStatus(content: string): "PARSED" | "UNPARSED" {
  try {
    JSON.parse(content);
    return "PARSED";
  } catch {
    return "UNPARSED";
  }
}

/** Reads the body through its stream and cancels it the moment the cap is crossed (L4-F3). */
async function readBoundedResponseText(response: Response): Promise<string> {
  if (response.body === null) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_PROVIDER_RESPONSE_BYTES) {
        const refusal = new TypedDomainError(
          "PROVIDER_RESPONSE_TOO_LARGE",
          `Provider response body exceeded ${MAX_PROVIDER_RESPONSE_BYTES} bytes`
        );
        await reader.cancel(refusal);
        throw refusal;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new TextDecoder("utf-8").decode(Buffer.concat(chunks));
}

/** Typed refusals for an over-long model id or a usage COUNTER outside its bound (L4-F3, C-I1). */
function assertBoundedProviderResponse(decoded: unknown): void {
  if (typeof decoded !== "object" || decoded === null || Array.isArray(decoded)) return;
  const row = decoded as Readonly<Record<string, unknown>>;
  if (typeof row.model === "string" && !modelIdSchema.safeParse(row.model).success) {
    throw new TypedDomainError(
      "PROVIDER_MODEL_INVALID",
      `Provider model id must be 1..${MAX_PROVIDER_MODEL_CHARS} characters`
    );
  }
  if (row.usage !== undefined && row.usage !== null && !usageSchema.safeParse(row.usage).success) {
    throw new TypedDomainError(
      "PROVIDER_USAGE_INVALID",
      "Provider usage counters must be non-negative integers within the bounded range"
    );
  }
}

function assertJsonObjectResponseCapability(options:OpenAICompatibleGatewayOptions):void {
 if ((options.supportsJsonObjectResponse !== undefined && typeof options.supportsJsonObjectResponse !== "boolean")
  || (options.supportsJsonObjectResponse === true && !isJsonObjectResponseTarget(options.endpoint,options.model)))
  throw new TypedDomainError("PROVIDER_RESPONSE_FORMAT_CAPABILITY_INVALID","Invalid JSON object response capability");
}

/**
 * PR B: the Anthropic wire's construction rules, checked once. A level outside
 * the wire's list, a JSON-object capability, or a credential that is not a bare
 * key would each fail at the vendor on every call, so each is refused here.
 */
function assertGatewayWire(options: OpenAICompatibleGatewayOptions): boolean {
  if (options.adapterKind !== undefined && options.adapterKind !== ANTHROPIC_MESSAGES_HTTP_ADAPTER_KIND) {
    throw new TypeError("PROVIDER_ADAPTER_KIND_UNKNOWN");
  }
  if (options.cacheFirstUserTurn !== undefined && (typeof options.cacheFirstUserTurn !== "boolean"
    || (options.cacheFirstUserTurn && options.adapterKind !== ANTHROPIC_MESSAGES_HTTP_ADAPTER_KIND))) {
    throw new TypeError("PROVIDER_GATEWAY_CACHE_INVALID");
  }
  const native = options.adapterKind === ANTHROPIC_MESSAGES_HTTP_ADAPTER_KIND;
  if (!isAnthropicHostPairing(native, options.endpoint)) {
    throw new TypeError("PROVIDER_ADAPTER_HOST_MISMATCH");
  }
  if (!native) return false;
  if (!isAnthropicThinkingControl(options.thinking)) {
    throw new TypeError("PROVIDER_GATEWAY_THINKING_INVALID");
  }
  if (options.supportsJsonObjectResponse === true) {
    throw new TypedDomainError("PROVIDER_RESPONSE_FORMAT_CAPABILITY_INVALID", "Invalid JSON object response capability");
  }
  assertAnthropicCredentialShape(options.authorizationHeader);
  return true;
}

export class OpenAICompatibleProviderGateway implements ProviderGateway {
  readonly #options: OpenAICompatibleGatewayOptions;
  /** PR B: true when this gateway speaks the Anthropic Messages wire. */
  readonly #anthropic: boolean;

  constructor(options: OpenAICompatibleGatewayOptions) {
    /**
     * Task review fix round 1, finding 4 — fail closed. A window that is not a
     * positive whole number (NaN, 0, negative, fractional, Infinity, past the
     * counter bound) makes the wall refuse everything or nothing by accident,
     * with no word said. The target parser refuses it; a programmatic caller
     * is refused here under the same rule.
     */
    if (options.contextWindowTokens !== undefined && !isContextWindowTokens(options.contextWindowTokens)) {
      throw new TypeError("PROVIDER_GATEWAY_CONTEXT_WINDOW_INVALID");
    }
    if (options.maxOutputTokens !== undefined
      && (!Number.isSafeInteger(options.maxOutputTokens) || options.maxOutputTokens < 1)) {
      throw new TypeError("PROVIDER_GATEWAY_MAX_OUTPUT_TOKENS_INVALID");
    }
    assertJsonObjectResponseCapability(options);
    this.#anthropic = assertGatewayWire(options);
    this.#options = options;
  }

  /**
   * Patch follow-up: the short follow-up packet for a refused reply, or null when it cannot go out — the door or the
   * builder refuses it (an answer that contains the boundary marker), the wire cannot say it, or it would not fit the
   * packet cap or the declared window. Null means the step's full re-ask instead; nothing is sent or recorded here.
   */
  #patchPacket(
    packet: PromptPacket, ownReply: string, plan: PatchFollowUpPlan, tokenCeiling: number, thinkingLevel: string,
    fits: (packet: PromptPacket, tokenCeiling: number) => boolean, packetCap: number, markMaterial: boolean
  ): PromptPacket | null {
    let patch: PromptPacket;
    try {
      patch = buildFramedPatchPrompt(packet, ownReply, plan.locator);
      if (this.#anthropic) {
        anthropicMessagesRequestBody({ model: this.#options.model, maxTokens: tokenCeiling, thinkingLevel, messages: patch.messages, cacheFirstUserTurn: markMaterial });
      }
    } catch (error) {
      if (error instanceof TypedDomainError) return null;
      throw error;
    }
    return Buffer.byteLength(JSON.stringify(patch.messages), "utf8") + PATCH_PACKET_HEADROOM_BYTES <= packetCap
      && fits(patch, tokenCeiling)
      ? patch
      : null;
  }

  async call(request: ProviderCallRequest): Promise<ProviderCallResult> {
    this.#options.assertNoOpenWriteTransaction();
    assertJsonObjectResponseCapability(this.#options);
    if(request.preferredResponseFormat!==undefined&&request.preferredResponseFormat!=="json_object") throw new TypedDomainError("PROVIDER_RESPONSE_FORMAT_INVALID","Unsupported preferred response format");
    // JSON mode only where the row allows it (supportsJsonObjectResponse), for a story request that asks for it (the story
    // writer and checker). The debate steps never ask: on 2026-10-12 GLM in JSON mode answered a judging call with "{}"
    // and MiMo's quote slip became garbage, so that extension was withdrawn the same day. One value for the whole call,
    // so the patch follow-up and the full re-ask carry the first POST's response_format.
    const responseFormat=request.lane==="story"&&request.preferredResponseFormat==="json_object"&&this.#options.supportsJsonObjectResponse===true?{type:"json_object"} as const:undefined;
    if (!Number.isInteger(request.bound.maxAttempts) || request.bound.maxAttempts < 1) {
      throw new TypeError("CallBound.maxAttempts must be a positive integer");
    }
    if (request.maxAttemptsThisCall !== undefined
      && (!Number.isInteger(request.maxAttemptsThisCall) || request.maxAttemptsThisCall < 1)) {
      throw new TypeError("ProviderCallRequest.maxAttemptsThisCall must be a positive integer");
    }
    if (request.packetByteCap !== undefined && (!Number.isSafeInteger(request.packetByteCap) || request.packetByteCap < 1
      || request.packetByteCap > MAX_PROVIDER_REQUEST_PACKET_BYTES_CEILING)) {
      throw new TypeError("ProviderCallRequest.packetByteCap must be a whole number of bytes, at most 1 MiB");
    }
    if (request.outputTokenCap !== undefined && (!Number.isSafeInteger(request.outputTokenCap) || request.outputTokenCap < 1)) {
      throw new TypeError("ProviderCallRequest.outputTokenCap must be a positive whole number");
    }
    // Refused-repair salvage (B): the follow-up continues a routed structured call, never any other.
    const followUp = request.structureFollowUp;
    if (followUp !== undefined && (request.structureRepairRouted !== true || request.classifyContent === undefined)) {
      throw new TypeError("ProviderCallRequest.structureFollowUp needs a routed structured call");
    }
    // L26/L29: the call's own caps when the preview names them (the final writers), else today's.
    const packetCap = request.packetByteCap ?? MAX_PROVIDER_REQUEST_PACKET_BYTES;
    const outputCap = request.outputTokenCap ?? this.#options.maxOutputTokens ?? Number.MAX_SAFE_INTEGER;
    /**
     * Preview retry fix, option B (spec 2026-10-11 §1.1): the POSTs of THIS call, decided once and used
     * by both the loop and the repair test below. Without `maxAttemptsThisCall` it is the bound, as
     * today; the field is also honoured when this gateway is called directly, without the counting
     * gateway in front.
     */
    /**
     * Patch follow-up (owner design, 2026-10-12): a call whose SECOND POST was the short patch follow-up may send one
     * more, for the full re-ask, still within `bound.maxAttempts` (on the preview the counting gateway's `remaining`,
     * read off the ledger, so the counting gateway never meets a spent step for it). Hosted and local never set
     * `maxAttemptsThisCall`, so for them this is the bound, as before.
     */
    let patchWasSecondPost = false;
    // LG-A (L32, L33): a routed call follows the routed rule (`structureRepairRouted`); every other call, today's loop.
    const routed = request.structureRepairRouted === true;
    const callAttempts = (): number => {
      // Refused-repair salvage (B): the continuation is the routed call's second POST and its last.
      if (followUp !== undefined) return 2;
      const sealed = Math.min(request.bound.maxAttempts, request.maxAttemptsThisCall ?? request.bound.maxAttempts);
      // LG-A (L33): a routed call sends at most 2 POSTs in all; the patch's extra POST is never added for it.
      return routed ? Math.min(2, sealed) : Math.min(request.bound.maxAttempts,
        (request.maxAttemptsThisCall ?? request.bound.maxAttempts) + (patchWasSecondPost ? 1 : 0));
    };
    /**
     * V-11 addendum, layer 1 — THE DOOR. Every hand-off in the engine passes
     * through this method, so holding the frame HERE is what makes "no call
     * site can assemble a prompt without the frame" a property of the system
     * rather than of a list of remembered call sites. It runs before the first
     * byte leaves the process and it is re-run on every repair packet below.
     */
    const frame = assertFramedPrompt(request.packet);
    /**
     * Model scorecard §2.2 (rulings R1, R7) — decided ONCE, before the first
     * byte leaves. The level is the candidate's, the capability is the
     * connection's, and a level this connection did not declare is refused
     * here rather than run silently at some other level. Thrown before the
     * loop, like the frame refusal: nothing was sent, so nothing is ledgered.
     */
    const thinking = resolveThinkingLevel(request.thinkingLevel, this.#options.thinking, request.providerRef);
    // Spec 2026-10-12 §4.4: the repair POSTs' level, decided and refused here too, before the first byte leaves.
    const repairThinking = request.repairThinkingLevel === undefined
      ? thinking : resolveThinkingLevel(request.repairThinkingLevel, this.#options.thinking, request.providerRef);
    /**
     * Length guidance L30 (LG-B; controller ruling PF-B3.9, 2026-10-16): the first user turn's material carries the cache
     * mark only where a cache read can happen: this call may send a second POST, and its repair POSTs run at the call's
     * own effort (Anthropic drops the messages cache whenever the effort changes). A one-POST call (the preview's
     * unrepaired steps; LG-A's structure-repair call, one POST by construction) and a call whose repairs run at the
     * owner's `slip_fix` level when it differs send today's unmarked body, so they never pay the write premium for a read
     * that cannot come. Decided once, before the first byte leaves, so every POST of the call has the same body form.
     */
    // Refused-repair salvage (B): the continuation repeats its first POST's decision, so its body carries the same marks.
    const markMaterial = followUp !== undefined ? this.#options.cacheFirstUserTurn === true && followUp.first.materialMarked
      : this.#options.cacheFirstUserTurn === true && callAttempts() >= 2 && repairThinking.sent === thinking.sent;
    // Length guidance L25: the answer room is a whole number, and the lower level is refused here, before the first byte.
    const lengthRetry = request.lengthRetry;
    if (lengthRetry !== undefined && (!Number.isSafeInteger(lengthRetry.answerRoomTokens) || lengthRetry.answerRoomTokens < 0)) {
      throw new TypeError("ProviderCallRequest.lengthRetry.answerRoomTokens must be a non-negative whole number");
    }
    const lowerThinking = lengthRetry === undefined || lengthRetry.lowerThinkingLevel === null
      ? null : resolveThinkingLevel(lengthRetry.lowerThinkingLevel, this.#options.thinking, request.providerRef);
    /** L25: set once a cut-off attempt's thinking left the answer no room; this call's length retries then think less. */
    let thinkLess = false;
    /** R1d (PF-D6.5): whether the latest cut-off attempt ran at the lowest level this call can think at. */
    let lastCutOffAtLowestLevel = false;
    const lowestThinking = lowerThinking ?? thinking;
    assertProviderCallRecord(request);
    const callFacts = Object.freeze({
      modelRole: request.modelRole ?? null,
      candidateId: request.candidateId ?? null,
      scorecardVersion: request.scorecardVersion ?? null
    });
    const fetcher = this.#options.fetchImplementation ?? fetch;
    const sleep = this.#options.sleepImplementation ?? realSleep;
    let attemptsMade = 0;
    let packetRefused = false;
    let lastError: unknown;
    let lastOutcome: "TIMED_OUT" | "FAILED" = "FAILED";
    let lastLedgerEntryRef = "PROVIDER_LEDGER_ENTRY_UNRESOLVED";
    let attemptPacket = request.packet;
    /**
     * PR B review: a packet the Anthropic wire cannot say (no user turn first, a final assistant
     * turn, an empty message) is refused HERE, before the loop: nothing is sent, so nothing is
     * ledgered, exactly as the frame refusal above. A later attempt's packet (a repair) that the
     * wire cannot say ends the loop below as exhaustion does, never as an escape mid-attempt.
     */
    if (this.#anthropic) {
      anthropicMessagesRequestBody({ model: this.#options.model, maxTokens: 1, thinkingLevel: thinking.sent, messages: attemptPacket.messages, cacheFirstUserTurn: markMaterial });
    }
    /** W10/2: how many attempts of THIS call were cut off at the bound. */
    let lengthFailures = 0;
    /**
     * Role rotation (spec 2026-10-11 Part 3): how many repair packets this call adopted since the original
     * packet was last sent (a length retry re-sends it and resets this to 0), so above 0 exactly when the
     * accepted reply answered a repair packet.
     */
    let repairAttempts = 0;
    type ContentRefusalRecord = {
      attempts: number;
      parseStatus: ProviderContentRejectionStatus;
      parseError: string;
      rawArtifactRef: string;
      ledgerEntryRef: string;
    };
    let lastContentRejection: ContentRefusalRecord | null = null;

    /**
     * Model scorecard §2.10: whether one attempt fits the declared window. The
     * prompt side is the ONE local estimate (`estimateWindowTokens`: UTF-8
     * bytes / 2, the relays' same rule, R1); the answer side is that attempt's
     * own token bound, because the window must hold both.
     */
    const contextWindowTokens = this.#options.contextWindowTokens;
    const fitsContextWindow = (packet: PromptPacket, tokenCeiling: number): boolean =>
      contextWindowTokens === undefined
        || estimateWindowTokens(packet.messages) + tokenCeiling <= contextWindowTokens;

    /**
     * Patch follow-up: the plan while `attemptPacket` is the patch packet (its reply is merged into the first reply
     * before the step's classifier sees it); whether this call already sent one (one per call); and the first reply's
     * refusal, which the full re-ask after a patch that did not do describes.
     */
    let patchPlan: PatchFollowUpPlan | null = null;
    let patchTried = false;
    let patchedRejection: RejectedProviderContent | null = null;
    /** The first reply's refusal as recorded (its artifact and ledger row): the call's, while a patch was not merged. */
    let patchedRefusal: ContentRefusalRecord | null = null;
    let repairForm: "PATCH" | "FULL" | undefined;

    /**
     * Refused-repair salvage (2026-10-16, B): the continuation starts where the routed call's first POST left it — that
     * reply refused and recorded, one follow-up chosen — so the loop below sends exactly one POST, attempt 2, and merges or
     * re-reads its reply exactly as it would a follow-up the call had chosen itself. A follow-up that cannot go out (the
     * builder or the door refuses it, the wire cannot say it, or it would not fit its packet cap or the window: the cap
     * is this call's own, which may be smaller than the first POST's) sends nothing and writes nothing: the call ends
     * with the first reply's refusal.
     */
    if (followUp !== undefined) {
      const { first } = followUp;
      const firstRefusal: ContentRefusalRecord = { attempts: 1, parseStatus: first.rejected.parseStatus,
        parseError: first.rejected.parseError, rawArtifactRef: first.rawArtifactRef, ledgerEntryRef: first.ledgerEntryRef };
      const followUpTokenCeiling = Math.min(request.bound.tokenCeiling, outputCap);
      let followUpPacket: PromptPacket | null;
      if (followUp.form === "PATCH") {
        followUpPacket = this.#patchPacket(request.packet, first.rejected.rawText, followUp.plan, followUpTokenCeiling,
          repairThinking.sent, fitsContextWindow, packetCap, markMaterial);
      } else {
        // As `#patchPacket`: a packet the step's builder or the door refuses is one that cannot go out. A chosen swallow
        // (spec §6 step 3, "only if B cannot be sent, today's refusal"): the refusal is the first reply's, never the builder's.
        let full: PromptPacket | undefined;
        try {
          full = request.buildRepairPacket?.({ ...first.rejected, failureClass: "STRUCTURE" });
          if (full !== undefined) assertFramedPrompt(full);
        } catch (error) {
          if (!(error instanceof TypedDomainError)) throw error;
          full = undefined;
        }
        followUpPacket = full !== undefined
          && Buffer.byteLength(JSON.stringify(full.messages), "utf8") + PATCH_PACKET_HEADROOM_BYTES <= packetCap
          && fitsContextWindow(full, followUpTokenCeiling) ? full : null;
      }
      if (followUpPacket === null) {
        throw new ProviderContentUnacceptedError(firstRefusal.attempts, firstRefusal.parseStatus, firstRefusal.parseError,
          firstRefusal.rawArtifactRef, firstRefusal.ledgerEntryRef);
      }
      attemptPacket = followUpPacket;
      patchPlan = followUp.form === "PATCH" ? followUp.plan : null;
      patchTried = true;
      patchedRejection = first.rejected;
      patchedRefusal = firstRefusal;
      lastContentRejection = firstRefusal;
      repairForm = followUp.form;
      repairAttempts = 1;
    }

    for (let attempt = followUp === undefined ? 1 : 2; attempt <= callAttempts(); attempt += 1) {
      const attemptTokenCeiling = Math.min(
        lengthRetryTokenCeiling(request.bound.tokenCeiling, lengthFailures),
        outputCap
      );
      /**
       * Task review fix round 1, finding 3. PROVIDER_CONTEXT_WINDOW_EXCEEDED
       * means "this prompt is over this candidate's window", and the picker
       * reads it so (`packages/scorecard/src/picker.ts`). That is only true of
       * attempt 1. A LATER attempt can outgrow a window the original prompt
       * fit — a length retry raises the bound, a repair packet is longer — and
       * then nothing more is sent: the loop ends exactly as exhaustion would,
       * before the backoff and the attempt guard, with no ledger row for an
       * attempt that never happened, and the caller sees the earlier content
       * rejection (or the usual PROVIDER_CALL_FAILED), never the window code.
       */
      if (attempt > 1 && !fitsContextWindow(attemptPacket, attemptTokenCeiling)) break;
      // Spec 2026-10-12 §4.4: the original packet (and its length retries) runs at the call's level; an adopted repair
      // packet (the patch follow-up or the full re-ask, `repairForm` set, reset by a length retry) at the repair level.
      // Length guidance L25: the original packet's length retries run one level lower once thinking ate the answer's room.
      const attemptThinking = repairForm === undefined ? (thinkLess && lowerThinking !== null ? lowerThinking : thinking) : repairThinking;
      // LG-A (L34): what this attempt sends, recorded on its artifact (reply_form); a structure-repair call is STRUCTURE.
      const attemptReplyForm: ReplyForm = lengthCallStepOf(request.callSiteKey) === "structure_repair" ? "STRUCTURE"
        : repairForm ?? (lengthFailures > 0 ? "LENGTH_RETRY" : "ORIGINAL");
      // L4-F8: back off first, then re-check the ceiling, so the decision to spend an attempt is
      // taken on the freshest state rather than on state read up to a backoff ago.
      if (attempt > 1) await sleep(providerBackoffMs(attempt));
      await request.assertAttemptAllowed?.();
      // The packet cap (L4-F2) is taken on the body actually sent, which carries the
      // per-attempt bound a length retry raised (W10/2).
      // Model scorecard §2.2: with no level asked this is today's three-member
      // body byte for byte; with one, the target's own member carries it.
      // Reviewed sampling (2026-10-12): a reviewed row with its own sampling (Qwen on
      // DeepInfra) carries exactly those members after the level; every other target's
      // body is unchanged (previewSamplingMembers is empty for it).
      // PR B: the Anthropic wire builds its own contract body; a packet it
      // cannot say is refused here, before anything is sent or recorded.
      let anthropicBody: string | undefined;
      if (this.#anthropic) {
        try {
          anthropicBody = anthropicMessagesRequestBody({
            model: this.#options.model,
            maxTokens: attemptTokenCeiling,
            thinkingLevel: attemptThinking.sent,
            messages: attemptPacket.messages,
            cacheFirstUserTurn: markMaterial
          });
        } catch (error) {
          // Only a later attempt can get here (the first packet was checked before the loop).
          if (attempt > 1 && error instanceof TypedDomainError && error.code === PROVIDER_PACKET_UNSUPPORTED) break;
          throw error;
        }
      }
      const body = anthropicBody !== undefined
        ? anthropicBody
        : JSON.stringify({
        model: this.#options.model,
        max_tokens: attemptTokenCeiling,
        ...attemptThinking.wire,
        ...previewSamplingMembers(this.#options.endpoint, this.#options.model),
        messages: attemptPacket.messages,
        ...(responseFormat===undefined?{}:{response_format:responseFormat})
      });
      /**
       * V-28 (DL4-F2) — THE MONEY DECISION, TAKEN BEFORE THE CALL.
       *
       * Vendor usage is only known AFTER the response, so "refuse the call that
       * would cross" is decided on the sum so far plus this call's configured
       * MAXIMUM: the bytes right there in `body`, and the bound this attempt
       * will ask for. Outside the try on purpose — a refusal here is not an
       * attempt that failed, it is an attempt that never happened, so it writes
       * no ledger row and burns nothing of the attempt ceiling, exactly as
       * `assertAttemptAllowed` above does.
       */
      const costAdmission = await request.costEnvelope?.assertCallAllowed({
        requestBytes: Buffer.byteLength(body, "utf8"),
        completionTokenCeiling: attemptTokenCeiling,
        // T12-R0: only a map call names a room; every other call's projection is today's two members.
        ...(request.keepRoomMicros === undefined ? {} : { keepRoomMicros: request.keepRoomMicros })
      });
      attemptsMade = attempt;
      const inputHash = digest(JSON.stringify(responseFormat===undefined?attemptPacket:{...attemptPacket,response_format:responseFormat}));
      const attemptId = randomUUID();
      const startedAt = new Date();
      let rawArtifactRef: string | null = null;
      let ledgerRecorded = false;
      // Model scorecard §2.2: the level this attempt ran at, as far as it got. A
      // failure before any body arrived records the level that was sent.
      let attemptThinkingLevel: string = attemptThinking.sent;
      // Pre-flight fix F13: set when the prompt could not be recorded, so the
      // catch below lets that failure leave unsent, unledgered and unretried.
      let promptRecordFailed = false;
      // NV-50: how far this attempt got, for the catch's unanswered charge: sent (the line before the fetch), a
      // reply returned, the charge reached and the charge written; and the body's usage block once it was read.
      let sent = false;
      let fetchReturned = false;
      let chargeReached = false;
      let chargeWritten = false;
      let bodyUsage: unknown = undefined;
      try {
        const headers: Record<string, string> = this.#anthropic
          ? anthropicMessagesRequestHeaders(this.#options.authorizationHeader)
          : { "content-type": "application/json" };
        if (!this.#anthropic && this.#options.authorizationHeader !== undefined) {
          headers.authorization = this.#options.authorizationHeader;
        }
        if (Buffer.byteLength(body, "utf8") > packetCap) {
          packetRefused = true;
          throw new TypedDomainError(
            "PROVIDER_PACKET_TOO_LARGE",
            `Provider request packet exceeded ${packetCap} bytes`
          );
        }
        /**
         * Model scorecard §2.10: a declared context window is a wall, checked
         * before the call is sent (`fitsContextWindow` above). The same prompt
         * does not fit one backoff later, so the refusal short-circuits below,
         * after its FAILED ledger row. Only attempt 1 can reach this throw: a
         * later attempt that would not fit ended the loop at its head (fix
         * round 1, finding 3).
         */
        if (!fitsContextWindow(attemptPacket, attemptTokenCeiling)) {
          throw new TypedDomainError(
            PROVIDER_CONTEXT_WINDOW_EXCEEDED,
            `${request.providerRef} declares a ${contextWindowTokens}-token context window and this attempt would not fit`
          );
        }
        // Model scorecard §2.3: the exact prompt of THIS attempt, recorded
        // before it leaves and under this attempt's id, so every attempt the
        // ledger shows as sent — a transport failure included — has its prompt
        // on record. A call with no run records none (the support chat).
        if (request.runId !== null && this.#options.persistCallPrompt !== undefined) {
          try {
            await this.#options.persistCallPrompt({
              runId: request.runId,
              attemptId,
              promptText: JSON.stringify(attemptPacket.messages),
              messages: attemptPacket.messages
            });
          } catch (promptError) {
            promptRecordFailed = true;
            throw promptError;
          }
        }
        sent = true;
        const response = await fetcher(`${this.#options.endpoint}${this.#anthropic ? ANTHROPIC_MESSAGES_PATH : "/chat/completions"}`, {
          method: "POST",
          headers,
          signal: AbortSignal.timeout(request.bound.deadlineMs),
          body
        });
        fetchReturned = true;
        const rawText = await readBoundedResponseText(response);
        let decoded: unknown;
        try {
          decoded = JSON.parse(rawText);
        } catch {
          decoded = null;
        }
        // PR B: the Anthropic reply is read into the shape every line below
        // already reads; `rawText` (the artifact) keeps the vendor's own bytes.
        // Spec 2026-10-12 §4.6: the reader keeps only the engine's three
        // counters, so the vendor's own usage block is kept first, for the
        // thinking-token read below (the charge keeps reading the reshaped one).
        const vendorUsageBlock: unknown = typeof decoded === "object" && decoded !== null && !Array.isArray(decoded)
          ? (decoded as Readonly<Record<string, unknown>>).usage
          : undefined;
        const nativeReply = this.#anthropic ? readAnthropicMessagesReply(decoded) : null;
        if (nativeReply !== null) decoded = nativeReply.normalized;
        const candidate = z.object({ id: z.string(), model: modelIdSchema }).passthrough().safeParse(decoded);
        const observedUsage = z.object({ usage: usageSchema.nullable().optional() })
          .passthrough().safeParse(decoded);
        /**
         * TWO READS OF ONE BLOCK, and the difference is deliberate.
         *
         * `reportedUsage` is what the engine can VOUCH FOR: the strict parse,
         * with a vendor's extra members stripped (C-I1), so what reaches the
         * artifact and the hosted usage requirement is the four bounded
         * counters or nothing. A block that strips to nothing is recorded as
         * `null` rather than as `{}`, which would claim the vendor reported an
         * empty usage block (fix round 1, Minor 7).
         *
         * `rawUsage` is what the vendor SENT, handed to the charge below,
         * because a malformed count does not make a billed call free
         * (Important 1). The charge reads it leniently and falls back to this
         * attempt's own projected maximum for a part it cannot read; the
         * acceptance decision keeps the strict parse and still refuses.
         */
        const parsedUsage = observedUsage.success ? observedUsage.data.usage ?? null : null;
        const reportedUsage = parsedUsage !== null && Object.keys(parsedUsage).length > 0
          ? parsedUsage
          : null;
        const rawUsage: unknown = typeof decoded === "object" && decoded !== null
          && !Array.isArray(decoded)
          ? (decoded as Readonly<Record<string, unknown>>).usage
          : undefined;
        bodyUsage = rawUsage;
        const strict = responseSchema.safeParse(decoded);
        // Model scorecard §2.2/§2.3: a relay says which level it RAN at; an API
        // vendor does not, and then the level sent is the level used. Thinking
        // tokens are read leniently off the RAW block, so the strict
        // four-counter parse above (and every test pinning it) is untouched.
        const echoedLevel = echoedThinkingLevel(decoded);
        const thinkingLevelUsed = echoedLevel ?? attemptThinking.sent;
        const reasoningTokens = reportedReasoningTokens(vendorUsageBlock);
        attemptThinkingLevel = thinkingLevelUsed;
        const finishReason = observedFinishReason(decoded);
        const content = strict.success ? strict.data.choices[0]!.message.content : null;
        const replyFacts: ModelReplyFacts = Object.freeze({ finishReason });
        // Length guidance L27: information only, never a reason to refuse or retry. The cached part of the input as the
        // vendor reported it, and the words this reply wrote.
        const cachedInputTokens = reportedCachedInputTokens(vendorUsageBlock);
        // A reply A1 rescues is counted again on what was accepted (the hook below).
        let attemptWords = replyWordsOf(request, content, replyFacts);
        /**
         * Patch follow-up: what this call hands back when the reply is accepted. The reply itself, except after a
         * merged patch, where it is the first reply with the patch merged in (`mergePatchReply`) — the string the step's
         * own classifier checked, so every caller that reads `content` again reads exactly what was accepted.
         */
        let acceptedContent = content;
        /** Patch follow-up: this attempt was the patch and its reply could not be merged, so the first reply stands. */
        let patchNotMerged = false;
        let classifiedContent: ContentClassification | {
          readonly parseStatus: "UNPARSED";
          readonly parseError: null;
        };
        try {
          if (content !== null && patchPlan !== null && request.classifyContent !== undefined) {
            const merged = mergePatchReply(patchPlan, content, replyFacts);
            if (merged.ok) {
              acceptedContent = merged.content;
              classifiedContent = request.classifyContent(merged.content, replyFacts);
            } else {
              patchNotMerged = true;
              classifiedContent = { parseStatus: merged.parseStatus, parseError: merged.parseError };
              /**
               * Owner ruling 2026-10-12: a reply with keys outside the request is most often the whole answer again.
               * The step's own full check reads it as a whole answer, and it is accepted as it is when it passes —
               * saving the full re-ask. When it does not, it stays refused as a patch (its record keeps
               * PATCH_KEY_NOT_REQUESTED) and the first reply stands.
               */
              // Refused-repair salvage (B): never for the follow-up B, whose reply keeps to the asked members.
              if (merged.parseError === PATCH_KEY_NOT_REQUESTED && followUp === undefined) {
                const whole = request.classifyContent(content, replyFacts);
                if (whole.parseStatus === "PARSED") classifiedContent = whole;
              }
            }
          } else {
            classifiedContent = content === null
              ? { parseStatus: "UNPARSED", parseError: null }
              : request.classifyContent?.(content, replyFacts) ?? {
                  parseStatus: contentParseStatus(content),
                  parseError: null
                };
          }
        } catch (error) {
          classifiedContent = {
            parseStatus: "SCHEMA_FAILED",
            parseError: error instanceof Error ? error.message : String(error)
          };
        }
        /**
         * V-11 addendum, layer 5. SIGNALS, never gates: the scan runs, the
         * result is recorded on the run's artifact, and the call proceeds
         * exactly as it would have. `raw_artifact.metadata` is unconstrained
         * jsonb — the same durable home W10/1 gave `finish_reason` — so no
         * migration is needed and no column constraint has to learn a new word.
         * Constraint 6: the signals carry codes, the code-owned field name and
         * a capped count; never the material and never the answer.
         */
        const tripwires = scanPromptTripwires({
          frame,
          contractId: frame.contractId,
          answer: content ?? rawText
        });
        // LG-A (L34): a refused reply's class and an accepted reply's repairs, decided before the artifact is written: both
        // are its columns (migration 0120). Codes only. The class reads the text the classifier checked: after a merged
        // patch, the merged reply (its issue paths are the merged reply's), else the reply (Task 11 review, finding 4).
        // A measure is information, never a gate: should reading it throw, the attempt is recorded with none (class null,
        // repairs null), so the billed artifact and its charge below are never lost (Task 11 review, finding 3).
        const truncatedReply = finishReason === PROVIDER_FINISH_REASON_LENGTH;
        let attemptFailureClass: ReplyFailureClass | null = null;
        let attemptRepairs: readonly ModelJsonRepair[] = [];
        try {
          attemptFailureClass =
            classifiedContent.parseStatus === "PARSE_FAILED" || classifiedContent.parseStatus === "SCHEMA_FAILED"
              ? classifiedContent.failureClass ?? replyFailureClassOf({ rawText: acceptedContent ?? content ?? rawText,
                  parseStatus: truncatedReply ? PROVIDER_CONTENT_LENGTH_EXCEEDED : classifiedContent.parseStatus,
                  parseError: classifiedContent.parseError }, replyFacts)
              : truncatedReply && !strict.success ? "CUT_OFF" : null;
          attemptRepairs = classifiedContent.parseStatus === "PARSED" ? contentRepairsOf(classifiedContent) : [];
        } catch {
          attemptFailureClass = null;
          attemptRepairs = [];
        }
        // Refused-repair salvage (2026-10-16, A1): a routed call's reply to the ORIGINAL question (the first POST, or the
        // length retry that sends it again; never a reply to a follow-up packet) of class STRUCTURE, not cut off, is read
        // in code, with no call, before its artifact is written. A rescued reply is accepted here as the original AI's own
        // reply: its artifact PARSED with A1's drops among its repairs and its words counted on what was accepted, its OK
        // row at the call's own key, no structure-repair call. A1 sends nothing, so the routed call's POSTs stay as they
        // were. A throw is no rescue (the reply goes on as it was refused), never a lost artifact. Never a reply to a full
        // re-ask (`repairForm` set), even one whose builder handed back the original packet object.
        if (routed && patchPlan === null && repairForm === undefined && attemptPacket === request.packet && attemptFailureClass === "STRUCTURE"
          && !truncatedReply && content !== null && request.structureSalvage !== undefined) {
          let salvaged: StructureSalvaged | null = null;
          try {
            salvaged = request.structureSalvage(content, replyFacts);
          } catch {
            salvaged = null;
          }
          if (salvaged !== null) {
            acceptedContent = salvaged.content;
            classifiedContent = salvaged.classification;
            attemptFailureClass = null;
            attemptRepairs = contentRepairsOf(salvaged.classification);
            attemptWords = replyWordsOf(request, salvaged.content, replyFacts);
          }
        }
        rawArtifactRef = await this.#options.persistRawArtifact({
          artifactId: randomUUID(),
          attemptId,
          runId: request.runId,
          providerRef: request.providerRef,
          provider: this.#anthropic ? ANTHROPIC_MESSAGES_HTTP_ADAPTER_KIND : "openai-compatible-http",
          model: candidate.success ? candidate.data.model : this.#options.model,
          maker: this.#options.maker,
          modelVersion: candidate.success ? candidate.data.model : null,
          rawText,
          metadata: {
            status: response.status,
            attempt,
            ...(tripwires.length === 0 ? {} : { prompt_tripwires: tripwires }),
            usage: reportedUsage,
            // W10/1: the reason this completion stopped, recorded on EVERY
            // attempt, so the truncation is durable even though `parse_status`
            // cannot name it (a code token; see recordableFinishReason).
            finish_reason: recordableFinishReason(finishReason),
            // W10/2: the bound this attempt actually asked for. Without it the
            // ledger cannot tell a raised retry from a repeat of the attempt
            // that was just cut off.
            token_ceiling: attemptTokenCeiling
            // Nothing else. For an encrypted run this object stays readable and
            // migration 0069 (V-6) admits only these code / number keys; a key
            // outside them refuses the artifact, and with it the model reply.
            // The debate's language is the RUN's (core.run.argument_language_name,
            // which every call of the run is told to write in), so the artifact
            // reaches it through its run_id rather than carrying a readable copy.
          },
          parseStatus: classifiedContent.parseStatus,
          parseError: classifiedContent.parseError,
          inputHash,
          contractHash: request.contractHash,
          contentHash: digest(rawText),
          thinkingTokens: reasoningTokens,
          cachedInputTokens,
          actualWords: attemptWords,
          guidedWords: request.guidedWords ?? null,
          replyForm: attemptReplyForm,
          replyRepairs: attemptRepairs.length === 0 ? null : attemptRepairs,
          replyFailureClass: attemptFailureClass
        });
        /**
         * V-28 / I4 — THE CHARGE, at the one point every attempt with a body
         * passes through, and BEFORE any decision the engine takes about that
         * body. The vendor has already billed for this call; whether the engine
         * goes on to accept, refuse or retry it changes nothing about the money.
         * It sits after `persistRawArtifact` so a charge is never recorded
         * against a call the ledger cannot show.
         */
        chargeReached = true;
        await request.costEnvelope?.recordCall({
          providerRef: request.providerRef,
          usage: rawUsage,
          ...(costAdmission === undefined ? {} : {admission:costAdmission}),
          // The SAME two facts `assertCallAllowed` decided against above, so a
          // charge that falls back to the projection can never exceed what the
          // per-run gate already admitted for this attempt.
          projection: {
            requestBytes: Buffer.byteLength(body, "utf8"),
            completionTokenCeiling: attemptTokenCeiling
          },
          attemptId
        });
        chargeWritten = true;
        /**
         * Model scorecard R4: a subscription tool at its usage cap answers 429
         * with the relay's typed marker. The cap is still there one backoff
         * later, so this is NOT retried: the loop stops below and the caller
         * sees PROVIDER_CALL_FAILED with the cap as its `cause` (pre-flight
         * ruling F11), which the runner's seat caller turns into an immediate
         * switch. A bare 429 (a vendor's rate limit) stays a retried transport
         * failure, exactly as before.
         */
        if (response.status === 429 && relayErrorCode(decoded) === CLI_RELAY_USAGE_CAP) {
          throw new TypedDomainError(
            PROVIDER_USAGE_CAP,
            `${request.providerRef} reported that its subscription usage cap is reached`
          );
        }
        /**
         * R1 (pre-flight fix F1): a relay refuses a window or a level with its
         * own typed marker (A8). Both are the gateway's own refusals under
         * another name, the same one backoff later, so they short-circuit
         * below, unwrapped — never a retried transport failure, never a reason
         * to move a seat to its backup.
         */
        if (response.status === 413 && relayErrorCode(decoded) === CLI_RELAY_CONTEXT_WINDOW_EXCEEDED) {
          throw new TypedDomainError(
            PROVIDER_CONTEXT_WINDOW_EXCEEDED,
            `${request.providerRef} refused the prompt: it does not fit the relay's declared context window`
          );
        }
        if (response.status === 400 && relayErrorCode(decoded) === CLI_RELAY_THINKING_LEVEL_UNSUPPORTED) {
          throw new TypedDomainError(
            PROVIDER_THINKING_LEVEL_UNSUPPORTED,
            `${request.providerRef} refused the requested thinking level`
          );
        }
        if (!response.ok) throw new Error(`PROVIDER_HTTP_STATUS_${response.status}`);
        /**
         * Model scorecard §2.2: the identity check's mirror for the level. A
         * relay that ran a requested level at another one produced an answer
         * from a candidate the scorecard did not pick. Nothing is compared
         * when no level was asked; then the relay's own level is recorded.
         *
         * Task review fix round 1:
         *  · finding 1 — decided HERE, on the raw body, before the content
         *    classifier and the strict response parse, so a wrong-level answer
         *    is never repaired, length-retried or retried as a transport
         *    failure; it is one FAILED row and CHANGED, like the other
         *    short-circuits.
         *  · finding 2 — fail closed: a relay that was SENT a level and does
         *    not echo it verbatim (no echo, a malformed one, DEFAULT_ONLY or
         *    another level) is CHANGED. A vendor never echoes, so there only a
         *    different echo is a change.
         */
        if (attemptThinking.sent !== THINKING_LEVEL_DEFAULT_ONLY
          && (attemptThinking.echoRequired
            ? echoedLevel !== attemptThinking.sent
            : echoedLevel !== null && echoedLevel !== attemptThinking.sent)) {
          throw new TypedDomainError(
            PROVIDER_THINKING_LEVEL_CHANGED,
            `${request.providerRef} was asked for thinking level ${attemptThinking.sent} and did not report running at it`
          );
        }
        assertBoundedProviderResponse(decoded);
        /**
         * V-28 — THE HOSTED REQUIREMENT, asked only of a SUCCESSFUL completion.
         *
         * The CHARGE is taken earlier, right after the artifact is recorded
         * (I4): a 200 the engine then refuses — an over-long model id, a
         * malformed usage counter — was still billed by the vendor, so charging
         * here missed real money. This check stays here, after
         * `assertBoundedProviderResponse`, so a malformed usage block is still
         * named PROVIDER_USAGE_INVALID rather than collapsed into "the vendor
         * reported nothing", and after the `!response.ok` throw so an error page
         * stays a transport failure.
         *
         * Two corrections this comment used to get wrong:
         *  · C-I1: an UNKNOWN member of the usage block is no longer a refusal
         *    at all. It is stripped, the four counters are charged, and the
         *    answer is accepted — which is what a vendor's real 200 looks like.
         *  · Important 1: a MALFORMED COUNTER is charged (from the raw block,
         *    falling back to this attempt's projected maximum) and is NOT
         *    retried — the refusal short-circuits the attempt loop below. One
         *    billed call, one ledger row, one typed stop.
         */
        await request.costEnvelope?.assertUsageReported({
          providerRef: request.providerRef,
          usage: reportedUsage
        });
        /**
         * PR B: a refusal or an unusable reply (a tool call), raised only now —
         * after the artifact, the charge, the bounded-response check and the
         * hosted usage requirement — so its usage is always recorded and judged
         * first, exactly as a usable reply's is (review fix, 2026-10-10). The
         * model-identity check stays below, after these as before.
         */
        if (nativeReply?.failure) throw nativeReply.failure;
        // W10/1: a refusal that arrived with `finish_reason: "length"` is a
        // TRUNCATION, and it is named as one. The classifier's own verdict
        // (PARSE_FAILED on a half-written object) describes the symptom; the
        // finish reason describes the cause, and only the cause is actionable.
        //
        // W10 fix round 1 (F7): the truncation WINS even when the cut landed
        // before a body the strict response schema will accept. Previously that
        // case fell through to `responseSchema.parse`, which threw and surfaced
        // as PROVIDER_CALL_FAILED — a transport-shaped name for a length
        // failure, which is the very confusion this ticket exists to remove.
        const truncated = finishReason === PROVIDER_FINISH_REASON_LENGTH;
        const contentRejection: {
          readonly parseStatus: ProviderContentRejectionStatus;
          readonly parseError: string;
        } | null =
          classifiedContent.parseStatus === "PARSE_FAILED" || classifiedContent.parseStatus === "SCHEMA_FAILED"
            ? {
                parseStatus: truncated ? PROVIDER_CONTENT_LENGTH_EXCEEDED : classifiedContent.parseStatus,
                parseError: classifiedContent.parseError
              }
            : truncated && !strict.success
              ? {
                  parseStatus: PROVIDER_CONTENT_LENGTH_EXCEEDED,
                  parseError: "The completion was cut off at the token bound before a parseable response body"
                }
              : null;
        if (request.classifyContent !== undefined && contentRejection !== null) {
          const ledgerEntryRef = await this.#options.appendLedgerEntry({
            attemptId,
            runId: request.runId,
            actionKind: "MODEL_CALL",
            callSiteKey: request.callSiteKey,
            subjectItemId: request.subjectItemId,
            stanceAtAction: "UNASSIGNED",
            outcome: "FAILED",
            ...callFacts,
            thinkingLevel: thinkingLevelUsed,
            inputHash,
            contractHash: request.contractHash,
            actorRef: request.providerRef,
            rawArtifactRef,
            startedAt,
            finishedAt: new Date()
          });
          ledgerRecorded = true;
          /**
           * Patch follow-up: a patch reply that could not be merged (PATCH_KEY_NOT_REQUESTED, PATCH_EMPTY,
           * PATCH_NOT_AN_OBJECT) changed nothing — the first reply still stands — so if the call ends here, its refusal is
           * that reply's. The steps read this code: the writer's citation codes end its round with no draft, never a
           * FAILED run (Task M4 I-1). This attempt's own artifact and ledger row above keep the patch's own code.
           */
          lastContentRejection = patchNotMerged && patchedRefusal !== null
            ? { ...patchedRefusal, attempts: attempt }
            : {
                attempts: attempt,
                parseStatus: contentRejection.parseStatus,
                parseError: contentRejection.parseError,
                rawArtifactRef,
                ledgerEntryRef
              };
          if (contentRejection.parseStatus === PROVIDER_CONTENT_LENGTH_EXCEEDED) {
            // W10/2: a truncation is NOT repaired by asking again for the same
            // thing. Appending a correction is strictly counterproductive here
            // — it lengthens the input the model must re-read while the output
            // it owes stays the same — so the next attempt re-sends the
            // ORIGINAL packet under a raised bound.
            lengthFailures += 1;
            // R1d (PF-D6.5): read before `thinkLess` changes, so it names the level THIS attempt ran at.
            lastCutOffAtLowestLevel = attemptThinking === lowestThinking;
            // Length guidance L25 (spec 2026-10-15 §3.3): the vendor's own count shows thinking used more than the allowance
            // minus the answer's room, so the retry thinks one level lower (once; a call already at its lowest stays).
            if (lowerThinking !== null && reasoningTokens !== null
              && reasoningTokens > attemptTokenCeiling - lengthRetry!.answerRoomTokens) thinkLess = true;
            attemptPacket = request.packet;
            patchPlan = null;
            repairForm = undefined;
            // Role rotation, Task 12: the original packet goes out again, so a repair adopted before
            // it no longer describes the reply that is finally accepted. Count afresh from here.
            repairAttempts = 0;
          } else if (routed && attemptFailureClass === "STRUCTURE") {
            // LG-A (L32): a format problem never costs a new answer from this AI. On the call's first POST, with a second
            // allowed, the call ends here for the structure-repair call (withStructureRepair); otherwise it ends as a
            // content refusal (L33: 2 POSTs in all, never a format re-ask). Pre-flight PF-A42 (ruling R7): the check stays
            // at 2, never 1 — a call with one POST left ends as a content refusal, a known limit kept on purpose.
            if (attempt === 1 && callAttempts() >= 2) {
              // L4-F10 (Task 11 review, finding 1): the structure-repair result takes its identity from this reply
              // (deviation 7), so the pinned-model check the accept path runs below is run here first, with the same
              // comparison and the same refusal: a relabelled reply never reaches the repair call (its FAILED row is
              // already written; the refusal short-circuits).
              if (!candidate.success || candidate.data.model !== this.#options.model) {
                throw new TypedDomainError(
                  "PROVIDER_MODEL_IDENTITY_CHANGED",
                  `${request.providerRef} is pinned to ${this.#options.model} and the response asserted a different model`
                );
              }
              throw new ProviderStructureUnrepairedError(
                { rawText: content ?? rawText, parseStatus: contentRejection.parseStatus, parseError: contentRejection.parseError,
                  failureClass: "STRUCTURE" },
                attempt, rawArtifactRef, ledgerEntryRef,
                Object.freeze({ provider: this.#anthropic ? ANTHROPIC_MESSAGES_HTTP_ADAPTER_KIND : "openai-compatible-http",
                  model: candidate.data.model, maker: this.#options.maker, modelVersion: candidate.data.model,
                  thinkingLevel: thinkingLevelUsed, reasoningTokens }), markMaterial);
            }
            break;
          } else if (request.buildRepairPacket !== undefined) {
            const answeredPatch = patchPlan !== null;
            patchPlan = null;
            /**
             * Patch follow-up (owner design, 2026-10-12), step (2): a reply to the ORIGINAL packet that decoded to an
             * object and failed its check at named members gets the short follow-up first — the same packet object,
             * then the model's own answer as its own turn, then only the failing machine paths (once per call). A
             * reply that cannot be patched, and a patch that did not do, get the step's full re-ask (step 3), which
             * describes the first reply's refusal.
             */
            const planned = !patchTried && attemptPacket === request.packet && content !== null && attempt < callAttempts()
              ? planPatchFollowUp({ content, reply: replyFacts, parseStatus: contentRejection.parseStatus, parseError: contentRejection.parseError })
              : null;
            // LG-A (L33): a routed call's short follow-up says in plain words what is missing.
            const plan = planned !== null && routed
              ? Object.freeze({ ...planned, locator: Object.freeze({ ...planned.locator,
                  reason: contentFollowUpSentence(planned.locator.code, attemptFailureClass ?? undefined) }) })
              : planned;
            const patch = plan === null ? null : this.#patchPacket(request.packet, content!, plan, attemptTokenCeiling, repairThinking.sent, fitsContextWindow, packetCap, markMaterial);
            if (plan !== null && patch !== null) {
              attemptPacket = patch;
              patchPlan = plan;
              patchTried = true;
              if (attempt === 1) patchWasSecondPost = true;
              patchedRejection = { rawText: content!, parseStatus: contentRejection.parseStatus, parseError: contentRejection.parseError };
              patchedRefusal = {
                attempts: attempt,
                parseStatus: contentRejection.parseStatus,
                parseError: contentRejection.parseError,
                rawArtifactRef,
                ledgerEntryRef
              };
              repairForm = "PATCH";
              repairAttempts += 1;
            } else if (attempt < callAttempts()) {
              const repair = request.buildRepairPacket(answeredPatch && patchedRejection !== null ? patchedRejection : {
                // `content` is the strict parse's, or the raw body when the cut
                // landed before one existed. Either way it is what arrived.
                rawText: content ?? rawText,
                parseStatus: contentRejection.parseStatus,
                parseError: contentRejection.parseError,
                // LG-A (L33): the step's own builder turns the class into the plain-word reason (schemaFailureLocator).
                ...(routed && attemptFailureClass !== null ? { failureClass: attemptFailureClass } : {})
              });
              // The repair path is the one that used to carry the model's own
              // rejected output back into the instruction compartment. It goes
              // through the same door as the first packet, with no exception.
              assertFramedPrompt(repair);
              attemptPacket = repair;
              repairForm = "FULL";
              repairAttempts += 1;
            }
          }
          continue;
        }
        lastContentRejection = null;
        const responseJson = responseSchema.parse(decoded);
        /**
         * L4-F10: the model the provider SAYS answered, compared with the model
         * this target is pinned to, before the call can be recorded as OK.
         *
         * Until now the asserted value was copied straight into the artifact's
         * `model`/`modelVersion` — the DR-115 lineage — with nothing checking
         * it, so a gateway that served a cheaper model produced a debate whose
         * lineage named a model that never ran, and whose "different maker"
         * honesty marks rested on it. It fails closed, and it names the PINNED
         * model and the provider ref only: the response body is not quoted.
         */
        if (responseJson.model !== this.#options.model) {
          throw new TypedDomainError(
            "PROVIDER_MODEL_IDENTITY_CHANGED",
            `${request.providerRef} is pinned to ${this.#options.model} and the response asserted a different model`
          );
        }
        const ledgerEntryRef = await this.#options.appendLedgerEntry({
          attemptId,
          runId: request.runId,
          actionKind: "MODEL_CALL",
          callSiteKey: request.callSiteKey,
          subjectItemId: request.subjectItemId,
          stanceAtAction: "UNASSIGNED",
          outcome: "OK",
          ...callFacts,
          thinkingLevel: thinkingLevelUsed,
          inputHash,
          contractHash: request.contractHash,
          actorRef: request.providerRef,
          rawArtifactRef,
          startedAt,
          finishedAt: new Date()
        });
        ledgerRecorded = true;
        return {
          rawArtifactRef,
          ledgerEntryRef,
          // Patch follow-up: the merged answer after a patch; otherwise the reply, exactly as before.
          content: acceptedContent ?? responseJson.choices[0]!.message.content,
          provider: this.#anthropic ? ANTHROPIC_MESSAGES_HTTP_ADAPTER_KIND : "openai-compatible-http",
          model: responseJson.model,
          maker: this.#options.maker,
          modelVersion: responseJson.model,
          thinkingLevel: thinkingLevelUsed,
          reasoningTokens,
          answerTokens: answerTokensOf(responseJson.usage?.completion_tokens, reasoningTokens),
          cachedInputTokens,
          // A merged patch is the first reply with the patch in it: its words are counted on what was accepted.
          actualWords: acceptedContent === content ? attemptWords
            : replyWordsOf(request, acceptedContent ?? responseJson.choices[0]!.message.content, replyFacts),
          repairAttempts,
          ...(repairAttempts > 0 && repairForm !== undefined ? { repairForm } : {})
        };
      } catch (error) {
        /**
         * Pre-flight fix F13: the prompt record could not be written (a database
         * or erasure-barrier refusal), so this attempt was never sent and no
         * vendor was asked. It is neither a FAILED model call nor a transport
         * failure: no ledger row, no retry, and the error leaves unwrapped, so
         * a seat never reads it as a reason to switch to its backup.
         */
        if (promptRecordFailed) throw error;
        // NV-50: an attempt that left, may have been billed and was never charged is charged now (its usage, else its
        // projected maximum), before the ledger row and before the next attempt's admission, which then sees it.
        let unansweredUnrecorded = false;
        if (sent && !chargeReached && request.costEnvelope?.recordUnanswered !== undefined
          && mayHaveBeenBilled(error, fetchReturned)) {
          try {
            await request.costEnvelope.recordUnanswered({
              providerRef: request.providerRef,
              usage: bodyUsage,
              ...(costAdmission === undefined ? {} : { admission: costAdmission }),
              projection: { requestBytes: Buffer.byteLength(body, "utf8"), completionTokenCeiling: attemptTokenCeiling },
              attemptId
            });
          } catch {
            unansweredUnrecorded = true;
          }
        }
        /**
         * The refusals below are OURS, not the transport's, and none of them is
         * repaired by asking again — so each propagates untouched instead of
         * being absorbed into a retry loop and re-emerging as
         * PROVIDER_CALL_FAILED after the ceiling is spent.
         *
         *  · a FRAME refusal: the packet was never sent, and the caller has to
         *    see which containment rule its builder broke.
         *  · a MODEL IDENTITY change (review item 8): the gateway has already
         *    proved it answers with the wrong model. Retrying it was three real
         *    calls, three artifacts and three ledger rows for an answer that
         *    cannot become correct.
         *  · a MALFORMED USAGE COUNTER (Important 1): a vendor that answered
         *    `completion_tokens: 300.5` answers the same way one backoff later.
         *    Retrying it was three billed calls to reach one refusal — and,
         *    before this round, three billed calls charged as nothing.
         *  · V-28: a MONEY refusal from the cost-envelope seam. A ceiling that
         *    is already reached is still reached one backoff later, and a vendor
         *    that reported no usage will report none again, so retrying either
         *    only spends the attempt ceiling to arrive at the same refusal —
         *    under a name (PROVIDER_CALL_FAILED) that hides which control spoke.
         */
        const shortCircuit = error instanceof TypedDomainError
          && (error.code.startsWith("PROMPT_FRAME_")
            || error.code === "PROVIDER_MODEL_IDENTITY_CHANGED"
            || error.code === "PROVIDER_USAGE_INVALID"
            // Model scorecard: a level run at another level, a level or a
            // prompt the relay refused, and a prompt that cannot fit the
            // declared window are each the same one backoff later (R1, F1).
            || error.code === PROVIDER_THINKING_LEVEL_CHANGED
            || error.code === PROVIDER_THINKING_LEVEL_UNSUPPORTED
            || error.code === PROVIDER_CONTEXT_WINDOW_EXCEEDED
            // LG-A (L32): the routed call ends for the structure-repair call; its attempt's FAILED row is already written.
            || error.code === PROVIDER_STRUCTURE_UNREPAIRED
            || (PROVIDER_COST_ENVELOPE_REFUSAL_CODES as readonly string[]).includes(error.code));
        lastContentRejection = null;
        lastError = error;
        if (!ledgerRecorded) {
          lastOutcome = error instanceof DOMException && error.name === "TimeoutError" ? "TIMED_OUT" : "FAILED";
          lastLedgerEntryRef = await this.#options.appendLedgerEntry({
          attemptId,
          runId: request.runId,
          actionKind: "MODEL_CALL",
          callSiteKey: request.callSiteKey,
          subjectItemId: request.subjectItemId,
          stanceAtAction: "UNASSIGNED",
          // Preview retry fix, option B (spec 2026-10-11 §1.2 (d)): a provably unbilled refusal is
          // recorded as REFUSED, which no attempt count includes, so it never uses up the step. The
          // thrown error keeps `lastOutcome` FAILED: hold and halt records accept only TIMED_OUT/FAILED
          // (`migrations/0021_dr174_cooldown_prune.sql:34-38`).
          outcome: error instanceof ProviderUnbilledRefusal ? "REFUSED" : lastOutcome,
          ...callFacts,
          thinkingLevel: attemptThinkingLevel,
          inputHash,
          contractHash: request.contractHash,
          actorRef: request.providerRef,
          rawArtifactRef,
          startedAt,
          finishedAt: new Date()
          });
        }
        // The attempt is RECORDED before the refusal leaves: a relabelled answer
        // is a FAILED attempt in the ledger, with its artifact, and only then a
        // refusal the caller sees unwrapped. A frame refusal on the initial
        // packet never reaches here at all, and one on a repair packet has
        // already been ledgered by the rejection branch above.
        if (shortCircuit) throw error;
        // NV-50: never send another paid attempt while this one's money is unrecorded (the unanswered write failed, or
        // recordCall's own store write did, whose commit outcome is unknown). Wrapped as PROVIDER_CALL_FAILED.
        if (unansweredUnrecorded || (chargeReached && !chargeWritten)) break;
        /**
         * Model scorecard R4 + pre-flight ruling F11: a usage cap is still there
         * one backoff later, so the loop stops on the attempt that met it — after
         * its FAILED row, like an oversized packet — and the caller gets today's
         * PROVIDER_CALL_FAILED with the cap as its `cause`. Wrapped, so a seat
         * with no runner-up (every legacy run) halts the member exactly as a
         * relay failure does today; the seat caller reads the cap off `cause`
         * and switches to the runner-up at once (A16a).
         */
        if (error instanceof TypedDomainError && error.code === PROVIDER_USAGE_CAP) break;
        /**
         * PR B: a vendor refusal and a reply this engine cannot use (a tool
         * call it never offered) were both billed, and asking again is most
         * likely a second bill for the same answer. Stopped like the usage
         * cap: after the FAILED row, wrapped as PROVIDER_CALL_FAILED with the
         * reason as its `cause`, so every caller handles it as it handles any
         * failed member today.
         */
        if (error instanceof TypedDomainError
          && (error.code === PROVIDER_CONTENT_REFUSED || error.code === PROVIDER_REPLY_UNSUPPORTED)) break;
        // All-steps format robustness (2026-10-12): a call whose later POSTs are for content repairs only ends here.
        if (request.retryOnlyAfterContentRejection === true) break;
      }
      // L4-F2: an oversized packet is deterministic — resending it would burn the ceiling for
      // an identical refusal, so the loop stops on the attempt that refused it.
      if (packetRefused) break;
    }
    if (lastContentRejection !== null) {
      throw new ProviderContentUnacceptedError(
        lastContentRejection.attempts,
        lastContentRejection.parseStatus,
        lastContentRejection.parseError,
        lastContentRejection.rawArtifactRef,
        lastContentRejection.ledgerEntryRef,
        // R1d (PF-D6.5): only a call that ended cut off says how it ran out of room.
        lastContentRejection.parseStatus === PROVIDER_CONTENT_LENGTH_EXCEEDED
          ? Object.freeze({ cutOffs: lengthFailures, lastAtLowestLevel: lastCutOffAtLowestLevel })
          : null
      );
    }
    throw new ProviderCallFailedError(
      lastError,
      attemptsMade,
      lastOutcome,
      lastLedgerEntryRef
    );
  }
}

export class VllmOpenAICompatibleProviderGateway implements ProviderGateway {
  readonly #delegate: OpenAICompatibleProviderGateway;

  constructor(options: OpenAICompatibleGatewayOptions) {
    this.#delegate = new OpenAICompatibleProviderGateway(options);
  }

  call(request: ProviderCallRequest): Promise<ProviderCallResult> {
    return this.#delegate.call(request);
  }
}

/**
 * Multi-model preview, PR B: the native Anthropic Messages adapter. The wire is
 * ./anthropic-messages.ts; the attempt loop is the shared one above.
 */
export class AnthropicMessagesProviderGateway implements ProviderGateway {
  readonly #delegate: OpenAICompatibleProviderGateway;

  constructor(options: Omit<OpenAICompatibleGatewayOptions, "adapterKind">) {
    this.#delegate = new OpenAICompatibleProviderGateway({
      ...options,
      adapterKind: ANTHROPIC_MESSAGES_HTTP_ADAPTER_KIND
    });
  }

  call(request: ProviderCallRequest): Promise<ProviderCallResult> {
    return this.#delegate.call(request);
  }
}

// V-11 addendum layers 1-3: THE one frame every hand-off is built with, and the
// door that refuses a packet built any other way. See ./prompt-frame.ts.
export { CONTENT_RULE_ID, CONTENT_RULE_TEXT, CONTENT_RULE_HEADING } from "./content-rule.js";

export {
  FRAMED_MATERIAL_FORMAT,
  PATCH_REPLY_FORM_SENTENCE,
  PER_CALL_MARKERS_HEADING,
  PROMPT_FRAME_VERSION,
  REVISION_REPLY_FORM,
  TEXT_QUOTE_RULE_SENTENCE,
  appendFramedRejection,
  assertFramedPrompt,
  buildFramedPatchPrompt,
  buildFramedPrompt,
  buildFramedRepairPrompt,
  buildFramedRevisionPrompt,
  // R1d final wave A3: the patch path rule, so the practice reads a stored patch only under the gateway's own rule.
  isPatchPath,
  promptContractFingerprintText,
  promptTextHasReservedToken,
  framedAnswerForm,
  readPromptFrame,
  schemaFailureLimits,
  schemaFailureLocator,
  splitCacheablePrefix,
  type FramedMaterialField,
  type FramedPatchLocator,
  type FramedPrompt,
  type FramedRepairLocator,
  type FramedRevisionLocator,
  type FramedSizeLimit,
  type PromptContract,
  type PromptFramePresence
} from "./prompt-frame.js";

// Patch follow-up (owner design, 2026-10-12): which refused replies get the short follow-up, and the merge.
export {
  mergePatchReply,
  planPatchFollowUp,
  schemaFailurePaths,
  type PatchFollowUpPlan
} from "./patch-follow-up.js";

// V-11 addendum layer 5: tripwires — typed signals on the run, never gates.
export {
  PROMPT_TRIPWIRE_SIGNALS,
  scanPromptTripwires,
  type PromptTripwireSignal,
  type PromptTripwireSignalCode
} from "./prompt-tripwire.js";

// DR-181/DR-182's provider health probe (moved here by ruling J21 so the API and
// the runner share ONE implementation). See ./provider-probe.ts.
export {
  observeClaimTimeTarget,
  observePreviewProviderTarget,
  observeProviderTarget,
  previewProbeRoundBusy,
  probeTarget,
  PROVIDER_PROBE_UNBILLED_REFUSAL,
  type ProviderProbeObservation,
  type ProviderProbeRecorder
} from "./provider-probe.js";

export { ProviderUnbilledRefusal } from "./unbilled-refusal.js";
// Story format robustness (2026-10-12): the tolerant decode of a model's JSON answer.
export {
  contentRepairsOf,
  decodedRepairsOf,
  decodeModelJson,
  MAP_REPLY_SALVAGE_REPAIRS,
  MODEL_JSON_STRUCTURE_REPAIRS,
  modelJsonFenceBody,
  modelJsonLateRepair,
  modelJsonObjectSpans,
  modelJsonSyntaxRepair,
  parsedWithRepairs,
  rememberingAcceptedReply,
  STRUCTURE_SALVAGE_REPAIRS,
  type ModelJsonDecoded,
  type ModelJsonDecodeOptions,
  type ModelJsonDecodeRepair,
  type ModelJsonStructureRepair,
  type ModelJsonSyntaxRepair,
  type MapReplySalvageRepair,
  type ModelJsonRepair,
  type ModelReplyFacts,
  type StructureSalvageRepair
} from "./model-json.js";
// Length guidance L27: the words of a reply (information only).
export { replyWordCount } from "./reply-words.js";
// LG-A (spec 2026-10-15, L33): the plain-word follow-up sentences.
export { CONTENT_FOLLOW_UP_SENTENCES, contentFollowUpSentence, isContentFollowUpSentence } from "./content-follow-up.js";
// LG-A (spec 2026-10-15, L31-L34): the reply fixer and the failure classes.
export {
  REPLY_FAILURE_CLASSES, admitsOnlyTheEmptyList, fixReplyStructure, replyFailureClassOf,
  type ReplyFailureClass, type ReplyFixed, type ReplyFixerOptions, type ReplyFixerRepair
} from "./reply-fixer.js";
// LG-A (spec 2026-10-15, L32): the structure-repair call.
export {
  STRUCTURE_REPAIR_ANSWER_FORM, STRUCTURE_REPAIR_CALL_SITE_PREFIX, STRUCTURE_REPAIR_CONTRACT_HASH, STRUCTURE_REPAIR_CONTRACT_ID,
  STRUCTURE_REPAIR_INSTRUCTION, STRUCTURE_REPAIR_PASSED_STOPS, STRUCTURE_REPAIR_PROMPT_CONTRACT, structureRepairCallSiteKey, structureRepairKeepsWords,
  structureRepairOriginalKey, structureRepairTextsKeptAt, withStructureRepair, type StructureRepairRoute,
  type StructureRepairTextsKept,
  // Refused-repair salvage (2026-10-16, A1): the verified subset of a STRUCTURE reply, read in code with no call.
  salvageStructureReply, structureSalvageFor, type StructureSalvage, type StructureSalvageRefusal,
  // Refused-repair salvage (2026-10-16, B): the one follow-up to the original AI after a structure-repair call that did not do.
  structureFollowUpFor,
  // Refused-repair salvage (2026-10-16): a reclaim replays an A1-rescued or B-answered call from its recorded rows.
  structureReplayReaders
} from "./structure-repair.js";
export * from "./preview-test.js";
// Side-by-side spec §13, addition D12-D20 (owner 2026-10-22): the preview line-up as a settings value, the env's gate part.
export * from "./preview-line-up.js";
// Side-by-side spec §13, addition D24 (owner 2026-10-22: providers only, not the models, listed automatically): the
// companies the declared targets reach, for the "AI providers" legal page.
export { PROVIDER_COMPANY_HOSTS, providerCompaniesOfTargets } from "./provider-companies.js";
// Parallel calls §3.3 (owner ruling O4): one probe for a busy preview model.
export * from "./preview-busy.js";

// Multi-model preview, PR B: the native Anthropic Messages wire. The support chat
// speaks it too (Claude Haiku 5.5), so the host, the headers and the key-shape
// rule are exported from the one file that owns them.
export {
  ANTHROPIC_API_HOST,
  ANTHROPIC_API_VERSION,
  ANTHROPIC_EFFORT_LEVELS,
  ANTHROPIC_MESSAGES_BASE_URL,
  ANTHROPIC_MESSAGES_HTTP_ADAPTER_KIND,
  ANTHROPIC_MESSAGES_PATH,
  ANTHROPIC_PER_CALL_MARKERS_SEPARATOR,
  PROVIDER_CONTENT_REFUSED,
  PROVIDER_PACKET_UNSUPPORTED,
  PROVIDER_REPLY_UNSUPPORTED,
  anthropicCacheableMessages,
  anthropicCacheableSystem,
  anthropicMessagesRequestBody,
  anthropicMessagesRequestHeaders,
  anthropicUsageAsEngineUsage,
  assertAnthropicCredentialShape,
  readAnthropicMessagesReply,
  type AnthropicMessagesReply,
  type AnthropicSystemBlocks,
  type AnthropicTextBlock
} from "./anthropic-messages.js";
export * from "./preview-models.js";
export * from "./preview-remaining.js";
// Spec 2026-10-12 §4.2–§4.4: the owner's thinking-level table, the step names and the level lookup.
export * from "./preview-thinking.js";
