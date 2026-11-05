import { randomBytes as cryptoRandomBytes } from "node:crypto";
import {
  PathOutcomeSchema, TrustWordSchema, cutQuoteAtWordEdge, pathTrustWordOf, type PathOutcome, type TrustWord
} from "@debateai/contract";
import type { PathResultsStore } from "@debateai/db";
import {
  TypedDomainError, questionLanguageFromRun, replyLanguageCheckFor, withQuestionLanguageField, withReaderField, type PathId, type QuestionLanguage,
  type ReadingLevel
} from "@debateai/kernel";
import {
  PREVIEW_V2_FINAL_SEATS, buildFramedPrompt, type FramedMaterialField, type PromptContract, type ProviderCallRequest, type ProviderCallResult,
  type ProviderGateway, type TokenCounter
} from "@debateai/providers";
import { PATH_REWRITE_POLICY, pathRunInvestigations, type EngineSettings } from "@debateai/register";
import {
  PATH_OUTCOME_CHECKER_PROSE, PATH_OUTCOME_PROSE, pathOutcomeContractsFor, pathOutcomeOrdinaryRefWordsOf, writePathOutcome, type PathOutcomeDraft,
  type PathOutcomeIndex
} from "@debateai/story";
import { engineContractHash } from "./engine-contracts.js";
import { closingRandomBytes } from "./investigation-close.js";
import type { DossierSource } from "./investigation-dossier.js";
import {
  PATH_REWRITE_ROUND_TWO_ROOM_BYTES, pathRewriteBodyBytes, pathRewriteBodyFits, pathRewriteGuard, type PathRewritePoint, type PathRewriteQuestion
} from "./path-rewrite-material.js";
import { fitPathOutcomeToTokenLine } from "./token-line.js";

/**
 * V4 start step, Task 49 (spec 2026-11-03 §4.3): EACH PATH'S ANSWER SO FAR, as soon as that path's own arguing and checks end (Task
 * 54 starts one chain per path, `runPathChains`, each on a one-path job, `pathOutcomesJobFor`). For one path: the material (below), the writer (Haiku) and the checker (GLM) rounds of
 * packages/story/src/path-outcome.ts on the served lane, 2 on a paid plan and 1 on Free, no backup writer; then code's outcome:
 *  - satisfied → READY; still objected after the last round → READY_WITH_RESERVATION; no root, no material that fits, or no
 *    draft → FAILED (no root and no fit: no call);
 *  - the trust word is code's, never the AI's: FELL → DIDNT_HOLD, else `pathTrustWordOf` over the points the changes rest on (none
 *    named: every point under the root);
 *  - the verdict on the person's own words is there exactly when the path has some, and quotes them in order;
 *  - stored at once (`recordPathOutcome`); a re-run reads first, so a stored outcome costs no call.
 *
 * THE MATERIAL, the same bytes every time for the same input, shared fields first (the writer and the checker send them byte for
 * byte, so every round reads them from the cache): question (with the step-2 place, time and purpose in their own fields, as the
 * rewrite's), path {title, question, statement}, viewpoints, own_words (only when the path has some), points [{ref P<n>, text, on,
 * side, disputed}], sources (only the kept points' pages, each quote as people see it); then the checker's candidate; then the
 * reader (only when the run has a level) and question_language last. THE LADDER (whole points only, never a cut inside a text):
 * all points, then 40, 20, 10 and none, disputed points first, each written in its own order, at the first step whose largest
 * first packet plus round 2's room passes the 100K guard; then the real count near the line (`fitPathOutcomeToTokenLine`).
 *
 * Money: every call names the run, on the served lane at `PATH_OUTCOME:` sites, booked on the debate's (BODY) attempts and never
 * walled (apps/runner/src/index.ts). It throws only when the store cannot be read or written, or for a path the job does not have.
 */

/** One path's job: its menu text, the root that argued it (null: the root dropped), its points and their pages. */
export type PathOutcomesPath = Readonly<{
  pathId: PathId;
  /** Its place in the person's order (b<n> → n): the call sites name it. */
  pathNo: number;
  title: string;
  question: string;
  /** The root's own answer, the path's first text (`pathRewriteDigPathsOfRoots`' statement). */
  statement: string;
  /** The viewpoints the path brings together, one line each, in the person's order. */
  viewpoints: readonly string[];
  /** The person's own words on this path (their own path, their rewrite), as they wrote them; none: []. */
  ownWords: readonly string[];
  rootNodeId: string | null;
  /** The points under the root (the root excluded), each right after the one it argues, with code's trust word. */
  points: readonly PathRewritePoint[];
  sources: readonly DossierSource[];
}>;

export type PathOutcomesSeat = Readonly<{ providerRef: string; model: string; maker: string }>;

export type PathOutcomesJob = Readonly<{
  runId: string;
  free: boolean;
  question: PathRewriteQuestion;
  /** null: no reader field and no reader sentence (withReaderField's rule). */
  readingLevel: ReadingLevel | null;
  language: Readonly<{ name: string; tag: string }>;
  paths: readonly PathOutcomesPath[];
  seats: Readonly<{ writer: PathOutcomesSeat; checker: PathOutcomesSeat }>;
  gateway: ProviderGateway;
  store: Pick<PathResultsStore, "readPathOutcomes" | "recordPathOutcome">;
  tokenCount: TokenCounter | undefined;
  log: (event: string, detail: Record<string, unknown>) => void;
}>;

/** The seats a path's answer so far sits in: Haiku writes, GLM checks, two makers; null when the members hold no such pair. */
export function pathsFinalSeatsOf<T extends Readonly<{ model: string; maker: string }>>(members: readonly T[]):
  Readonly<{ writer: T; checker: T }> | null {
  const writer = members.find((member) => member.model === PREVIEW_V2_FINAL_SEATS.writer);
  const checker = members.find((member) => member.model === PREVIEW_V2_FINAL_SEATS.checker);
  if (writer === undefined || checker === undefined || writer.maker === checker.maker) return null;
  return Object.freeze({ writer, checker });
}

/* ----------------------------------------------------------------- the material */

/** The points each step keeps (whole points, disputed first): all, then 40, 20, 10 and none. */
export const PATH_OUTCOME_LADDER: readonly number[] = Object.freeze([Number.POSITIVE_INFINITY, 40, 20, 10, 0]);

export type PathOutcomeMaterialInput = Readonly<{
  question: PathRewriteQuestion;
  path: PathOutcomesPath;
  readingLevel: ReadingLevel | null;
  language: Readonly<{ name: string; tag: string }>;
}>;

export type PathOutcomeMaterial = Readonly<{
  /** The writer's fields: the shared ones, then the reader and the question's language. */
  fields: readonly FramedMaterialField[];
  /** The checker's fields: the same shared ones, the candidate (`answer_so_far`), then the reader and the question's language. */
  checkerOf: (candidate: PathOutcomeDraft) => readonly FramedMaterialField[];
  /** How many first fields both send byte for byte (the cache's part). */
  sharedFieldCount: number;
  /** Every point's ref (P<n>, over the whole path, so a point keeps it on every step) → its node id. */
  refs: ReadonlyMap<string, string>;
  /** What code checks a reply against: the kept points' refs, and whether the path has the person's own words. */
  index: PathOutcomeIndex;
  pointsKept: number;
  /** The ladder step used, 1 (every point) to 5 (none). */
  ladderStep: number;
  /** The larger first packet (the writer's or the checker's over an empty candidate), as the 100K guard measures a body. */
  bodyBytes: number;
  /** Whether that packet and round 2's room pass the guard; false only on the last step. */
  fits: boolean;
  /** The two contracts as sent: the drafts with the reader sentence (only with a level) and the language line. */
  contracts: Readonly<{ writer: PromptContract; checker: PromptContract }>;
}>;

const field = (name: string, content: string): FramedMaterialField => Object.freeze({ name, content });

/** The run's locked language, or none for "und" (the map's rule). */
export function pathOutcomeLockOf(language: Readonly<{ name: string; tag: string }>): QuestionLanguage | null {
  return language.tag === "und" ? null : questionLanguageFromRun(language.tag, language.name);
}

/** The points a step keeps: disputed points first, then in order, up to the cap; written in their own order. */
function keptPoints(points: readonly PathRewritePoint[], cap: number): readonly PathRewritePoint[] {
  if (points.length <= cap) return points;
  const chosen = new Set([...points.filter((point) => point.disputed), ...points.filter((point) => !point.disputed)]
    .slice(0, cap).map((point) => point.id));
  return points.filter((point) => chosen.has(point.id));
}

function assertPath(path: PathOutcomesPath): ReadonlyMap<string, string> {
  const refs = new Map<string, string>();
  for (const point of path.points) {
    if ([...refs.values()].includes(point.id)) throw new TypedDomainError("PATH_OUTCOME_POINTS_INVALID", "A point is given once");
    refs.set(`P${String(refs.size + 1)}`, point.id);
  }
  return refs;
}

const EMPTY_CANDIDATE: PathOutcomeDraft = Object.freeze({ line: "-", summary: "-", fate: "SET_ASIDE", what_changed: [{ text: "-", rests_on: [] }],
  view: null });

function atStep(input: PathOutcomeMaterialInput, refs: ReadonlyMap<string, string>, step: number,
  contracts: PathOutcomeMaterial["contracts"], lock: QuestionLanguage | null): PathOutcomeMaterial {
  const { path, question } = input;
  const refOf = new Map([...refs].map(([name, id]) => [id, name] as const));
  const kept = keptPoints(path.points, PATH_OUTCOME_LADDER[step - 1]!);
  const here = new Set(kept.map((point) => point.id));
  const points = kept.map((point) => ({
    ref: refOf.get(point.id)!,
    text: point.text,
    on: point.onId !== null && here.has(point.onId) ? refOf.get(point.onId)! : "path",
    ...(point.side === null ? {} : { side: point.side }),
    ...(point.disputed ? { disputed: true } : {})
  }));
  const sources = path.sources.flatMap((source, at) => (here.has(source.pointId) ? [{
    ref: `W${String(at + 1)}`, point: refOf.get(source.pointId)!, site: source.site,
    ...(source.title === null ? {} : { title: source.title }), quote: cutQuoteAtWordEdge(source.quote)
  }] : []));
  const shared: readonly FramedMaterialField[] = Object.freeze([
    field("question", question.line),
    ...(question.place === null ? [] : [field("place", question.place)]),
    ...(question.time === null ? [] : [field("time", question.time)]),
    ...(question.purpose === null ? [] : [field("purpose", question.purpose)]),
    field("path", JSON.stringify({ title: path.title, question: path.question, statement: path.statement })),
    field("viewpoints", JSON.stringify([...path.viewpoints])),
    ...(path.ownWords.length === 0 ? [] : [field("own_words", JSON.stringify([...path.ownWords]))]),
    field("points", JSON.stringify(points)),
    field("sources", JSON.stringify(sources))
  ]);
  const closing = (fields: readonly FramedMaterialField[]): readonly FramedMaterialField[] =>
    Object.freeze(withQuestionLanguageField(withReaderField(fields, input.readingLevel), lock));
  const fields = closing(shared);
  const checkerOf = (candidate: PathOutcomeDraft) => closing([...shared, field("answer_so_far", JSON.stringify(candidate))]);
  const bodyBytes = Math.max(
    pathRewriteBodyBytes(buildFramedPrompt({ contract: contracts.writer, material: fields }).packet),
    pathRewriteBodyBytes(buildFramedPrompt({ contract: contracts.checker, material: checkerOf(EMPTY_CANDIDATE) }).packet));
  return Object.freeze({
    fields,
    checkerOf,
    sharedFieldCount: shared.length,
    refs,
    // Task 49 review: the pages' refs, and the ref-shaped words the material's own texts use, for code's check that no text a reader
    // meets names a ref (as the dig rewrite's).
    index: Object.freeze({ refs: new Set(points.map((point) => point.ref)), hasOwnWords: path.ownWords.length > 0,
      sourceRefs: new Set(sources.map((source) => source.ref)), ordinaryRefWords: pathOutcomeOrdinaryRefWordsOf(shared.map((entry) => entry.content)) }),
    pointsKept: kept.length,
    ladderStep: step,
    bodyBytes,
    fits: pathRewriteBodyFits(bodyBytes + PATH_REWRITE_ROUND_TWO_ROOM_BYTES),
    contracts
  });
}

/**
 * The material, from the step asked for (the real count's, else step 1) down the ladder, at the first step that fits; when none
 * does, the last step, marked as not fitting (the path then ends FAILED with no call).
 */
export function pathOutcomeMaterial(input: PathOutcomeMaterialInput, options: Readonly<{ fromStep?: number }> = {}): PathOutcomeMaterial {
  const refs = assertPath(input.path);
  const lock = pathOutcomeLockOf(input.language);
  const contracts = pathOutcomeContractsFor(input.readingLevel, lock, input.language.name);
  const asked = options.fromStep;
  const first = asked !== undefined && Number.isSafeInteger(asked) ? Math.min(Math.max(asked, 1), PATH_OUTCOME_LADDER.length) : 1;
  let built = atStep(input, refs, first, contracts, lock);
  for (let step = first + 1; !built.fits && step <= PATH_OUTCOME_LADDER.length; step += 1) built = atStep(input, refs, step, contracts, lock);
  return built;
}

/* ----------------------------------------------------------------- one path, and every path */

const FAILED: PathOutcome = Object.freeze({ state: "FAILED", text: null, what_changed: [], view: null, trust: null, rests_on: [] }) as PathOutcome;
/** Task 54: a FAILED answer so far (no text, no changes, no view, no trust word, no evidence), as every failed path stores it. */
export const PATH_OUTCOME_FAILED: PathOutcome = FAILED;

const trustOf = (word: string | null): TrustWord | null => {
  const read = TrustWordSchema.safeParse(word);
  return read.success ? read.data : null;
};

/** The outcome code keeps from a written draft: refs back to node ids, the trust word from the evidence, the person's words quoted. */
function outcomeOf(state: "READY" | "READY_WITH_RESERVATION", draft: PathOutcomeDraft, path: PathOutcomesPath,
  refs: ReadonlyMap<string, string>): PathOutcome {
  const restsOn = [...new Set(draft.what_changed.flatMap((sentence) => sentence.rests_on.flatMap((name) => {
    const id = refs.get(name);
    return id === undefined ? [] : [id];
  })))];
  const wordOf = new Map(path.points.map((point) => [point.id, trustOf(point.trust)] as const));
  const evidence = restsOn.length === 0 ? path.points.map((point) => point.id) : restsOn;
  const trust = draft.fate === "FELL" ? "DIDNT_HOLD" as const : pathTrustWordOf(evidence.map((id) => wordOf.get(id) ?? null));
  return PathOutcomeSchema.parse({
    state,
    text: { line: draft.line, summary: draft.summary, fate: draft.fate },
    what_changed: draft.what_changed.map((sentence) => sentence.text),
    view: draft.view === null ? null : { ...draft.view, own_words: [...path.ownWords] },
    trust,
    rests_on: restsOn
  });
}

async function writtenOutcome(job: PathOutcomesJob, path: PathOutcomesPath, log: PathOutcomesJob["log"]): Promise<PathOutcome> {
  if (path.rootNodeId === null) {
    log("PATH_OUTCOME_NO_ROOT", {});
    return FAILED;
  }
  const material = await fitPathOutcomeToTokenLine({ question: job.question, path, readingLevel: job.readingLevel, language: job.language },
    job.tokenCount, log);
  if (!material.fits) {
    log("PATH_OUTCOME_MATERIAL_TOO_LARGE", { bodyBytes: material.bodyBytes });
    return FAILED;
  }
  const lock = pathOutcomeLockOf(job.language);
  const written = await writePathOutcome({
    runId: job.runId,
    subjectItemId: `path-outcome:${path.pathId}`,
    contractHash: engineContractHash(),
    pathNo: path.pathNo,
    maxRounds: job.free ? PATH_REWRITE_POLICY.freeMaxRounds : PATH_REWRITE_POLICY.maxRounds,
    writerRef: job.seats.writer.providerRef,
    checkerRef: job.seats.checker.providerRef,
    material,
    // One seed per path: every round of this path is framed under one fence and canary, so round 2 reads round 1 from the cache.
    randomBytes: closingRandomBytes(cryptoRandomBytes(32)),
    send: (request) => job.gateway.call(request),
    guard: pathRewriteGuard,
    writerLanguageCheck: replyLanguageCheckFor(job.question.line, lock, PATH_OUTCOME_PROSE),
    checkerLanguageCheck: replyLanguageCheckFor(job.question.line, lock, PATH_OUTCOME_CHECKER_PROSE),
    log
  });
  if (written.outcome === "FAILED") {
    log("PATH_OUTCOME_FAILED", { failureCode: written.failureCode, cause: written.cause, rounds: written.rounds.length });
    return FAILED;
  }
  try {
    return outcomeOf(written.outcome, written.body, path, material.refs);
  } catch (error) {
    log("PATH_OUTCOME_UNSTORABLE", { code: error instanceof TypedDomainError ? error.code : error instanceof Error ? error.name : "UNTYPED" });
    return FAILED;
  }
}

/**
 * One path's writer and checker rounds, stored at once. A stored outcome is read back (0 calls); a path stored meanwhile by another
 * copy (ALREADY) is read back too, so every caller sees the one stored.
 */
export async function runPathOutcomeFor(job: PathOutcomesJob, pathId: PathId): Promise<PathOutcome> {
  const path = job.paths.find((candidate) => candidate.pathId === pathId);
  if (path === undefined) throw new TypedDomainError("PATH_OUTCOME_PATH_UNKNOWN", "The job has no such path");
  const log: PathOutcomesJob["log"] = (event, detail) => {
    try {
      job.log(event, { runId: job.runId, pathId, ...detail });
    } catch {
      // A failing log sink never costs the path its answer.
    }
  };
  const stored = (await job.store.readPathOutcomes(job.runId)).get(pathId);
  if (stored !== undefined) {
    log("PATH_OUTCOME_READ_BACK", { state: stored.state });
    return stored;
  }
  const outcome = await writtenOutcome(job, path, log);
  const recorded = await job.store.recordPathOutcome({ runId: job.runId, pathId, outcome });
  log("PATH_OUTCOME_STORED", { state: outcome.state, recorded });
  if (recorded === "ALREADY") return (await job.store.readPathOutcomes(job.runId)).get(pathId) ?? outcome;
  return outcome;
}

/** Every path of the job through `runPathOutcomeFor`, all at once; the map in the job's path order. */
export async function runPathOutcomes(job: PathOutcomesJob): Promise<ReadonlyMap<PathId, PathOutcome>> {
  const outcomes = await Promise.all(job.paths.map((path) => runPathOutcomeFor(job, path.pathId)));
  return new Map(job.paths.map((path, at) => [path.pathId, outcomes[at]!] as const));
}

/* ----------------------------------------------------------------- Task 54: one chain per path, as soon as its own checks end */

/**
 * Review of Task 54: A STOP THAT ENDS THIS COPY IS NEVER A PATH'S ANSWER. The writer's and checker's loop (`runStoryLoop`) reads every
 * failed call as a failed round, so a call refused because this copy of the run must stop (`endsCopy`: its claim taken, its time up,
 * its release retiring, its lane stopped) would end FAILED, be stored, and be read back by the copy that takes the run on, which then
 * never writes that path. Over the paths' gateway and store: the first such stop a call meets is kept (`stopped`), every later write
 * is refused with it (so `runPathOutcomeFor` rejects with it, the chain rethrows it and stores nothing), and `throwIfStopped` throws
 * it, for the main answer, whose loop ends FAILED the same way: the stop leaves as it came, as at every other step of the runner.
 */
export function pathCopyStops(gateway: ProviderGateway, store: PathOutcomesJob["store"], endsCopy: (error: unknown) => boolean): Readonly<{
  gateway: ProviderGateway;
  store: PathOutcomesJob["store"];
  stopped: () => Readonly<{ error: unknown }> | null;
  throwIfStopped: () => void;
}> {
  let stop: Readonly<{ error: unknown }> | null = null;
  return Object.freeze({
    gateway: Object.freeze({
      call: async (request: ProviderCallRequest): Promise<ProviderCallResult> => {
        try {
          return await gateway.call(request);
        } catch (error) {
          if (stop === null && endsCopy(error)) stop = Object.freeze({ error });
          throw error;
        }
      }
    }),
    // Read lazily: a run with no paths never reads or writes through it.
    store: Object.freeze({
      readPathOutcomes: (runId: string) => store.readPathOutcomes(runId),
      recordPathOutcome: (input: Parameters<PathOutcomesJob["store"]["recordPathOutcome"]>[0]) =>
        stop === null ? store.recordPathOutcome(input) : Promise.reject(stop.error)
    }),
    stopped: () => stop,
    throwIfStopped: () => {
      if (stop !== null) throw stop.error;
    }
  });
}

/** V4 start step, Task 54: a one-path job (each path's chain writes its own answer so far, never waiting for another path's). */
export function pathOutcomesJobFor(input: Readonly<{ base: Omit<PathOutcomesJob, "paths">; path: PathOutcomesJob["paths"][number] }>): PathOutcomesJob {
  return Object.freeze({ ...input.base, paths: Object.freeze([input.path]) });
}

/**
 * Review of Task 54: A PATH'S OWN REVIEW FACTS (the brief: "facts from `engineNodeFactsOf` restricted to its nodes"). A path's chain
 * reads the run's review lists (reviewed, disputed, cannot assess) one after another while other paths still record theirs, so the
 * lists can disagree: a dispute recorded between two reads is "disputed but not reviewed" (ENGINE_FACTS_INVALID), and the path would
 * end FAILED. Every review of the path's own nodes is recorded before its chain reads them (its checks are over), so the lists kept
 * to those nodes agree. Each list keeps its order.
 */
export type PathReviewLists = Readonly<{
  reviewedNodeIds: readonly string[]; disputedNodeIds: readonly string[]; cannotAssessNodeIds: readonly string[];
}>;
export function pathReviewFactsOf(lists: PathReviewLists, ownNodeIds: ReadonlySet<string>): PathReviewLists {
  const own = (nodeIds: readonly string[]): readonly string[] => Object.freeze(nodeIds.filter((nodeId) => ownNodeIds.has(nodeId)));
  return Object.freeze({
    reviewedNodeIds: own(lists.reviewedNodeIds), disputedNodeIds: own(lists.disputedNodeIds), cannotAssessNodeIds: own(lists.cannotAssessNodeIds)
  });
}

/** One FOUND mark per point of the path that has a trust word (code's, `trustOfPoint`), in the path's order. */
export function pathFoundMarksOf(path: PathOutcomesPath): readonly Readonly<{ nodeId: string; trust: TrustWord }>[] {
  return Object.freeze(path.points.flatMap((point) => {
    const trust = trustOf(point.trust);
    return trust === null ? [] : [Object.freeze({ nodeId: point.id, trust })];
  }));
}

/**
 * V4 start step, Task 54e (the owner's answer of 5 Nov, "One per path": every path gets one look-up, 3 paths = 3): the
 * investigations a path run shares out. On a paid path debate every path holds at least one, `pathRunInvestigations(cap, paths)`
 * for the paths the run argues, as the admission priced it on the receipt (`sites.investigations`); never above what the receipt
 * priced, so a Free run (priced at the cap) keeps the cap, and a set smaller than the receipt's takes one per path it has.
 */
export function pathRunInvestigationsOf(engine: Pick<EngineSettings, "investigate" | "sites">, pathCount: number): number {
  return Math.min(pathRunInvestigations(engine.investigate.maxPerDebate, pathCount), engine.sites.investigations);
}

/**
 * The debate's investigations (`pathRunInvestigationsOf`, which the admission priced once per debate), shared out by path in the
 * person's order: each path its even share, the earlier paths one more each while a remainder is left. `first` is how many slots
 * the earlier paths hold, so a path's k-th investigation is the debate's `VERDICT:investigate:<first + k>` whichever path ends
 * first (one numbering per debate). A path with no slot investigates nothing (its points are recorded capped).
 */
export function pathInvestigationShares(cap: number, pathCount: number): readonly Readonly<{ first: number; slots: number }>[] {
  if (!Number.isSafeInteger(cap) || cap < 0 || !Number.isSafeInteger(pathCount) || pathCount < 0) throw new TypeError("PATH_INVESTIGATION_SHARES_INVALID");
  const even = pathCount === 0 ? 0 : Math.floor(cap / pathCount);
  const shares: Readonly<{ first: number; slots: number }>[] = [];
  let first = 0;
  for (let at = 0; at < pathCount; at += 1) {
    const slots = even + (at < cap - even * pathCount ? 1 : 0);
    shares.push(Object.freeze({ first, slots }));
    first += slots;
  }
  return Object.freeze(shares);
}

/**
 * What one path's chain does (Task 54; the runner gives each step, a test scripts them). In order: (1) its own checks are over
 * (Task 53's `pathChecksOver`); (2) its cannot-assess points investigated; (3) the path as its answer so far reads it, each point
 * with code's trust word; (4) its answer so far, stored at once; (5) one FOUND mark per point with a trust word. A re-claimed run
 * whose path already has its answer so far skips (2) and (4): no call, its marks only.
 */
export type PathChainSteps = Readonly<{
  checksOver: () => Promise<void>;
  /** The answer so far already stored for this path (a re-claimed run), else null. */
  stored: () => Promise<PathOutcome | null>;
  investigate: () => Promise<void>;
  pathOf: () => Promise<PathOutcomesPath>;
  /** `runPathOutcomeFor(pathOutcomesJobFor({ base, path }), pathId)`. */
  outcomeOf: (path: PathOutcomesPath) => Promise<PathOutcome>;
  /** One FOUND mark (best effort; never fails the chain). */
  found: (pathId: PathId, nodeId: string, trust: TrustWord) => void;
  /** A step failed: FAILED stored for this path (the stored row when another copy stored first), so every path has its row. */
  failed: () => Promise<PathOutcome>;
  /** An error that ends the run itself (a lost claim, an erased run, a stopped arguing): never one path's FAILED, rethrown. */
  endsRun: (error: unknown) => boolean;
  log: (event: string, detail: Record<string, unknown>) => void;
}>;

const codeOfError = (error: unknown): string =>
  error instanceof TypedDomainError ? error.code : error instanceof Error ? error.name : "UNTYPED";

/**
 * One path's chain, as soon as its own checks end; it never waits for another path. A step that fails costs this path only: its
 * FAILED is stored and the others go on. It rejects only when its checks never end (the run failed) or an error ends the run.
 */
export async function runPathChain(pathId: PathId, steps: PathChainSteps): Promise<PathOutcome> {
  await steps.checksOver();
  try {
    const stored = await steps.stored();
    if (stored === null) await steps.investigate();
    const path = await steps.pathOf();
    const outcome = stored ?? await steps.outcomeOf(path);
    for (const mark of pathFoundMarksOf(path)) {
      try {
        steps.found(pathId, mark.nodeId, mark.trust);
      } catch {
        // A mark is best effort: the path keeps its answer so far.
      }
    }
    return outcome;
  } catch (error) {
    if (steps.endsRun(error)) throw error;
    try {
      steps.log("PATH_CHAIN_FAILED", { pathId, code: codeOfError(error) });
    } catch {
      // A failing log sink never costs the path its row.
    }
    return await steps.failed();
  }
}

/**
 * Every path's chain, all at once (each held by the run's call lane like any other call); the map in the paths' order once every
 * chain has ended. A chain that rejects (the run ended) rejects this, once every other chain has settled.
 */
export async function runPathChains(pathIds: readonly PathId[], stepsOf: (pathId: PathId) => PathChainSteps):
  Promise<ReadonlyMap<PathId, PathOutcome>> {
  const settled = await Promise.allSettled(pathIds.map((pathId) => runPathChain(pathId, stepsOf(pathId))));
  const rejected = settled.find((entry): entry is PromiseRejectedResult => entry.status === "rejected");
  if (rejected !== undefined) throw rejected.reason;
  return new Map(pathIds.map((pathId, at) => [pathId, (settled[at] as PromiseFulfilledResult<PathOutcome>).value] as const));
}
