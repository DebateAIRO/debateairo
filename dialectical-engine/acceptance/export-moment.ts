import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname, sep } from "node:path";
import { pathToFileURL } from "node:url";
import type { Pool } from "pg";
import { z } from "zod";
import {
  ContentCipher,
  FileRunContentKeyStore,
  FileUserDekStore,
  configureCustodyGroup,
  loadKekRing
} from "@debateai/crypto";
import {
  RunRepository,
  configureContentEncryption,
  createPool,
  decryptContentForRun,
  readCallPrompt,
  type CryptoEnvelope
} from "@debateai/db";
import { TypedDomainError, debateRoleFromCallSiteKey, isDebateRole, type DebateRole } from "@debateai/kernel";
import type { PromptPacket } from "@debateai/providers";
import { MomentFileSchema, canonicalPromptFingerprint, momentIdFor, type MomentFile } from "@debateai/scorecard";
import {
  assertMomentOutputPathUntracked,
  assertMomentToolRuntime,
  builderFromRecordedPacket,
  captureMomentPacket,
  graderContextOf,
  replyContentOf,
  writePrivateJsonFile
} from "./moment-tools.js";
import { absolutePathOf } from "./untracked-path.js";

/**
 * Model scorecard A18 (spec §2.9) — `pnpm run moment:export`.
 *
 *   --run <runId> --call-site-key <key> --out <file>
 *   --run <runId> --all --out-dir <dir>            [--engine-commit <hex>]
 *
 * Reads ONE recorded model call (or every call of a run) and writes it as a
 * moment file: the exact inputs its prompt builder consumed, the question and
 * excerpts a grader needs, and the reply it recorded. It reads the database and
 * writes files; it never writes the database and never calls a model. Moment
 * files hold private debate text: they are written owner-only (0600), and belong
 * in the private repository (spec §2.9), never in this one. So an output path
 * inside any git checkout must sit under a `.local/` folder (A18 carry 4), and
 * decrypted text goes only into those files, never to stdout or a log line.
 *
 * Environment (no path is assumed): DATABASE_URL; for content-encrypted runs
 * CONTENT_ENCRYPTION_ENABLED=true with KEK_PATH, USER_DEK_STORE_PATH,
 * DEBATEAI_CUSTODY_GROUP and, during a KEK changeover, KEK_PREVIOUS_PATH — the
 * runner's own key settings.
 */

/** One MODEL_CALL ledger row of a call-site key, with the artifact's route when it has one. */
export interface MomentCallRow {
  readonly attemptId: string | null;
  readonly outcome: string;
  readonly contractHash: string;
  readonly modelRole: string | null;
  readonly thinkingLevel: string | null;
  readonly rawArtifactId: string | null;
  readonly providerRef: string | null;
  readonly maker: string | null;
  readonly modelId: string | null;
}

/** What export reads, as a seam: Postgres in production, memory in the unit tests. */
export interface MomentSource {
  readQuestion(runId: string): Promise<string>;
  /** Every MODEL_CALL key of the run, in the order of its first attempt. */
  listCallSiteKeys(runId: string): Promise<readonly string[]>;
  /** The key's MODEL_CALL rows in ledger order. */
  readCallRows(runId: string, callSiteKey: string): Promise<readonly MomentCallRow[]>;
  /** The attempt's recorded prompt, decrypted, or null when none was recorded. */
  readCallPrompt(attemptId: string): Promise<{ readonly promptText: string; readonly promptFingerprint: string } | null>;
  /** The artifact's reply text, decrypted. */
  readReply(runId: string, rawArtifactId: string): Promise<string>;
}

export function createPostgresMomentSource(pool: Pool): MomentSource {
  const runs = new RunRepository(pool);
  return Object.freeze({
    readQuestion: async (runId: string) => (await runs.readFrozenHead(runId)).questionLine,
    listCallSiteKeys: async (runId: string) => (await pool.query<{ call_site_key: string }>(
      `SELECT call_site_key FROM ledger.ledger_entry
        WHERE run_id=$1 AND action_kind='MODEL_CALL' AND call_site_key IS NOT NULL
        GROUP BY call_site_key ORDER BY min(sequence)`,
      [runId]
    )).rows.map((entry) => entry.call_site_key),
    readCallRows: async (runId: string, callSiteKey: string) => (await pool.query<{
      attempt_id: string | null; outcome: string; contract_hash: string; model_role: string | null;
      thinking_level: string | null; raw_artifact_id: string | null; provider_ref: string | null;
      maker: string | null; model_id: string | null;
    }>(
      `SELECT entry.attempt_id::text AS attempt_id, entry.outcome, entry.contract_hash, entry.model_role,
              entry.thinking_level, entry.raw_artifact_ref::text AS raw_artifact_id,
              artifact.provider_ref, artifact.maker, artifact.model_id
         FROM ledger.ledger_entry AS entry
         LEFT JOIN ledger.raw_artifact AS artifact ON artifact.raw_artifact_id = entry.raw_artifact_ref
        WHERE entry.run_id=$1 AND entry.action_kind='MODEL_CALL' AND entry.call_site_key=$2
        ORDER BY entry.sequence`,
      [runId, callSiteKey]
    )).rows.map((entry) => Object.freeze({
      attemptId: entry.attempt_id, outcome: entry.outcome, contractHash: entry.contract_hash,
      modelRole: entry.model_role, thinkingLevel: entry.thinking_level, rawArtifactId: entry.raw_artifact_id,
      providerRef: entry.provider_ref, maker: entry.maker, modelId: entry.model_id
    })),
    readCallPrompt: async (attemptId: string) => {
      const record = await readCallPrompt(pool, attemptId);
      return record === null ? null : { promptText: record.promptText, promptFingerprint: record.promptFingerprint };
    },
    readReply: async (runId: string, rawArtifactId: string) => {
      const artifact = (await pool.query<{ raw_text: string; content_ciphertext: CryptoEnvelope | null }>(
        "SELECT raw_text, content_ciphertext FROM ledger.raw_artifact WHERE run_id=$1 AND raw_artifact_id=$2",
        [runId, rawArtifactId]
      )).rows[0];
      if (artifact === undefined) throw new TypedDomainError("MOMENT_CALL_NOT_FOUND", `artifact ${rawArtifactId}`);
      // Pre-flight fix F4: the artifact holds the whole HTTP body; the moment records the ANSWER.
      return replyContentOf((await decryptContentForRun<{ rawText: string }>(
        pool, runId, "ledger.raw_artifact", rawArtifactId, artifact.content_ciphertext, { rawText: artifact.raw_text }
      )).rawText);
    }
  });
}

const recordedMessagesSchema = z.array(z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string()
}).strict()).min(1);

function recordedMessagesOf(promptText: string, callSiteKey: string): PromptPacket["messages"] {
  try {
    return recordedMessagesSchema.parse(JSON.parse(promptText));
  } catch {
    throw new TypedDomainError("MOMENT_RECORDED_PROMPT_UNREADABLE", `${callSiteKey}: the recorded prompt is not a message list`);
  }
}

function momentRoleOf(recorded: string | null, callSiteKey: string): DebateRole {
  if (recorded !== null && isDebateRole(recorded)) return recorded;
  const parsed = debateRoleFromCallSiteKey(callSiteKey);
  if (parsed === null) {
    throw new TypedDomainError("MOMENT_ROLE_UNRESOLVED", `${callSiteKey} is not a debate role's call`);
  }
  return parsed;
}

export interface MomentExportInput {
  readonly runId: string;
  readonly callSiteKey: string;
  readonly exportedAt: string;
  readonly engineCommit: string | null;
}

/** An attempt that answered: OK, with its artifact and its route (the actor that answered, never the seat marker). */
function answered(entry: MomentCallRow): boolean {
  return entry.outcome === "OK" && entry.rawArtifactId !== null
    && entry.providerRef !== null && entry.maker !== null && entry.modelId !== null;
}

/** The attempt that opened a sequence: its row, its record and the record's messages. */
interface SequenceStart {
  readonly index: number;
  readonly prompt: { readonly promptText: string; readonly promptFingerprint: string };
  readonly messages: PromptPacket["messages"];
}

/** The sequence a moment is exported from, and the row that answered in it (null: none did). */
interface ChosenSequence {
  readonly start: SequenceStart;
  readonly answeredIndex: number | null;
}

/**
 * A18 carry 1 (pre-flight E4), as the controller ruled it in fix round 1 — THE
 * MOMENT IS THE FIRST ANSWER THAT BELONGS TO A RECORDED SEQUENCE. A resumed pass
 * re-authors every site, so one call-site key can carry several different
 * initial packets. An attempt whose prompt record has exactly 2 messages (the
 * frame and one fenced block) STARTS a sequence; a later attempt with no
 * record, or with a repair (more than 2 messages), belongs to the latest start
 * before it. The rows are walked in ledger order, tracking that latest start,
 * and the walk stops at the first answered row that has one: that row is
 * `recorded`, that start gives the builder and the fingerprint. An answered row
 * with no recorded start at or before it (a pass before migration 0072) belongs
 * to no sequence and is passed over. When no recorded sequence answered, the
 * moment is the key's FIRST sequence, with `recorded: null`; with no start at
 * all, null (`MOMENT_INPUTS_NOT_RECORDED`, which `--all` skips). Since the
 * start is always the latest one before the answer, one pass's prompt is never
 * paired with another pass's reply.
 *
 * Strict on purpose (review Minor 2): EVERY record up to the stopping row is
 * read, decrypted and parsed, not only the moment's own. So one bad record in
 * any earlier pass fails this key — and, since its codes are not skippable,
 * the whole `--all` — rather than being passed over unseen. The two ways a
 * record can be bad in shape are both loud: one message (neither an initial
 * packet nor a repair), and a repair with no recorded start before it (review
 * Minor 3, the brief's `MOMENT_INITIAL_PROMPT_UNRECORDED`): the gateway records
 * a call's initial packet before sending it, and builds every repair from that
 * packet, so an orphan repair means a damaged ledger, never a legacy run.
 * Records after the stopping row are never read.
 */
async function chooseSequence(
  source: MomentSource,
  rows: readonly MomentCallRow[],
  callSiteKey: string
): Promise<ChosenSequence | null> {
  let first: SequenceStart | null = null;
  let latest: SequenceStart | null = null;
  for (const [index, entry] of rows.entries()) {
    const prompt = entry.attemptId === null ? null : await source.readCallPrompt(entry.attemptId);
    // No record: this attempt belongs to the latest sequence before it, if any.
    if (prompt !== null) {
      const messages = recordedMessagesOf(prompt.promptText, callSiteKey);
      if (messages.length === 2) {
        latest = Object.freeze({ index, prompt, messages });
        first ??= latest;
      } else if (messages.length > 2) {
        // A repair belongs to the latest sequence before it, and never starts one.
        if (latest === null) {
          throw new TypedDomainError(
            "MOMENT_INITIAL_PROMPT_UNRECORDED",
            `${callSiteKey}: a repair is on record, but the initial packet it was built from is not`
          );
        }
      } else {
        throw new TypedDomainError(
          "MOMENT_RECORDED_PROMPT_UNREADABLE",
          `${callSiteKey}: a recorded prompt of ${String(messages.length)} message is neither an initial packet nor a repair`
        );
      }
    }
    if (answered(entry) && latest !== null) return Object.freeze({ start: latest, answeredIndex: index });
  }
  return first === null ? null : Object.freeze({ start: first, answeredIndex: null });
}

export async function exportMoment(source: MomentSource, input: MomentExportInput): Promise<MomentFile> {
  const rows = await source.readCallRows(input.runId, input.callSiteKey);
  if (rows.length === 0) {
    throw new TypedDomainError("MOMENT_CALL_NOT_FOUND", `run ${input.runId} has no model call at ${input.callSiteKey}`);
  }
  const chosen = await chooseSequence(source, rows, input.callSiteKey);
  if (chosen === null) {
    throw new TypedDomainError(
      "MOMENT_INPUTS_NOT_RECORDED",
      `${input.callSiteKey}: no initial prompt record (a run admitted before migration 0072, or no attempt was sent)`
    );
  }
  const { start } = chosen;
  const { prompt } = start;
  const initial = rows[start.index]!;
  const role = momentRoleOf(initial.modelRole, input.callSiteKey);
  const recordedPacket: PromptPacket = Object.freeze({ messages: start.messages });
  // Self-check 1: the record is its own fingerprint.
  if (canonicalPromptFingerprint(recordedPacket.messages) !== prompt.promptFingerprint) {
    throw new TypedDomainError("MOMENT_FINGERPRINT_INCONSISTENT", `${input.callSiteKey}: the recorded prompt does not match its fingerprint`);
  }
  const builder = builderFromRecordedPacket(role, input.callSiteKey, recordedPacket);
  // Self-check 2: the LIVE builder, fed these inputs, sends this prompt again.
  if (canonicalPromptFingerprint((await captureMomentPacket(builder)).messages) !== prompt.promptFingerprint) {
    throw new TypedDomainError("MOMENT_FINGERPRINT_INCONSISTENT", `${input.callSiteKey}: the live builder does not reproduce the recorded prompt`);
  }
  const accepted = chosen.answeredIndex === null ? undefined : rows[chosen.answeredIndex]!;
  const recorded = accepted === undefined
    ? null
    : {
        providerRef: accepted.providerRef!,
        maker: accepted.maker!,
        modelId: accepted.modelId!,
        thinkingLevel: accepted.thinkingLevel,
        replyText: await source.readReply(input.runId, accepted.rawArtifactId!),
        promptFingerprint: prompt.promptFingerprint
      };
  const momentBuilder = { family: builder.family, inputs: builder.inputs };
  return MomentFileSchema.parse({
    kind: "DEBATEAI_MOMENT",
    formatVersion: 1,
    momentId: momentIdFor({ role, contractHash: initial.contractHash, builder: momentBuilder }),
    role,
    // Fragment note 1: no run records its language today.
    language: null,
    contractHash: initial.contractHash,
    builder: momentBuilder,
    graderContext: graderContextOf(await source.readQuestion(input.runId), builder),
    recorded,
    source: {
      runId: input.runId,
      callSiteKey: input.callSiteKey,
      exportedAt: input.exportedAt,
      engineCommit: input.engineCommit
    }
  });
}

/** A call that cannot be a moment and is skipped by `--all`; anything else is loud. */
const SKIPPABLE_EXPORT_CODES: ReadonlySet<string> = new Set(["MOMENT_INPUTS_NOT_RECORDED", "MOMENT_ROLE_UNRESOLVED"]);

export async function exportRunMoments(
  source: MomentSource,
  input: Omit<MomentExportInput, "callSiteKey">
): Promise<{
  readonly moments: readonly MomentFile[];
  readonly skipped: readonly { readonly callSiteKey: string; readonly code: string }[];
}> {
  const moments: MomentFile[] = [];
  const skipped: { callSiteKey: string; code: string }[] = [];
  for (const callSiteKey of await source.listCallSiteKeys(input.runId)) {
    try {
      moments.push(await exportMoment(source, { ...input, callSiteKey }));
    } catch (error) {
      if (!(error instanceof TypedDomainError) || !SKIPPABLE_EXPORT_CODES.has(error.code)) throw error;
      skipped.push({ callSiteKey, code: error.code });
    }
  }
  return Object.freeze({ moments: Object.freeze(moments), skipped: Object.freeze(skipped) });
}

/** The runner's own content-key bootstrap (`apps/runner/src/main.ts:42-68`), read from this process's environment. */
export function configureMomentContentAccess(pool: Pool, env: Readonly<Record<string, string | undefined>>): void {
  if (env.CONTENT_ENCRYPTION_ENABLED !== "true") return;
  const kekPath = env.KEK_PATH;
  const storePath = env.USER_DEK_STORE_PATH;
  if (kekPath === undefined || kekPath === "" || storePath === undefined || storePath === "") {
    throw new TypedDomainError(
      "MOMENT_CONTENT_KEYS_UNRESOLVED",
      "CONTENT_ENCRYPTION_ENABLED=true needs KEK_PATH and USER_DEK_STORE_PATH"
    );
  }
  configureCustodyGroup(env.DEBATEAI_CUSTODY_GROUP);
  const users = new FileUserDekStore(storePath, loadKekRing(kekPath, env.KEK_PREVIOUS_PATH));
  configureContentEncryption(pool, new ContentCipher(new FileRunContentKeyStore(storePath, users, async (ownerRef) => {
    const resolved = await pool.query<{ user_id: string }>(
      `SELECT user_id FROM identity."user" WHERE owner_ref=$1 AND state='active'`,
      [ownerRef]
    );
    const userId = resolved.rows[0]?.user_id;
    if (userId === undefined) throw new TypeError("OWNER_REF_UNRESOLVED");
    return userId;
  })));
}

export type ExportArguments = Readonly<{
  runId: string;
  target: Readonly<{ kind: "ONE"; callSiteKey: string; outPath: string }> | Readonly<{ kind: "ALL"; outDir: string }>;
  engineCommit: string | null;
}>;

const VALUE_FLAGS = new Set(["--run", "--call-site-key", "--out", "--out-dir", "--engine-commit"]);

/** A leading `--` (pnpm) is ignored; every flag at most once; `--all` takes no value. */
export function parseExportArguments(argv: readonly string[]): ExportArguments {
  const usage = (): never => {
    throw new TypedDomainError(
      "MOMENT_USAGE",
      "moment:export --run <runId> (--call-site-key <key> --out <file> | --all --out-dir <dir>) [--engine-commit <hex>]"
    );
  };
  const tokens = argv[0] === "--" ? argv.slice(1) : argv;
  const values = new Map<string, string>();
  let all = false;
  for (let index = 0; index < tokens.length; index += 1) {
    const flag = tokens[index]!;
    if (flag === "--all") {
      if (all) usage();
      all = true;
      continue;
    }
    const value = tokens[index + 1];
    if (!VALUE_FLAGS.has(flag) || values.has(flag) || value === undefined || value.startsWith("--") || value.trim() === "") usage();
    values.set(flag, value!);
    index += 1;
  }
  const runId = values.get("--run") ?? usage();
  const engineCommit = values.get("--engine-commit") ?? null;
  if (engineCommit !== null && !/^[0-9a-f]{7,64}$/u.test(engineCommit)) usage();
  const callSiteKey = values.get("--call-site-key");
  const outPath = values.get("--out");
  const outDir = values.get("--out-dir");
  if (all) {
    if (callSiteKey !== undefined || outPath !== undefined || outDir === undefined) usage();
    return Object.freeze({ runId, target: Object.freeze({ kind: "ALL" as const, outDir: outDir! }), engineCommit });
  }
  if (callSiteKey === undefined || outPath === undefined || outDir !== undefined) usage();
  return Object.freeze({ runId, target: Object.freeze({ kind: "ONE" as const, callSiteKey: callSiteKey!, outPath: outPath! }), engineCommit });
}

/**
 * Pre-flight fix F26: an `--all` file is named by its moment AND its call site.
 * `momentId` hashes the role, the contract and the builder's inputs, not the
 * call site, so two sites that sent the same prompt share a moment id; naming
 * files by the id alone let the second overwrite the first while the summary
 * still counted both.
 */
export function momentFileNameFor(moment: Readonly<{ momentId: string; source: Readonly<{ callSiteKey: string }> }>): string {
  const siteTag = createHash("sha256").update(moment.source.callSiteKey, "utf8").digest("hex").slice(0, 12);
  return `${moment.momentId}.${siteTag}.moment.json`;
}

/**
 * A file inside the `--out-dir`, joined as a STRING: `join` folds `..` by
 * string rules, so `<link>/..` would name the folder holding the link, not the
 * one above its target where the directory was judged (A18 carry 7).
 */
function fileInside(directory: string, name: string): string {
  return directory.endsWith(sep) ? `${directory}${name}` : `${directory}${sep}${name}`;
}

/**
 * Writes what `args` asks for at `outputPath`, the one string the raw path was
 * judged as: created, written and printed there, never re-derived.
 */
async function writeExport(
  source: MomentSource,
  args: ExportArguments,
  outputPath: string,
  emit: (line: string) => void
): Promise<void> {
  const exportedAt = new Date().toISOString();
  if (args.target.kind === "ONE") {
    const moment = await exportMoment(source, {
      runId: args.runId, callSiteKey: args.target.callSiteKey, exportedAt, engineCommit: args.engineCommit
    });
    await mkdir(dirname(outputPath), { recursive: true, mode: 0o700 });
    await writePrivateJsonFile(outputPath, moment);
    emit(`MOMENT ${moment.role} ${moment.momentId} ${outputPath}`);
    return;
  }
  const exported = await exportRunMoments(source, { runId: args.runId, exportedAt, engineCommit: args.engineCommit });
  // Review Minor 1: the folder is made only once EVERY moment has passed both
  // self-checks, so a loud failure leaves nothing behind — no file, no folder.
  await mkdir(outputPath, { recursive: true, mode: 0o700 });
  for (const moment of exported.moments) {
    await writePrivateJsonFile(fileInside(outputPath, momentFileNameFor(moment)), moment);
    emit(`MOMENT ${moment.role} ${moment.momentId} ${moment.source.callSiteKey}`);
  }
  for (const skip of exported.skipped) emit(`MOMENT SKIPPED ${skip.callSiteKey} ${skip.code}`);
  emit(`MOMENTS WRITTEN ${String(exported.moments.length)} ${outputPath}`);
}

/** Test seams, refused outside NODE_ENV=test: the command line never passes them. */
export interface MomentExportSeams {
  /** Read instead of Postgres at DATABASE_URL. */
  readonly source?: MomentSource;
  /** The repository output paths are judged against (`assertMomentOutputPathUntracked`'s own test seam). */
  readonly repositoryRoot?: string;
}

export async function main(
  argv: readonly string[],
  environment: Readonly<Record<string, string | undefined>> = process.env,
  emit: (line: string) => void = (line) => { process.stdout.write(`${line}\n`); },
  seams: MomentExportSeams = {}
): Promise<void> {
  if (seams.source !== undefined && process.env.NODE_ENV !== "test") {
    throw new TypedDomainError(
      "MOMENT_TOOLS_TEST_ONLY_SOURCE_FORBIDDEN",
      "the in-memory source seam exists for tests; moment:export reads the run from DATABASE_URL"
    );
  }
  assertMomentToolRuntime(environment);
  const args = parseExportArguments(argv);
  const databaseUrl = environment.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl === "") {
    throw new TypedDomainError("MOMENT_DATABASE_URL_REQUIRED", "moment:export reads the run from DATABASE_URL");
  }
  // A18 carries 4 and 7: the RAW path is judged before any database read or key
  // load; from here on it is created, written and printed only as the string
  // `absolutePathOf` makes of it — never `resolve`d, which folds `..` before a
  // link is read and could write somewhere other than the place judged.
  const rawOutput = args.target.kind === "ONE" ? args.target.outPath : args.target.outDir;
  assertMomentOutputPathUntracked(rawOutput, args.target.kind === "ONE" ? "file" : "directory", seams.repositoryRoot);
  const outputPath = absolutePathOf(rawOutput);
  if (seams.source !== undefined) {
    await writeExport(seams.source, args, outputPath, emit);
    return;
  }
  const pool = createPool(databaseUrl);
  try {
    configureMomentContentAccess(pool, environment);
    await writeExport(createPostgresMomentSource(pool), args, outputPath, emit);
  } finally {
    await pool.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    const code = typeof (error as { code?: unknown } | null)?.code === "string" ? (error as { code: string }).code : null;
    process.stderr.write(`${code ?? (error instanceof Error ? error.message : "MOMENT_EXPORT_FAILED")}\n`);
    process.exitCode = 1;
  });
}
