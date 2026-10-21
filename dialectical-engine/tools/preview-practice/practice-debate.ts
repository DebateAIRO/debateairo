/**
 * Preview practice, mode "debate": one whole practice debate with all five AIs, on this computer.
 *
 * Plain words: a throwaway database is started and given the live preview's schema and its exact register (the
 * settings the live site runs on). One throwaway team member asks our own fixed question through the same ask path
 * the site uses; the runner then argues it in this same process (no job system), with every model call going through
 * the two real spending gates over the forwarded sockets. At the end the database is read for what happened (every
 * call, its format check, its time and tokens; the served answer; the story), the database is deleted, and a report
 * says PASS or why not.
 */
import { randomBytes, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { QuestionLanguageChoiceNeeded } from "@debateai/api";
import type { AskRequest } from "@debateai/contract";
import { ContentCipher, generateDek, MemoryRunContentKeyStore, type KeyDestroyResult, type ReadableUserDekStore } from "@debateai/crypto";
import { configureContentEncryption, decryptContentForRun, migrate, readCallPrompt } from "@debateai/db";
import { TEXT_NOT_IN_QUESTION_LANGUAGE } from "@debateai/kernel";
import type { Session } from "@debateai/contract";
import {
  DEBATE_SHAPE_POLICY_ROW_KEY,
  debateShapeInForce,
  LENGTH_GUIDANCE_POLICY_ROW_KEY,
  readDebateShapePolicy,
  readEngineVersionPolicy,
  readLengthGuidancePolicy,
  type CallConcurrencyPolicy,
  type EngineVersionPolicy,
  type LengthGuidancePolicy
} from "@debateai/register";
import {
  PREVIEW_PROVIDER_REF_MODELS, previewModelRow, STRUCTURE_SALVAGE_REPAIRS, structureRepairOriginalKey, type PreviewBudgetPorts,
  type PreviewGateRemaining
} from "@debateai/providers";
import { ServeRepository } from "@debateai/serve";
import { StoryRepository } from "@debateai/story";
import { previewCallNanoUsd } from "../../apps/api/src/preview-budget-estimate.js";
import type { QuestionLanguageLock } from "../../apps/api/src/question-language/decider.js";
import { composePracticeAsk, practiceRemainingPorts } from "./practice-ask-composition.js";
import type { PracticeGateName, PracticeGateObserver } from "./practice-gate-observer.js";
import {
  callFamilyOf,
  issueListFromParseError,
  PRACTICE_ISSUE_LIST,
  practiceFinishReasonOf,
  practiceJsonRepairOf,
  practiceMapEngineOf,
  practiceMapKeyPointIdsOf,
  practiceMapLengthedOf,
  practiceModelOfRef,
  practiceReplyFormOf,
  practiceReviewEdgeCountOf,
  practiceStepOf,
  recheckReply,
  replyContentOf,
  type PracticeCallFamily,
  type PracticeStep
} from "./practice-lanes.js";
import {
  practiceDebateLanguageBlock,
  practiceDebateSiteLanguage,
  practiceLanguageResubmission,
  readPracticeMapLanguage,
  type PracticeDebateLanguage,
  type PracticeDebateLanguageBlock,
  type PracticeMapLanguage
} from "./practice-language.js";
import { readPracticeInvestigations, type PracticeInvestigationBlock } from "./practice-investigations.js";
import { practiceJudgesBlocks, readPracticeJudges, type PracticeJudgesBlocks } from "./practice-judges.js";
import { practiceLengthBlock, readPracticeFrozenLength, type PracticeLengthBlock } from "./practice-length.js";
import type { PracticeParallelBlock } from "./practice-parallel.js";
import {
  practiceServedModels,
  practiceServedStoryteller,
  practiceWriterPinsBlock,
  type PracticeWriterPins,
  type PracticeWriterPinsBlock
} from "./practice-pins.js";
import { practiceDebateQuestion } from "./practice-questions.js";
import { reportableReplyText } from "./practice-redaction.js";
import {
  importPracticeRegister,
  publishPracticeOverrideVersion,
  type PracticeNextRegisterVersion,
  type PracticeOverrideVersion,
  type PracticeRegisterExport,
  type PracticeRegisterImportReceipt
} from "./practice-register-import.js";
import { composePracticeRunner } from "./practice-runner-composition.js";
import { PracticeRefusal, practiceReleaseKeyAt, type PracticeSettings, type PracticeSockets } from "./practice-settings.js";
import {
  practiceCheckEmptyReasons,
  practiceMapReaders,
  practiceShapeBlock,
  readPracticeMap,
  readPracticeShapeFacts,
  type PracticeShapeBlock,
  type PracticeShapeFacts,
  type PracticeShapeOverride,
  type PracticeShapeRowChange,
  type PracticeShapeSource
} from "./practice-shape.js";
import { collectPracticeStoryLength, type PracticeStoryLengthBlock } from "./practice-story-length.js";
import { collectPracticeStoryEngine, type PracticeStoryEngineBlock } from "./practice-story-rounds.js";
import { startPracticeDatabase, type PracticeDatabase } from "./practice-throwaway-db.js";
import {
  practiceLengthRows,
  practiceTokenRows,
  practiceTryTier,
  type PracticeLengthRow,
  type PracticeMeasuredAttempt,
  type PracticeTokenRow
} from "./practice-tokens.js";
import { recordPracticeTranscript } from "./practice-transcript.js";
import {
  latencySummary,
  practiceCallFacts,
  practiceModelCalls,
  practiceRepairKindsByModel,
  practiceStructureRescuesShown,
  type LatencySummary,
  type PracticeCallTry,
  type PracticeModelCalls,
  type PracticeRepairKinds,
  type PracticeReplyForm,
  type PracticeStructureRescues
} from "./practice-verdict.js";

/** The practice's one throwaway person's DEK lives only in memory, for this process. */
class PracticeUserDekStore implements ReadableUserDekStore {
  readonly #keys = new Map<string, Buffer>();
  async store(userId: string, dek: Uint8Array): Promise<void> {
    if (this.#keys.has(userId)) throw new TypeError("PRACTICE_USER_DEK_EXISTS");
    this.#keys.set(userId, Buffer.from(dek));
  }
  async load(userId: string): Promise<Buffer> {
    const key = this.#keys.get(userId);
    if (key === undefined) throw new TypeError("PRACTICE_USER_DEK_UNRESOLVED");
    return Buffer.from(key);
  }
  async exists(userId: string): Promise<boolean> { return this.#keys.has(userId); }
  async destroy(userId: string): Promise<KeyDestroyResult> {
    const key = this.#keys.get(userId);
    if (key === undefined) return "ALREADY_ABSENT";
    key.fill(0);
    this.#keys.delete(userId);
    return "DESTROYED";
  }
}

export type PracticeCallRow = Readonly<{
  model: string;
  providerRef: string;
  site: string;
  calls: number;
  outcomes: Readonly<Record<string, number>>;
  parse: Readonly<Record<string, number>>;
  latencyMs: LatencySummary;
  inputTokens: number;
  outputTokens: number;
  costNanoUsd: string;
}>;

export type PracticeFailure = Readonly<{
  sequence: number;
  model: string;
  providerRef: string;
  callSiteKey: string;
  parseStatus: string;
  /** What the format check said at call time, as `code@path`. */
  issues: readonly string[];
  /**
   * The same reply re-checked now by the job's own check. Empty for a reply to the patch follow-up: it holds only the
   * members it was asked for, so the whole answer's check says nothing about it (its `issues` say why it was refused).
   */
  recheckIssues: readonly string[];
  /** Patch follow-up (owner design, 2026-10-12): what the try that got this reply sent (null when not recorded). */
  replyForm: PracticeReplyForm | null;
  latencyMs: number;
  replyText: string;
  /** Owner ruling 2026-10-12 ("Fixed slips = warning"): a later try of the SAME call (same step, same maker) was accepted. */
  fixedBySameCall: boolean;
}>;

export type PracticeDebateResult = Readonly<{
  register: PracticeRegisterImportReceipt | null;
  questionId: string;
  depth: number;
  admission: Readonly<{
    admitted: boolean;
    refusalCode: string | null;
    panel: readonly Readonly<{ providerRef: string; modelId: string; maker: string }>[];
    satOut: readonly Readonly<{ model: string; providerRefs: readonly string[]; failureCode: string | null }>[];
    rotation: Readonly<Record<string, string>> | null;
  }>;
  run: Readonly<{
    runId: string | null;
    workItemOutcome: string | null;
    failureCode: string | null;
    answer: Readonly<{ served: boolean; terminal: string | null; serveState: string | null; verdictState: string | null;
      conditionMarks: readonly string[] }> | null;
    story: Readonly<{ outcome: string | null; failureCode: string | null }> | null;
  }>;
  byModelAndSite: readonly PracticeCallRow[];
  probes: readonly Readonly<{ providerRef: string; state: string; failureCode: string | null; count: number }>[];
  failures: readonly PracticeFailure[];
  /** Calls (one step on one maker, all its tries) that ended without an accepted reply after a refused one. */
  formatFailures: number;
  /** Each AI's calls for the slip rule. */
  callsByModel: Readonly<Record<string, PracticeModelCalls>>;
  /** Information only: each AI's repaired calls by how they were fixed (patch follow-up, full re-ask, otherwise). */
  repairKindsByModel?: Readonly<Record<string, PracticeRepairKinds>>;
  /** Each AI's calls that ended with an accepted reply, and those that ended without one (any reason). */
  answersByModel: Readonly<Record<string, Readonly<{ answered: number; unanswered: number }>>>;
  /** Information only: each accepted reply that needed a tolerant repair, by model and code. */
  jsonRepairs: readonly Readonly<{ model: string; repair: string }>[];
  /** LG-A (L34): each accepted reply's repairs, counted per AI, step and kind (from raw_artifact.reply_repairs). */
  repairsByKind?: readonly PracticeRepairRow[];
  /** LG-A (L34): each reply code could not repair, with its class, its follow-up, whether it recovered, and a sample. */
  unrepaired?: readonly PracticeUnrepairedRow[];
  /** The stray-letter rule (PR #194): the replies refused for their language and their short follow-ups, per AI and step. */
  languageFollowUps?: readonly PracticeLanguageFollowUpRow[];
  /**
   * Refused-repair salvage, information only: the structure rescues (A1 in code; B by short follow-up or full re-ask).
   * Absent when every count is 0, so a run with no rescue reports exactly as before.
   */
  structureRescues?: PracticeStructureRescues;
  /** Length guidance L27 (LG-B): tokens and words per AI and step, information only (practice-tokens.ts). */
  tokensByModelAndStep?: readonly PracticeTokenRow[];
  lengthByModelAndStep?: readonly PracticeLengthRow[];
  failedCalls: number;
  refusedCalls: number;
  remaining: Readonly<Record<PracticeGateName, Readonly<{ before: PreviewGateRemaining | null; after: PreviewGateRemaining | null }>>>;
  seconds: Readonly<{ admission: number; debate: number }>;
  /** Parallel AI calls: the setting the runner ran with and how many calls really went at once (practice-parallel.ts). */
  parallel?: PracticeParallelBlock;
  /**
   * `--transcript` only: where transcript.json went, how many calls it holds, and what the key-shape safety net
   * blanked (by kind; empty when nothing). `error` names why it could not be written. Not part of report.json.
   */
  transcript?: Readonly<{ path: string | null; attempts: number; bytes: number; blanked: Readonly<Record<string, number>>; error: string | null }>;
  /** Debate shape: what the shape run did (practice-shape.ts); absent when the debate ran without a debate-shape row. */
  shape?: PracticeShapeBlock;
  /**
   * Length guidance (LG-C, practice-length.ts): where the row came from and the numbers the run was admitted with; absent
   * when the debate ran without a length row.
   */
  length?: PracticeLengthBlock;
  /** Question language: the lock, its source, the offer and the planner's naming (operator-only); absent without a debate-shape row. */
  language?: PracticeDebateLanguageBlock;
  /** R2 (E12, E13): the "cannot assess" reviews and the investigations, counts, money and time (practice-investigations.ts). */
  investigations?: PracticeInvestigationBlock;
  /** Engine redesign R2: the comparing judges' votes, the label and its trigger, today's ladder, the judging time, D1's conditional winner (engine 2 only). */
  judges?: PracticeJudgesBlocks;
  /**
   * Pinned final writers (R1d): each pin, the model the run's own pin names, the models that served the step, whether it
   * held (the pinned model served it); absent without a pin.
   */
  writerPins?: PracticeWriterPinsBlock;
  /** Length guidance (LG-D): the storyteller's words per field and its unreadable replies; absent when it could not be read. */
  storyLength?: PracticeStoryLengthBlock;
  /** Engine row (R1d): the engine the run was admitted with, the story's rounds and backups, the stories by outcome. */
  storyEngine?: PracticeStoryEngineBlock;
  /**
   * Hosted mode only (absent in local mode): the ask went through the room or the daily guard, billing as the register
   * says it and as the practice ran it (always off), the ceilings the run was held to (micro-dollars), and the names
   * of the server-only settings set aside unread.
   */
  deployment?: Readonly<{
    mode: "hosted";
    room: boolean;
    billingInRegister: "on" | "off";
    billingInPractice: "off";
    ceilings: Readonly<{ perRunCeilingMicros: number; dailyCeilingMicros: number; perStoryCeilingMicros: number | null; band: boolean;
      billingPlansSealed: boolean }> | null;
    setAsideSettings: readonly string[];
  }>;
}>;

/** The per-AI table's order: the steps in debate order (R2: the investigations after the reviews, then the comparing judges). */
export const ROSTER_ORDER = Object.freeze(["MAP", "JUDGE", "PANEL", "REVIEW", "INVESTIGATOR", "VERDICT_JUDGE", "SYNTHESIZER", "EVALUATOR",
  "STORYTELLER", "STORY_CHECKER", "STRUCTURE_REPAIR", "UNMAPPED"]);

/** LG-A (L34): one try as the report's two new tables read it (the ledger row with its artifact's 0120 columns). */
export type PracticeTryRecord = Readonly<{
  callKey: string; model: string; callSiteKey: string; outcome: string; parseStatus: string | null; replyForm: string | null;
  repairs: readonly string[] | null; failureClass: string | null;
  /** The first issue of a refusal as `code@path`; null for an accepted reply. */
  issue: string | null;
  /** Every issue of a refusal as `code@path` (`issue` is the first); absent where only the first was kept. */
  issues?: readonly string[];
  /** A refused reply's own text (already through `reportableReplyText`); null for an accepted one. */
  replyText: string | null;
}>;
export type PracticeRepairRow = Readonly<{ model: string; step: PracticeStep; kind: string; count: number }>;
export type PracticeUnrepairedRow = Readonly<{ model: string; step: PracticeStep; failureClass: string; code: string; path: string;
  followUp: "STRUCTURE" | "PATCH" | "FULL" | "LENGTH_RETRY" | "NONE"; recovered: boolean; sample: string }>;
/** The sample an unrepaired row keeps: the reply's first characters (report.json only; report.md never carries text). */
const UNREPAIRED_SAMPLE = Object.freeze({ chars: 400 });

/** Every repair of an accepted reply, counted per AI, step and kind, in that order. */
export function practiceRepairRows(tries: readonly PracticeTryRecord[]): readonly PracticeRepairRow[] {
  const counts = new Map<string, { model: string; step: PracticeStep; kind: string; count: number }>();
  for (const attempt of tries) {
    if (attempt.outcome !== "OK" || attempt.repairs === null) continue;
    for (const kind of attempt.repairs) {
      const step = practiceStepOf(attempt.callSiteKey);
      const key = `${attempt.model}\u0000${step}\u0000${kind}`;
      const row = counts.get(key) ?? { model: attempt.model, step, kind, count: 0 };
      row.count += 1;
      counts.set(key, row);
    }
  }
  return Object.freeze([...counts.values()].sort((a, b) => a.model.localeCompare(b.model) || a.step.localeCompare(b.step)
    || a.kind.localeCompare(b.kind)).map((row) => Object.freeze(row)));
}

const FOLLOW_UPS: ReadonlySet<string> = new Set(["STRUCTURE", "PATCH", "FULL", "LENGTH_RETRY"]);

const STRUCTURE_SALVAGE: ReadonlySet<string> = new Set(STRUCTURE_SALVAGE_REPAIRS);

/**
 * Refused-repair salvage, information only: `inCode`, the accepted replies whose recorded repairs name one of A1's drops
 * (`STRUCTURE_SALVAGE_REPAIRS`); `byPatch` / `byFullAsk`, the calls (tries grouped by call, in ledger order) whose first
 * try with a reply was refused for its STRUCTURE and whose first accepted try came back as a PATCH / FULL follow-up (B).
 * B runs only behind the structure-repair route: a run without one (no Haiku target, `structureRouted` false) sends a
 * STRUCTURE reply today's patch or full re-ask, which is not B, so its follow-ups are never counted.
 */
export function practiceStructureRescues(tries: readonly PracticeTryRecord[],
  run: Readonly<{ structureRouted: boolean }>): PracticeStructureRescues {
  const inCode = tries.filter((attempt) => attempt.outcome === "OK"
    && (attempt.repairs ?? []).some((repair) => STRUCTURE_SALVAGE.has(repair))).length;
  const byCall = new Map<string, PracticeTryRecord[]>();
  for (const attempt of tries) byCall.set(attempt.callKey, [...(byCall.get(attempt.callKey) ?? []), attempt]);
  let byPatch = 0;
  let byFullAsk = 0;
  for (const call of run.structureRouted ? byCall.values() : []) {
    if (call.find((attempt) => attempt.parseStatus !== null)?.failureClass !== "STRUCTURE") continue;
    const accepted = call.find((attempt) => attempt.outcome === "OK");
    if (accepted?.replyForm === "PATCH") byPatch += 1;
    else if (accepted?.replyForm === "FULL") byFullAsk += 1;
  }
  return Object.freeze({ inCode, byPatch, byFullAsk });
}

/**
 * A1's drops as the tolerant-repairs list names them: the artifact's recorded repair names joined by "+" when one of them
 * is an A1 drop, else null (re-reading the raw reply would miss them: the drops are only on the artifact).
 */
export function recordedSalvageRepairs(replyRepairs: readonly string[] | null): string | null {
  if (replyRepairs === null || !replyRepairs.some((repair) => STRUCTURE_SALVAGE.has(repair))) return null;
  return replyRepairs.join("+");
}

/** One ledger row as the call join reads it (`practiceTryJoiner`). */
export type PracticeLedgerTry = Readonly<{
  actorRef: string; model: string; callSiteKey: string; outcome: string;
  /** The reply its step refused (PARSE_FAILED, SCHEMA_FAILED or UNPARSED). */
  formatFailed: boolean;
  /** The artifact's own `reply_form` (migration 0120); null for an older row or a try with no reply. */
  recordedForm: string | null;
}>;

/**
 * Where one try belongs: `callKey`, the call it is a try of; `callModel`, that call's AI (its first try's); `recordModel`,
 * the AI the report's two tables name for this try (an accepted try's own writer, a refused try's call); `replyForm`.
 */
export type PracticeJoinedTry = Readonly<{ callKey: string; callModel: string; recordModel: string; replyForm: PracticeReplyForm | null }>;

/**
 * LG-A (L32, Review Focus 5): the call join, fed ledger rows in ledger order. A call is one step on one maker (its
 * call-site key and actor) with all its tries; a structure-repair try (`REPAIR:STRUCTURE:<key>`, the repair model's row)
 * joins the last REFUSED call of the key it names, so the slip rule counts the original AI's one call (fixed: a warning)
 * and never the repair model's. With no refused call of that key it stays a call of its own. Only a refused try of a
 * plain key marks its call as the one a later repair joins. The form is the artifact's record; else a structure-repair
 * try's is STRUCTURE (its prompt's `machine_rejection_code` block would read as FULL); else `promptForm` reads it from
 * the try's recorded prompt.
 */
export function practiceTryJoiner(): (attempt: PracticeLedgerTry, promptForm: () => Promise<PracticeReplyForm | null>) => Promise<PracticeJoinedTry> {
  const lastRefusedCall = new Map<string, string>();
  const callModels = new Map<string, string>();
  return async (attempt, promptForm) => {
    const original = structureRepairOriginalKey(attempt.callSiteKey);
    const repair = original !== attempt.callSiteKey;
    const ownKey = `${attempt.actorRef}\u0000${attempt.callSiteKey}`;
    const callKey = repair ? lastRefusedCall.get(original) ?? ownKey : ownKey;
    const callModel = callModels.get(callKey) ?? attempt.model;
    callModels.set(callKey, callModel);
    if (attempt.formatFailed && !repair) lastRefusedCall.set(attempt.callSiteKey, callKey);
    const replyForm = (attempt.recordedForm as PracticeReplyForm | null) ?? (repair ? "STRUCTURE" : await promptForm());
    return Object.freeze({ callKey, callModel, recordModel: attempt.outcome === "OK" ? attempt.model : callModel, replyForm });
  };
}

/**
 * Every reply its step refused that code could not repair, with its class, the follow-up the same call sent next (the
 * next try of the call, by its reply form; NONE when there was none), whether the call ended answered, and a sample.
 */
export function practiceUnrepairedRows(tries: readonly PracticeTryRecord[]): readonly PracticeUnrepairedRow[] {
  const byCall = new Map<string, PracticeTryRecord[]>();
  for (const attempt of tries) byCall.set(attempt.callKey, [...(byCall.get(attempt.callKey) ?? []), attempt]);
  const rows: PracticeUnrepairedRow[] = [];
  for (const attempt of tries) {
    if (attempt.failureClass === null) continue;
    const call = byCall.get(attempt.callKey)!;
    const next = call[call.indexOf(attempt) + 1];
    const followUp = next?.replyForm !== undefined && next.replyForm !== null && FOLLOW_UPS.has(next.replyForm)
      ? next.replyForm as PracticeUnrepairedRow["followUp"] : "NONE";
    // Only a `code@path` issue is split (a free-text parse error, which may quote the reply, is never a code here).
    const at = attempt.issue !== null && PRACTICE_ISSUE_LIST.test(attempt.issue) ? attempt.issue.indexOf("@") : -1;
    rows.push(Object.freeze({
      model: attempt.model, step: practiceStepOf(attempt.callSiteKey), failureClass: attempt.failureClass,
      code: at > 0 ? attempt.issue!.slice(0, at) : attempt.parseStatus ?? "UNKNOWN",
      path: at > 0 ? attempt.issue!.slice(at + 1) : "$",
      followUp, recovered: call.some((entry) => entry.outcome === "OK"),
      sample: (attempt.replyText ?? "").slice(0, UNREPAIRED_SAMPLE.chars)
    }));
  }
  return Object.freeze(rows);
}

/**
 * The reply-language check's two codes: the shared check's (kernel), and MAP_WRONG_LANGUAGE, the map's own name for the
 * same refusal (its short follow-up says the same sentence).
 */
const LANGUAGE_REFUSAL_CODES = Object.freeze([TEXT_NOT_IN_QUESTION_LANGUAGE, "MAP_WRONG_LANGUAGE"] as const);

/**
 * Information only, per AI, step and code: `refused`, the replies a reply-language refusal named (alone or beside other
 * issues); `followUps`, those the same call asked again by the short follow-up (its next try a PATCH); `accepted`, those
 * follow-ups whose reply was accepted. The measure of the stray-letter rule (PR #194): a Chinese, Japanese or Korean
 * gloss in English or Romanian text is refused there, and the short follow-up asks for just that piece again.
 */
export type PracticeLanguageFollowUpRow = Readonly<{ model: string; step: PracticeStep; code: string; refused: number; followUps: number;
  accepted: number }>;

export function practiceLanguageFollowUpRows(tries: readonly PracticeTryRecord[]): readonly PracticeLanguageFollowUpRow[] {
  const byCall = new Map<string, PracticeTryRecord[]>();
  for (const attempt of tries) byCall.set(attempt.callKey, [...(byCall.get(attempt.callKey) ?? []), attempt]);
  const counts = new Map<string, { model: string; step: PracticeStep; code: string; refused: number; followUps: number; accepted: number }>();
  for (const attempt of tries) {
    const issues = attempt.issues ?? (attempt.issue === null ? [] : [attempt.issue]);
    const code = LANGUAGE_REFUSAL_CODES.find((candidate) => issues.some((issue) => issue.startsWith(`${candidate}@`)));
    if (code === undefined) continue;
    const call = byCall.get(attempt.callKey)!;
    const next = call[call.indexOf(attempt) + 1];
    const step = practiceStepOf(attempt.callSiteKey);
    const key = `${attempt.model}\u0000${step}\u0000${code}`;
    const row = counts.get(key) ?? { model: attempt.model, step, code, refused: 0, followUps: 0, accepted: 0 };
    row.refused += 1;
    if (next?.replyForm === "PATCH") {
      row.followUps += 1;
      if (next.outcome === "OK") row.accepted += 1;
    }
    counts.set(key, row);
  }
  return Object.freeze([...counts.values()].sort((a, b) => a.model.localeCompare(b.model) || a.step.localeCompare(b.step)
    || a.code.localeCompare(b.code)).map((row) => Object.freeze(row)));
}


function usageOf(metadata: unknown): { input: number; output: number } {
  const usage = typeof metadata === "object" && metadata !== null ? (metadata as { usage?: unknown }).usage : undefined;
  if (typeof usage !== "object" || usage === null) return { input: 0, output: 0 };
  const row = usage as Record<string, unknown>;
  const n = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
  return { input: n(row.prompt_tokens) + n(row.input_tokens), output: n(row.completion_tokens) + n(row.output_tokens) };
}

async function readRemaining(port: (signal?: AbortSignal) => Promise<PreviewGateRemaining>): Promise<PreviewGateRemaining | null> {
  try { return await port(); } catch { return null; }
}

/** What happened, read from the throwaway database after the debate. */
async function collect(pool: Pool, runId: string, run: Readonly<{ structureRouted: boolean }>): Promise<Pick<PracticeDebateResult,
  "byModelAndSite" | "failures" | "formatFailures" | "callsByModel" | "repairKindsByModel" | "answersByModel" | "jsonRepairs"
  | "failedCalls" | "refusedCalls" | "repairsByKind" | "unrepaired" | "languageFollowUps" | "structureRescues" | "tokensByModelAndStep"
  | "lengthByModelAndStep">
  & Readonly<{ answerWritersServed: readonly string[] }>> {
  const entries = (await pool.query<{ sequence: string; attempt_id: string | null; call_site_key: string; actor_ref: string; outcome: string;
    started_at: Date; finished_at: Date; raw_artifact_ref: string | null; thinking_level: string | null }>(
    `SELECT sequence::text, attempt_id::text, call_site_key, actor_ref, outcome, started_at, finished_at, raw_artifact_ref::text, thinking_level
       FROM ledger.ledger_entry WHERE run_id=$1 AND action_kind='MODEL_CALL' ORDER BY sequence`, [runId])).rows;
  const artifacts = new Map((await pool.query<{ raw_artifact_id: string; parse_status: string; metadata_json: unknown;
    raw_text: string; content_ciphertext: unknown; reply_repairs: string[] | null; reply_failure_class: string | null;
    reply_form: string | null; thinking_tokens: number | null; cached_input_tokens: number | null; actual_words: number | null;
    guided_words: number | null }>(
    `SELECT raw_artifact_id::text, parse_status, metadata_json, raw_text, content_ciphertext, reply_repairs, reply_failure_class, reply_form,
            thinking_tokens, cached_input_tokens, actual_words, guided_words
       FROM ledger.raw_artifact WHERE run_id=$1`, [runId])).rows.map((row) => [row.raw_artifact_id, row]));
  type Bucket = { model: string; providerRef: string; site: string; calls: number; outcomes: Record<string, number>;
    parse: Record<string, number>; latencies: number[]; input: number; output: number; cost: bigint };
  const buckets = new Map<string, Bucket>();
  const failures: PracticeFailure[] = [];
  let failedCalls = 0;
  let refusedCalls = 0;
  // Owner ruling 2026-10-12 ("Fixed slips = warning"): a call is one step on one maker (its call-site key and its actor)
  // with all its tries, in ledger order: its format repair, its one resend after an unbilled refusal, the final retry.
  const calls = new Map<string, { model: string; family: PracticeCallFamily; tries: PracticeCallTry[] }>();
  const jsonRepairs: { model: string; repair: string }[] = [];
  const measured: PracticeMeasuredAttempt[] = [];
  /** Each failure's call (`calls` key), in `failures` order: a structure-repair try's failure is its original call's. */
  const failureCallKeys: string[] = [];
  const readContent = async (rawArtifactRef: string, artifact: { raw_text: string; content_ciphertext: unknown }) => {
    const stored = await decryptContentForRun<{ rawText: string; parseErrorDetail: string | null }>(pool, runId, "ledger.raw_artifact",
      rawArtifactRef, (artifact.content_ciphertext ?? null) as never, { rawText: artifact.raw_text, parseErrorDetail: null });
    return stored;
  };
  /**
   * Patch follow-up (owner design, 2026-10-12): what an attempt sent, read from its own recorded prompt
   * (ledger.call_prompt, written by the runner's gateway just before it sent the attempt, decrypted with the run's key).
   * Null when the attempt has no recorded prompt (refused before it was sent).
   */
  const promptMessagesOf = async (attemptId: string | null): Promise<Parameters<typeof practiceReplyFormOf>[0] | null> => {
    if (attemptId === null) return null;
    const prompt = await readCallPrompt(pool, attemptId);
    if (prompt === null) return null;
    const messages = JSON.parse(prompt.promptText) as unknown;
    return Array.isArray(messages) ? messages as Parameters<typeof practiceReplyFormOf>[0] : null;
  };
  const replyFormOf = async (attemptId: string | null): Promise<PracticeReplyForm | null> => {
    const messages = await promptMessagesOf(attemptId);
    return messages === null ? null : practiceReplyFormOf(messages);
  };
  /** MiMo salvage (2026-10-12): a review's edge count, from its own prompt, so the recheck knows when [] is the answer. */
  const reviewEdgeCountOf = async (attemptId: string | null, callSiteKey: string): Promise<number | null> => {
    if (callFamilyOf(callSiteKey) !== "REVIEW") return null;
    const messages = await promptMessagesOf(attemptId);
    return messages === null ? null : practiceReviewEdgeCountOf(messages);
  };
  /** Ruling MAP-SALVAGE: a choose call's key point ids, from its own prompt, so a dropped unknown id is counted. */
  const mapKeyPointIdsOf = async (attemptId: string | null, callSiteKey: string): Promise<ReadonlySet<string> | null> => {
    if (!callSiteKey.startsWith("MAP:choose")) return null;
    const messages = await promptMessagesOf(attemptId);
    return messages === null ? null : practiceMapKeyPointIdsOf(messages);
  };
  /** Length guidance (spec 2026-10-15 §3.9): a map call asked under a length variant, from its own prompt (every MAP: call). */
  const mapLengthedOf = async (attemptId: string | null, callSiteKey: string): Promise<boolean> => {
    if (!callSiteKey.startsWith("MAP:")) return false;
    const messages = await promptMessagesOf(attemptId);
    return messages === null ? false : practiceMapLengthedOf(messages);
  };
  /** Engine redesign R3: a map call asked under an engine-2 contract, from its own prompt (read by engine 2's readings only). */
  const mapEngineOf = async (attemptId: string | null, callSiteKey: string): Promise<boolean> => {
    if (!callSiteKey.startsWith("MAP:")) return false;
    const messages = await promptMessagesOf(attemptId);
    return messages === null ? false : practiceMapEngineOf(messages);
  };
  /**
   * R3 final wave P17 (Task 17 Minor 1): a structure-repair try of a map call is re-read with the readings of the call it
   * repairs. Its own prompt is the repair packet, which names no map contract, so before this an engine-2 repair (a
   * MAP:check one included) was re-read with engine 1's readings (UNMAPPED). The call's engine flag is kept by its call key.
   */
  const mapEngineByCall = new Map<string, boolean>();
  const mapEngineOfTry = async (attemptId: string | null, callSiteKey: string, callKey: string): Promise<boolean> => {
    if (structureRepairOriginalKey(callSiteKey) !== callSiteKey) return mapEngineByCall.get(callKey) ?? false;
    const engine = await mapEngineOf(attemptId, callSiteKey);
    if (callSiteKey.startsWith("MAP:")) mapEngineByCall.set(callKey, engine);
    return engine;
  };
  // LG-A (L32): a structure-repair try joins the call it repairs (`practiceTryJoiner`).
  const joinTry = practiceTryJoiner();
  const records: PracticeTryRecord[] = [];
  for (const entry of entries) {
    const model = practiceModelOfRef(entry.actor_ref);
    const site = callFamilyOf(entry.call_site_key);
    const key = `${entry.actor_ref}\u0000${site}`;
    const bucket = buckets.get(key) ?? { model, providerRef: entry.actor_ref, site, calls: 0, outcomes: {}, parse: {},
      latencies: [], input: 0, output: 0, cost: 0n };
    buckets.set(key, bucket);
    bucket.calls += 1;
    bucket.outcomes[entry.outcome] = (bucket.outcomes[entry.outcome] ?? 0) + 1;
    const latencyMs = entry.finished_at.getTime() - entry.started_at.getTime();
    bucket.latencies.push(latencyMs);
    const artifact = entry.raw_artifact_ref === null ? undefined : artifacts.get(entry.raw_artifact_ref);
    const parseStatus = artifact?.parse_status ?? "NONE";
    bucket.parse[parseStatus] = (bucket.parse[parseStatus] ?? 0) + 1;
    if (artifact !== undefined) {
      const usage = usageOf(artifact.metadata_json);
      bucket.input += usage.input;
      bucket.output += usage.output;
      const row = previewModelRow(model);
      // Measured usage is priced at the try's own tier (a final writer's output is not clamped at the standard bound).
      if (row !== undefined) {
        const ceiling = (artifact.metadata_json as { token_ceiling?: unknown } | null)?.token_ceiling;
        bucket.cost += previewCallNanoUsd(row, BigInt(usage.input), usage.output, practiceTryTier(row, ceiling));
      }
    }
    const formatFailed = parseStatus === "PARSE_FAILED" || parseStatus === "SCHEMA_FAILED" || parseStatus === "UNPARSED";
    if (entry.outcome === "REFUSED") refusedCalls += 1;
    else if (entry.outcome !== "OK" && !formatFailed) failedCalls += 1;
    const { callKey, callModel, recordModel, replyForm } = await joinTry({ actorRef: entry.actor_ref, model,
      callSiteKey: entry.call_site_key, outcome: entry.outcome, formatFailed, recordedForm: artifact?.reply_form ?? null },
    () => replyFormOf(entry.attempt_id));
    const mapEngine = await mapEngineOfTry(entry.attempt_id, entry.call_site_key, callKey);
    // Length guidance L27 (LG-B): this try's measures. A structure-repair try's words count for its call's AI (callModel).
    if (artifact !== undefined) {
      const recorded = typeof artifact.metadata_json === "object" && artifact.metadata_json !== null
        ? artifact.metadata_json as { usage?: Record<string, unknown> | null; token_ceiling?: unknown } : {};
      const count = (value: unknown): number | null => typeof value === "number" && Number.isSafeInteger(value) ? value : null;
      measured.push(Object.freeze({ model, wordsModel: callModel, actorRef: entry.actor_ref, callSiteKey: entry.call_site_key,
        outcome: entry.outcome, thinkingLevel: entry.thinking_level, replyForm, parseStatus: artifact.parse_status,
        finishReason: practiceFinishReasonOf(artifact.metadata_json), tokenCeiling: count(recorded.token_ceiling),
        promptTokens: count(recorded.usage?.prompt_tokens), completionTokens: count(recorded.usage?.completion_tokens),
        thinkingTokens: artifact.thinking_tokens, cachedInputTokens: artifact.cached_input_tokens, actualWords: artifact.actual_words,
        guidedWords: artifact.guided_words }));
    }
    const call = calls.get(callKey) ?? { model: callModel, family: callFamilyOf(entry.call_site_key), tries: [] };
    calls.set(callKey, call);
    call.tries.push(Object.freeze({ outcome: entry.outcome, parseStatus: artifact === undefined ? null : parseStatus, replyForm }));
    if (entry.outcome === "OK" && artifact !== undefined) {
      const stored = await readContent(entry.raw_artifact_ref!, artifact);
      // Refused-repair salvage: A1's drops are recorded on the artifact only (re-reading the raw reply would miss them).
      const repair = recordedSalvageRepairs(artifact.reply_repairs) ?? practiceJsonRepairOf(replyContentOf(stored.rawText),
        practiceFinishReasonOf(artifact.metadata_json), entry.call_site_key, await mapKeyPointIdsOf(entry.attempt_id, entry.call_site_key),
        await mapLengthedOf(entry.attempt_id, entry.call_site_key), mapEngine);
      if (repair !== null) jsonRepairs.push(Object.freeze({ model, repair }));
    }
    let refused: Readonly<{ issue: string | null; issues: readonly string[]; replyText: string }> | null = null;
    if (formatFailed && artifact !== undefined) {
      const stored = await readContent(entry.raw_artifact_ref!, artifact);
      const content = replyContentOf(stored.rawText);
      const issues = issueListFromParseError(stored.parseErrorDetail);
      refused = Object.freeze({ issue: issues[0] ?? null, issues, replyText: reportableReplyText(content) });
      failureCallKeys.push(callKey);
      failures.push(Object.freeze({
        sequence: Number(entry.sequence), model, providerRef: entry.actor_ref, callSiteKey: entry.call_site_key, parseStatus,
        issues: issueListFromParseError(stored.parseErrorDetail),
        recheckIssues: replyForm === "PATCH" ? [] : recheckReply(entry.call_site_key, content, await reviewEdgeCountOf(entry.attempt_id, entry.call_site_key),
          await mapLengthedOf(entry.attempt_id, entry.call_site_key), mapEngine).issues,
        replyForm, latencyMs, replyText: reportableReplyText(content), fixedBySameCall: false
      }));
    }
    // A refused try is the call's (the original AI's); an accepted one is its writer's own (a structure-repair try: the
    // repair model's copy, whose own code repairs are counted under that model).
    records.push(Object.freeze({ callKey, model: recordModel, callSiteKey: entry.call_site_key, outcome: entry.outcome,
      parseStatus: artifact === undefined ? null : parseStatus, replyForm, repairs: artifact?.reply_repairs ?? null,
      failureClass: artifact?.reply_failure_class ?? null, issue: refused?.issue ?? null, ...(refused === null ? {} : { issues: refused.issues }),
      replyText: refused?.replyText ?? null }));
  }
  const callList = [...calls.entries()];
  const structureRescues = practiceStructureRescues(records, run);
  const formatFailures = callList.filter(([, call]) => practiceCallFacts(call.tries).unrecovered).length;
  const answersByModel: Record<string, { answered: number; unanswered: number }> = {};
  for (const [, call] of callList) {
    const mine = answersByModel[call.model] ??= { answered: 0, unanswered: 0 };
    if (practiceCallFacts(call.tries).answered) mine.answered += 1; else mine.unanswered += 1;
  }
  // A wrong-format reply whose call was answered later (same step, same maker): fixed by the same call. LG-A: a refused
  // structure-repair try is a try of the call it repairs, so that call's answer counts for it too.
  const answeredKeys = new Set(callList.filter(([, call]) => practiceCallFacts(call.tries).answered).map(([key]) => key));
  const fixed = failures.map((failure, index) => Object.freeze({ ...failure, fixedBySameCall: answeredKeys.has(failureCallKeys[index]!) }));
  const byModelAndSite = [...buckets.values()]
    .sort((a, b) => a.model.localeCompare(b.model) || a.providerRef.localeCompare(b.providerRef)
      || ROSTER_ORDER.indexOf(a.site) - ROSTER_ORDER.indexOf(b.site))
    .map((bucket): PracticeCallRow => Object.freeze({
      model: bucket.model, providerRef: bucket.providerRef, site: bucket.site, calls: bucket.calls,
      outcomes: Object.freeze({ ...bucket.outcomes }), parse: Object.freeze({ ...bucket.parse }),
      latencyMs: latencySummary(bucket.latencies), inputTokens: bucket.input, outputTokens: bucket.output,
      costNanoUsd: String(bucket.cost)
    }));
  return { byModelAndSite: Object.freeze(byModelAndSite), failures: Object.freeze(fixed), formatFailures,
    callsByModel: practiceModelCalls(callList.map(([, call]) => call)),
    repairKindsByModel: practiceRepairKindsByModel(callList.map(([, call]) => call)),
    answersByModel: Object.freeze(Object.fromEntries(Object.entries(answersByModel).map(([model, mine]) => [model, Object.freeze(mine)]))),
    jsonRepairs: Object.freeze(jsonRepairs), failedCalls, refusedCalls,
    repairsByKind: practiceRepairRows(records), unrepaired: practiceUnrepairedRows(records),
    languageFollowUps: practiceLanguageFollowUpRows(records),
    ...(practiceStructureRescuesShown(structureRescues) ? { structureRescues } : {}),
    tokensByModelAndStep: practiceTokenRows(measured), lengthByModelAndStep: practiceLengthRows(measured),
    // Ruling A1 (Task 21 review): the models that served the final writer, for the pins only (not a report member).
    answerWritersServed: practiceServedModels(callList.map(([, call]) => call), "SYNTHESIZER") };
}

function codeOf(error: unknown): string {
  if (typeof error === "object" && error !== null && typeof (error as { code?: unknown }).code === "string") {
    return (error as { code: string }).code;
  }
  return error instanceof Error ? error.name : "UNKNOWN";
}

export async function runPracticeDebate(input: Readonly<{
  settings: PracticeSettings;
  sockets: PracticeSockets;
  register: PracticeRegisterExport;
  /**
   * `--register-next`: the code's next register version, composed on the export's newest version
   * (`composePracticeNextRegisterVersion`); the practice publishes it on top and runs on it. Null: the live version.
   */
  registerNext?: PracticeNextRegisterVersion | null;
  /** The watched gate ports. */
  budgetPorts: PreviewBudgetPorts;
  observer: PracticeGateObserver;
  depth: number;
  questionId: string;
  /** --call-concurrency: handed to the practice's runner as it is (never written to a register). Absent: the register's row. */
  callConcurrency?: CallConcurrencyPolicy;
  /** Test seams: the runner's cooldown hold and the preview policy's resend wait. */
  wait?: (milliseconds: number) => Promise<void>;
  sleep?: (milliseconds: number) => Promise<void>;
  /** Test seam: the ask's `as_of` (ISO time; it seeds the role rotation). Absent: the time of the ask. */
  asOf?: string;
  progress?: (line: string) => void;
  /** `--transcript`: the folder transcript.json is written to, before the throwaway database is deleted; null: none. */
  transcriptDirectory?: string | null;
  /** Debate shape (`--shape-policy`, the three ask settings): absent: today's debate command. */
  shape?: PracticeShapeOverride;
  /** Length guidance (`--length-policy`, LG-C): the checked policy file; absent: the imported register's own row, if any. */
  length?: LengthGuidancePolicy;
  /** Engine row (`--engine-policy`, R1d): put into the throwaway register only (or carried by --register-next's version). */
  engine?: EngineVersionPolicy;
  /** Pinned final writers (`--answer-writer-model`, `--storyteller-model`, R1d): absent: the rotation's own picks. */
  pins?: PracticeWriterPins;
  /** Question language (`--site-language`, `--language-choice`; P2L): absent: the question's own language, an offer answered KEEP_MINE. */
  language?: PracticeDebateLanguage;
}>): Promise<PracticeDebateResult> {
  const progress = input.progress ?? (() => undefined);
  const remainingPorts = practiceRemainingPorts(input.settings, input.sockets);
  const remaining: Record<PracticeGateName, { before: PreviewGateRemaining | null; after: PreviewGateRemaining | null }> = {
    deepinfra: { before: await readRemaining(remainingPorts.deepinfra), after: null },
    anthropic: { before: await readRemaining(remainingPorts.anthropic), after: null }
  };
  let database: PracticeDatabase | null = null;
  try {
    database = await startPracticeDatabase(progress);
    const pool = database.pool;
    progress("practice database started; migrating");
    await migrate(pool);
    const receipt = await importPracticeRegister(pool, input.register, input.registerNext ?? null);
    // Exactly the exported versions (and the code's next one, with --register-next), no other: each version from 1 to
    // one above the last, asked by its own number.
    const exported = new Set([...input.register.versions.map((version) => version.register_version),
      ...(receipt.codeNext === undefined ? [] : [receipt.registerVersion])]);
    for (let version = 1n; version <= BigInt(receipt.registerVersion) + 1n; version += 1n) {
      const found = (await pool.query("SELECT 1 FROM register.register_version WHERE register_version=$1", [String(version)])).rows.length === 1;
      if (found !== exported.has(String(version))) {
        throw Object.assign(new Error("PRACTICE_REGISTER_NOT_EXACT"), { code: "PRACTICE_REGISTER_NOT_EXACT" });
      }
    }
    // The settings file is the live runner's: its REGISTER_VERSION is the export's newest version, always.
    const liveVersion = input.register.versions[input.register.versions.length - 1]!.register_version;
    if (String(input.settings.runner.REGISTER_VERSION) !== liveVersion) {
      throw Object.assign(new Error("PRACTICE_REGISTER_VERSION_MISMATCH"), { code: "PRACTICE_REGISTER_VERSION_MISMATCH" });
    }
    // With --register-next the runner and the ask path read the code's next version instead (the live one plus one,
    // which the import proved it allocated), as the server will once REGISTER_VERSION is repinned to it.
    const nextVersion = input.settings.runner.REGISTER_VERSION + 1;
    if (receipt.codeNext !== undefined && String(nextVersion) !== receipt.registerVersion) {
      throw Object.assign(new Error("PRACTICE_REGISTER_VERSION_MISMATCH"), { code: "PRACTICE_REGISTER_VERSION_MISMATCH" });
    }
    // The practice's own version (no --register-next), in this throwaway database only: the export's last version with
    // the --shape-policy and/or --length-policy rows added (or replaced) and this code's contract hashes. ONE version for
    // both, the live version + 1, the number --register-next would take. With --register-next the code's next version
    // carries them already (practice.ts handed the policies to the kit's own source build), so nothing more is
    // published: a second version on top would undo the rows it changed (controller ruling D-REGNEXT). Both
    // compositions below run on the version `settings` names, so the ask path and the runner read the rows exactly as
    // the live services would. The export file is only read; the live register is never reached.
    const shapePolicy = input.shape === undefined ? null : input.shape.policy;
    const lengthPolicy = input.length ?? null;
    // R1d: the engine row joins the same ONE throwaway version (never a second version on top). `engine` is passed
    // only when given, so a run without --engine-policy hands over exactly LG-C's `{ shape, length }`.
    const enginePolicy = input.engine ?? null;
    const overrideVersion: PracticeOverrideVersion | null =
      (shapePolicy === null && lengthPolicy === null && enginePolicy === null) || receipt.codeNext !== undefined ? null
        : await publishPracticeOverrideVersion(pool, input.register, receipt,
          { shape: shapePolicy, length: lengthPolicy, ...(enginePolicy === null ? {} : { engine: enginePolicy }) });
    // A next version composed by publish kit v3 is a hosted one: the server runs it in hosted mode (runbook H6 step 5
    // switches both units to hosted with it), so the practice runs it in hosted mode too, whatever the settings said.
    // The practice's own override version (no --register-next) keeps the settings' mode.
    // Side-by-side spec §1, §3: on the next version the one release key is renumbered with it and checked again against
    // the FINAL mode (practiceReleaseKeyAt), so a local development key never runs a practice switched to hosted.
    const nextReleaseKey = (mode: PracticeSettings["runner"]["DEPLOYMENT_MODE"]) =>
      practiceReleaseKeyAt(input.settings.runner.RELEASE_KEY, nextVersion, mode);
    const settings: PracticeSettings = receipt.codeNext !== undefined
      ? Object.freeze({ ...input.settings, runner: Object.freeze({ ...input.settings.runner, REGISTER_VERSION: nextVersion,
        RELEASE_KEY: nextReleaseKey(receipt.codeNext.composer === undefined ? input.settings.runner.DEPLOYMENT_MODE : "hosted"),
        ...(receipt.codeNext.composer === undefined ? {} : { DEPLOYMENT_MODE: "hosted" as const }) }) })
      : overrideVersion === null ? input.settings
        : Object.freeze({ ...input.settings, runner: Object.freeze({ ...input.settings.runner, REGISTER_VERSION: nextVersion,
          RELEASE_KEY: nextReleaseKey(input.settings.runner.DEPLOYMENT_MODE) }) });
    const hosted = settings.runner.DEPLOYMENT_MODE === "hosted";
    progress(receipt.codeNext === undefined ? `register imported up to version ${receipt.registerVersion}`
      : `register imported up to live version ${liveVersion}; practising on this code's next version ${receipt.registerVersion}`
        + ` (changed: ${receipt.codeNext.changedKeys.join(", ") || "none"}; added: ${receipt.codeNext.addedKeys.join(", ") || "none"})`);
    if (overrideVersion !== null) {
      for (const [name, change] of [["debate-shape", overrideVersion.shapeRow], ["length", overrideVersion.lengthRow], ["engine", overrideVersion.engineRow]] as const) {
        // `!= null`: a row the version did not touch is null (Task 20 review 2: a caller's double may leave it out).
        if (change != null) progress(`the ${name} row ${change === "ADDED" ? "added" : "replaced"} in this throwaway copy as version `
          + `${overrideVersion.registerVersion}, with this code's contract hashes`);
      }
    }
    // The version both compositions read: the live one, the code's next one, or the practice's own.
    const registerVersion = String(settings.runner.REGISTER_VERSION);
    // report.json's register block names that same version (final review M-2): on the practice's own version the
    // import's receipt names the export's newest, which is kept beside it under its own name. Else the receipt as it is.
    const reportedRegister: PracticeRegisterImportReceipt = overrideVersion === null ? receipt
      : Object.freeze({ ...receipt, registerVersion: overrideVersion.registerVersion, importedRegisterVersion: receipt.registerVersion });
    // FLAG only: what the debate-shape row did in that version (with --register-next, as the code's next version's delta:
    // a row whose bytes, value and source ref, equal the export's is in neither list, UNCHANGED; final review M-3).
    const shapeRowChange: PracticeShapeRowChange | null = overrideVersion !== null ? overrideVersion.shapeRow
      : input.shape === undefined || input.shape.policy === null || receipt.codeNext === undefined ? null
        : receipt.codeNext.addedKeys.includes(DEBATE_SHAPE_POLICY_ROW_KEY) ? "ADDED"
          : receipt.codeNext.changedKeys.includes(DEBATE_SHAPE_POLICY_ROW_KEY) ? "REPLACED" : "UNCHANGED";
    // The row the debate runs on, read as the ask path and the runner read it (absent: today's shape, byte for byte).
    // A row switched off (P2b's `enabled: false`, the preview's rollback) is no row, as the API reads it.
    const readRow = await readDebateShapePolicy(pool, settings.runner.REGISTER_VERSION);
    const shapeRow = readRow !== null && debateShapeInForce(readRow) ? readRow : null;
    if (input.shape !== undefined && input.shape.policy !== null && shapeRow === null) {
      // Only a caller that composed --register-next without the policy can get here (practice.ts never does).
      throw new PracticeRefusal("PRACTICE_SHAPE_POLICY_NOT_PUBLISHED", "the code's next version was composed without --shape-policy");
    }
    // Length guidance (LG-C): the length row the debate runs on, read the same way (absent: today's lengths, byte for byte).
    const lengthRow = await readLengthGuidancePolicy(pool, settings.runner.REGISTER_VERSION);
    if (lengthPolicy !== null && lengthRow === null) {
      throw new PracticeRefusal("PRACTICE_LENGTH_POLICY_NOT_PUBLISHED", "the code's next version was composed without --length-policy");
    }
    // Engine row (R1d): read RAW, as the runner reads it (INTERFACE §1.3). A flag whose row is not in the version the
    // debate runs on would silently run engine 1: refused before any AI is asked.
    const engineRow = await readEngineVersionPolicy(pool, settings.runner.REGISTER_VERSION);
    if (enginePolicy !== null && engineRow === null) {
      throw new PracticeRefusal("PRACTICE_ENGINE_POLICY_NOT_PUBLISHED", "the code's next version was composed without --engine-policy");
    }
    // FLAG only: what the length row did in that version (with --register-next, as the code's next version's delta).
    const lengthRowChange: PracticeLengthBlock["row"] = overrideVersion !== null ? overrideVersion.lengthRow
      : lengthPolicy === null || receipt.codeNext === undefined ? null
        : receipt.codeNext.addedKeys.includes(LENGTH_GUIDANCE_POLICY_ROW_KEY) ? "ADDED"
          : receipt.codeNext.changedKeys.includes(LENGTH_GUIDANCE_POLICY_ROW_KEY) ? "REPLACED" : "UNCHANGED";
    const lengthSource = lengthPolicy !== null ? "FLAG" as const : lengthRow !== null ? "REGISTER" as const : null;
    const asked = input.shape?.ask ?? {};
    const askedKeys = Object.keys(asked);
    // With the length row, --answer-length alone needs no debate-shape row: admission reads it from the length row (LG-C).
    const lengthCarriesIt = lengthRow !== null && askedKeys.every((key) => key === "answerLength");
    if (shapeRow === null && askedKeys.length > 0 && !lengthCarriesIt) {
      // Without the row the ask path would drop them silently: refused before any AI is asked.
      throw new PracticeRefusal("PRACTICE_SHAPE_SETTINGS_WITHOUT_ROW",
        "--depth-mode, --scrutiny and --answer-length need a debate-shape row (--shape-policy)");
    }
    if (shapeRow === null && input.language !== undefined) {
      // Without the row the ask ignores the site language and never offers a rewrite: refused before any AI is asked.
      throw new PracticeRefusal("PRACTICE_SHAPE_SETTINGS_WITHOUT_ROW",
        "--site-language and --language-choice need a debate-shape row (--shape-policy)");
    }
    // Every lock or offer the ask's question-language decider makes (P2L Task 12's onQuestionLanguage).
    const languageOutcomes: (QuestionLanguageLock | QuestionLanguageChoiceNeeded)[] = [];
    const shapeSource = input.shape !== undefined && input.shape.policy !== null ? "FLAG" as const
      : shapeRow !== null ? "REGISTER" as const : null;
    const shapeBlockOf = (source: PracticeShapeSource, facts: PracticeShapeFacts | null, unreadable?: string,
      checkEmptyReasons?: number): PracticeShapeBlock =>
      practiceShapeBlock({ source, registerVersion, row: shapeRowChange, asked, facts, ...(unreadable === undefined ? {} : { unreadable }),
        ...(checkEmptyReasons === undefined ? {} : { checkEmptyReasons }) });
    // Content encryption ON, as on the live preview, with a key that lives only in this process.
    const users = new PracticeUserDekStore();
    configureContentEncryption(pool, new ContentCipher(new MemoryRunContentKeyStore(users, async (ownerRef) => {
      const resolved = await pool.query<{ user_id: string }>(
        `SELECT user_id FROM identity."user" WHERE owner_ref=$1 AND state='active'`, [ownerRef]);
      const userId = resolved.rows[0]?.user_id;
      if (userId === undefined) throw new TypeError("PRACTICE_OWNER_REF_UNRESOLVED");
      return userId;
    })));
    const userId = randomUUID();
    const ownerRef = randomUUID();
    await pool.query(
      `INSERT INTO identity."user" (user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,phone_ciphertext,
         password_hash,pseudonym,audit_token,owner_ref,state,adult_affirmed_at,created_at)
       VALUES ($1,$2,'{}'::jsonb,'{}'::jsonb,NULL,'practice-no-sign-in',$3,$4,$5,'active',now(),now())`,
      [userId, randomBytes(32), `practice-${randomUUID()}`, randomUUID(), ownerRef]);
    await users.store(userId, generateDek());
    // The server session the ask is made in (the run key provision requires a live one), valid for the practice only.
    const sessionId = randomUUID();
    await pool.query(
      `INSERT INTO identity.session(session_id,user_id,token_hash,csrf_token_hash,binding_context,
         created_at,last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at)
       VALUES ($1,$2,$3,$4,'{}'::jsonb,now(),now(),now()+interval '12 hours',now()+interval '12 hours',now())`,
      [sessionId, userId, `sha256:${randomBytes(32).toString("hex")}`, `sha256:${randomBytes(32).toString("hex")}`]);
    const dispatched: { runId: string; workItemId: string }[] = [];
    const ask = await composePracticeAsk({
      pool, provisionPool: database.extraPool(), serverAdmissionPool: database.extraPool(), legacyAdmissionPool: database.extraPool(),
      settings, sockets: input.sockets, budgetPorts: input.budgetPorts, teamUserIds: [userId],
      dispatcher: { dispatch: async (job) => { dispatched.push({ ...job }); } }, log: progress,
      onQuestionLanguage: (outcome) => { languageOutcomes.push(outcome); },
      ...(input.pins === undefined ? {} : { pins: input.pins }),
      // Hosted only: the room's own decision pool (main.ts: API_DATABASE_POOLS.roomDecision).
      ...(hosted ? { roomDecisionPool: database.extraPool() } : {})
    });
    const runner = await composePracticeRunner({ pool, environment: settings.runner, budgetPorts: input.budgetPorts,
      remaining: remainingPorts, keepAlivePool: database.extraPool(),
      ...(input.callConcurrency === undefined ? {} : { callConcurrency: input.callConcurrency }),
      ...(input.wait === undefined ? {} : { wait: input.wait }), ...(input.sleep === undefined ? {} : { sleep: input.sleep }) });
    const question = practiceDebateQuestion(input.questionId);
    // The site language goes with the question only when the ask reads it (a debate-shape row); else the ask is today's.
    const siteLanguage = shapeRow === null ? null : practiceDebateSiteLanguage(question, input.language?.siteLanguage);
    const request = {
      question_line: question.questionLine, ...(siteLanguage === null ? {} : { site_language: siteLanguage }),
      risk_tier: "casual", tier_source: "ASKER",
      tier_provenance_ref: "asker-declaration:preview-practice", composition_budget_tier: "high", plan_tier: "premium",
      depth_params: { depth: input.depth, ...asked }, decision_scope: "preview practice", as_of: input.asOf ?? new Date().toISOString(),
      steering_presets: [], steering_annotations: []
    } as unknown as AskRequest;
    const session = { asker_id: `owner:${ownerRef}`, session_id: sessionId, caller_scope: "ASKER",
      ownership_provenance: "server_session", provisional_identity_model: false } as Session;
    const admissionStarted = performance.now();
    let refusalCode: string | null = null;
    let languageChoice: "USE_REWRITE" | "KEEP_MINE" | null = null;
    try {
      let accepted: Awaited<ReturnType<typeof ask.application.submit>>;
      try {
        accepted = await ask.application.submit(request, session, { kind: "server", userId, ownerRef });
      } catch (error) {
        if (!(error instanceof QuestionLanguageChoiceNeeded)) throw error;
        // The site's one-language pop-up (P2L): answered as the operator asked (--language-choice, default keep:
        // KEEP_MINE, as the P2L final review asks; controller ruling D-CHOICE), by the same ask sent again with the
        // choice, exactly as the page sends it. USE_REWRITE debates the rewrite; the transcript keeps the case's own line.
        const choice = input.language?.choice ?? "keep";
        languageChoice = choice === "use" ? "USE_REWRITE" : "KEEP_MINE";
        progress(`the ask answered with a one-language offer; answering ${languageChoice} as the site's pop-up would`);
        accepted = await ask.application.submit(practiceLanguageResubmission(request, error.offer, choice), session,
          { kind: "server", userId, ownerRef });
      }
      // Hosted with the band: the room may put the ask in line instead of starting it. The practice starts no waker,
      // so a waiting ask is reported as not admitted, naming the limit it waits for.
      if (accepted.status === "WAITING") refusalCode = `ASK_WAITING_IN_LINE:${accepted.waiting_scope ?? "UNKNOWN"}`;
    } catch (error) {
      refusalCode = codeOf(error);
    }
    const deployment: PracticeDebateResult["deployment"] = ask.hosted === null ? undefined : Object.freeze({
      mode: "hosted" as const, room: ask.hosted.room, billingInRegister: ask.hosted.billingInRegister,
      billingInPractice: ask.hosted.billingInPractice, ceilings: runner.money, setAsideSettings: input.settings.setAsideKeys
    });
    if (deployment !== undefined) {
      progress(`hosted mode: the ask went through ${deployment.room ? "the room (the site's day, the waiting line)" : "the daily guard"};`
        + ` billing is ${deployment.billingInRegister} in the register and kept off in the practice (no plan wall, no charge scope)`);
    }
    const admissionSeconds = (performance.now() - admissionStarted) / 1000;
    const job = dispatched[0];
    const premium = input.settings.previewConfig.premium_model_ids;
    const probeRows = (await pool.query<{ provider_ref: string; state: string; failure_code: string | null; n: number }>(
      `SELECT provider_ref, state, failure_code, count(*)::int AS n FROM core.provider_probe
        GROUP BY provider_ref, state, failure_code ORDER BY provider_ref, state`)).rows;
    const probes = probeRows.map((row) => Object.freeze({ providerRef: row.provider_ref, state: row.state, failureCode: row.failure_code, count: row.n }));
    if (job === undefined) {
      progress(`the practice ask was refused: ${refusalCode ?? "NOT_DISPATCHED"}`);
      if (input.transcriptDirectory !== undefined && input.transcriptDirectory !== null) progress("transcript: not written (no debate was admitted)");
      remaining.deepinfra.after = await readRemaining(remainingPorts.deepinfra);
      remaining.anthropic.after = await readRemaining(remainingPorts.anthropic);
      return Object.freeze({
        register: reportedRegister, questionId: question.id, depth: input.depth,
        admission: { admitted: false, refusalCode: refusalCode ?? "NOT_DISPATCHED", panel: [], satOut: [], rotation: null },
        run: { runId: null, workItemOutcome: null, failureCode: null, answer: null, story: null },
        byModelAndSite: [], probes, failures: [], formatFailures: 0, callsByModel: {}, repairKindsByModel: {}, answersByModel: {}, jsonRepairs: [],
        failedCalls: 0, refusedCalls: 0,
        remaining, seconds: { admission: admissionSeconds, debate: 0 }, parallel: runner.callStats.summary(),
        ...(shapeSource === null ? {} : { shape: shapeBlockOf(shapeSource, null) }),
        ...(input.pins === undefined ? {} : { writerPins: practiceWriterPinsBlock(input.pins, null, null) }),
        // Length guidance: where the row came from, with no frozen numbers (no run was admitted).
        ...(lengthSource === null ? {} : { length: practiceLengthBlock({ source: lengthSource, registerVersion, row: lengthRowChange, frozen: null }) }),
        ...(siteLanguage === null ? {} : { language: practiceDebateLanguageBlock({ siteLanguage, outcomes: languageOutcomes, choice: languageChoice,
          planner: null, storedLanguage: null }) }),
        ...(deployment === undefined ? {} : { deployment })
      });
    }
    const runRow = (await pool.query<{ discovered_panel: unknown }>("SELECT discovered_panel FROM core.run WHERE run_id=$1", [job.runId])).rows[0];
    const panel = (Array.isArray(runRow?.discovered_panel) ? runRow.discovered_panel : []) as { provider_ref: string; model_id: string; maker: string }[];
    const satOut = premium.filter((model) => !panel.some((member) => member.model_id === model)).map((model) => {
      const refs = Object.entries(PREVIEW_PROVIDER_REF_MODELS).filter(([, id]) => id === model).map(([ref]) => ref);
      const failure = probeRows.find((row) => refs.includes(row.provider_ref) && row.state !== "HEALTHY")?.failure_code ?? null;
      return Object.freeze({ model, providerRefs: Object.freeze(refs), failureCode: failure });
    });
    const rotationRow = (await pool.query<Record<string, string>>(
      `SELECT writer_provider_ref, checker_provider_ref, storyteller_provider_ref, story_checker_provider_ref
         FROM core.run_role_rotation WHERE run_id=$1`, [job.runId])).rows[0];
    progress(`admitted run ${job.runId} with ${String(panel.length)} models; the debate starts`);
    const debateStarted = performance.now();
    const debateStartedAt = new Date();
    let workItemOutcome: string;
    let failureCode: string | null = null;
    let answerId: string | null = null;
    try {
      const result = await runner.runner.executeWorkItem(job.workItemId);
      workItemOutcome = result.kind;
      if (result.kind === "COMPLETED") answerId = result.answerId;
    } catch (error) {
      workItemOutcome = "THREW";
      failureCode = codeOf(error);
    }
    const debateSeconds = (performance.now() - debateStarted) / 1000;
    const debateFinishedAt = new Date();
    progress(`the debate ended: ${workItemOutcome}${failureCode === null ? "" : ` (${failureCode})`}`);
    let answer: PracticeDebateResult["run"]["answer"] = null;
    let story: PracticeDebateResult["run"]["story"] = null;
    // Kept whole for the transcript (--transcript): the served answer and the story exactly as the site reads them.
    let projection: Awaited<ReturnType<ServeRepository["readAnswerProjection"]>> = null;
    let storedStory: Awaited<ReturnType<StoryRepository["readForAnswer"]>> = null;
    if (answerId !== null) {
      projection = await new ServeRepository(pool).readAnswerProjection(answerId, { ownerRef, legacyAskerId: null } as never);
      answer = projection === null ? Object.freeze({ served: false, terminal: null, serveState: null, verdictState: null, conditionMarks: [] })
        : Object.freeze({
          served: projection.terminal !== "BLOCKED",
          terminal: projection.terminal, serveState: projection.serve_state, verdictState: projection.verdict_state,
          conditionMarks: Object.freeze((projection.condition_mark_records ?? []).map((record) => String((record as { code?: unknown }).code ?? "MARK")))
        });
      const stored = await new StoryRepository(pool).readForAnswer({ answerId, answerVersion: null, ownership: { ownerRef } });
      storedStory = stored;
      story = Object.freeze({ outcome: stored?.outcome ?? null, failureCode: stored?.failureCode ?? null });
    }
    const panelFacts = Object.freeze(panel.map((member) => Object.freeze({ providerRef: member.provider_ref, modelId: member.model_id, maker: member.maker })));
    const rotation = rotationRow === undefined ? null : Object.freeze({
      answerWriter: rotationRow.writer_provider_ref!, answerChecker: rotationRow.checker_provider_ref!,
      storyteller: rotationRow.storyteller_provider_ref!, storyChecker: rotationRow.story_checker_provider_ref!
    });
    let transcript: PracticeDebateResult["transcript"];
    if (input.transcriptDirectory !== undefined && input.transcriptDirectory !== null) {
      // Before the finally below deletes the database and with it the only way to read the run's sealed text; and before
      // the report's own reading (collect), so a reading that breaks there cannot cost the transcript.
      try {
        const written = await recordPracticeTranscript({
          pool, directory: input.transcriptDirectory, ownerRef, answer: projection, story: storedStory,
          ...(shapeSource === null ? {} : { map: () => readPracticeMap(practiceMapReaders(pool), job.runId) }),
          run: Object.freeze({
            runId: job.runId, question: Object.freeze({ id: question.id, text: question.questionLine }), depth: input.depth,
            registerVersion, panel: panelFacts, satOut: Object.freeze(satOut), rotation,
            startedAt: debateStartedAt.toISOString(), finishedAt: debateFinishedAt.toISOString(),
            workItemOutcome, failureCode, answerId, answer, story
          })
        });
        transcript = Object.freeze({ path: written.path, attempts: written.attempts, bytes: written.bytes, blanked: written.blanked, error: null });
        progress(`transcript: ${written.path} (${String(written.attempts)} calls)`);
        const blanked = Object.entries(written.blanked);
        progress(blanked.length === 0 ? "transcript: the key-shape safety net changed nothing"
          : `transcript: the key-shape safety net blanked ${blanked.map(([kind, count]) => `${String(count)} ${kind}`).join(", ")}`);
      } catch (error) {
        transcript = Object.freeze({ path: null, attempts: 0, bytes: 0, blanked: Object.freeze({}), error: codeOf(error) });
        progress(`transcript could not be written: ${codeOf(error)}`);
      }
    }
    const { answerWritersServed, ...collected } = await collect(pool, job.runId, { structureRouted: runner.structureRouted });
    // R2 (E12, E13): the "cannot assess" reviews and the investigations, both engines (engine 1 runs none). A reading that
    // breaks costs only this block, never the report.
    let investigations: PracticeInvestigationBlock | undefined;
    try {
      investigations = await readPracticeInvestigations(pool, job.runId, collected.byModelAndSite);
    } catch (error) {
      progress(`investigations: could not be read (${codeOf(error)})`);
    }
    // R2 B11: the comparing judges, read before the database goes. Engine 1: absent (today's report keys). A reading
    // that breaks costs only this block, never the report.
    let judges: PracticeJudgesBlocks | undefined;
    try {
      const facts = await readPracticeJudges(pool, job.runId);
      if (facts !== null) judges = practiceJudgesBlocks(facts);
    } catch (error) {
      progress(`comparing judges: the votes could not be read (${codeOf(error)})`);
    }
    // Pinned final writers (R1d; Task 21 review ruling A1): which models the run's own pin names, and which actually
    // served each step (the answered final-writer calls; the stored story's storyteller), beside the pins (codes and
    // model ids only). A cost fallback or a backup storyteller serving instead: not held.
    const writerPins = input.pins === undefined ? undefined : practiceWriterPinsBlock(input.pins, rotation,
      { answerWriter: answerWritersServed, storyteller: practiceServedStoryteller(storedStory) });
    if (writerPins !== undefined) {
      for (const [name, entry] of [["answer writer", writerPins.answerWriter], ["storyteller", writerPins.storyteller]] as const) {
        if (entry !== null) progress(`pinned ${name} ${entry.pinnedModel}: ${entry.held ? "held" : `not held (${entry.wroteModel ?? "no rotation"}`
          + `, served by ${entry.servedBy.length === 0 ? "none" : entry.servedBy.join(", ")})`}`);
      }
    }
    // Length guidance (LG-D): the story's words per field and its unreadable replies, read before the database goes.
    // A reading that breaks costs only this block, never the report.
    let storyLength: PracticeStoryLengthBlock | undefined;
    try {
      storyLength = await collectPracticeStoryLength(pool, job.runId) ?? undefined;
      if (storyLength === undefined) progress("story length: the run's row is absent");
    } catch (error) {
      progress(`story length: could not be read (${codeOf(error)})`);
    }
    // Engine row (R1d): the engine from the run's own receipt, the story's rounds and backups, the stories by outcome
    // (the stored story's backup record comes from the story the practice already read). Same rule: only this block.
    let storyEngine: PracticeStoryEngineBlock | undefined;
    try {
      storyEngine = await collectPracticeStoryEngine(pool, job.runId, storedStory) ?? undefined;
      if (storyEngine === undefined) progress("story rounds: the run's row is absent");
    } catch (error) {
      progress(`story rounds: could not be read (${codeOf(error)})`);
    }
    // Debate shape: what the shape run did, read before the database goes. A reading that breaks costs only this block
    // (NOT_PROVEN: the shape was not shown to run), never the report.
    let shape: PracticeShapeBlock | undefined;
    if (shapeSource !== null) {
      try {
        // Carried from Task 4: the check's refused empty reasons, from the refused tries' own issues (shown only with a check).
        shape = shapeBlockOf(shapeSource, await readPracticeShapeFacts(pool, job.runId, answerId, practiceMapReaders(pool)), undefined,
          practiceCheckEmptyReasons(collected.failures));
      } catch (error) {
        shape = shapeBlockOf(shapeSource, null, codeOf(error));
        progress(`debate shape: what the run did could not be read (${codeOf(error)})`);
      }
    }
    // Length guidance: the numbers the run was admitted with (its receipt's `length`), read before the database goes. A
    // reading that breaks costs only this block, never the report.
    let length: PracticeLengthBlock | undefined;
    if (lengthSource !== null) {
      try {
        length = practiceLengthBlock({ source: lengthSource, registerVersion, row: lengthRowChange,
          frozen: await readPracticeFrozenLength(pool, job.runId) });
      } catch (error) {
        progress(`length guidance: what the run was admitted with could not be read (${codeOf(error)})`);
        length = practiceLengthBlock({ source: lengthSource, registerVersion, row: lengthRowChange, frozen: null,
          unreadable: `FACTS_UNREADABLE:${codeOf(error)}` });
      }
    }
    // Question language: the lock and the offer (from the decider), the language the run was stored with, and the
    // planner's naming as the map stored it (operator-only, CR-3). A reading that breaks costs only the planner facts,
    // never the report.
    let language: PracticeDebateLanguageBlock | undefined;
    if (siteLanguage !== null) {
      // Ruling L-SHAPED-ONLY: the run stores the lock only when admission froze a shape (apps/api/src/index.ts,
      // `storedLanguageLock`), else today's guess; this says which reached the run (pre-flight PF-D27).
      const storedLanguage = (await pool.query<{ argument_language_tag: string }>(
        "SELECT argument_language_tag FROM core.run WHERE run_id=$1", [job.runId])).rows[0]?.argument_language_tag ?? null;
      let planner: PracticeMapLanguage | null = null;
      try { planner = await readPracticeMapLanguage(pool, job.runId); } catch (error) {
        progress(`question language: the map's planner facts could not be read (${codeOf(error)})`);
      }
      language = practiceDebateLanguageBlock({ siteLanguage, outcomes: languageOutcomes, choice: languageChoice, planner, storedLanguage });
    }
    remaining.deepinfra.after = await readRemaining(remainingPorts.deepinfra);
    remaining.anthropic.after = await readRemaining(remainingPorts.anthropic);
    return Object.freeze({
      register: reportedRegister, questionId: question.id, depth: input.depth,
      admission: Object.freeze({
        admitted: true, refusalCode: null,
        panel: panelFacts,
        satOut: Object.freeze(satOut),
        rotation
      }),
      run: Object.freeze({ runId: job.runId, workItemOutcome, failureCode, answer, story }),
      ...collected, probes: Object.freeze(probes), remaining,
      ...(storyLength === undefined ? {} : { storyLength }),
      ...(storyEngine === undefined ? {} : { storyEngine }),
      seconds: Object.freeze({ admission: admissionSeconds, debate: debateSeconds }),
      parallel: runner.callStats.summary(),
      ...(transcript === undefined ? {} : { transcript }),
      ...(shape === undefined ? {} : { shape }),
      ...(length === undefined ? {} : { length }),
      ...(language === undefined ? {} : { language }),
      ...(investigations === undefined ? {} : { investigations }),
      ...(judges === undefined ? {} : { judges }),
      ...(writerPins === undefined ? {} : { writerPins }),
      ...(deployment === undefined ? {} : { deployment })
    });
  } finally {
    remaining.deepinfra.after ??= await readRemaining(remainingPorts.deepinfra);
    remaining.anthropic.after ??= await readRemaining(remainingPorts.anthropic);
    await database?.stop();
  }
}
