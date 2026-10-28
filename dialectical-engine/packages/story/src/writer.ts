import { STORY_COST_ENVELOPE_REACHED } from "@debateai/budget";
import { StoryLanguageTagSchema, type MakerLineage, type StoryBody, type StoryChart } from "@debateai/contract";
import type { Pool } from "@debateai/db";
import { TypedDomainError, questionLanguageFromRun, replyLanguageCheckFor, withQuestionLanguageField, type EngineQuestionKind,
  type QuestionLanguage } from "@debateai/kernel";
import {
  buildFramedPrompt,
  buildFramedRepairPrompt,
  rememberingAcceptedReply,
  schemaFailureLocator,
  type CallBound,
  type ContentClassification,
  type FramedMaterialField,
  type ModelJsonRepair,
  type ModelReplyFacts,
  type PromptContract,
  type ProviderCallRequest,
  type ProviderCallResult,
  type ProviderGateway,
  type TypedRole
} from "@debateai/providers";
import type { EngineSettings, LengthGuidance, StoryPolicy } from "@debateai/register";
import {
  STORY_BACKUP_UNAVAILABLE,
  STORY_BACKUP_USED,
  pickBackupStoryteller,
  storyBackupSignalOf,
  type StoryBackupCandidate,
  type StoryBackupMaker,
  type StoryBackupRecord
} from "./backup.js";
import {
  STORY_CHARTS_CALL_SITE_KEY,
  buildStoryChartsContract,
  classifyStoryChartsContent,
  parseStoryCharts,
  restoreChartRefs
} from "./charts.js";
import {
  buildStoryCheckerContract,
  buildStorytellerContract,
  storyCheckerLengthField,
  storyContractHash,
  storyContractInArgumentLanguage,
  storyLengthField
} from "./contracts.js";
import { readStoryEnrichment } from "./enrichment.js";
import { storyActualWords, storyGuidedBound, storyGuidedWords } from "./length.js";
import { runStoryLoop, storyCallSiteKey, storyLoopLastRound, type StoryLoopDependencies, type StoryLoopOutcome } from "./loop.js";
import {
  buildStoryMaterial,
  buildStoryRevisionPrompt,
  pointNumbersFrom,
  restoreStoryRefs,
  storyMaterialHasMapFields,
  storyDraftText,
  storyMaterialClaims,
  toChartsPromptMaterial,
  toCheckerPromptMaterial,
  toStoryPromptMaterial,
  type StoryMaterial,
  type StoryNodeEnrichment,
  type StoryRunSnapshot
} from "./material.js";
import { storyShapeOf, type StoryPack, type StoryV4Options } from "./pack.js";
import { StoryRepository, isPrivateContentErased, type StoryRecordInput } from "./repository.js";
import {
  STORY_BODY_PROSE,
  STORY_CHECKER_PROSE,
  classifyCheckerContent,
  classifyStoryContent,
  parseCheckerVerdict,
  parseStoryBody
} from "./validate.js";

/**
 * THE VERDICT STORY WRITER (spec §3, §3.1). The runner calls it once, after the
 * work item is settled and AFTER the run's content lease is released (spec §3,
 * amended). It checks readiness, reads the database material, builds the
 * material, runs the write-and-check loop on the story lane, and stores ONE
 * row. Each step that touches the run's private content — the enrichment read,
 * each provider call, the insert — takes its own short lease (`stepLease`), so
 * a user's erasure is never held up for the length of a story: an erasure
 * between two steps makes the next one fail PRIVATE_CONTENT_ERASED, and the
 * story ends FAILED, or RUN_ERASED at the insert. Whatever happens — a
 * provider, the database, a defect in this file — it NEVER rejects: a thrown
 * error there would reach the Hatchet handler's failure path and be recorded
 * against a work item that is already DONE.
 */

export type StoryRoleResolver = (roleRef: string) => StoryRoleMaker | null;

/** One of the run's claim-eligible makers, as a story call can be sent to it. */
export interface StoryRoleMaker {
  readonly provider: ProviderGateway;
  readonly providerRef: string;
}

/**
 * ENGINE MONEY RULE (spec 2026-09-26 §14.4.6), TASK M7 — THE RUNNER'S COST
 * FALLBACK FOR ONE STORY CALL.
 *
 * The runner hands every run's story ONE function over that run's
 * claim-eligible makers and its price map: its own answer-writing fallback
 * (Task M3, `callServeRoleWithFallback`), not a copy of it. The planned maker is
 * asked first with the request exactly as built; only a refusal the WRITER names
 * as money (`refusedForMoney`: the story seam's STORY_COST_ENVELOPE_REACHED,
 * raised before an attempt is sent) moves the SAME request — call site, framed
 * prompt, bound, contract — to the run's other makers, cheapest first by the
 * seam's own projection, `preferNot` last. The first that goes through serves;
 * nothing fits → the planned call's own refusal travels; any other failure,
 * planned or fallback, travels untouched.
 *
 * A refused try costs nothing only when the refusal comes on its FIRST attempt:
 * the seam decides before each attempt, so a later repair or length retry that
 * is refused for money also starts the fallback, and the attempts that maker
 * already made stay charged and ledgered (inherited from Task M3).
 */
export type StoryCostFallback = (input: Readonly<{
  planned: StoryRoleMaker;
  /**
   * The maker offered last: for the checker, the one that wrote the draft it
   * checks. Null for the storyteller, whose fallback is strictly cheapest first.
   */
  preferNot: string | null;
  request: ProviderCallRequest;
  refusedForMoney: (error: unknown) => boolean;
  call: (maker: StoryRoleMaker, request: ProviderCallRequest) => Promise<ProviderCallResult>;
}>) => Promise<Readonly<{ result: ProviderCallResult; servedBy: StoryRoleMaker }>>;

/**
 * The story's one money refusal: its own seam's, raised before sending. The
 * attempt allowance, a dead transport, an unusable answer and everything else
 * are not money, and are never a reason to change the maker (J24).
 */
function isStoryMoneyRefusal(error: unknown): boolean {
  return error instanceof TypedDomainError && error.code === STORY_COST_ENVELOPE_REACHED;
}

export interface StoryRecordSink {
  insert(record: StoryRecordInput): Promise<"INSERTED" | "ALREADY_PRESENT" | "RUN_ERASED">;
}

export interface StoryWriterDependencies {
  /**
   * The RUNNER'S OWN pool: the one its content lease was taken on. The content
   * lease is borrowed by pool identity, so any other pool object would take a
   * second shared lock on the run and livelock against an erasure waiting on
   * the first.
   */
  readonly pool: Pool;
  /** The pack loaded at boot, or the loader's refusal (every story is then STORY_PACK_INVALID). */
  readonly pack: StoryPack | { readonly error: string };
  /**
   * The construction policy, used by a write that carries none (`StoryWriteInput.policy` absent). Side-by-side spec §13
   * runner point 6: a write's own policy is THE policy of that write. `null` switches the story off (STORY_NOT_CONFIGURED).
   */
  readonly policy?: StoryPolicy | null;
  readonly hosted: boolean;
  /** The boot-time resolver over the deployment's configured providers. */
  resolveProvider(roleRef: string): { provider: ProviderGateway; providerRef: string } | null;
  /** Codes and ids only: a log line never carries story or debate text. */
  log(event: string, detail: Record<string, unknown>): void;
  /** Test seam; absent means `new StoryRepository(pool)`. */
  readonly repository?: StoryRecordSink;
  /** Test seam; absent means `readStoryEnrichment`. */
  readonly readEnrichment?: typeof readStoryEnrichment;
  /**
   * Charts (design 2026-10-28): true makes ONE more call after every accepted story, `STORY:CHARTS:1`, and stores the
   * charts that pass their checks. The runner's composition turns it on; absent or false, a story is written exactly as
   * before, with no chart call.
   */
  readonly charts?: boolean;
}

/**
 * One story step under the run's content lease. The runner's is its disclosure
 * lease — the run AND its memory-linked prior run, exactly the runs the debate
 * held — taken afresh for each step on the runner's own pool, so every store and
 * gateway inside it borrows the lease rather than taking a second one.
 */
export type StoryStepLease = <T>(use: () => Promise<T>) => Promise<T>;

/**
 * The runner's snapshot, plus each node's judge artifact and, optionally, the
 * run's OWN role resolver (its claim-eligible providers), which REPLACES the
 * boot-time one for that run, and the step lease. With no step lease each step
 * runs bare, and each store and gateway takes its own lease on the run.
 *
 * Task M7: and, optionally, the run's cost fallback (`StoryCostFallback`). With
 * none, a story call refused for money ends the loop at once, as before.
 */
export type StoryWriteInput = StoryRunSnapshot & {
  readonly judgeArtifactRefs: ReadonlyMap<string, string>;
  readonly resolveProvider?: StoryRoleResolver;
  readonly stepLease?: StoryStepLease;
  readonly costFallback?: StoryCostFallback;
  /**
   * Side-by-side spec §13 runner point 6: the story runs after DONE, so the policy travels with the write, never with the
   * writer. When present it is THE policy of this write (`null`: the story is off for this write); absent, the writer's
   * construction policy serves (tests, practice tools without per-version settings).
   */
  readonly policy?: StoryPolicy | null;
  /** P4-D: the run's own story roles (`StoryRunRoleMakers`); absent on every other run. */
  readonly roleMakers?: StoryRunRoleMakers;
  /**
   * Question-language spec 2026-10-13: set by the runner only when the run's shape receipt says the language was
   * locked; then `argumentLanguage` {tag, name} IS the lock (one named sentence, a last `question_language` material
   * field, replies checked against it). Absent on every other run: today's story bytes.
   */
  readonly languageLocked?: true;
  /**
   * R2 (spec §7.2 item 2, INTERFACE §9.9): the comparing judges' question kinds; their majority picks the v4 story's
   * one shape (`storyV4ShapeId`). Set by the runner under engine 2 only; absent: the pack's default shape.
   */
  readonly questionKinds?: readonly EngineQuestionKind[];
  /**
   * Length guidance (spec 2026-10-15 §3.1): the run's frozen numbers, set by the runner only when its receipt carries them.
   * LG-C reads only its presence (the also-raised claims whole); LG-D reads the story's targets. Absent: today's story.
   */
  readonly lengthGuidance?: LengthGuidance;
  /**
   * Engine redesign R1d (spec 2026-10-15 §7; INTERFACE §3.3, §5.1): the run's receipt `engine` member, set by the runner
   * only for an engine-2 debate. With the length table (`lengthGuidance`) it switches the story to v4: contracts v4, one
   * shape set by code, a `length` field, allowances and guided words from the table, round 2 only for a misleading
   * problem and as a revision of its own draft, and the backup storyteller. Alone it changes nothing. Absent: today's story.
   */
  readonly engine?: EngineSettings;
  /**
   * R1d (spec §7.2 item 11): the run's claim-eligible members in its stored panel's order, the backup storyteller's
   * candidates. Read only under v4. Absent or none of another maker: no backup (STORY_BACKUP_UNAVAILABLE is logged).
   */
  readonly backupCandidates?: readonly StoryBackupCandidate[];
  /**
   * R1d (whole-branch review Minor 1, ruling W1): every claim-eligible member's maker, before the sit-out filter, so the
   * backup's maker rule knows the first storyteller's and the checker's makers even when their refs are not candidates.
   * Read only under v4. Absent: the makers are read from the candidates alone.
   */
  readonly backupMakers?: readonly StoryBackupMaker[];
};

/** R2: the one v4 shape, from the comparing judges' question kinds (majority; a tie or none: the pack's default). */
export function storyV4ShapeId(input: Readonly<{ questionKinds?: readonly EngineQuestionKind[] }>, pack: StoryPack): string {
  return storyShapeOf({ questionKinds: input.questionKinds ?? [], pack });
}

/**
 * Part 4, P4-D (P3-N1; the controller's ruling of 3 October 2026): the run's
 * OWN story roles. On a debate whose models the scorecard picked, the story is
 * written and checked by that debate's own answer writer and answer checker,
 * so the runner hands their seat members over here. Each one present REPLACES
 * the policy's ref for this run; a role left null keeps the policy's ref,
 * resolved exactly as before. A role maker never widens the money rule: a call
 * refused for money still goes to the run's cost fallback, with it planned.
 */
export interface StoryRunRoleMakers {
  readonly storyteller: StoryRoleMaker | null;
  readonly checker: StoryRoleMaker | null;
}

/** What the runner reports when it could not even build the snapshot. */
export interface StorySnapshotFailure {
  readonly answerId: string;
  readonly answerVersion: number;
  readonly error: unknown;
}

const BARE_STEP: StoryStepLease = (use) => use();

/**
 * R1d: the story gateway accepts rounds 1..8 only (`STORY_CALL_SITE`, apps/runner/src/index.ts, and the loop's own
 * limit, read from the loop: Task 17 review 2), so a backup loop whose last round would pass it is not started.
 */
const STORY_BACKUP_ROUNDS = Object.freeze({ lastCallSiteRound: storyLoopLastRound() });

/** Story v4 round 2 (R1d decision 3): the accepted round-1 draft as the model's own turn, and the checker's problems. */
type StoryRevisionTurn = Readonly<{ ownDraft: string; problems: string }>;

/**
 * The story's call sites and the named role each one carries (the gateway checks the pair). Charts (design 2026-10-28):
 * the chart call is the storyteller's role, at its one key `STORY:CHARTS:1`.
 */
type StoryCallSite = "STORYTELLER" | "CHECKER" | "CHARTS";
const STORY_SITE_ROLES: Readonly<Record<StoryCallSite, TypedRole>> = Object.freeze({
  STORYTELLER: "SYNTHESIZER",
  CHECKER: "EVALUATOR",
  CHARTS: "SYNTHESIZER"
});

function isStoryPack(pack: StoryPack | { readonly error: string }): pack is StoryPack {
  return typeof pack === "object" && pack !== null && !("error" in pack);
}

/** A class name that can travel in a log line: a code shape, never a sentence. */
const LOG_ERROR_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/u;

/** A thrown value as a log code: its typed code, a database code, or its class name; never its message. */
function codeOf(error: unknown): string {
  if (error instanceof TypedDomainError) return error.code;
  const code = typeof error === "object" && error !== null ? (error as { readonly code?: unknown }).code : undefined;
  if (typeof code === "string" && /^[0-9A-Z_]{1,64}$/u.test(code)) return `DATABASE:${code}`;
  return error instanceof Error && LOG_ERROR_NAME.test(error.name) ? error.name : "UNTYPED";
}

/** Any id shaped like a node's, in any letter case. */
const STORY_NODE_ID_TEXT = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/giu;

/**
 * Free text with every node-id-shaped run replaced by "(a point)". The models
 * read points only as P1…Pn, so no free text handed to them may carry an id:
 * the runner applies this to its snapshot's texts, the writer to the judges'
 * and reviewers' texts it reads from the database.
 */
export function withoutStoryNodeIds(text: string): string {
  return text.replace(STORY_NODE_ID_TEXT, "(a point)");
}

/** The database's judge and review texts, cleared of node ids before they enter the material. */
function enrichmentWithoutNodeIds(
  enrichment: ReadonlyMap<string, StoryNodeEnrichment>
): ReadonlyMap<string, StoryNodeEnrichment> {
  return new Map([...enrichment].map(([nodeId, entry]) => [nodeId, Object.freeze({
    ...entry,
    judgeBestCase: entry.judgeBestCase === null ? null : withoutStoryNodeIds(entry.judgeBestCase),
    judgeObjection: entry.judgeObjection === null ? null : withoutStoryNodeIds(entry.judgeObjection),
    reviewReasons: Object.freeze(entry.reviewReasons.map(withoutStoryNodeIds))
  })] as const));
}

function lineageOf(result: ProviderCallResult, providerRef: string): MakerLineage {
  return Object.freeze({
    maker: result.maker,
    model_id: result.model,
    transport: result.provider,
    provider_ref: providerRef
  });
}

/**
 * THE ONE STORY REQUEST BUILDER (pre-flight ruling): the storyteller and the
 * checker differ only in what they are handed, never in how the request is
 * shaped. The prompt is framed by the providers' one door; the repair packet is
 * the runner's `buildSchemaRepairPacket`, rebuilt from the providers' own
 * exports: a CODE and a machine PATH inside the fence, never the model's
 * rejected text.
 */
function storyCallRequest(input: {
  readonly story: StoryWriteInput;
  readonly site: StoryCallSite;
  readonly round: number;
  readonly providerRef: string;
  readonly bound: CallBound;
  readonly contract: PromptContract;
  readonly contractHash: string;
  readonly material: readonly FramedMaterialField[];
  readonly classifyContent: (content: string, reply?: ModelReplyFacts) => ContentClassification;
  /** Length guidance (LG-D, v4 only): set only with the run's table; the gateway logs them, nothing decides by them. */
  readonly guidedWords?: number;
  readonly actualWordsOf?: (content: string) => number | null;
  /**
   * Story v4 round 2 (R1d decision 3; spec 2026-10-15 §7.2 item 8): a fresh call — the material exactly as round 1 sent it,
   * framed anew (a new fence), then the model's own accepted draft as its turn and one fenced `revision_problems` block.
   * Its repair packet is the same revision packet with the rejection's machine fields, under the same fence.
   */
  readonly revision?: StoryRevisionTurn;
}): ProviderCallRequest {
  const turn = input.revision ?? null;
  const revision = turn === null ? null : buildStoryRevisionPrompt({
    contract: input.contract, material: input.material, ownDraft: turn.ownDraft, problems: turn.problems
  });
  const framed = revision === null ? buildFramedPrompt({ contract: input.contract, material: input.material }) : revision.framed;
  const request: ProviderCallRequest = {
    runId: input.story.runId,
    subjectItemId: input.story.workItemId,
    callSiteKey: input.site === "CHARTS" ? STORY_CHARTS_CALL_SITE_KEY : storyCallSiteKey(input.site, input.round),
    role: STORY_SITE_ROLES[input.site],
    lane: "story",
    preferredResponseFormat: "json_object",
    bound: input.bound,
    contractHash: input.contractHash,
    providerRef: input.providerRef,
    packet: revision === null ? framed.packet : revision.packet,
    classifyContent: input.classifyContent,
    // A revision's full re-ask is the revision's own (`buildStoryRevisionPrompt`), under the same fence (Task 17 review 1).
    buildRepairPacket: revision === null
      ? (rejected) => buildFramedRepairPrompt(framed, schemaFailureLocator(rejected))
      : revision.buildRepairPacket,
    ...(input.guidedWords === undefined ? {} : { guidedWords: input.guidedWords }),
    ...(input.actualWordsOf === undefined ? {} : { actualWordsOf: input.actualWordsOf })
  };
  return Object.freeze(request);
}

/** Length guidance (LG-D, v4 only): the `length` field after the material (and after candidate_story), before the language field. */
function withLengthField(material: readonly FramedMaterialField[], length: FramedMaterialField | null): readonly FramedMaterialField[] {
  return length === null ? material : Object.freeze([...material, length]);
}

/**
 * The tag stored with the story: the run's, when the contract can carry it.
 * The database already holds the tag to a BCP-47 shape; this is the last guard,
 * so a tag the stored schema would refuse costs the tag and never the story.
 */
function storyLanguageTag(input: StoryWriteInput): string | null {
  const tag = input.argumentLanguage?.tag ?? null;
  return tag !== null && StoryLanguageTagSchema.safeParse(tag).success ? tag : null;
}

/** A readiness refusal: nothing ran, so no lineage, no artifact and no point numbers. */
function failedRecord(input: StoryWriteInput, failureCode: string, pack: StoryPack | null): StoryRecordInput {
  const record: StoryRecordInput = {
    runId: input.runId,
    answerId: input.answerId,
    answerVersion: input.answerVersion,
    outcome: "FAILED",
    failureCode,
    shapeId: null,
    packVersion: pack?.version ?? null,
    packFingerprint: pack?.fingerprint ?? null,
    storytellerLineage: null,
    checkerLineage: null,
    rounds: 0,
    artifactRefs: Object.freeze([]),
    body: null,
    reservation: null,
    verdictBasis: input.verdictBasis,
    // No material was built, so no point was numbered.
    pointNumbers: null,
    languageTag: storyLanguageTag(input),
    // Role rotation (spec 2026-10-11 Part 3): no storyteller replied, so there is no repair count.
    storytellerRepairs: null
  };
  return Object.freeze(record);
}

/**
 * The record written when the first one could not be: FAILED/STORY_UNEXPECTED_ERROR.
 * It carries NO verdict basis, no point numbers and no language tag, so the
 * repository's parse-before-seal cannot refuse it for the same reason it
 * refused the first.
 */
function fallbackRecord(input: StoryWriteInput, pack: StoryPack | null): StoryRecordInput {
  return Object.freeze({ ...failedRecord(input, "STORY_UNEXPECTED_ERROR", pack), verdictBasis: null, languageTag: null });
}

function recordFromOutcome(
  input: StoryWriteInput,
  pack: StoryPack,
  outcome: StoryLoopOutcome,
  refMap: ReadonlyMap<string, string>,
  storytellerRepairs: number,
  backup: StoryBackupRecord | null,
  charts: readonly StoryChart[] = []
): StoryRecordInput {
  // The lineage is the SERVED round's: under the earlier-draft fallback that is
  // the earlier round, whose writer wrote and whose checker judged the story
  // the reader sees. A FAILED loop serves nothing, so it names the last round's.
  const lineageRound = outcome.outcome === "FAILED"
    ? outcome.rounds.at(-1)
    : outcome.rounds.find((round) => round.round === outcome.servedRound);
  const artifactRefs = Object.freeze(outcome.rounds.flatMap((round) => [
    round.writer.artifactRef,
    ...(round.checker === null ? [] : [round.checker.artifactRef])
  ]));
  const shared = {
    runId: input.runId,
    answerId: input.answerId,
    answerVersion: input.answerVersion,
    packVersion: pack.version,
    packFingerprint: pack.fingerprint,
    storytellerLineage: lineageRound?.writer.lineage ?? null,
    checkerLineage: lineageRound?.checker?.lineage ?? null,
    rounds: outcome.rounds.length,
    artifactRefs,
    verdictBasis: input.verdictBasis,
    // The short refs the models wrote in ARE the story's point numbers (node id
    // -> Pn), so a reservation that says "P3" matches appendix entry P3.
    pointNumbers: pointNumbersFrom(refMap),
    languageTag: storyLanguageTag(input),
    // Role rotation (spec 2026-10-11 Part 3): the rounds whose storyteller reply needed the repair try. A loop
    // that recorded no round got no storyteller reply at all (the round-1 write failed), so its count is null.
    storytellerRepairs: outcome.rounds.length === 0 ? null : storytellerRepairs,
    // R1d (spec §7.2 item 11): a story a backup storyteller wrote (or tried to) carries the sealed record; no other does.
    ...(backup === null ? {} : { backup })
  };
  if (outcome.outcome === "FAILED") {
    const failed: StoryRecordInput = {
      ...shared, outcome: "FAILED", failureCode: outcome.failureCode, shapeId: null, body: null, reservation: null
    };
    return Object.freeze(failed);
  }
  // The models wrote short refs (P1…Pn); the STORED story names real node ids,
  // which is what the site's tree and the PDF appendix number. An unknown ref
  // cannot reach here (the classifier checked every ref against the index), and
  // if one did, STORY_REF_UNMAPPED becomes STORY_UNEXPECTED_ERROR upstream.
  const body = restoreStoryRefs(outcome.body, refMap);
  const written: StoryRecordInput = {
    ...shared,
    outcome: outcome.outcome,
    failureCode: null,
    shapeId: body.shape_id,
    body,
    reservation: outcome.reservation,
    // Charts (design 2026-10-28): only a story that has some carries the member.
    ...(charts.length === 0 ? {} : { charts })
  };
  return Object.freeze(written);
}

export class StoryWriter {
  readonly #deps: StoryWriterDependencies;
  readonly #repository: StoryRecordSink;

  constructor(deps: StoryWriterDependencies) {
    this.#deps = deps;
    this.#repository = deps.repository ?? new StoryRepository(deps.pool);
  }

  async writeAfterSettle(input: StoryWriteInput): Promise<void> {
    try {
      await this.#store(await this.#compose(input), input.stepLease ?? BARE_STEP);
      return;
    } catch (error) {
      this.#log("STORY_WRITE_FAILED", () => ({
        answerId: input.answerId, answerVersion: input.answerVersion, code: codeOf(error)
      }));
    }
    try {
      const pack = isStoryPack(this.#deps.pack) ? this.#deps.pack : null;
      await this.#store(fallbackRecord(input, pack), input.stepLease ?? BARE_STEP);
    } catch (secondError) {
      this.#log("STORY_FAILURE_NOT_RECORDED", () => ({
        answerId: input.answerId, answerVersion: input.answerVersion, code: codeOf(secondError)
      }));
    }
  }

  /**
   * The runner could not build the snapshot, so there is no story to write:
   * say so by code or class name, never by message. Never throws.
   */
  reportSnapshotFailure(failure: StorySnapshotFailure): void {
    this.#log("STORY_SNAPSHOT_FAILED", () => ({
      answerId: failure.answerId, answerVersion: failure.answerVersion, code: codeOf(failure.error)
    }));
  }

  /**
   * The detail is built INSIDE the guard, so reading an error's code cannot
   * throw out of the writer, and an async sink's rejection is caught here, so it
   * can never become an unhandled rejection.
   */
  #log(event: string, detail: () => Record<string, unknown>): void {
    try {
      const returned: unknown = this.#deps.log(event, detail());
      void Promise.resolve(returned).catch(() => undefined);
    } catch {
      // A failing log sink never costs the caller anything.
    }
  }

  /**
   * Story format robustness (2026-10-12): an accepted reply that needed a repair, by code and ids only. LG-A: `repair` is
   * the first; `repairs` rides along only when there were two or more.
   */
  #logRepair(site: StoryCallSite, round: number, repairs: readonly ModelJsonRepair[], input: StoryWriteInput): void {
    if (repairs.length === 0) return;
    this.#log("STORY_REPLY_REPAIRED", () => ({
      answerId: input.answerId, answerVersion: input.answerVersion, round, site, repair: repairs[0]!,
      ...(repairs.length > 1 ? { repairs: [...repairs] } : {})
    }));
  }

  async #store(record: StoryRecordInput, stepLease: StoryStepLease): Promise<void> {
    let stored: "INSERTED" | "ALREADY_PRESENT" | "RUN_ERASED";
    try {
      stored = await stepLease(() => this.#repository.insert(record));
    } catch (error) {
      // An erasure that landed before this step: the step's own lease refuses,
      // and an erased run has nothing left to tell.
      if (!isPrivateContentErased(error)) throw error;
      stored = "RUN_ERASED";
    }
    this.#log("STORY_STORED", () => ({
      answerId: record.answerId,
      answerVersion: record.answerVersion,
      outcome: record.outcome,
      failureCode: record.failureCode,
      stored
    }));
  }

  /**
   * Side-by-side spec §13 runner point 6: the story runs after DONE, so the policy travels with the write, never with the
   * writer. The write's own policy is the one used, `null` included; only an absent one falls back to the writer's
   * construction policy. With neither, the story is off, and the missing policy is logged once, by code and ids.
   */
  async #compose(input: StoryWriteInput): Promise<StoryRecordInput> {
    const pack = this.#deps.pack;
    if (!isStoryPack(pack)) return failedRecord(input, "STORY_PACK_INVALID", null);
    const policy = input.policy !== undefined ? input.policy : (this.#deps.policy ?? null);
    if (policy === null) {
      if (input.policy === undefined) {
        this.#log("STORY_POLICY_NOT_PASSED", () => ({ answerId: input.answerId, answerVersion: input.answerVersion }));
      }
      return failedRecord(input, "STORY_NOT_CONFIGURED", pack);
    }
    // Hosted spends money, and a story with no sealed ceiling of its own would be
    // refused by the gateway anyway (STORY_ENVELOPE_MISSING), after the material
    // was read and with a code the loop cannot name. Refuse here, before anything.
    if (this.#deps.hosted && policy.perStoryCeilingMicros === null) {
      return failedRecord(input, "STORY_ENVELOPE_MISSING", pack);
    }
    const resolve: StoryRoleResolver = input.resolveProvider
      ?? ((roleRef) => this.#deps.resolveProvider(roleRef));
    // P4-D: a run's own role maker replaces the policy's ref for that run only.
    const storyteller = input.roleMakers?.storyteller ?? resolve(policy.storytellerRoleRef);
    const checker = input.roleMakers?.checker ?? resolve(policy.storyCheckerRoleRef);
    if (storyteller === null || checker === null) return failedRecord(input, "STORY_ROLE_UNAVAILABLE", pack);

    const snapshot: StoryRunSnapshot = {
      runId: input.runId,
      workItemId: input.workItemId,
      answerId: input.answerId,
      answerVersion: input.answerVersion,
      questionLine: input.questionLine,
      argumentLanguage: input.argumentLanguage,
      compositionBudgetTier: input.compositionBudgetTier,
      verdictBasis: input.verdictBasis,
      servedStatement: input.servedStatement,
      nodes: input.nodes,
      arrows: input.arrows,
      sensitivity: input.sensitivity,
      setAside: input.setAside,
      // Debate shape P2c: the snapshot's optional map fields reach the material; absent on every other run, whose
      // material stays byte for byte. The spread form keeps exactOptionalPropertyTypes satisfied.
      ...(input.alsoRaised === undefined ? {} : { alsoRaised: input.alsoRaised }),
      ...(input.answersNote === undefined ? {} : { answersNote: input.answersNote })
    };
    const stepLease = input.stepLease ?? BARE_STEP;
    const readEnrichment = this.#deps.readEnrichment ?? readStoryEnrichment;
    // Awaited INSIDE its own step lease, on the runner's own pool: the reader
    // borrows that lease rather than taking a second one.
    const enrichment = await stepLease(() => readEnrichment(this.#deps.pool, {
      runId: input.runId,
      nodes: input.nodes.map((node) => ({
        nodeId: node.nodeId,
        judgeArtifactRef: input.judgeArtifactRefs.get(node.nodeId) ?? null
      }))
    }));
    // Engine redesign R1d (spec 2026-10-15 §7; INTERFACE §5.1; R1d decision 1): story v4 exactly when the run's receipt
    // carries engine 2 AND its length table — `input.engine?.engine === 2 && input.lengthGuidance !== undefined`. The
    // length table alone keeps the v3 story: today's contracts, no `length` field, today's bounds, no guided words (the
    // material differs only by LG-C's whole also-raised claims, ruling L19) (pre-flight PF-D6.3).
    const guidance = input.engine?.engine === 2 && input.lengthGuidance !== undefined ? input.lengthGuidance : null;
    // One shape (decision 2): the comparing judges' question kinds pick it (R2; `storyV4ShapeId`: their majority, a tie
    // or none the pack default). The model never writes shape_id: the material's index sets it on the decoded body, and
    // the stored row carries it.
    const v4: StoryV4Options | null = guidance === null
      ? null
      : Object.freeze({ shapeId: storyV4ShapeId(input, pack) });
    const built = buildStoryMaterial({
      snapshot,
      enrichment: enrichmentWithoutNodeIds(enrichment),
      budgetBytes: policy.materialBudget[input.compositionBudgetTier],
      shapeIds: new Set(pack.shapes.map((shape) => shape.id)),
      ...(input.lengthGuidance === undefined ? {} : { alsoRaisedWhole: true }),
      // R1d decision 6: under v4, each position once and review reasons only for disputed points; the index fixes the shape.
      ...(v4 === null ? {} : { v4 })
    });
    if (built.kind === "TOO_LARGE") {
      this.#log("STORY_MATERIAL_TOO_LARGE", () => ({
        answerId: input.answerId, bytes: built.bytes, budgetBytes: built.budgetBytes
      }));
      return failedRecord(input, "STORY_MATERIAL_TOO_LARGE", pack);
    }

    // Both prompts carry dev's argument-language directive (spec §14.1), so the
    // story and the checker's objection come out in the question's language.
    // Question-language spec 2026-10-13: on a locked (shape) run, the run's language is the lock — its one named
    // sentence, a last `question_language` field and the locked reply check. A stored pair the kernel would not
    // have locked reads back as no lock: today's directive and today's check.
    const languageName = input.argumentLanguage?.name ?? null;
    const lock = input.languageLocked === true && input.argumentLanguage !== null
      ? questionLanguageFromRun(input.argumentLanguage.tag, input.argumentLanguage.name)
      : null;
    // Debate shape (ruling W-STORY): the pack's map passages ride only with a material that sends a map field; every
    // other story gets the instructions it got before the debate shape, byte for byte.
    const mapFields = storyMaterialHasMapFields(built.material);
    // R1d: v4 contracts under engine 2 with the table; `null` builds today's v3 contracts byte for byte.
    const storytellerContract = storyContractInArgumentLanguage(buildStorytellerContract(pack, mapFields, v4), languageName, lock);
    const checkerContract = storyContractInArgumentLanguage(buildStoryCheckerContract(pack, mapFields, v4), languageName, lock);
    const storytellerHash = storyContractHash(storytellerContract);
    const checkerHash = storyContractHash(checkerContract);
    // Length guidance under v4 only (LG-D Task 4, spec 2026-10-15 §3.4): a `length` field before the language field, the
    // allowances from the table and its guided words. `guidance` is null under v3, so every story request keeps today's
    // bytes and its bound objects (`storyGuidedBound` returns the policy's own object for null).
    const languageTag = input.argumentLanguage?.tag ?? null;
    const storytellerLength = guidance === null ? null
      : storyLengthField(guidance.story, languageTag, guidance.charactersPerWord);
    const checkerLength = guidance === null ? null
      : storyCheckerLengthField(guidance.story, guidance.steps.story_checker, languageTag, guidance.charactersPerWord);
    const storytellerBound = storyGuidedBound(policy.storytellerBound, "STORYTELLER", guidance);
    const checkerBound = storyGuidedBound(policy.checkerBound, "CHECKER", guidance);
    const storytellerWords = guidance === null ? {} : {
      guidedWords: storyGuidedWords(guidance.story),
      actualWordsOf: (content: string) => storyActualWords(content, guidance.charactersPerWord)
    };
    const checkerWords = guidance === null ? {} : { guidedWords: guidance.steps.story_checker };
    /**
     * Engine money rule, Task M7 (spec §14.4.6): one story call, with the
     * run's cost fallback when the runner handed one over. Each try is one
     * provider call, so each takes its own short step lease. The ROLE rule
     * above is untouched: an absent role never reaches here, so a maker is only
     * ever substituted for money — or, on the preview (run resilience, spec
     * 2026-10-12 fix (a)), because the runner's fallback found the planned maker
     * sitting out the rest of the run (the runner's own move rule, handed over
     * inside `costFallback`; this writer is unchanged).
     */
    const callStoryRole = async (
      planned: StoryRoleMaker,
      request: ProviderCallRequest,
      preferNot: string | null,
      /**
       * R1d (pre-flight PF-D6.2; spec §7.2 items 8 and 11): the backup storyteller's calls and a v4 revision keep their
       * maker. They never go through the cost fallback, which could move them to the first storyteller's or the checker's
       * maker; a money refusal there is today's money stop (the loop's STORY_ENVELOPE_EXHAUSTED), never a silent move.
       */
      keepMaker = false
    ): Promise<Readonly<{ result: ProviderCallResult; servedBy: StoryRoleMaker }>> => {
      const send = (maker: StoryRoleMaker, sent: ProviderCallRequest) => stepLease(() => maker.provider.call(sent));
      const costFallback = input.costFallback;
      if (costFallback === undefined || keepMaker) return { result: await send(planned, request), servedBy: planned };
      return costFallback({ planned, preferNot, request, refusedForMoney: isStoryMoneyRefusal, call: send });
    };
    /** Who actually wrote each round's draft: its checker prefers another maker. */
    const draftWriterByRound = new Map<number, string>();
    /** R1d (PF-D6.2): who wrote each round's draft, as a role maker. A v4 revision revises ITS OWN draft, so it goes there. */
    const draftTellerByRound = new Map<number, StoryRoleMaker>();
    /**
     * Role rotation (spec 2026-10-11 Part 3): the rounds whose storyteller reply was accepted only after the
     * format repair try. Rounds, not repair packets; a gateway that reports no count reported none.
     */
    const repairedRounds = new Set<number>();
    // Reply language (2026-10-12): each draft and each objection is checked against the question's language.
    const storyInQuestionLanguage = replyLanguageCheckFor(input.questionLine, lock, STORY_BODY_PROSE);
    const checkerInQuestionLanguage = replyLanguageCheckFor(input.questionLine, lock, STORY_CHECKER_PROSE);
    /**
     * R1d decision 5: the FIRST storyteller's round-1 write error, kept for the backup's signal. A holder object, not a
     * `let`, so the closure's write is seen after the loop. The backup loop starts at round maxRounds + 1, so it never
     * writes here.
     */
    const firstWrite: { failed: boolean; error: unknown } = { failed: false, error: null };
    /**
     * `backupLoop` (pre-flight PF-D6.2): true for the backup storyteller's loop, whose every call goes straight to
     * `teller`. The first loop's round 1 keeps today's cost fallback (M7); its v4 revision goes straight to the round-1
     * draft's own writer.
     */
    const writeStoryWith = (teller: StoryRoleMaker, backupLoop: boolean): StoryLoopDependencies["writeStory"] =>
      async ({ round, priorObjection, priorDraft }) => {
        try {
          const reading = rememberingAcceptedReply((content, reply) =>
            classifyStoryContent(content, built.index, reply, storyInQuestionLanguage));
          // Story v4 round 2 (R1d decision 3; spec §7.2 item 8): the round-1 material unchanged (no prior_objection
          // field), the accepted round-1 draft as the model's own turn, the checker's problems in one fenced block.
          // v3 keeps today's prior_objection field.
          const revision: StoryRevisionTurn | null = v4 !== null && priorDraft !== null && priorObjection !== null
            ? Object.freeze({ ownDraft: storyDraftText(priorDraft), problems: priorObjection })
            : null;
          // R1d (PF-D6.2): a revision is sent to the maker that wrote the draft it revises (round 1 may have been served
          // by a cheaper maker), and neither it nor a backup call is handed to the cost fallback.
          const author = revision === null ? teller : (draftTellerByRound.get(round - 1) ?? teller);
          const keepMaker = backupLoop || revision !== null;
          const request = storyCallRequest({
            story: input,
            site: "STORYTELLER",
            round,
            providerRef: author.providerRef,
            bound: storytellerBound,
            contract: storytellerContract,
            contractHash: storytellerHash,
            material: withQuestionLanguageField(withLengthField(
              toStoryPromptMaterial(built.material, revision === null ? priorObjection : null), storytellerLength), lock),
            classifyContent: reading.classifyContent,
            ...(revision === null ? {} : { revision }),
            ...storytellerWords
          });
          // Task M7 (review ruling): a fallback storyteller is STRICTLY cheapest
          // first, the planned checker's maker included. Both calls spend ONE
          // story total, so a dearer storyteller could leave the checker unpaid
          // and fail a story cheapest-first would have made READY. Diversity is
          // preferred on the checker's side only; the lineage shows one maker
          // doing both jobs.
          const { result, servedBy } = await callStoryRole(author, request, null, keepMaker);
          draftWriterByRound.set(round, servedBy.providerRef);
          draftTellerByRound.set(round, servedBy);
          // Short refs on purpose: the checker judges this body against the SAME
          // material the storyteller read. Real ids are restored only for storage.
          const accepted = reading.acceptedAs(result.content);
          const body: StoryBody = parseStoryBody(result.content, built.index, accepted.reply);
          this.#logRepair("STORYTELLER", round, accepted.repairs, input);
          if ((result.repairAttempts ?? 0) > 0) repairedRounds.add(round);
          return {
            artifactRef: result.rawArtifactRef,
            callSiteKey: request.callSiteKey,
            // The maker ACTUALLY used, so "Written by" names a fallback model.
            lineage: lineageOf(result, servedBy.providerRef),
            body
          };
        } catch (error) {
          if (round === 1) {
            firstWrite.failed = true;
            firstWrite.error = error;
          }
          throw error;
        }
      };
    const checkStory: StoryLoopDependencies["checkStory"] = async ({ round, candidate }) => {
      // R1d: the v4 checker form carries `misleading`; the v3 reading is today's call, unchanged.
      const reading = rememberingAcceptedReply((content, reply) => (v4 === null
        ? classifyCheckerContent(content, reply, checkerInQuestionLanguage)
        : classifyCheckerContent(content, reply, checkerInQuestionLanguage, true)));
      const request = storyCallRequest({
        story: input,
        site: "CHECKER",
        round,
        providerRef: checker.providerRef,
        bound: checkerBound,
        contract: checkerContract,
        contractHash: checkerHash,
        material: withQuestionLanguageField(withLengthField(toCheckerPromptMaterial(built.material, candidate), checkerLength), lock),
        classifyContent: reading.classifyContent,
        ...checkerWords
      });
      // Task M7: the planned checker is always asked first; a fallback checker
      // prefers a maker other than the one that wrote this round's draft.
      const { result, servedBy } = await callStoryRole(checker, request, draftWriterByRound.get(round) ?? null);
      const accepted = reading.acceptedAs(result.content);
      const verdict = v4 === null
        ? parseCheckerVerdict(result.content, accepted.reply)
        : parseCheckerVerdict(result.content, accepted.reply, true);
      this.#logRepair("CHECKER", round, accepted.repairs, input);
      return {
        artifactRef: result.rawArtifactRef,
        callSiteKey: request.callSiteKey,
        lineage: lineageOf(result, servedBy.providerRef),
        verdict
      };
    };
    const outcome = await runStoryLoop(
      v4 === null ? { maxRounds: policy.loopMaxRounds } : { maxRounds: policy.loopMaxRounds, v4: true as const },
      { writeStory: writeStoryWith(storyteller, false), checkStory }
    );
    this.#logLoopOutcome(outcome, input);
    // R1d decision 5 (spec §7.2 item 11): under v4 only, when the first loop ended FAILED with no draft because round 1's
    // write failed with one of the four signals, ONE more loop with a backup storyteller of another maker, the same
    // checker, rounds maxRounds+1.. (STORY:STORYTELLER:3/4 with 2 rounds) and its own tries.
    let served: StoryLoopOutcome = outcome;
    let backup: StoryBackupRecord | null = null;
    if (v4 !== null && outcome.outcome === "FAILED" && outcome.rounds.length === 0 && firstWrite.failed) {
      const signal = storyBackupSignalOf(firstWrite.error);
      if (signal !== null) {
        const chosen = pickBackupStoryteller({
          candidates: input.backupCandidates ?? [],
          firstRef: storyteller.providerRef,
          checkerRef: checker.providerRef,
          makers: input.backupMakers
        });
        const firstRound = policy.loopMaxRounds + 1;
        const fits = firstRound + policy.loopMaxRounds - 1 <= STORY_BACKUP_ROUNDS.lastCallSiteRound;
        if (chosen === null || !fits) {
          this.#log(STORY_BACKUP_UNAVAILABLE, () => ({
            answerId: input.answerId,
            answerVersion: input.answerVersion,
            signal,
            reason: chosen === null ? "NO_CANDIDATE" : "NO_ROUND_LEFT"
          }));
        } else {
          backup = Object.freeze({ code: STORY_BACKUP_USED, signal, firstModel: storyteller.providerRef });
          this.#log(STORY_BACKUP_USED, () => ({
            answerId: input.answerId,
            answerVersion: input.answerVersion,
            signal,
            firstModel: storyteller.providerRef,
            backupModel: chosen.providerRef
          }));
          served = await runStoryLoop(
            { maxRounds: policy.loopMaxRounds, v4: true, firstRound },
            { writeStory: writeStoryWith(chosen, true), checkStory }
          );
          this.#logLoopOutcome(served, input);
        }
      }
    }
    // R1d decision 4: a wording note (not satisfied, not misleading) is served READY with no reservation and never shown
    // to a reader; the checker's own artifact holds its text. Logged by code and round only.
    if (v4 !== null) {
      for (const round of served.rounds) {
        if (round.checker !== null && !round.satisfied && round.misleading === false) {
          this.#log("STORY_WORDING_NOTE_ONLY", () => ({
            answerId: input.answerId, answerVersion: input.answerVersion, round: round.round
          }));
        }
      }
    }
    // Charts (design 2026-10-28): one more call, after an accepted story, to the maker that wrote the served draft. The
    // story is stored as it is whatever becomes of it.
    const charts = served.outcome === "FAILED" || this.#deps.charts !== true ? [] : await this.#chartsFor(input, {
      material: built.material,
      scoreTexts: built.index.scoreTexts,
      refMap: built.refMap,
      body: served.body,
      teller: draftTellerByRound.get(served.servedRound) ?? storyteller,
      bound: storytellerBound,
      languageName,
      lock,
      call: (planned, request) => callStoryRole(planned, request, null)
    });
    return recordFromOutcome(input, pack, served, built.refMap, repairedRounds.size, backup, charts);
  }

  /**
   * Charts (design 2026-10-28): the chart call and its checks (packages/story/src/charts.ts). Never throws: a refused
   * call, money, a reply that is not a chart plan, or a plan with no chart that passes, all mean no charts, logged by
   * code and counts only.
   */
  async #chartsFor(input: StoryWriteInput, args: Readonly<{
    material: StoryMaterial;
    scoreTexts: ReadonlySet<string>;
    refMap: ReadonlyMap<string, string>;
    body: StoryBody;
    teller: StoryRoleMaker;
    bound: CallBound;
    languageName: string | null;
    lock: QuestionLanguage | null;
    call: (planned: StoryRoleMaker, request: ProviderCallRequest) => Promise<Readonly<{ result: ProviderCallResult }>>;
  }>): Promise<readonly StoryChart[]> {
    try {
      const contract = storyContractInArgumentLanguage(buildStoryChartsContract(), args.languageName, args.lock);
      const reading = rememberingAcceptedReply((content, reply) => classifyStoryChartsContent(content, reply));
      const request = storyCallRequest({
        story: input,
        site: "CHARTS",
        round: 1,
        providerRef: args.teller.providerRef,
        bound: args.bound,
        contract,
        contractHash: storyContractHash(contract),
        material: withQuestionLanguageField(toChartsPromptMaterial(args.material, args.body), args.lock),
        classifyContent: reading.classifyContent
      });
      const { result } = await args.call(args.teller, request);
      const accepted = reading.acceptedAs(result.content);
      const read = parseStoryCharts(result.content, {
        body: args.body,
        claims: storyMaterialClaims(args.material),
        scoreTexts: args.scoreTexts
      }, accepted.reply);
      const charts = restoreChartRefs(read.charts, args.refMap);
      this.#log("STORY_CHARTS_WRITTEN", () => ({
        answerId: input.answerId, answerVersion: input.answerVersion, charts: charts.length, dropped: [...read.dropped]
      }));
      return charts;
    } catch (error) {
      this.#log("STORY_CHARTS_FAILED", () => ({
        answerId: input.answerId, answerVersion: input.answerVersion, code: codeOf(error)
      }));
      return [];
    }
  }

  /** Why a story failed, or why an earlier draft is the one served: codes only (today's two logs, one loop at a time). */
  #logLoopOutcome(outcome: StoryLoopOutcome, input: StoryWriteInput): void {
    if (outcome.outcome === "FAILED") {
      this.#log("STORY_LOOP_FAILED", () => ({
        answerId: input.answerId,
        answerVersion: input.answerVersion,
        failureCode: outcome.failureCode,
        cause: outcome.cause,
        rounds: outcome.rounds.length
      }));
    } else if (outcome.laterFailure !== null) {
      const laterFailure = outcome.laterFailure;
      this.#log("STORY_LATER_ROUND_FAILED", () => ({
        answerId: input.answerId,
        answerVersion: input.answerVersion,
        servedRound: outcome.servedRound,
        failureCode: laterFailure.failureCode,
        cause: laterFailure.cause
      }));
    }
  }
}
