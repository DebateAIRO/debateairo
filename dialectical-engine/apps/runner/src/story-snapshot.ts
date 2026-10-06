import type { CompositionBudgetTier, WayOfKnowing } from "@debateai/kernel";
import {
  withoutStoryNodeIds,
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
  readonly compositionBudgetTier: CompositionBudgetTier;
  readonly verdict: {
    readonly label: "SUPPORTED" | "CONTESTED" | "UNSUPPORTED";
    readonly rung: 0 | 1 | 2 | 3 | 4;
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

export function buildStoryRunSnapshot(source: StorySnapshotSource): StoryWriteInput {
  const baseById = new Map(source.baseStrengths.map((row) => [row.nodeId, row.baseStrength] as const));
  const finalById = new Map(source.finalStrengths.map((row) => [row.nodeId, row.strength] as const));
  const nodeScoped = source.conditionMarkRecords.filter((record) => record.scope === "node");
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
      marks: source.answerMarks.map(withoutNodeIds)
    },
    servedStatement: Object.freeze(source.servedSegments.map((segment) => segment.text)),
    nodes: Object.freeze(source.authored.map((node) => Object.freeze({
      nodeId: node.nodeId,
      claim: node.statement,
      isPosition: source.positionNodeIds.has(node.nodeId),
      wayOfKnowing: node.wayOfKnowing,
      baseScore: baseById.get(node.nodeId) ?? null,
      finalStrength: finalById.get(node.nodeId) ?? null,
      excludedReason: excludedReasonOf(node.nodeId),
      authorModel: node.maker,
      panelDispersion: node.panelDispersion,
      criticSummary: withoutNodeIds(node.reversalPoint)
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
    ...(source.roleMakers === undefined ? {} : { roleMakers: source.roleMakers })
  });
}
