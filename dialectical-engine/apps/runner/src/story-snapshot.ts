import {
  DEBATE_SHAPE_MARKS, type CompositionBudgetTier, type DebateShapeMark, type EngineCitedExtract, type EngineQuestionKind, type ReadingLevel,
  type WayOfKnowing
} from "@debateai/kernel";
import type { VerdictState } from "@debateai/contract";
import { MAP_ENGINE_INTERNAL_FIELD_NAMES, mapAlsoRaisedOf, type MapResult } from "@debateai/map";
import type { EngineSettings, LengthGuidance } from "@debateai/register";
import {
  withoutStoryNodeIds,
  type StoryAnswersNoteKind,
  type StoryBackupCandidate,
  type StoryBackupMaker,
  type StoryCostFallback,
  type StoryRoleMaker,
  type StoryRoleResolver,
  type StoryRunRoleMakers,
  type StoryStepLease,
  type StoryWriteInput
} from "@debateai/story";

/**
 * VERDICT STORY — the runner's in-memory material, projected for the story at
 * the post-settle hook (spec §3.1 step 1). Built INSIDE the run's content lease,
 * where the material lives; the story itself runs after that lease, under the
 * step lease this snapshot carries. Pure and total: it throws nowhere, because
 * the hook runs after the work item is DONE and nothing that fails there may
 * reach the Hatchet failure path. (The hook guards it anyway.)
 *
 * Structural input on purpose: the authored-node record is a type local to
 * `execute`, and this module states only the members the story reads.
 *
 * The models never see a node id (packages/story numbers the points P1…Pn), so
 * every FREE-TEXT field this module passes on — a set-aside or exclusion
 * reason, a critic line, an answer mark — is cleared of node ids here, at the
 * source. And the arrows travel in the engine's fixed arrow order, so the same
 * debate always numbers its points the same way.
 */

/** Node-scoped disclosures that take a point out of the served number or its view. */
const EXCLUDING_MARKS: ReadonlySet<string> = new Set(["HIDDEN-UNJUDGEABLE", "HIDDEN-LOW-SCORE"]);
/** Branches the debate stopped: frozen by adaptive stopping, or halted by transport. */
const SET_ASIDE_MARKS: ReadonlySet<string> = new Set(["BRANCH-FROZEN-LOW-LEVERAGE", "UNAUTHORED-BRANCH-HALTED"]);
/**
 * The story's own words for a mark whose recorded reason names node ids: the
 * branch-freeze record names the frozen branch and every root by id
 * (`buildBranchFrozenRecord`). The recorded reason stays on the answer, untouched.
 */
const STORY_REASON_BY_MARK: ReadonlyMap<string, string> = new Map([[
  "BRANCH-FROZEN-LOW-LEVERAGE",
  "Adaptive stopping froze this branch: its leverage on the positions was below the sealed branch-freeze "
    + "threshold, so nothing was expanded beneath it"
]]);
/**
 * Debate shape (Task 14; Task 12 note): the twelve shape marks say how the debate was run (the map's fallbacks, fills and answer check,
 * a close call that gained graders, a point that got scrutiny), and their records carry codes only. The story is never
 * handed them — neither the marks nor their reasons — so the story writer never reads a raw code. None on today's run.
 */
const STORY_OMITTED_MARKS: ReadonlySet<string> = new Set(DEBATE_SHAPE_MARKS);
/**
 * R22 (owner ruling 2026-10-29): the coded reason of a halted-branch record whose leg was given up because its author's
 * reply was refused after its repairs (`haltedExpansionConditionRecord` in ./index.ts). Like the shape marks' coded
 * reasons, the story is never handed it, so the story writer never reads a raw code; the answer still carries the mark,
 * which the story sees by name. Owner wording pending: the sentence that would replace this code is AI-facing (the
 * story reads a record's reason), so it waits for the owner's approval.
 */
export const CONTENT_REFUSED_HALT_REASON = "EXPANSION_HALTED_CONTENT_REFUSED" as const;
/** Free text with every node-id-shaped run replaced: the safety net under every field below. */
const withoutNodeIds = withoutStoryNodeIds;

function storyReason(record: { readonly mark: string; readonly reason: string }): string {
  return withoutNodeIds(`${record.mark}: ${STORY_REASON_BY_MARK.get(record.mark) ?? record.reason}`);
}

export interface StorySnapshotSource {
  readonly runId: string;
  readonly workItemId: string;
  readonly answerId: string;
  readonly answerVersion: number;
  readonly questionLine: string;
  /** The question's language the run recorded (its frozen head's tag and English name), or null. */
  readonly argumentLanguage: { readonly tag: string; readonly name: string } | null;
  /**
   * Question-language spec 2026-10-13: true only when the run's shape receipt says the language was locked, so the
   * story writes in that lock; the caller decides by the receipt, never by the stored tag. Absent: today's story.
   */
  readonly languageLocked?: boolean;
  /** V4 reading level (owner N6, 2026-10-29): the run's level, or null / absent — today's story. */
  readonly readingLevel?: ReadingLevel | null;
  /**
   * Web search (W4-1; design §7.1 item 7): the extract each looked-up node cites, by node id (only this debate's). Any:
   * each node carries its extract and the storyteller is told item 7 (`webSources`). Absent or empty: today's story.
   */
  readonly citedExtracts?: ReadonlyMap<string, EngineCitedExtract>;
  readonly compositionBudgetTier: CompositionBudgetTier;
  readonly verdict: {
    /** The contract's closed list (B4 Minor 2, R2b final wave P2), so a fifth state cannot be missed here. */
    readonly label: VerdictState;
    /** 0-4: engine 1's ladder rung; 5: the comparing judges (engine 2). */
    readonly rung: 0 | 1 | 2 | 3 | 4 | 5;
    readonly trigger: string;
  };
  readonly servedRootNodeId: string;
  readonly servedStrength: number;
  readonly runnerUp: { readonly nodeId: string; readonly strength: number } | null;
  readonly margin: { readonly kind: "MEASURED"; readonly value: number } | { readonly kind: "ABSENT"; readonly reason: string };
  /** The same quantity the label's disagreement rung read (`verdictLabelBasis.disagreement`). */
  readonly disagreement:
    | { readonly kind: "MEASURED"; readonly value: number }
    | { readonly kind: "ABSENT"; readonly reason: string };
  readonly thresholds: {
    readonly gamma: number;
    readonly highCut: number;
    readonly lowCut: number;
    readonly disagreementThreshold: number;
  };
  readonly confidenceBand: string | null;
  readonly answerMarks: readonly string[];
  readonly servedSegments: readonly { readonly text: string }[];
  readonly authored: readonly {
    readonly nodeId: string;
    readonly statement: string;
    readonly provenanceRef: string;
    readonly wayOfKnowing: WayOfKnowing;
    readonly reversalPoint: string;
    readonly maker: string;
    readonly panelDispersion: number | null;
  }[];
  readonly positionNodeIds: ReadonlySet<string>;
  /** Engine 2 + map (R3, P2.6): a position's words, by root node id; absent = the node's statement (today). */
  readonly positionWords?: ReadonlyMap<string, string> | undefined;
  readonly baseStrengths: readonly { readonly nodeId: string; readonly baseStrength: number | null }[];
  readonly finalStrengths: readonly { readonly nodeId: string; readonly strength: number }[];
  /** Every arrow of the debate's graph, whatever order they were read in. */
  readonly arrows: readonly {
    readonly arrowId: string;
    readonly sourceNodeId: string;
    readonly targetKind: string;
    readonly targetNodeId: string | null;
    readonly polarity: string;
  }[];
  /** The engine's fixed arrow order (the graph snapshot's `arrowOrder`). */
  readonly arrowOrder: readonly string[];
  readonly sensitivity: readonly { readonly removedNodeId: string; readonly leverage: number }[];
  readonly conditionMarkRecords: readonly {
    readonly mark: string;
    readonly scope: string;
    readonly subjectRef: string;
    readonly reason: string;
    readonly affectedNodeIds: readonly string[];
  }[];
  readonly resolveProvider: StoryRoleResolver;
  /** One story step under the run's disclosure lease (the story runs after the run's own lease). */
  readonly stepLease: StoryStepLease;
  /**
   * Engine money rule, Task M7 (spec §14.4.6): the run's cost fallback over the
   * SAME claim-eligible makers `resolveProvider` answers from, cheapest first
   * by the runner's price map (`storyCostFallback`).
   */
  readonly costFallback: StoryCostFallback;
  /**
   * Part 4, P4-D (P3-N1): the run's own story roles — set by the runner only
   * for a pinned assignment whose answer job has a SCORECARD seat
   * (`storySeatRoleMaker`); absent on every other run, whose story keeps the
   * register's refs.
   */
  readonly roleMakers?: StoryRunRoleMakers | undefined;
  /**
   * Debate shape P2c (spec 2026-10-12 §3.3 step 8): the map's points that were raised but
   * not debated (`storyAlsoRaisedFrom`). Undefined when the run had no map choice, so the
   * story's material stays exactly today's.
   */
  readonly alsoRaised?: readonly { readonly claim: string; readonly raisedBy: number }[] | undefined;
  /**
   * Debate shape P2c, owner ruling C-STORY: why not every answer argued was picked the usual way
   * (`storyAnswersNoteFrom`). Undefined on today's run and on a map that chose everything itself.
   */
  readonly answersNote?: StoryAnswersNoteKind | undefined;
  /** Length guidance (spec 2026-10-15 §3.1): the run's frozen numbers, only when the receipt carries them. */
  readonly lengthGuidance?: LengthGuidance | undefined;
  /**
   * Engine redesign R1d (spec 2026-10-15 §7; INTERFACE §3.3, §5.1): the run's receipt `engine` member
   * (`engineOfRun(envelopeBasis)` when it is engine 2). With the length table above, the story is told v4. Null or
   * absent: an engine-1 debate, whose story keeps today's bytes.
   */
  readonly engine?: EngineSettings | null;
  /** R2 (INTERFACE §9.9): the comparing judges' question kinds, handed on to the story; the runner sets it under engine 2 only. */
  readonly questionKinds?: readonly EngineQuestionKind[];
  /**
   * R1d (spec §7.2 item 11): the backup storyteller's candidates, the run's claim-eligible members in its stored panel's
   * order (`storyBackupCandidatesFrom`), without the members the preview's sit-out book has benched. The runner hands
   * them over only for an engine-2 debate.
   */
  readonly backupCandidates?: readonly StoryBackupCandidate[];
  /**
   * R1d (whole-branch review Minor 1, ruling W1): every claim-eligible member's maker, BEFORE the sit-out filter
   * (`storyBackupMakersFrom`), out-of-panel register refs included, so the backup's maker rule knows the resolved roles'
   * makers even when their refs are not candidates. Handed over only for an engine-2 debate.
   */
  readonly backupMakers?: readonly StoryBackupMaker[];
}

/**
 * Part 4, P4-D (P3-N1; controller C3, 3 October 2026): the story role a
 * SCORECARD answer seat hands the story — the seat member the served round
 * recorded (`writerPlannedByRound` / `checkerPlannedByRound`: the member that
 * answered last, main or runner-up). No answered round (a floor answer), or a
 * ref that names neither member: the seat's main. No seat — a legacy run, or a
 * FALLBACK answer seat — null, so the register's ref decides as before.
 *
 * The member's gateway is the seat's own (`stampCandidateGateway` over the
 * configured gateway), so the story lane's money ceiling and the ledger apply
 * to every story call it makes, with the candidate stamped on the row.
 */
export function storySeatRoleMaker(
  seat: Readonly<{ main: StoryRoleMaker; runnerUp: StoryRoleMaker | null }> | null,
  plannedRef: string | undefined
): StoryRoleMaker | null {
  if (seat === null) return null;
  const member = seat.runnerUp !== null && seat.runnerUp.providerRef === plannedRef ? seat.runnerUp : seat.main;
  return Object.freeze({ provider: member.provider, providerRef: member.providerRef });
}

/**
 * The run's claim-eligible members in its STORED panel's order (`discoveredPanel`), each once; a claim-eligible member
 * that is not on the panel is never taken. The one ordering the story's rotated roles and its backup storytellers share.
 */
function claimEligibleInPanelOrder<T extends Readonly<{ providerRef: string }>>(
  panelRefs: readonly string[],
  claimEligible: readonly T[]
): readonly T[] {
  const eligibleByRef = new Map(claimEligible.map((member) => [member.providerRef, member] as const));
  const seen = new Set<string>();
  return panelRefs.flatMap((ref) => {
    const member = eligibleByRef.get(ref);
    if (member === undefined || seen.has(ref)) return [];
    seen.add(ref);
    return [member];
  });
}

/**
 * Role rotation, Task 12 (spec 2026-10-11 Part 6, "Story roles"; the orchestrator's "always an answer"): a rotated
 * run's story pair. A pinned story member that is claim-eligible keeps its role. One that is not hands it to another
 * claim-eligible member of the run's STORED panel (`discoveredPanel`), in that panel's order, skipping every member not
 * claim-eligible:
 * - the storyteller: the first member of another maker than the pinned story checker, when that checker can serve
 *   (so the pinned checker keeps its role whenever it can); otherwise the first member;
 * - the story checker: the pinned one when it can serve and its maker differs from the storyteller ACTUALLY serving
 *   (re-checked when the storyteller fell back); otherwise the first member of another maker than that storyteller.
 * A role with no such member reads null, and the story package then takes the register's story ref, exactly as for a
 * FALLBACK seat; the runner resolves that ref on a rotated run only when it is a panel ref, else STORY_ROLE_UNAVAILABLE.
 * A claim-eligible member that is not on the panel is never taken. Pure; each member keeps its own gateway object.
 */
export function storyRotationRoleMakers(input: Readonly<{
  panelRefs: readonly string[];
  claimEligible: readonly Readonly<{ provider: StoryRoleMaker["provider"]; providerRef: string; maker: string }>[];
  storytellerRef: string;
  storyCheckerRef: string;
}>): StoryRunRoleMakers {
  const inPanelOrder = claimEligibleInPanelOrder(input.panelRefs, input.claimEligible);
  const pinnedStoryteller = inPanelOrder.find((member) => member.providerRef === input.storytellerRef);
  const pinnedChecker = inPanelOrder.find((member) => member.providerRef === input.storyCheckerRef);
  const storyteller = pinnedStoryteller
    ?? inPanelOrder.find((member) => pinnedChecker === undefined || member.maker !== pinnedChecker.maker)
    ?? inPanelOrder[0];
  const checker = pinnedChecker !== undefined && pinnedChecker.maker !== storyteller?.maker
    ? pinnedChecker
    : inPanelOrder.find((member) => member.maker !== storyteller?.maker);
  const roleMaker = (member: (typeof inPanelOrder)[number] | undefined): StoryRoleMaker | null =>
    member === undefined ? null : Object.freeze({ provider: member.provider, providerRef: member.providerRef });
  return Object.freeze({ storyteller: roleMaker(storyteller), checker: roleMaker(checker) });
}

/**
 * Engine redesign R1d (spec 2026-10-15 §7.2 item 11, "the next AI in the story rotation"): the backup storyteller's
 * candidates — the run's claim-eligible members in its stored panel's order, each with its own gateway and maker. The
 * story package picks the first whose maker is neither the first storyteller's nor the checker's
 * (`pickBackupStoryteller`). Pure.
 */
export function storyBackupCandidatesFrom(input: Readonly<{
  panelRefs: readonly string[];
  claimEligible: readonly Readonly<{ provider: StoryRoleMaker["provider"]; providerRef: string; maker: string }>[];
}>): readonly StoryBackupCandidate[] {
  return Object.freeze(claimEligibleInPanelOrder(input.panelRefs, input.claimEligible)
    .map((member) => Object.freeze({ provider: member.provider, providerRef: member.providerRef, maker: member.maker })));
}

/**
 * Engine redesign R1d (whole-branch review Minor 1, ruling W1): the backup's maker rule's makers — every claim-eligible
 * member of the run, in the order given, BEFORE the sit-out filter, out-of-panel register refs included, each as its ref
 * and maker only (no gateway: none of them is offered). Pure.
 */
export function storyBackupMakersFrom(
  claimEligible: readonly Readonly<{ providerRef: string; maker: string }>[]
): readonly StoryBackupMaker[] {
  return Object.freeze(claimEligible.map((member) => Object.freeze({ providerRef: member.providerRef, maker: member.maker })));
}

/**
 * The arrows in the engine's fixed order. An arrow the order does not list is
 * never dropped: it follows, in the order it was read, so every argued point
 * keeps the arrow that ties it to the debate.
 */
function inArrowOrder<T extends { readonly arrowId: string }>(arrows: readonly T[], arrowOrder: readonly string[]): readonly T[] {
  const position = new Map(arrowOrder.map((arrowId, index) => [arrowId, index] as const));
  return arrows
    .map((arrow, readAt) => ({ arrow, rank: position.get(arrow.arrowId) ?? arrowOrder.length + readAt }))
    .sort((left, right) => left.rank - right.rank)
    .map(({ arrow }) => arrow);
}

/** The members of P2b's `MapResult` (@debateai/map) this module reads. */
export type StoryMapSource = Pick<MapResult, "keyPoints" | "mergedAnswers" | "choice">;

/**
 * Debate shape P2c: the map choice's "also raised, not debated" points, most-raised first, each with how many
 * different makers raised it. A claim is cleared of node ids like every free text here. No map, or a map that chose
 * nothing: undefined. Whole-branch review m-3/m-4 (ruling W-CUT): the list is @debateai/map's `mapAlsoRaisedOf`, the
 * one the debate page's stored list is built with: a chosen answer past the `arguedAnswers` the run argued is listed
 * too, with the points only it took, and claims that say the same are one entry.
 */
export function storyAlsoRaisedFrom(
  map: StoryMapSource | null,
  arguedAnswers: number,
  /**
   * Engine 2 (spec §5.2 item 8): unchosen answers too, never one the answer check failed (deviation 8), by its words
   * (`mapCheckFailedStatements`) and by the merged answer behind it (`mapCheckFailedMergedAnswerIds`, amendment A9-1).
   */
  engine?: Readonly<{ checkFailed: readonly string[]; checkFailedMergedAnswerIds: readonly string[] }>
): readonly { readonly claim: string; readonly raisedBy: number }[] | undefined {
  if (map === null || map.choice === null) return undefined;
  return Object.freeze(mapAlsoRaisedOf({ choice: map.choice, keyPoints: map.keyPoints, mergedAnswers: map.mergedAnswers, arguedAnswers,
    ...(engine === undefined ? {} : { unchosenAnswers: true as const, checkFailed: engine.checkFailed,
      checkFailedMergedAnswerIds: engine.checkFailedMergedAnswerIds, internalNames: MAP_ENGINE_INTERNAL_FIELD_NAMES }) })
    .map((entry) => Object.freeze({ claim: withoutNodeIds(entry.claim), raisedBy: Math.max(1, new Set(entry.makers).size) })));
}

/** The members of P2b's `MapResult` the answers note reads; structural, like `StoryMapSource`. */
export type StoryMapOutcome = Readonly<{
  kind: "MAP" | "UNAVAILABLE";
  marks: readonly Readonly<{ mark: string }>[];
}>;

/**
 * Debate shape P2c, owner ruling C-STORY: the plain sentence, if any, the story owes the person about how the answers
 * argued came about. Read from the map's whole result and its marks (the runner's `shapeMapResult`, never
 * `debateShapeMap`, which is null exactly when the map fell back). The map unavailable, or today's opening argued
 * because the map gave fewer than two positions (`arguedTodaysOpening`; no mark records that case), is MAP_UNAVAILABLE;
 * an answer or a point the code filled in is ANSWERS_FILLED. The map's other fallbacks change how the map was made, not
 * which answers were argued: no note. No map (today's run): undefined, so the story's material stays today's.
 */
export function storyAnswersNoteFrom(map: StoryMapOutcome | null, arguedTodaysOpening: boolean): StoryAnswersNoteKind | undefined {
  if (map === null) return undefined;
  const marked = (mark: DebateShapeMark): boolean => map.marks.some((record) => record.mark === mark);
  if (arguedTodaysOpening || map.kind === "UNAVAILABLE" || marked("MAP_UNAVAILABLE_TODAYS_OPENING")) return "MAP_UNAVAILABLE";
  if (marked("ANSWERS_FILLED") || marked("CHOOSE_QUOTA_FILLED")) return "ANSWERS_FILLED";
  return undefined;
}

export function buildStoryRunSnapshot(source: StorySnapshotSource): StoryWriteInput {
  const baseById = new Map(source.baseStrengths.map((row) => [row.nodeId, row.baseStrength] as const));
  const finalById = new Map(source.finalStrengths.map((row) => [row.nodeId, row.strength] as const));
  const nodeScoped = source.conditionMarkRecords.filter((record) => record.scope === "node" && !STORY_OMITTED_MARKS.has(record.mark)
    && record.reason !== CONTENT_REFUSED_HALT_REASON);
  const excludedReasonOf = (nodeId: string): string | null => {
    const record = nodeScoped.find((candidate) =>
      (EXCLUDING_MARKS.has(candidate.mark) || SET_ASIDE_MARKS.has(candidate.mark))
      && (candidate.subjectRef === nodeId || candidate.affectedNodeIds.includes(nodeId)));
    return record === undefined ? null : storyReason(record);
  };
  return Object.freeze({
    runId: source.runId,
    workItemId: source.workItemId,
    answerId: source.answerId,
    answerVersion: source.answerVersion,
    questionLine: source.questionLine,
    argumentLanguage: source.argumentLanguage === null
      ? null
      : Object.freeze({ tag: source.argumentLanguage.tag, name: source.argumentLanguage.name }),
    compositionBudgetTier: source.compositionBudgetTier,
    verdictBasis: {
      label: source.verdict.label,
      rung: source.verdict.rung,
      trigger: source.verdict.trigger,
      winner_node_id: source.servedRootNodeId,
      winner_strength: source.servedStrength,
      runner_up_node_id: source.runnerUp?.nodeId ?? null,
      runner_up_strength: source.runnerUp?.strength ?? null,
      margin: source.margin.kind === "MEASURED" ? source.margin.value : null,
      disagreement: source.disagreement.kind === "MEASURED" ? source.disagreement.value : null,
      thresholds: {
        gamma: source.thresholds.gamma,
        high_cut: source.thresholds.highCut,
        low_cut: source.thresholds.lowCut,
        disagreement: source.thresholds.disagreementThreshold
      },
      confidence_band: source.confidenceBand,
      marks: source.answerMarks.filter((mark) => !STORY_OMITTED_MARKS.has(mark)).map(withoutNodeIds)
    },
    servedStatement: Object.freeze(source.servedSegments.map((segment) => segment.text)),
    nodes: Object.freeze(source.authored.map((node) => Object.freeze({
      nodeId: node.nodeId,
      claim: source.positionNodeIds.has(node.nodeId) ? (source.positionWords?.get(node.nodeId) ?? node.statement) : node.statement,
      isPosition: source.positionNodeIds.has(node.nodeId),
      wayOfKnowing: node.wayOfKnowing,
      baseScore: baseById.get(node.nodeId) ?? null,
      finalStrength: finalById.get(node.nodeId) ?? null,
      excludedReason: excludedReasonOf(node.nodeId),
      authorModel: node.maker,
      panelDispersion: node.panelDispersion,
      criticSummary: withoutNodeIds(node.reversalPoint),
      ...(source.citedExtracts?.has(node.nodeId) === true ? { citedExtract: source.citedExtracts.get(node.nodeId)! } : {})
    }))),
    arrows: Object.freeze(inArrowOrder(source.arrows, source.arrowOrder).map((arrow) => Object.freeze({
      sourceNodeId: arrow.sourceNodeId,
      targetNodeId: arrow.targetKind === "NODE" ? arrow.targetNodeId : null,
      polarity: arrow.polarity === "attack" ? "attack" as const : "support" as const
    }))),
    sensitivity: Object.freeze(source.sensitivity.map((record) => Object.freeze({
      removedNodeId: record.removedNodeId,
      leverage: record.leverage
    }))),
    setAside: Object.freeze(nodeScoped
      .filter((record) => SET_ASIDE_MARKS.has(record.mark))
      .map((record) => Object.freeze({ nodeId: record.subjectRef, reason: storyReason(record) }))),
    judgeArtifactRefs: new Map(source.authored.map((node) => [node.nodeId, node.provenanceRef] as const)),
    resolveProvider: source.resolveProvider,
    stepLease: source.stepLease,
    costFallback: source.costFallback,
    ...(source.roleMakers === undefined ? {} : { roleMakers: source.roleMakers }),
    ...(source.questionKinds === undefined ? {} : { questionKinds: Object.freeze([...source.questionKinds]) }),
    ...(source.alsoRaised === undefined
      ? {}
      : { alsoRaised: Object.freeze(source.alsoRaised.map((item) => Object.freeze({ claim: item.claim, raisedBy: item.raisedBy }))) }),
    ...(source.answersNote === undefined ? {} : { answersNote: source.answersNote }),
    ...(source.lengthGuidance === undefined ? {} : { lengthGuidance: source.lengthGuidance }),
    ...(source.languageLocked === true ? { languageLocked: true as const } : {}),
    ...(source.readingLevel === undefined || source.readingLevel === null ? {} : { readingLevel: source.readingLevel }),
    // W4-1: told only when a node of the material carries an extract (`storyContractForSources`).
    ...(source.authored.some((node) => source.citedExtracts?.has(node.nodeId) === true) ? { webSources: true as const } : {}),
    // R1d: the receipt's engine and the backup storytellers, only when the runner handed them over (an engine-2 debate).
    ...(source.engine === undefined || source.engine === null ? {} : { engine: source.engine }),
    ...(source.backupCandidates === undefined ? {} : { backupCandidates: Object.freeze([...source.backupCandidates]) }),
    ...(source.backupMakers === undefined ? {} : { backupMakers: Object.freeze([...source.backupMakers]) })
  });
}
