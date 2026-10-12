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
import type { AskRequest } from "@debateai/contract";
import { ContentCipher, generateDek, MemoryRunContentKeyStore, type KeyDestroyResult, type ReadableUserDekStore } from "@debateai/crypto";
import { configureContentEncryption, decryptContentForRun, migrate, readCallPrompt } from "@debateai/db";
import type { Session } from "@debateai/contract";
import { PREVIEW_PROVIDER_REF_MODELS, previewModelRow, type PreviewBudgetPorts, type PreviewGateRemaining } from "@debateai/providers";
import { ServeRepository } from "@debateai/serve";
import { StoryRepository } from "@debateai/story";
import { previewCallNanoUsd } from "../../apps/api/src/preview-budget-estimate.js";
import { composePracticeAsk, practiceRemainingPorts } from "./practice-ask-composition.js";
import type { PracticeGateName, PracticeGateObserver } from "./practice-gate-observer.js";
import {
  callFamilyOf,
  issueListFromParseError,
  practiceFinishReasonOf,
  practiceJsonRepairOf,
  practiceReplyFormOf,
  recheckReply,
  replyContentOf
} from "./practice-lanes.js";
import { practiceQuestion } from "./practice-questions.js";
import { reportableReplyText } from "./practice-redaction.js";
import {
  importPracticeRegister,
  type PracticeNextRegisterVersion,
  type PracticeRegisterExport,
  type PracticeRegisterImportReceipt
} from "./practice-register-import.js";
import { composePracticeRunner } from "./practice-runner-composition.js";
import type { PracticeSettings, PracticeSockets } from "./practice-settings.js";
import { startPracticeDatabase, type PracticeDatabase } from "./practice-throwaway-db.js";
import { recordPracticeTranscript } from "./practice-transcript.js";
import {
  latencySummary,
  practiceCallFacts,
  practiceModelCalls,
  practiceRepairKindsByModel,
  type LatencySummary,
  type PracticeCallTry,
  type PracticeModelCalls,
  type PracticeRepairKinds,
  type PracticeReplyForm
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
  failedCalls: number;
  refusedCalls: number;
  remaining: Readonly<Record<PracticeGateName, Readonly<{ before: PreviewGateRemaining | null; after: PreviewGateRemaining | null }>>>;
  seconds: Readonly<{ admission: number; debate: number }>;
  /**
   * `--transcript` only: where transcript.json went, how many calls it holds, and what the key-shape safety net
   * blanked (by kind; empty when nothing). `error` names why it could not be written. Not part of report.json.
   */
  transcript?: Readonly<{ path: string | null; attempts: number; bytes: number; blanked: Readonly<Record<string, number>>; error: string | null }>;
}>;

const ROSTER_ORDER = Object.freeze(["JUDGE", "PANEL", "REVIEW", "SYNTHESIZER", "EVALUATOR", "STORYTELLER", "STORY_CHECKER", "UNMAPPED"]);

function modelOfRef(providerRef: string): string {
  return PREVIEW_PROVIDER_REF_MODELS[providerRef] ?? `unreviewed:${providerRef}`;
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
async function collect(pool: Pool, runId: string): Promise<Pick<PracticeDebateResult, "byModelAndSite" | "failures" | "formatFailures"
  | "callsByModel" | "repairKindsByModel" | "answersByModel" | "jsonRepairs" | "failedCalls" | "refusedCalls">> {
  const entries = (await pool.query<{ sequence: string; attempt_id: string | null; call_site_key: string; actor_ref: string; outcome: string;
    started_at: Date; finished_at: Date; raw_artifact_ref: string | null }>(
    `SELECT sequence::text, attempt_id::text, call_site_key, actor_ref, outcome, started_at, finished_at, raw_artifact_ref::text
       FROM ledger.ledger_entry WHERE run_id=$1 AND action_kind='MODEL_CALL' ORDER BY sequence`, [runId])).rows;
  const artifacts = new Map((await pool.query<{ raw_artifact_id: string; parse_status: string; metadata_json: unknown;
    raw_text: string; content_ciphertext: unknown }>(
    `SELECT raw_artifact_id::text, parse_status, metadata_json, raw_text, content_ciphertext
       FROM ledger.raw_artifact WHERE run_id=$1`, [runId])).rows.map((row) => [row.raw_artifact_id, row]));
  type Bucket = { model: string; providerRef: string; site: string; calls: number; outcomes: Record<string, number>;
    parse: Record<string, number>; latencies: number[]; input: number; output: number; cost: bigint };
  const buckets = new Map<string, Bucket>();
  const failures: PracticeFailure[] = [];
  let failedCalls = 0;
  let refusedCalls = 0;
  // Owner ruling 2026-10-12 ("Fixed slips = warning"): a call is one step on one maker (its call-site key and its actor)
  // with all its tries, in ledger order: its format repair, its one resend after an unbilled refusal, the final retry.
  const calls = new Map<string, { model: string; tries: PracticeCallTry[] }>();
  const jsonRepairs: { model: string; repair: string }[] = [];
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
  const replyFormOf = async (attemptId: string | null): Promise<PracticeReplyForm | null> => {
    if (attemptId === null) return null;
    const prompt = await readCallPrompt(pool, attemptId);
    if (prompt === null) return null;
    const messages = JSON.parse(prompt.promptText) as unknown;
    return Array.isArray(messages) ? practiceReplyFormOf(messages as Parameters<typeof practiceReplyFormOf>[0]) : null;
  };
  for (const entry of entries) {
    const model = modelOfRef(entry.actor_ref);
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
      if (row !== undefined) bucket.cost += previewCallNanoUsd(row, BigInt(usage.input), usage.output);
    }
    const formatFailed = parseStatus === "PARSE_FAILED" || parseStatus === "SCHEMA_FAILED" || parseStatus === "UNPARSED";
    if (entry.outcome === "REFUSED") refusedCalls += 1;
    else if (entry.outcome !== "OK" && !formatFailed) failedCalls += 1;
    const callKey = `${entry.actor_ref}\u0000${entry.call_site_key}`;
    const call = calls.get(callKey) ?? { model, tries: [] };
    calls.set(callKey, call);
    const replyForm = await replyFormOf(entry.attempt_id);
    call.tries.push(Object.freeze({ outcome: entry.outcome, parseStatus: artifact === undefined ? null : parseStatus, replyForm }));
    if (entry.outcome === "OK" && artifact !== undefined) {
      const stored = await readContent(entry.raw_artifact_ref!, artifact);
      const repair = practiceJsonRepairOf(replyContentOf(stored.rawText), practiceFinishReasonOf(artifact.metadata_json));
      if (repair !== null) jsonRepairs.push(Object.freeze({ model, repair }));
    }
    if (formatFailed && artifact !== undefined) {
      const stored = await readContent(entry.raw_artifact_ref!, artifact);
      const content = replyContentOf(stored.rawText);
      failures.push(Object.freeze({
        sequence: Number(entry.sequence), model, providerRef: entry.actor_ref, callSiteKey: entry.call_site_key, parseStatus,
        issues: issueListFromParseError(stored.parseErrorDetail),
        recheckIssues: replyForm === "PATCH" ? [] : recheckReply(entry.call_site_key, content).issues,
        replyForm, latencyMs, replyText: reportableReplyText(content), fixedBySameCall: false
      }));
    }
  }
  const callList = [...calls.entries()];
  const formatFailures = callList.filter(([, call]) => practiceCallFacts(call.tries).unrecovered).length;
  const answersByModel: Record<string, { answered: number; unanswered: number }> = {};
  for (const [, call] of callList) {
    const mine = answersByModel[call.model] ??= { answered: 0, unanswered: 0 };
    if (practiceCallFacts(call.tries).answered) mine.answered += 1; else mine.unanswered += 1;
  }
  // A wrong-format reply whose call was answered later (same step, same maker): fixed by the same call.
  const answeredKeys = new Set(callList.filter(([, call]) => practiceCallFacts(call.tries).answered).map(([key]) => key));
  const fixed = failures.map((failure) => Object.freeze({ ...failure,
    fixedBySameCall: answeredKeys.has(`${failure.providerRef}\u0000${failure.callSiteKey}`) }));
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
    jsonRepairs: Object.freeze(jsonRepairs), failedCalls, refusedCalls };
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
  /** Test seams: the runner's cooldown hold and the preview policy's resend wait. */
  wait?: (milliseconds: number) => Promise<void>;
  sleep?: (milliseconds: number) => Promise<void>;
  progress?: (line: string) => void;
  /** `--transcript`: the folder transcript.json is written to, before the throwaway database is deleted; null: none. */
  transcriptDirectory?: string | null;
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
    const settings: PracticeSettings = receipt.codeNext === undefined ? input.settings
      : Object.freeze({ ...input.settings, runner: Object.freeze({ ...input.settings.runner, REGISTER_VERSION: nextVersion }) });
    progress(receipt.codeNext === undefined ? `register imported up to version ${receipt.registerVersion}`
      : `register imported up to live version ${liveVersion}; practising on this code's next version ${receipt.registerVersion}`
        + ` (changed: ${receipt.codeNext.changedKeys.join(", ") || "none"}; added: ${receipt.codeNext.addedKeys.join(", ") || "none"})`);
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
      dispatcher: { dispatch: async (job) => { dispatched.push({ ...job }); } }, log: progress
    });
    const runner = await composePracticeRunner({ pool, environment: settings.runner, budgetPorts: input.budgetPorts,
      ...(input.wait === undefined ? {} : { wait: input.wait }), ...(input.sleep === undefined ? {} : { sleep: input.sleep }) });
    const question = practiceQuestion(input.questionId);
    const request = {
      question_line: question.questionLine, risk_tier: "casual", tier_source: "ASKER",
      tier_provenance_ref: "asker-declaration:preview-practice", composition_budget_tier: "high", plan_tier: "premium",
      depth_params: { depth: input.depth }, decision_scope: "preview practice", as_of: new Date().toISOString(),
      steering_presets: [], steering_annotations: []
    } as unknown as AskRequest;
    const session = { asker_id: `owner:${ownerRef}`, session_id: sessionId, caller_scope: "ASKER",
      ownership_provenance: "server_session", provisional_identity_model: false } as Session;
    const admissionStarted = performance.now();
    let refusalCode: string | null = null;
    try {
      await ask.application.submit(request, session, { kind: "server", userId, ownerRef });
    } catch (error) {
      refusalCode = codeOf(error);
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
        register: receipt, questionId: question.id, depth: input.depth,
        admission: { admitted: false, refusalCode: refusalCode ?? "NOT_DISPATCHED", panel: [], satOut: [], rotation: null },
        run: { runId: null, workItemOutcome: null, failureCode: null, answer: null, story: null },
        byModelAndSite: [], probes, failures: [], formatFailures: 0, callsByModel: {}, repairKindsByModel: {}, answersByModel: {}, jsonRepairs: [],
        failedCalls: 0, refusedCalls: 0,
        remaining, seconds: { admission: admissionSeconds, debate: 0 }
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
          run: Object.freeze({
            runId: job.runId, question: Object.freeze({ id: question.id, text: question.questionLine }), depth: input.depth,
            registerVersion: receipt.registerVersion, panel: panelFacts, satOut: Object.freeze(satOut), rotation,
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
    const collected = await collect(pool, job.runId);
    remaining.deepinfra.after = await readRemaining(remainingPorts.deepinfra);
    remaining.anthropic.after = await readRemaining(remainingPorts.anthropic);
    return Object.freeze({
      register: receipt, questionId: question.id, depth: input.depth,
      admission: Object.freeze({
        admitted: true, refusalCode: null,
        panel: panelFacts,
        satOut: Object.freeze(satOut),
        rotation
      }),
      run: Object.freeze({ runId: job.runId, workItemOutcome, failureCode, answer, story }),
      ...collected, probes: Object.freeze(probes), remaining,
      seconds: Object.freeze({ admission: admissionSeconds, debate: debateSeconds }),
      ...(transcript === undefined ? {} : { transcript })
    });
  } finally {
    remaining.deepinfra.after ??= await readRemaining(remainingPorts.deepinfra);
    remaining.anthropic.after ??= await readRemaining(remainingPorts.anthropic);
    await database?.stop();
  }
}
