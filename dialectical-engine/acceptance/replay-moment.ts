import { appendFile, mkdir, readFile, stat, truncate } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { TypedDomainError } from "@debateai/kernel";
import {
  OpenAICompatibleProviderGateway,
  estimatePromptTokens,
  estimateWindowTokens,
  type CallBound,
  type PromptPacket,
  type ProviderGateway,
  type RawArtifactInput
} from "@debateai/providers";
import {
  MomentFileSchema,
  ReplayResultSchema,
  canonicalPromptFingerprint,
  type MomentFile,
  type ReplayOutcome,
  type ReplayResult
} from "@debateai/scorecard";
import {
  assertMomentOutputPathUntracked,
  assertMomentToolRuntime,
  captureMomentPacket,
  currentContractHash,
  invokeMomentBuilder,
  parseMomentBuilder,
  replayOutcomeOf,
  replyContentOf
} from "./moment-tools.js";
import { absolutePathOf } from "./untracked-path.js";

/**
 * Model scorecard A18 (spec §2.9/§2.10) — `pnpm run moment:replay`.
 *
 *   --endpoints <file> --jobs <jobs.jsonl> --out <results.jsonl> --bound <maxAttempts>,<tokenCeiling>,<deadlineMs>
 *
 * Sends each job's moment — rebuilt by the SAME builder the live runner uses —
 * to one candidate (a route of the endpoints file `relays:serve` writes, at one
 * thinking level) and appends one replay result per job. It writes nothing to
 * any database: the gateway's ledger and artifact sinks are in memory. It is
 * resumable (a job whose result in the out file is final is skipped; a
 * USAGE_CAP or TIMED_OUT result is asked again, and a cap stops the batch —
 * pre-flight ruling F25) and refuses a hosted deployment before it reads
 * anything. A result carries the model's answer to private debate text, so the
 * out file is owner-only (0600) and, inside any git checkout, must sit under a
 * `.local/` folder (A18 carry 4); a reply is recorded only when it is the
 * model's own answer (carry 6), never a vendor's error body.
 */

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** Debate text leaves this process only over TLS or to this machine. */
function isReplayEndpointUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return parsed.protocol === "https:" || (parsed.protocol === "http:" && LOOPBACK_HOSTS.has(parsed.hostname));
}

const endpointSchema = z.object({
  providerRef: z.string().min(1),
  maker: z.string().min(1),
  tool: z.string().min(1),
  modelId: z.string().min(1),
  baseUrl: z.string().refine(isReplayEndpointUrl),
  bearerToken: z.string().min(1),
  thinkingLevels: z.array(z.string().min(1)),
  contextWindowTokens: z.number().int().positive().nullable()
}).strict();
export const ReplayEndpointsFileSchema = z.object({ relays: z.array(endpointSchema).min(1) }).strict();
export type ReplayEndpoint = z.infer<typeof endpointSchema>;

export const ReplayJobSchema = z.object({
  /** Relative to the jobs file's own directory, or absolute. */
  momentFile: z.string().min(1),
  providerRef: z.string().min(1),
  thinkingLevel: z.string().min(1)
}).strict();
export type ReplayJob = z.infer<typeof ReplayJobSchema>;

/** The relays declare their level on this member (relay fragment A12, `DEVELOPMENT_RELAY_THINKING_PARAMETER`). */
const RELAY_THINKING_PARAMETER = "x_thinking_level" as const;

const isMissing = (error: unknown): boolean => (error as { code?: unknown } | null)?.code === "ENOENT";

export async function readReplayEndpoints(path: string): Promise<ReadonlyMap<string, ReplayEndpoint>> {
  const invalid = (): TypedDomainError => new TypedDomainError("MOMENT_REPLAY_ENDPOINTS_INVALID", `${path} is not a relay endpoints file`);
  let mode: number;
  try {
    mode = (await stat(path)).mode;
  } catch {
    throw invalid();
  }
  if ((mode & 0o077) !== 0) {
    throw new TypedDomainError("MOMENT_REPLAY_ENDPOINTS_EXPOSED", `${path} holds relay bearers; make it owner-only (chmod 600)`);
  }
  let relays: readonly ReplayEndpoint[];
  try {
    // The parse error is dropped on purpose: it could quote a bearer.
    relays = ReplayEndpointsFileSchema.parse(JSON.parse(await readFile(path, "utf8"))).relays;
  } catch {
    throw invalid();
  }
  const byRef = new Map<string, ReplayEndpoint>();
  for (const relay of relays) {
    if (byRef.has(relay.providerRef)) throw invalid();
    byRef.set(relay.providerRef, Object.freeze(relay));
  }
  return byRef;
}

export async function readReplayJobs(path: string): Promise<readonly ReplayJob[]> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    throw new TypedDomainError("MOMENT_REPLAY_JOBS_INVALID", `${path} cannot be read`);
  }
  const jobs: ReplayJob[] = [];
  for (const [index, line] of text.split("\n").entries()) {
    if (line.trim() === "") continue;
    try {
      jobs.push(ReplayJobSchema.parse(JSON.parse(line)));
    } catch {
      throw new TypedDomainError("MOMENT_REPLAY_JOBS_INVALID", `${path}:${String(index + 1)}`);
    }
  }
  if (jobs.length === 0) throw new TypedDomainError("MOMENT_REPLAY_JOBS_INVALID", `${path} holds no job`);
  return jobs;
}

/**
 * A moment file, read whole: the schema (its id included), then its builder
 * against its role (A18 carries 3 and 8, pre-flight E11). A moment whose role
 * names another family than its builder's, or a JUDGE_JUDGE leg that does
 * another debate job than its role, is refused `MOMENT_FILE_INVALID`: a
 * synthesis request rebuilt from recorded data can never fall through to the
 * checker's contract, and no result is filed under an id naming another role.
 */
export async function readMomentFile(path: string): Promise<MomentFile> {
  let moment: MomentFile;
  try {
    moment = MomentFileSchema.parse(JSON.parse(await readFile(path, "utf8")));
  } catch {
    throw new TypedDomainError("MOMENT_FILE_INVALID", `${path} is not a moment file`);
  }
  try {
    parseMomentBuilder(moment.builder, moment.role);
  } catch (error) {
    // The builder's own code (a role mismatch is MOMENT_FILE_INVALID), with the file named.
    if (error instanceof TypedDomainError) throw new TypedDomainError(error.code, `${path}: ${error.message}`);
    throw error;
  }
  return moment;
}

export function replayJobKey(momentId: string, providerRef: string, thinkingLevel: string): string {
  return JSON.stringify([momentId, providerRef, thinkingLevel]);
}

/**
 * The jobs already answered in `outPath`. A last line without its newline is a
 * record a crash tore: it is cut off, and its job runs again.
 */
export async function readCompletedReplayKeys(outPath: string): Promise<Set<string>> {
  let text: string;
  try {
    text = await readFile(outPath, "utf8");
  } catch (error) {
    if (isMissing(error)) return new Set();
    throw new TypedDomainError("MOMENT_REPLAY_RESULTS_UNREADABLE", `${outPath} cannot be read`);
  }
  if (((await stat(outPath)).mode & 0o077) !== 0) {
    throw new TypedDomainError("MOMENT_REPLAY_RESULTS_EXPOSED", `${outPath} holds replies to private moments; make it owner-only (chmod 600)`);
  }
  const complete = text.slice(0, text.lastIndexOf("\n") + 1);
  if (complete.length < text.length) await truncate(outPath, Buffer.byteLength(complete, "utf8"));
  const done = new Set<string>();
  for (const [index, line] of complete.split("\n").entries()) {
    if (line.trim() === "") continue;
    let result: ReplayResult;
    try {
      result = ReplayResultSchema.parse(JSON.parse(line));
    } catch {
      throw new TypedDomainError("MOMENT_REPLAY_RESULTS_UNREADABLE", `${outPath}:${String(index + 1)}`);
    }
    // Pre-flight ruling F25: a cap or a timeout is not an answer; the job is asked again.
    if (RETRYABLE_REPLAY_OUTCOMES.has(result.outcome)) continue;
    done.add(replayJobKey(result.momentId, result.candidate.providerRef, result.candidate.thinkingLevel));
  }
  return done;
}

/** Outcomes that describe a moment in time, not the candidate: never "done" (pre-flight ruling F25). */
const RETRYABLE_REPLAY_OUTCOMES: ReadonlySet<ReplayOutcome> = new Set<ReplayOutcome>(["USAGE_CAP", "TIMED_OUT"]);

/**
 * A18 carry 6 (pre-flight R4) — the outcomes whose last body is the MODEL'S OWN
 * answer: accepted, or refused by the live classification. Every other body is
 * a relay's or a vendor's (an error page, a cap notice, an answer at an
 * unconfirmed level), and a vendor's error body can echo a key fragment, so it
 * never reaches a results file: `replyText` is null.
 */
const ANSWERED_REPLAY_OUTCOMES: ReadonlySet<ReplayOutcome> = new Set<ReplayOutcome>(["OK", "REFUSED"]);

function usageCounter(usage: unknown, key: string): number | null {
  if (typeof usage !== "object" || usage === null || Array.isArray(usage)) return null;
  const value = (usage as Readonly<Record<string, unknown>>)[key];
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** What the relay REPORTED (a CLI adds its own ~14-18k of input: never money, M4) and the thinking it counted. */
function usageOf(artifact: RawArtifactInput | undefined): ReplayResult["usage"] {
  const usage = artifact?.metadata.usage;
  return {
    reportedInputTokens: usageCounter(usage, "prompt_tokens"),
    outputTokens: usageCounter(usage, "completion_tokens"),
    thinkingTokens: artifact?.thinkingTokens ?? null
  };
}

export interface ReplayMomentInput {
  readonly moment: MomentFile;
  readonly endpoint: ReplayEndpoint;
  readonly thinkingLevel: string;
  readonly bound: CallBound;
  readonly fetchImplementation?: typeof fetch;
  readonly sleepImplementation?: (milliseconds: number) => Promise<void>;
  readonly now?: () => Date;
  /** Milliseconds, monotonic. */
  readonly clock?: () => number;
}

export async function replayMoment(input: ReplayMomentInput): Promise<ReplayResult> {
  const now = input.now ?? (() => new Date());
  const clock = input.clock ?? (() => performance.now());
  // A18 carry 8: with the moment's role, so a role and builder that disagree are refused before anything is built.
  const builder = parseMomentBuilder(input.moment.builder, input.moment.role);
  const offline = await captureMomentPacket(builder);
  const offlineFingerprint = canonicalPromptFingerprint(offline.messages);
  const recordedFingerprint = input.moment.recorded?.promptFingerprint ?? null;
  const promptTokensEstimate = estimatePromptTokens(offline.messages);
  const fixed = {
    kind: "DEBATEAI_REPLAY_RESULT" as const,
    formatVersion: 1 as const,
    momentId: input.moment.momentId,
    candidate: {
      providerRef: input.endpoint.providerRef,
      maker: input.endpoint.maker,
      modelId: input.endpoint.modelId,
      thinkingLevel: input.thinkingLevel
    },
    promptTokensEstimate,
    contractHashMatches: currentContractHash(builder.family) === input.moment.contractHash,
    startedAt: now().toISOString()
  };
  const matches = (fingerprint: string): boolean | null =>
    recordedFingerprint === null ? null : fingerprint === recordedFingerprint;
  // §2.10: the gateway's own wall (R1: estimateWindowTokens), checked before a byte leaves.
  const window = input.endpoint.contextWindowTokens;
  if (window !== null && estimateWindowTokens(offline.messages) + input.bound.tokenCeiling > window) {
    return ReplayResultSchema.parse({
      ...fixed,
      outcome: "CONTEXT_TOO_LARGE",
      replyText: null,
      parsed: null,
      usage: { reportedInputTokens: null, outputTokens: null, thinkingTokens: null },
      seconds: 0,
      promptFingerprint: offlineFingerprint,
      fingerprintMatchesRecorded: matches(offlineFingerprint)
    });
  }
  const artifacts: RawArtifactInput[] = [];
  const sent: PromptPacket[] = [];
  const http = new OpenAICompatibleProviderGateway({
    endpoint: input.endpoint.baseUrl,
    model: input.endpoint.modelId,
    maker: input.endpoint.maker,
    authorizationHeader: `Bearer ${input.endpoint.bearerToken}`,
    // In memory, never a database: a replay is not a run.
    assertNoOpenWriteTransaction: () => undefined,
    persistRawArtifact: async (artifact) => {
      artifacts.push(artifact);
      return artifact.artifactId;
    },
    appendLedgerEntry: async (entry) => entry.attemptId,
    ...(input.endpoint.thinkingLevels.length === 0
      ? {}
      : { thinking: { parameter: RELAY_THINKING_PARAMETER, levels: input.endpoint.thinkingLevels } }),
    ...(window === null ? {} : { contextWindowTokens: window }),
    ...(input.fetchImplementation === undefined ? {} : { fetchImplementation: input.fetchImplementation }),
    ...(input.sleepImplementation === undefined ? {} : { sleepImplementation: input.sleepImplementation })
  });
  const gateway: ProviderGateway = {
    call: (request) => {
      if (sent.length === 0) sent.push(request.packet);
      return http.call({ ...request, thinkingLevel: input.thinkingLevel });
    }
  };
  const started = clock();
  let outcome: ReplayOutcome = "OK";
  let parsed: unknown = null;
  try {
    parsed = await invokeMomentBuilder(builder, gateway, {
      providerRef: input.endpoint.providerRef,
      bound: input.bound,
      callSiteKey: input.moment.source.callSiteKey,
      contractHash: input.moment.contractHash,
      subjectItemId: `moment:${input.moment.momentId}`
    });
  } catch (error) {
    outcome = replayOutcomeOf(error);
  }
  const seconds = Math.max(0, Math.round(clock() - started)) / 1000;
  const sentPacket = sent[0];
  const promptFingerprint = sentPacket === undefined ? offlineFingerprint : canonicalPromptFingerprint(sentPacket.messages);
  if (promptFingerprint !== offlineFingerprint) {
    throw new TypedDomainError(
      "MOMENT_FINGERPRINT_INCONSISTENT",
      `${input.moment.momentId}: the packet sent is not the packet the builder produced offline`
    );
  }
  const last = artifacts.at(-1);
  return ReplayResultSchema.parse({
    ...fixed,
    outcome,
    // Pre-flight fix F4: the answer, not the vendor's HTTP envelope; carry 6: only the model's own.
    replyText: last === undefined || !ANSWERED_REPLAY_OUTCOMES.has(outcome) ? null : replyContentOf(last.rawText),
    parsed: outcome === "OK" ? parsed : null,
    usage: usageOf(last),
    seconds,
    promptFingerprint,
    fingerprintMatchesRecorded: matches(promptFingerprint)
  });
}

export interface ReplayMomentsOptions {
  readonly endpointsPath: string;
  readonly jobsPath: string;
  readonly outPath: string;
  readonly bound: CallBound;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly fetchImplementation?: typeof fetch;
  readonly sleepImplementation?: (milliseconds: number) => Promise<void>;
  readonly now?: () => Date;
  readonly clock?: () => number;
  readonly emit?: (line: string) => void;
  /**
   * Test seam only: the repository `outPath` is judged against
   * (`assertMomentOutputPathUntracked`'s own seam, which refuses it outside
   * NODE_ENV=test). The command line never passes it.
   */
  readonly repositoryRoot?: string;
}

export async function replayMoments(options: ReplayMomentsOptions): Promise<{ readonly replayed: number; readonly alreadyDone: number }> {
  assertMomentToolRuntime(options.environment);
  // A18 carries 4 and 7 (pre-flight R6): the RAW `--out` is judged before the
  // endpoints file is read and before any call. From here on it is read,
  // truncated, created and appended to only as the string `absolutePathOf`
  // makes of it — never `resolve`d, which folds `..` before a link is read and
  // could write somewhere other than the place judged.
  assertMomentOutputPathUntracked(options.outPath, "file", options.repositoryRoot);
  const outPath = absolutePathOf(options.outPath);
  const emit = options.emit ?? ((line: string) => { process.stdout.write(`${line}\n`); });
  const endpoints = await readReplayEndpoints(resolve(options.endpointsPath));
  const jobsPath = resolve(options.jobsPath);
  const jobs = await readReplayJobs(jobsPath);
  // Every route is known before the first call, so a typo never costs a partial batch.
  const unknown = jobs.find((job) => !endpoints.has(job.providerRef));
  if (unknown !== undefined) {
    throw new TypedDomainError("MOMENT_REPLAY_ENDPOINT_UNKNOWN", `${unknown.providerRef} is not in the endpoints file`);
  }
  // So is every moment, its role checked against its builder (carry 3): a bad
  // file anywhere in the jobs stops the batch before anyone is asked.
  const momentPathOf = (job: ReplayJob): string => resolve(dirname(jobsPath), job.momentFile);
  const moments = new Map<string, MomentFile>();
  for (const job of jobs) {
    const momentPath = momentPathOf(job);
    if (!moments.has(momentPath)) moments.set(momentPath, await readMomentFile(momentPath));
  }
  const done = await readCompletedReplayKeys(outPath);
  // Its folder, owner-only, before the first call: a paid answer must never be lost to a missing folder.
  await mkdir(dirname(outPath), { recursive: true, mode: 0o700 });
  let replayed = 0;
  let alreadyDone = 0;
  for (const job of jobs) {
    const moment = moments.get(momentPathOf(job))!;
    const key = replayJobKey(moment.momentId, job.providerRef, job.thinkingLevel);
    if (done.has(key)) {
      alreadyDone += 1;
      continue;
    }
    const result = await replayMoment({
      moment,
      endpoint: endpoints.get(job.providerRef)!,
      thinkingLevel: job.thinkingLevel,
      bound: options.bound,
      ...(options.fetchImplementation === undefined ? {} : { fetchImplementation: options.fetchImplementation }),
      ...(options.sleepImplementation === undefined ? {} : { sleepImplementation: options.sleepImplementation }),
      ...(options.now === undefined ? {} : { now: options.now }),
      ...(options.clock === undefined ? {} : { clock: options.clock })
    });
    await appendFile(outPath, `${JSON.stringify(result)}\n`, { encoding: "utf8", mode: 0o600 });
    done.add(key);
    replayed += 1;
    emit(`REPLAYED ${moment.momentId} ${job.providerRef} ${job.thinkingLevel} ${result.outcome}`);
    // Pre-flight ruling F25: a subscription at its cap answers nothing more for now, so the
    // batch stops here, its result written; a rerun resumes and asks this job again.
    if (result.outcome === "USAGE_CAP") {
      emit(`MOMENT_REPLAY_USAGE_CAP ${job.providerRef}`);
      throw new TypedDomainError(
        "MOMENT_REPLAY_USAGE_CAP",
        `${job.providerRef} reached its subscription usage cap; the batch stops here and a rerun resumes where it stopped`
      );
    }
  }
  emit(`REPLAY DONE replayed=${String(replayed)} already=${String(alreadyDone)}`);
  return Object.freeze({ replayed, alreadyDone });
}

const REPLAY_FLAGS = new Set(["--endpoints", "--jobs", "--out", "--bound"]);

/** A leading `--` (pnpm) is ignored; each flag exactly once. */
export function parseReplayArguments(argv: readonly string[]): Readonly<{
  endpointsPath: string;
  jobsPath: string;
  outPath: string;
  bound: CallBound;
}> {
  const usage = (): never => {
    throw new TypedDomainError(
      "MOMENT_USAGE",
      "moment:replay --endpoints <file> --jobs <jobs.jsonl> --out <results.jsonl> --bound <maxAttempts>,<tokenCeiling>,<deadlineMs>"
    );
  };
  const tokens = argv[0] === "--" ? argv.slice(1) : argv;
  const values = new Map<string, string>();
  for (let index = 0; index < tokens.length; index += 2) {
    const flag = tokens[index]!;
    const value = tokens[index + 1];
    if (!REPLAY_FLAGS.has(flag) || values.has(flag) || value === undefined || value.startsWith("--") || value.trim() === "") usage();
    values.set(flag, value!);
  }
  const bound = /^([1-9][0-9]{0,2}),([1-9][0-9]{0,6}),([1-9][0-9]{0,7})$/u.exec(values.get("--bound") ?? "") ?? usage();
  return Object.freeze({
    endpointsPath: values.get("--endpoints") ?? usage(),
    jobsPath: values.get("--jobs") ?? usage(),
    outPath: values.get("--out") ?? usage(),
    bound: Object.freeze({ maxAttempts: Number(bound[1]), tokenCeiling: Number(bound[2]), deadlineMs: Number(bound[3]) })
  });
}

export async function main(
  argv: readonly string[],
  environment: Readonly<Record<string, string | undefined>> = process.env
): Promise<void> {
  assertMomentToolRuntime(environment);
  await replayMoments({ ...parseReplayArguments(argv), environment });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    const code = typeof (error as { code?: unknown } | null)?.code === "string" ? (error as { code: string }).code : null;
    process.stderr.write(`${code ?? (error instanceof Error ? error.message : "MOMENT_REPLAY_FAILED")}\n`);
    process.exitCode = 1;
  });
}
