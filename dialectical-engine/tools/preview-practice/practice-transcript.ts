/**
 * Preview practice, debate mode, `--transcript`: every real prompt and every real answer of the practice debate.
 *
 * Plain words: with `--transcript`, right after the debate ends and before the throwaway database is deleted, the
 * practice reads back everything the run stored and writes it to `<out>/transcript.json`, one JSON object:
 *  - the run's facts (question, depth, register version, the five AIs, who sat out, who wrote and checked);
 *  - every model call in ledger order, with the exact prompt the gateway sent (every message, as sent) and the exact
 *    reply (the model's text, and the vendor's whole reply body beside it when the stored reply is the vendor's JSON),
 *    decrypted with the run's key (which lives only in this process);
 *  - the debate as the site would serve it (the positions with their makers, judgements, reviews and edges, the served
 *    answer and its verdict), and the story.
 * Model text is never cut or blanked: the file exists so the owner can read it. As a safety net every string in the
 * file still goes through the named key shapes (practice-redaction.ts redactNamedKeyShapes), and the practice says
 * if that blanked anything. No key, password, database address or setting is ever put in the file. It is written
 * whole or not at all (a temporary file, then a rename), readable only by the owner of the folder.
 */
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { decryptContentForRun, readCallPrompt } from "@debateai/db";
import {
  answerTokensOf,
  PREVIEW_PROVIDER_REF_MODELS,
  previewModelRow,
  readPromptFrame,
  replyWordCount,
  structureRepairOriginalKey,
  type PromptPacket
} from "@debateai/providers";
import { ServeRepository } from "@debateai/serve";
import { previewCallNanoUsd } from "../../apps/api/src/preview-budget-estimate.js";
import { vendorUsage } from "./practice-gate-observer.js";
import {
  callFamilyOf,
  issueListFromParseError,
  practiceFinishReasonOf,
  practiceJsonRepairOf,
  practiceMapKeyPointIdsOf,
  practiceMapLengthedOf,
  practiceReplyFormOf,
  replyContentOf
} from "./practice-lanes.js";
import { practiceGuidedWordsOfFields } from "./practice-length.js";
import { redactNamedKeyShapes } from "./practice-redaction.js";
import { practiceTryTier } from "./practice-tokens.js";

export const PRACTICE_TRANSCRIPT_SCHEMA = "preview-practice-transcript-v1";
export const PRACTICE_TRANSCRIPT_FILE = "transcript.json";

/** One ledger row of a model call, as stored (ledger.ledger_entry). */
export type TranscriptLedgerRow = Readonly<{
  sequence: string | number;
  ledgerEntryId: string;
  attemptId: string | null;
  callSiteKey: string;
  subjectItemId: string;
  stance: string;
  actorRef: string;
  outcome: string;
  modelRole: string | null;
  thinkingLevel: string | null;
  candidateId: string | null;
  startedAt: Date;
  finishedAt: Date;
  rawArtifactRef: string | null;
}>;

/** One stored reply (ledger.raw_artifact), its sealed part already decrypted. */
export type TranscriptArtifact = Readonly<{
  rawArtifactId: string;
  provider: string;
  providerRef: string;
  modelId: string;
  maker: string;
  modelVersion: string | null;
  parseStatus: string;
  parseErrorCode: string | null;
  metadata: unknown;
  thinkingTokens: number | null;
  /** Decrypted: the reply exactly as the gateway stored it (for a vendor reply, the vendor's JSON body). */
  rawText: string;
  /** Decrypted: what the format check said, word for word. */
  parseErrorDetail: string | null;
  /** LG-A (migration 0120): every repair code made on the reply, its failure class, and the form its try sent; null on older rows. */
  replyRepairs?: readonly string[] | null;
  replyFailureClass?: string | null;
  replyForm?: string | null;
  /** LG-B (L27, migration 0120): the vendor's cached input tokens, the reply's words, the words it was guided to; null on older rows. */
  cachedInputTokens?: number | null;
  actualWords?: number | null;
  guidedWords?: number | null;
}>;

/** One attempt's prompt (ledger.call_prompt), decrypted. */
export type TranscriptPrompt = Readonly<{ promptText: string; promptFingerprint: string }>;

/** One recorded charge (ledger.model_spend) for an attempt. */
export type TranscriptSpend = Readonly<{ chargeMicros: string; inputTokens: string; outputTokens: string }>;

export type TranscriptRunFacts = Readonly<{
  runId: string;
  question: Readonly<{ id: string; text: string }>;
  depth: number;
  registerVersion: string;
  panel: readonly Readonly<{ providerRef: string; modelId: string; maker: string }>[];
  satOut: readonly Readonly<{ model: string; providerRefs: readonly string[]; failureCode: string | null }>[];
  rotation: Readonly<Record<string, string>> | null;
  /** The practice's own clock around the runner's one work item. */
  startedAt: string;
  finishedAt: string;
  workItemOutcome: string;
  failureCode: string | null;
  answerId: string | null;
  answer: unknown;
  story: Readonly<{ outcome: string | null; failureCode: string | null }> | null;
}>;

export type TranscriptAttempt = Readonly<{
  sequence: number;
  ledgerEntryId: string;
  attemptId: string | null;
  callSiteKey: string;
  /** The job, read from the call-site key (JUDGE, PANEL, REVIEW, SYNTHESIZER, EVALUATOR, STORYTELLER, STORY_CHECKER). */
  family: string;
  /** The debate role the ledger recorded (migration 0090), null when not recorded. */
  modelRole: string | null;
  subjectItemId: string;
  stance: string;
  providerRef: string;
  model: string;
  maker: string | null;
  provider: string | null;
  modelVersion: string | null;
  thinkingLevel: string | null;
  candidateId: string | null;
  outcome: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  usage: Readonly<{
    inputTokens: number | null;
    outputTokens: number | null;
    reasoningTokens: number | null;
    /** Length guidance L27: the output tokens that were the answer, not thinking (answerTokensOf). */
    answerTokens: number | null;
    cachedInputTokens: number | null;
    /** The usage block the gateway recorded beside the reply (metadata_json.usage). */
    recorded: unknown;
  }>;
  cost: Readonly<{
    /** What the run's spend ledger charged for this attempt (USD micro-units), null when nothing was recorded. */
    chargedMicros: string | null;
    /** The preview's own price list applied to the tokens (nano-USD), null without a price row or tokens. */
    estimatedNanoUsd: string | null;
  }>;
  parse: Readonly<{
    status: string | null;
    errorCode: string | null;
    errorDetail: string | null;
    issues: readonly string[];
    /** Accepted replies only: the tolerant repair the shared decode needed (null for strict JSON). */
    jsonRepair: string | null;
    /** LG-A (L34): every repair code made on the reply (the artifact's own record, else `jsonRepair` split at "+"). */
    jsonRepairs: readonly string[];
    /** LG-A: a refused reply's failure class (STRUCTURE, CONTENT, CUT_OFF, EMPTY), from the artifact; null otherwise. */
    failureClass: string | null;
    finishReason: string | null;
  }>;
  /**
   * ORIGINAL (the step's own packet), PATCH (the short follow-up), FULL (the full re-ask), STRUCTURE (LG-A: the
   * structure-repair call), LENGTH_RETRY (a cut-off reply's resend): the artifact's own record (migration 0120), else read
   * from the prompt; null without either.
   */
  replyForm: string | null;
  /** Length guidance L27: the words the call was guided to (LG-C writes them; null without a length row). */
  guidedWords: number | null;
  /** The words the reply wrote: the record's own count, else counted here from the reply (replyWordCount). */
  actualWords: number | null;
  /** The metadata the gateway stored beside the reply (status, attempt, usage, finish reason, token ceiling, tripwires). */
  metadata: unknown;
  prompt: Readonly<{ fingerprint: string; messages: readonly unknown[] | null; text: string | null }> | null;
  reply: Readonly<{
    /** The model's own text (the vendor body's message content, or the stored text itself). */
    content: string;
    /** The vendor's whole reply body, when the stored reply is the vendor's JSON (never any header). */
    vendorBody: unknown;
    /** The usage block of the vendor body, when it has one. */
    vendorUsage: unknown;
  }> | null;
}>;

export type PracticeTranscript = Readonly<{
  schema: typeof PRACTICE_TRANSCRIPT_SCHEMA;
  writtenAt: string;
  run: TranscriptRunFacts;
  totals: Readonly<{ attempts: number; withPrompt: number; withReply: number; promptBytes: number; replyBytes: number }>;
  attempts: readonly TranscriptAttempt[];
  structure: Readonly<{
    /** The served answer as the site reads it (ServeRepository.readAnswerProjection): nodes, edges, numbers, text. */
    answer: unknown;
    /** The answer checker's per-segment record (ServeRepository.readInspectionProjection). */
    inspection: unknown;
    /** The story as stored (StoryRepository.readForAnswer), its sealed body decrypted. */
    story: unknown;
    /**
     * Debate shape only (absent otherwise): the map's choice (the answers argued, the points also raised) and every map
     * item (each point and candidate answer with the AI that wrote it), as P2b's readers return them, decrypted.
     */
    map?: unknown;
  }>;
  /** What this file could not hold, and why. */
  unavailable: readonly string[];
}>;

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function modelOfRef(providerRef: string): string {
  return PREVIEW_PROVIDER_REF_MODELS[providerRef] ?? `unreviewed:${providerRef}`;
}

function parsedJson(text: string): unknown {
  try { return JSON.parse(text) as unknown; } catch { return undefined; }
}

/**
 * Builds the attempts in ledger order from rows already read and decrypted. Pure: the unit test hands it rows, the
 * practice hands it what readPracticeTranscriptRows read from the throwaway database.
 */
export function buildTranscriptAttempts(input: Readonly<{
  entries: readonly TranscriptLedgerRow[];
  artifacts: ReadonlyMap<string, TranscriptArtifact>;
  prompts: ReadonlyMap<string, TranscriptPrompt>;
  spend: ReadonlyMap<string, readonly TranscriptSpend[]>;
  makers?: ReadonlyMap<string, string>;
}>): readonly TranscriptAttempt[] {
  const ordered = [...input.entries].sort((a, b) => {
    const left = BigInt(a.sequence);
    const right = BigInt(b.sequence);
    return left < right ? -1 : left > right ? 1 : 0;
  });
  return Object.freeze(ordered.map((entry): TranscriptAttempt => {
    const artifact = entry.rawArtifactRef === null ? undefined : input.artifacts.get(entry.rawArtifactRef);
    const model = artifact?.modelId ?? modelOfRef(entry.actorRef);
    const row = previewModelRow(model);
    const prompt = entry.attemptId === null ? undefined : input.prompts.get(entry.attemptId);
    const messages = prompt === undefined ? undefined : parsedJson(prompt.promptText);
    const messageList = Array.isArray(messages) ? messages : null;
    let replyForm: string | null = null;
    // LG-A: a structure-repair try is the structure call (its prompt's `machine_rejection_code` block would read as FULL).
    if (structureRepairOriginalKey(entry.callSiteKey) !== entry.callSiteKey) replyForm = "STRUCTURE";
    else if (messageList !== null) {
      try { replyForm = practiceReplyFormOf(messageList as Parameters<typeof practiceReplyFormOf>[0]); } catch { replyForm = null; }
    }
    // Ruling MAP-SALVAGE: a choose reply's ids the run did not hold are known only from the call's own prompt.
    const mapKeyPointIds = messageList === null || !entry.callSiteKey.startsWith("MAP:choose") ? null
      : practiceMapKeyPointIdsOf(messageList as Parameters<typeof practiceMapKeyPointIdsOf>[0]);
    const recorded = typeof artifact?.metadata === "object" && artifact.metadata !== null
      ? (artifact.metadata as { usage?: unknown }).usage ?? null : null;
    const recordedRow = typeof recorded === "object" && recorded !== null ? recorded as Record<string, unknown> : {};
    const gate = row?.provider === "anthropic" ? "anthropic" : "deepinfra";
    const fromVendor = artifact === undefined ? null : vendorUsage(gate, artifact.rawText);
    const inputTokens = fromVendor?.inputTokens ?? finiteOrNull(recordedRow.prompt_tokens);
    const outputTokens = fromVendor?.outputTokens ?? finiteOrNull(recordedRow.completion_tokens);
    const reasoningTokens = fromVendor?.reasoningTokens ?? artifact?.thinkingTokens ?? null;
    const charges = entry.attemptId === null ? undefined : input.spend.get(entry.attemptId);
    const charged = charges === undefined || charges.length === 0 ? null
      : String(charges.reduce((sum, charge) => sum + BigInt(charge.chargeMicros), 0n));
    // Priced at the try's own tier: a final writer's output is not clamped at the standard bound (Task 6 review, Minor 1).
    const ceiling = typeof artifact?.metadata === "object" && artifact.metadata !== null
      ? (artifact.metadata as { token_ceiling?: unknown }).token_ceiling : undefined;
    const estimated = row === undefined || inputTokens === null || outputTokens === null ? null
      : String(previewCallNanoUsd(row, BigInt(inputTokens), outputTokens, practiceTryTier(row, ceiling)));
    const content = artifact === undefined ? null : replyContentOf(artifact.rawText);
    const body = artifact === undefined ? undefined : parsedJson(artifact.rawText);
    const vendorBody = typeof body === "object" && body !== null && content !== artifact?.rawText ? body : null;
    const finishReason = artifact === undefined ? null : practiceFinishReasonOf(artifact.metadata);
    const jsonRepair = entry.outcome === "OK" && content !== null
      ? practiceJsonRepairOf(content, finishReason, entry.callSiteKey, mapKeyPointIds,
        // Length guidance (spec 2026-10-15 §3.9): a map call asked under a length variant is re-read with the runaway limits.
        messageList !== null && practiceMapLengthedOf(messageList as Parameters<typeof practiceMapLengthedOf>[0])) : null;
    return Object.freeze({
      sequence: Number(entry.sequence),
      ledgerEntryId: entry.ledgerEntryId,
      attemptId: entry.attemptId,
      callSiteKey: entry.callSiteKey,
      family: callFamilyOf(entry.callSiteKey),
      modelRole: entry.modelRole,
      subjectItemId: entry.subjectItemId,
      stance: entry.stance,
      providerRef: entry.actorRef,
      model,
      maker: artifact?.maker ?? input.makers?.get(entry.actorRef) ?? row?.maker ?? null,
      provider: artifact?.provider ?? row?.provider ?? null,
      modelVersion: artifact?.modelVersion ?? null,
      thinkingLevel: entry.thinkingLevel,
      candidateId: entry.candidateId,
      outcome: entry.outcome,
      startedAt: entry.startedAt.toISOString(),
      finishedAt: entry.finishedAt.toISOString(),
      durationMs: entry.finishedAt.getTime() - entry.startedAt.getTime(),
      usage: Object.freeze({ inputTokens, outputTokens, reasoningTokens, answerTokens: answerTokensOf(outputTokens, reasoningTokens),
        cachedInputTokens: artifact?.cachedInputTokens ?? fromVendor?.cachedInputTokens ?? null, recorded }),
      cost: Object.freeze({ chargedMicros: charged, estimatedNanoUsd: estimated }),
      parse: Object.freeze({
        status: artifact?.parseStatus ?? null,
        errorCode: artifact?.parseErrorCode ?? null,
        errorDetail: artifact?.parseErrorDetail ?? null,
        issues: issueListFromParseError(artifact?.parseErrorDetail ?? null),
        jsonRepair,
        // LG-A (L34): every repair, from the artifact's own record (migration 0120); else the one worked out from the reply.
        jsonRepairs: artifact?.replyRepairs ?? (jsonRepair === null ? [] : jsonRepair.split("+")),
        failureClass: artifact?.replyFailureClass ?? null,
        finishReason
      }),
      replyForm: artifact?.replyForm ?? replyForm,
      // LG-C: the column first; else, for transcript.json only, the target read back from the recorded prompt.
      guidedWords: artifact?.guidedWords ?? (messageList === null ? null : (() => {
        try { return practiceGuidedWordsOfFields(readPromptFrame({ messages: messageList as PromptPacket["messages"] }).fields); }
        catch { return null; }
      })()),
      actualWords: artifact?.actualWords ?? (content === null ? null : replyWordCount(content, { finishReason })),
      metadata: artifact?.metadata ?? null,
      prompt: prompt === undefined ? null : Object.freeze({
        fingerprint: prompt.promptFingerprint,
        messages: messageList,
        // Kept as text only when it is not the messages list (never the case for a prompt the gateway sent).
        text: messageList === null ? prompt.promptText : null
      }),
      reply: content === null ? null : Object.freeze({
        content,
        vendorBody,
        vendorUsage: typeof body === "object" && body !== null ? (body as { usage?: unknown }).usage ?? null : null
      })
    });
  }));
}

/** Reads every model call of the run from the throwaway database, decrypting each prompt and reply with the run's key. */
export async function readTranscriptAttempts(pool: Pool, runId: string, makers: ReadonlyMap<string, string>): Promise<readonly TranscriptAttempt[]> {
  const entries = (await pool.query<{ sequence: string; ledger_entry_id: string; attempt_id: string | null; call_site_key: string;
    subject_item_id: string; stance_at_action: string; actor_ref: string; outcome: string; model_role: string | null;
    thinking_level: string | null; candidate_id: string | null; started_at: Date; finished_at: Date; raw_artifact_ref: string | null }>(
    `SELECT sequence::text, ledger_entry_id::text, attempt_id::text, call_site_key, subject_item_id, stance_at_action, actor_ref,
            outcome, model_role, thinking_level, candidate_id, started_at, finished_at, raw_artifact_ref::text
       FROM ledger.ledger_entry WHERE run_id=$1 AND action_kind='MODEL_CALL' ORDER BY sequence`, [runId])).rows;
  const artifactRows = (await pool.query<{ raw_artifact_id: string; provider: string; provider_ref: string; model_id: string;
    maker: string; model_version: string | null; parse_status: string; parse_error: string | null; metadata_json: unknown;
    thinking_tokens: number | null; raw_text: string; content_ciphertext: unknown; reply_repairs: string[] | null;
    reply_failure_class: string | null; reply_form: string | null; cached_input_tokens: number | null; actual_words: number | null;
    guided_words: number | null }>(
    `SELECT raw_artifact_id::text, provider, provider_ref, model_id, maker, model_version, parse_status, parse_error,
            metadata_json, thinking_tokens, raw_text, content_ciphertext, reply_repairs, reply_failure_class, reply_form,
            cached_input_tokens, actual_words, guided_words
       FROM ledger.raw_artifact WHERE run_id=$1`, [runId])).rows;
  const artifacts = new Map<string, TranscriptArtifact>();
  for (const row of artifactRows) {
    const stored = await decryptContentForRun<{ rawText: string; parseErrorDetail: string | null }>(pool, runId, "ledger.raw_artifact",
      row.raw_artifact_id, (row.content_ciphertext ?? null) as never, { rawText: row.raw_text, parseErrorDetail: null });
    artifacts.set(row.raw_artifact_id, Object.freeze({
      rawArtifactId: row.raw_artifact_id, provider: row.provider, providerRef: row.provider_ref, modelId: row.model_id,
      maker: row.maker, modelVersion: row.model_version, parseStatus: row.parse_status, parseErrorCode: row.parse_error,
      metadata: row.metadata_json, thinkingTokens: row.thinking_tokens, rawText: stored.rawText,
      parseErrorDetail: stored.parseErrorDetail ?? null,
      replyRepairs: row.reply_repairs, replyFailureClass: row.reply_failure_class, replyForm: row.reply_form,
      cachedInputTokens: row.cached_input_tokens, actualWords: row.actual_words, guidedWords: row.guided_words
    }));
  }
  const prompts = new Map<string, TranscriptPrompt>();
  for (const entry of entries) {
    if (entry.attempt_id === null || prompts.has(entry.attempt_id)) continue;
    const prompt = await readCallPrompt(pool, entry.attempt_id);
    if (prompt !== null) prompts.set(entry.attempt_id, Object.freeze({ promptText: prompt.promptText, promptFingerprint: prompt.promptFingerprint }));
  }
  const spend = new Map<string, TranscriptSpend[]>();
  for (const row of (await pool.query<{ attempt_id: string; charge_micros: string; input_tokens: string; output_tokens: string }>(
    `SELECT attempt_id::text, charge_micros::text, input_tokens::text, output_tokens::text
       FROM ledger.model_spend WHERE run_id=$1 AND attempt_id IS NOT NULL`, [runId])).rows) {
    const list = spend.get(row.attempt_id) ?? [];
    list.push(Object.freeze({ chargeMicros: row.charge_micros, inputTokens: row.input_tokens, outputTokens: row.output_tokens }));
    spend.set(row.attempt_id, list);
  }
  return buildTranscriptAttempts({
    entries: entries.map((entry) => Object.freeze({
      sequence: entry.sequence, ledgerEntryId: entry.ledger_entry_id, attemptId: entry.attempt_id, callSiteKey: entry.call_site_key,
      subjectItemId: entry.subject_item_id, stance: entry.stance_at_action, actorRef: entry.actor_ref, outcome: entry.outcome,
      modelRole: entry.model_role, thinkingLevel: entry.thinking_level, candidateId: entry.candidate_id,
      startedAt: entry.started_at, finishedAt: entry.finished_at, rawArtifactRef: entry.raw_artifact_ref
    })),
    artifacts, prompts, spend, makers
  });
}

/** The whole transcript object; `structure` pieces are passed in as the serve and story repositories read them. */
export function buildPracticeTranscript(input: Readonly<{
  run: TranscriptRunFacts;
  attempts: readonly TranscriptAttempt[];
  answer: unknown;
  inspection: unknown;
  story: unknown;
  unavailable: readonly string[];
  map?: unknown;
  now?: Date;
}>): PracticeTranscript {
  const bytes = (text: string | null | undefined) => (text === null || text === undefined ? 0 : Buffer.byteLength(text, "utf8"));
  return Object.freeze({
    schema: PRACTICE_TRANSCRIPT_SCHEMA,
    writtenAt: (input.now ?? new Date()).toISOString(),
    run: input.run,
    totals: Object.freeze({
      attempts: input.attempts.length,
      withPrompt: input.attempts.filter((attempt) => attempt.prompt !== null).length,
      withReply: input.attempts.filter((attempt) => attempt.reply !== null).length,
      promptBytes: input.attempts.reduce((sum, attempt) => sum + (attempt.prompt === null ? 0
        : attempt.prompt.messages === null ? bytes(attempt.prompt.text) : bytes(JSON.stringify(attempt.prompt.messages))), 0),
      replyBytes: input.attempts.reduce((sum, attempt) => sum + bytes(attempt.reply?.content), 0)
    }),
    attempts: input.attempts,
    structure: Object.freeze({ answer: input.answer, inspection: input.inspection, story: input.story,
      ...(input.map === undefined ? {} : { map: input.map }) }),
    unavailable: Object.freeze([...input.unavailable])
  });
}

/** The transcript as file text: every string through the named key shapes; what was blanked, by kind. */
export function serializePracticeTranscript(transcript: PracticeTranscript): Readonly<{ text: string; blanked: Readonly<Record<string, number>> }> {
  const blanked: Record<string, number> = {};
  const text = JSON.stringify(transcript, (_key, value: unknown) => {
    if (typeof value === "bigint") return String(value);
    if (typeof value !== "string") return value;
    const checked = redactNamedKeyShapes(value);
    for (const [kind, count] of Object.entries(checked.blanked)) blanked[kind] = (blanked[kind] ?? 0) + count;
    return checked.text;
  });
  return Object.freeze({ text: `${text}\n`, blanked: Object.freeze(blanked) });
}

/** Writes `<directory>/transcript.json` whole or not at all (temporary file in the same folder, then a rename). */
export function writePracticeTranscript(directory: string, transcript: PracticeTranscript): Readonly<{
  path: string; bytes: number; blanked: Readonly<Record<string, number>>;
}> {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, PRACTICE_TRANSCRIPT_FILE);
  const temporary = join(directory, `.${PRACTICE_TRANSCRIPT_FILE}.${randomUUID()}.tmp`);
  const { text, blanked } = serializePracticeTranscript(transcript);
  try {
    writeFileSync(temporary, text, { mode: 0o600, flag: "wx" });
    renameSync(temporary, path);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
  return Object.freeze({ path, bytes: Buffer.byteLength(text, "utf8"), blanked });
}

/**
 * Reads the run back and writes the transcript. Called by practice-debate.ts while the throwaway database (and the
 * run's in-process key) still exist. `answer` and `story` are the projections the practice already read.
 */
export async function recordPracticeTranscript(input: Readonly<{
  pool: Pool;
  directory: string;
  run: TranscriptRunFacts;
  ownerRef: string;
  answer: unknown;
  story: unknown;
  /** Debate shape only: reads the map (practice-shape.ts readPracticeMap). Absent: no structure.map, as today. */
  map?: () => Promise<unknown>;
}>): Promise<ReturnType<typeof writePracticeTranscript> & Readonly<{ attempts: number }>> {
  const makers = new Map(input.run.panel.map((member) => [member.providerRef, member.maker]));
  const attempts = await readTranscriptAttempts(input.pool, input.run.runId, makers);
  const unavailable: string[] = [
    "structure.answer lists only the positions that got a judgement (the site's own reader); every judge, panel and review reply is in attempts"
  ];
  let inspection: unknown = null;
  if (input.run.answerId === null) {
    unavailable.push("structure.answer, structure.inspection, structure.story: the run settled no answer");
  } else {
    try {
      inspection = await new ServeRepository(input.pool).readInspectionProjection(input.run.answerId, { ownerRef: input.ownerRef, legacyAskerId: null } as never);
    } catch (error) {
      unavailable.push(`structure.inspection: ${error instanceof Error ? error.name : "UNKNOWN"}`);
    }
    if (input.answer === null) unavailable.push("structure.answer: the site's reader returned nothing");
    if (input.story === null) unavailable.push("structure.story: no story was stored");
  }
  let map: unknown;
  if (input.map !== undefined) {
    try {
      map = await input.map();
      // Pre-flight PF-D12: a map that fell back still stores its choice (opening TODAYS_OPENING, no answers), so null
      // means no map was stored at all.
      const choice = (map as { choice?: { opening?: unknown } | null }).choice;
      if (choice === null) {
        unavailable.push("structure.map.choice: no map stored (the run never reached the map, or its content was erased)");
      } else if (choice?.opening === "TODAYS_OPENING") {
        unavailable.push("structure.map.choice: the map was unavailable, so it holds no answers and no points also raised");
      }
    } catch (error) {
      map = null;
      unavailable.push(`structure.map: ${error instanceof Error ? error.name : "UNKNOWN"}`);
    }
  }
  const transcript = buildPracticeTranscript({ run: input.run, attempts, answer: input.answer, inspection, story: input.story, unavailable,
    ...(input.map === undefined ? {} : { map }) });
  return Object.freeze({ ...writePracticeTranscript(input.directory, transcript), attempts: attempts.length });
}
