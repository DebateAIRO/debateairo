import type { MakerLineage, StoryBody } from "@debateai/contract";
import type { Pool } from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import {
  buildFramedPrompt,
  buildFramedRepairPrompt,
  schemaFailureLocator,
  type CallBound,
  type ContentClassification,
  type FramedMaterialField,
  type PromptContract,
  type ProviderCallRequest,
  type ProviderCallResult,
  type ProviderGateway,
  type TypedRole
} from "@debateai/providers";
import type { StoryPolicy } from "@debateai/register";
import { buildStoryCheckerContract, buildStorytellerContract, storyContractHash } from "./contracts.js";
import { readStoryEnrichment } from "./enrichment.js";
import { runStoryLoop, storyCallSiteKey, type StoryLoopOutcome } from "./loop.js";
import {
  buildStoryMaterial,
  pointNumbersFrom,
  restoreStoryRefs,
  toCheckerPromptMaterial,
  toStoryPromptMaterial,
  type StoryNodeEnrichment,
  type StoryRunSnapshot
} from "./material.js";
import type { StoryPack } from "./pack.js";
import { StoryRepository, isPrivateContentErased, type StoryRecordInput } from "./repository.js";
import { classifyCheckerContent, classifyStoryContent, parseCheckerVerdict, parseStoryBody } from "./validate.js";

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

export type StoryRoleResolver = (roleRef: string) => {
  readonly provider: ProviderGateway;
  readonly providerRef: string;
} | null;

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
  /** The optional register family; `null` switches the story off (STORY_NOT_CONFIGURED). */
  readonly policy: StoryPolicy | null;
  readonly hosted: boolean;
  /** The boot-time resolver over the deployment's configured providers. */
  resolveProvider(roleRef: string): { provider: ProviderGateway; providerRef: string } | null;
  /** Codes and ids only: a log line never carries story or debate text. */
  log(event: string, detail: Record<string, unknown>): void;
  /** Test seam; absent means `new StoryRepository(pool)`. */
  readonly repository?: StoryRecordSink;
  /** Test seam; absent means `readStoryEnrichment`. */
  readonly readEnrichment?: typeof readStoryEnrichment;
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
 */
export type StoryWriteInput = StoryRunSnapshot & {
  readonly judgeArtifactRefs: ReadonlyMap<string, string>;
  readonly resolveProvider?: StoryRoleResolver;
  readonly stepLease?: StoryStepLease;
};

/** What the runner reports when it could not even build the snapshot. */
export interface StorySnapshotFailure {
  readonly answerId: string;
  readonly answerVersion: number;
  readonly error: unknown;
}

const BARE_STEP: StoryStepLease = (use) => use();

/** The story's two call sites and the named role each one carries (the gateway checks the pair). */
type StoryCallSite = "STORYTELLER" | "CHECKER";
const STORY_SITE_ROLES: Readonly<Record<StoryCallSite, TypedRole>> = Object.freeze({
  STORYTELLER: "SYNTHESIZER",
  CHECKER: "EVALUATOR"
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
  readonly classifyContent: (content: string) => ContentClassification;
}): ProviderCallRequest {
  const framed = buildFramedPrompt({ contract: input.contract, material: input.material });
  const request: ProviderCallRequest = {
    runId: input.story.runId,
    subjectItemId: input.story.workItemId,
    callSiteKey: storyCallSiteKey(input.site, input.round),
    role: STORY_SITE_ROLES[input.site],
    lane: "story",
    bound: input.bound,
    contractHash: input.contractHash,
    providerRef: input.providerRef,
    packet: framed.packet,
    classifyContent: input.classifyContent,
    buildRepairPacket: (rejected) => buildFramedRepairPrompt(framed, schemaFailureLocator(rejected))
  };
  return Object.freeze(request);
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
    pointNumbers: null
  };
  return Object.freeze(record);
}

/**
 * The record written when the first one could not be: FAILED/STORY_UNEXPECTED_ERROR.
 * It carries NO verdict basis and no point numbers, so the repository's
 * parse-before-seal cannot refuse it for the same reason it refused the first.
 */
function fallbackRecord(input: StoryWriteInput, pack: StoryPack | null): StoryRecordInput {
  return Object.freeze({ ...failedRecord(input, "STORY_UNEXPECTED_ERROR", pack), verdictBasis: null });
}

function recordFromOutcome(
  input: StoryWriteInput,
  pack: StoryPack,
  outcome: StoryLoopOutcome,
  refMap: ReadonlyMap<string, string>
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
    pointNumbers: pointNumbersFrom(refMap)
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
    reservation: outcome.reservation
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

  async #compose(input: StoryWriteInput): Promise<StoryRecordInput> {
    const pack = this.#deps.pack;
    if (!isStoryPack(pack)) return failedRecord(input, "STORY_PACK_INVALID", null);
    const policy = this.#deps.policy;
    if (policy === null) return failedRecord(input, "STORY_NOT_CONFIGURED", pack);
    // Hosted spends money, and a story with no sealed ceiling of its own would be
    // refused by the gateway anyway (STORY_ENVELOPE_MISSING), after the material
    // was read and with a code the loop cannot name. Refuse here, before anything.
    if (this.#deps.hosted && policy.perStoryCeilingMicros === null) {
      return failedRecord(input, "STORY_ENVELOPE_MISSING", pack);
    }
    const resolve: StoryRoleResolver = input.resolveProvider
      ?? ((roleRef) => this.#deps.resolveProvider(roleRef));
    const storyteller = resolve(policy.storytellerRoleRef);
    const checker = resolve(policy.storyCheckerRoleRef);
    if (storyteller === null || checker === null) return failedRecord(input, "STORY_ROLE_UNAVAILABLE", pack);

    const snapshot: StoryRunSnapshot = {
      runId: input.runId,
      workItemId: input.workItemId,
      answerId: input.answerId,
      answerVersion: input.answerVersion,
      questionLine: input.questionLine,
      compositionBudgetTier: input.compositionBudgetTier,
      verdictBasis: input.verdictBasis,
      servedStatement: input.servedStatement,
      nodes: input.nodes,
      arrows: input.arrows,
      sensitivity: input.sensitivity,
      setAside: input.setAside
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
    const built = buildStoryMaterial({
      snapshot,
      enrichment: enrichmentWithoutNodeIds(enrichment),
      budgetBytes: policy.materialBudget[input.compositionBudgetTier],
      shapeIds: new Set(pack.shapes.map((shape) => shape.id))
    });
    if (built.kind === "TOO_LARGE") {
      this.#log("STORY_MATERIAL_TOO_LARGE", () => ({
        answerId: input.answerId, bytes: built.bytes, budgetBytes: built.budgetBytes
      }));
      return failedRecord(input, "STORY_MATERIAL_TOO_LARGE", pack);
    }

    const storytellerContract = buildStorytellerContract(pack);
    const checkerContract = buildStoryCheckerContract(pack);
    const storytellerHash = storyContractHash(storytellerContract);
    const checkerHash = storyContractHash(checkerContract);
    const outcome = await runStoryLoop({ maxRounds: policy.loopMaxRounds }, {
      writeStory: async ({ round, priorObjection }) => {
        const request = storyCallRequest({
          story: input,
          site: "STORYTELLER",
          round,
          providerRef: storyteller.providerRef,
          bound: policy.storytellerBound,
          contract: storytellerContract,
          contractHash: storytellerHash,
          material: toStoryPromptMaterial(built.material, priorObjection),
          classifyContent: (content) => classifyStoryContent(content, built.index)
        });
        const result = await stepLease(() => storyteller.provider.call(request));
        // Short refs on purpose: the checker judges this body against the SAME
        // material the storyteller read. Real ids are restored only for storage.
        const body: StoryBody = parseStoryBody(result.content, built.index);
        return {
          artifactRef: result.rawArtifactRef,
          callSiteKey: request.callSiteKey,
          lineage: lineageOf(result, storyteller.providerRef),
          body
        };
      },
      checkStory: async ({ round, candidate }) => {
        const request = storyCallRequest({
          story: input,
          site: "CHECKER",
          round,
          providerRef: checker.providerRef,
          bound: policy.checkerBound,
          contract: checkerContract,
          contractHash: checkerHash,
          material: toCheckerPromptMaterial(built.material, candidate),
          classifyContent: (content) => classifyCheckerContent(content)
        });
        const result = await stepLease(() => checker.provider.call(request));
        return {
          artifactRef: result.rawArtifactRef,
          callSiteKey: request.callSiteKey,
          lineage: lineageOf(result, checker.providerRef),
          verdict: parseCheckerVerdict(result.content)
        };
      }
    });
    // Why a story failed, or why an earlier draft is the one served: codes only.
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
    return recordFromOutcome(input, pack, outcome, built.refMap);
  }
}
