import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Pool } from "pg";
import {
  ProviderProbeRepository,
  RunRepository,
  assertNoOpenWriteTransaction,
  withRunContentLease,
  withWriteTransaction,
  type CompletionActivationResolution,
  type DiscoveredPanelMember
} from "@debateai/db";
import {
  WorkItemRepository,
  assertClaimCoversCall,
  type TerminalCompletionDeclaration
} from "@debateai/battery";
import { GraphRepository, recordEdgeMeasurementsOnClient } from "@debateai/graph";
import {
  Judge,
  JudgementRepository,
  insertPreparedNodeReview,
  translateNodeReviewFailure,
  applyCorrelatedErrorDiscount,
  applyDeclaredDisagreement,
  bindWayOfKnowingDowngrade,
  createUnmeasuredDisagreement,
  measureDispersion,
  reduceAssessment,
  runJudgePanel,
  selectReducedJudgement,
  type ClaimType,
  type CompositionMapRegisterRow,
  type JudgeAssessment,
  type JudgeFamily,
  type JudgementSelectionRule,
  type WayOfKnowingDowngradeRecord
} from "@debateai/judgement";
import { LedgerRepository } from "@debateai/ledger";
import {
  ENGINE_BRANCHING_FACTOR,
  ENGINE_COMPOSITION_SEGMENT_CAP,
  ENGINE_FIXED_ORGANS_PER_COMPOSITION,
  ENGINE_MAX_RECOMPOSE,
  resolveScoringOperator
} from "@debateai/register";
import {
  BudgetRepository,
  BATTERY_BUDGET_CONTRACTS,
  parseCostEnvelopeBasis,
  type BudgetPressureDecision
} from "@debateai/budget";
import { evaluate, type EvaluationSnapshot } from "@debateai/propagation";
import {
  ValuationRepository,
  buildValueOverlay,
  serveMixedAnswer,
  type CriterionCandidate,
  type MixedValueAnswer,
  type OptionVector,
  type WeightSource
} from "@debateai/valuation";
import {
  OpenAICompatibleProviderGateway,
  ProviderCallFailedError,
  ProviderContentUnacceptedError,
  type CallBound,
  type ContentClassification,
  type OpenAICompatibleGatewayOptions,
  type PromptPacket,
  type ProviderCallRequest,
  type ProviderCallResult,
  type ProviderGateway
} from "@debateai/providers";
import {
  buildFactBundle,
  compositionEvidenceRequired,
  createEnvelopeExhaustedResult,
  deriveBandCeiling,
  deriveVerdictLabel,
  LABEL_BASIS_INCOMPLETE_MARK,
  runServeGateChain,
  ServeRepository,
  type BandCeilingRegisterRow,
  type ComposedSegment,
  type CompositionBudgetResolution,
  type ConditionMarkRecord,
  type DigestSourceNode,
  type EvaluatorRequest,
  type EvaluatorVerdict,
  type FactBundle,
  type PreservedConditionMarkRecord,
  type ServeGateResult,
  type ServeNode,
  type SynthesizerRequest,
  type VerdictLabelBasis
} from "@debateai/serve";
import { SERVED_ROOT_SELECTION_RULE, TypedDomainError, type CompositionBudgetTier, type ServedRootRule, type WayOfKnowing } from "@debateai/kernel";
import { MemoryRepository, renderMemorySentence, validateMemorySentence } from "@debateai/memory";
import type { Hatchet, TaskWorkflowDeclaration } from "@hatchet-dev/typescript-sdk";

export const RUNNER_BRANCHING_FACTOR = ENGINE_BRANCHING_FACTOR;
export const RUNNER_COMPOSITION_SEGMENT_CAP = ENGINE_COMPOSITION_SEGMENT_CAP;
export const RUNNER_FIXED_ORGANS_PER_COMPOSITION = ENGINE_FIXED_ORGANS_PER_COMPOSITION;
export const RUNNER_MAX_RECOMPOSE = ENGINE_MAX_RECOMPOSE;

const compositionSchema = z.object({
  segments: z.array(z.object({
    segment_id: z.string().trim().min(1),
    text: z.string().trim().min(1),
    node_refs: z.array(z.string().trim().min(1)),
    served_number_refs: z.array(z.string().trim().min(1))
  }).strict()).min(1).max(RUNNER_COMPOSITION_SEGMENT_CAP, "Composer output exceeds the engine segment cap")
}).strict();
// T9 retired the CONFORMANCE and post-compose-R9 organ schemas with the gates
// they served: both limbs are evaluator objection criteria now, graded in one
// EVALUATOR call whose wire shape is `evaluatorVerdictSchema` below.
/**
 * T9: the EVALUATOR organ's wire shape. One call grades the whole candidate on
 * the five criteria — the three the goal names (fairness to losers,
 * statement-label agreement, overstatement) plus the two re-routed gates
 * (restatement, citation tracing). `satisfied` is checked against the criteria
 * by `assertEvaluatorVerdict` in the serve package, so a provider cannot claim
 * satisfaction while failing a criterion.
 */
const evaluatorVerdictSchema = z.object({
  satisfied: z.boolean(),
  objection: z.string().nullable(),
  criteria: z.object({
    fairness_to_losers: z.boolean(),
    statement_label_agreement: z.boolean(),
    no_overstatement: z.boolean(),
    restatement: z.boolean(),
    citation_tracing: z.boolean()
  }).strict()
}).strict();

/**
 * FAIR-01 (DR-140(b)): the SECOND real maker's leg. When configured, the
 * critic maker judges the strongest genuine counter-position through the same
 * ruled JUDGE organ, and the counter joins the answer graph as a first-class
 * defeater node with an attack edge — a rival judgement whose independence is
 * carried by recorded per-artifact maker lineage. Deliberately NOT the S08
 * CROSS critique-packet instrument: DR-141(4) rules that a run carrying
 * critique packets REFUSES at terminal (Q42 `critic_agrees` has no recorded
 * shape) until V rules the recording migration. When absent, the runner stays
 * honestly single-node (DR-137 mono-model runs remain lawful; DR-143 clause 1
 * keeps the >1-maker law run-level, enforced on the acceptance debate).
 */
export interface RunnerCritiqueSettings {
  readonly provider: ProviderGateway;
  readonly providerRef: string;
  readonly maker: string;
}

/**
 * S2-2 / T3 — the sealed T16 panel inputs as the runner consumes them. Every
 * member is READ from a register row by the deployment's boot; the runner binds
 * identifiers only and never restates a value (T16 consumer discipline).
 */
export interface RunnerPanelPolicy {
  readonly registerVersion: number;
  readonly dispersionScale: number;
  readonly repeatedFamilyMultiplier: number;
  readonly disagreementThreshold: number;
  /** The sealed band vocabulary's one-step-down map, total over the band order. */
  readonly oneStepDown: Readonly<Record<string, string>>;
  readonly providerFamilies: readonly {
    readonly familyRef: string;
    readonly providerRefs: readonly string[];
  }[];
  /** The sealed reason an unmapped provider carries; UNKNOWN is discount-exempt. */
  readonly unmappedReason: string;
  readonly sourceRefs: Readonly<Record<string, string>>;
}

/**
 * S6-1 / T11 — the sealed T16 verdict-label inputs as the runner consumes them.
 * Identifiers and provenance only: no member below is ever restated in code.
 */
export interface RunnerVerdictLabelPolicy {
  readonly registerVersion: number;
  readonly gamma: number;
  readonly highCut: number;
  readonly lowCut: number;
  readonly disagreementThreshold: number;
  readonly sourceRefs: Readonly<Record<string, string>>;
}

/**
 * S6-2 / T9: the sealed T16 synthesis-role family as the runner consumes it.
 *
 * The two role refs are NAMED PROVIDER IDENTITIES chosen by ruling J8 — never
 * by this file, and never by `#1 in the configured list`. `identicalRoleRefs`
 * is carried, not re-derived: T16's reader already compared them and printed
 * the startup warning (J7), and re-comparing here would be a second opinion
 * about a sealed fact.
 */
export interface RunnerSynthesisRolePolicy {
  readonly registerVersion: number;
  readonly synthesizerRoleRef: string;
  readonly evaluatorRoleRef: string;
  readonly evaluatorLoopMaxRounds: number;
  readonly identicalRoleRefs: boolean;
  readonly sourceRefs: Readonly<Record<string, string>>;
}

/**
 * confirm-item 5: the visible marks a degraded panel leaves on the node's
 * receipt. A partial panel PROCEEDS with the voices that parsed and says so;
 * a panel whose every non-author member failed is never allowed to look like a
 * clean self-grade.
 */
export const PANEL_PARTIAL_MARK = "PANEL-PARTIAL" as const;
export const PANEL_DEGRADED_SINGLE_VOICE_MARK = "PANEL-DEGRADED-SINGLE-VOICE" as const;
/** J13(b): both are canonical `CONDITION_MARKS` members, not runner-local strings. */
export type PanelDegradationMark =
  | typeof PANEL_PARTIAL_MARK
  | typeof PANEL_DEGRADED_SINGLE_VOICE_MARK;

/** One node's panel degradation, bound to the node id the graph minted. */
interface PanelDegradationRecord {
  readonly subjectRef: string;
  readonly mark: PanelDegradationMark;
  readonly reason: string;
}

export function selectDifferentMakerReviewer<T extends { readonly maker: string }>(
  authorMaker: string,
  configuredMakers: readonly T[],
  latestReviewerMaker: string | null = null
): T {
  const candidates = configuredMakers.filter((candidate) => candidate.maker !== authorMaker);
  const reviewer = candidates.find((candidate) => candidate.maker !== latestReviewerMaker) ?? candidates[0];
  if (reviewer === undefined) {
    throw new TypedDomainError(
      "DIFFERENT_MAKER_REVIEWER_UNAVAILABLE",
      `No configured maker differs from node author ${authorMaker}`
    );
  }
  return reviewer;
}

/**
 * P8/DR-074: the raw deployment `scoringOperator` register row, resolved
 * through the SHIPPED chain (resolveScoringOperator) at the point of use. The
 * VALUE is V's at DR-023 — a missing row is a typed loud stop, never a
 * literal (AC-76/DR-039).
 */
export interface ScoringOperatorRegisterInput {
  readonly deploymentRowValue: unknown;
  readonly registerRef: string;
}

export interface RunDeathPolicy {
  readonly cooldownMs: number;
  readonly finalRetryAttempts: number;
  readonly maxCooldownHoldsPerRun: number;
}

export interface HoldProgressEvent {
  readonly kind: "node.retrying" | "ledger.could_not_do";
  readonly state: "COOLDOWN_HOLD" | "COOLDOWN_RETRY" | "MAKER_POSITION_HALTED" | "EXPANSION_HALTED" | "REVIEW_HALTED";
  readonly runId: string;
  readonly callSiteKey: string;
  readonly parentNodeId: string | null;
  readonly holdMs: number;
  readonly holdUntil: string | null;
  readonly attemptsSpent: number;
  readonly transportOutcome: "TIMED_OUT" | "FAILED";
  readonly plannedLegCount: number;
}

export interface HoldRecorder {
  countCooldownHolds(runId: string): Promise<number>;
  record(event: HoldProgressEvent): Promise<void>;
  wait(cooldownMs: number): Promise<void>;
}

export interface HaltedExpansionRecord {
  readonly callSiteKey: string;
  readonly parentNodeId: string | null;
  readonly plannedLegCount: number;
  readonly terminalTransportOutcome: "TIMED_OUT" | "FAILED";
  readonly lastLedgerEntryRef: string;
}

export function remainingProviderAttempts(maxAttempts: number, consumed: number): number {
  return maxAttempts - consumed;
}

export async function withCooldownRetry<T>(input: {
  readonly runId: string;
  readonly callSiteKey: string;
  readonly parentNodeId: string | null;
  readonly plannedLegCount: number;
  readonly baseMaxAttempts: number;
  readonly failureScope: "MAKER_POSITION" | "EXPANSION" | "REVIEW";
  readonly policy: RunDeathPolicy;
  readonly hold: HoldRecorder;
  readonly attempt: (maxAttempts: number) => Promise<T>;
}): Promise<
  | { readonly kind: "AUTHORED"; readonly value: T }
  | { readonly kind: "HALTED"; readonly record: HaltedExpansionRecord }
> {
  const halted = async (error: ProviderCallFailedError, attemptsSpent: number) => {
    const record = Object.freeze({
      callSiteKey: input.callSiteKey,
      parentNodeId: input.parentNodeId,
      plannedLegCount: input.plannedLegCount,
      terminalTransportOutcome: error.lastOutcome,
      lastLedgerEntryRef: error.lastLedgerEntryRef
    });
    await input.hold.record({
      kind: "ledger.could_not_do",
      state: input.failureScope === "EXPANSION"
        ? "EXPANSION_HALTED"
        : input.failureScope === "REVIEW" ? "REVIEW_HALTED" : "MAKER_POSITION_HALTED",
      runId: input.runId,
      callSiteKey: input.callSiteKey,
      parentNodeId: input.parentNodeId,
      holdMs: input.policy.cooldownMs,
      holdUntil: null,
      attemptsSpent,
      transportOutcome: error.lastOutcome,
      plannedLegCount: input.plannedLegCount
    });
    return { kind: "HALTED" as const, record };
  };
  const finalAttempt = async (error: ProviderCallFailedError) => {
    try {
      return {
        kind: "AUTHORED" as const,
        value: await input.attempt(input.baseMaxAttempts + input.policy.finalRetryAttempts)
      };
    } catch (retryError) {
      if (!(retryError instanceof ProviderCallFailedError)) throw retryError;
      return halted(retryError, error.attempts + retryError.attempts);
    }
  };
  try {
    return { kind: "AUTHORED", value: await input.attempt(input.baseMaxAttempts) };
  } catch (error) {
    if (!(error instanceof ProviderCallFailedError)) throw error;
    // DR-186(8): review gets every ruled provider attempt plus the final
    // attempt, but never holds the in-run loading page open.
    if (input.failureScope === "REVIEW") return finalAttempt(error);
    const holds = await input.hold.countCooldownHolds(input.runId);
    // DR-184/C-1: the run-wide cap bounds waiting only. It must never eat the
    // final attempt that the structural ceiling provisions at every site.
    if (holds >= input.policy.maxCooldownHoldsPerRun) return finalAttempt(error);
    const holdUntil = new Date(Date.now() + input.policy.cooldownMs).toISOString();
    await input.hold.record({
      kind: "node.retrying",
      state: "COOLDOWN_HOLD",
      runId: input.runId,
      callSiteKey: input.callSiteKey,
      parentNodeId: input.parentNodeId,
      holdMs: input.policy.cooldownMs,
      holdUntil,
      attemptsSpent: error.attempts,
      transportOutcome: error.lastOutcome,
      plannedLegCount: input.plannedLegCount
    });
    await input.hold.wait(input.policy.cooldownMs);
    await input.hold.record({
      kind: "node.retrying",
      state: "COOLDOWN_RETRY",
      runId: input.runId,
      callSiteKey: input.callSiteKey,
      parentNodeId: input.parentNodeId,
      holdMs: input.policy.cooldownMs,
      holdUntil,
      attemptsSpent: error.attempts,
      transportOutcome: error.lastOutcome,
      plannedLegCount: input.plannedLegCount
    });
    return finalAttempt(error);
  }
}

function snapshotWithoutNodes(snapshot: EvaluationSnapshot, excluded: ReadonlySet<string>): EvaluationSnapshot {
  let arrows = snapshot.arrows.filter((arrow) =>
    !excluded.has(arrow.sourceNodeId)
    && !(arrow.targetKind === "NODE" && arrow.targetNodeId !== null && excluded.has(arrow.targetNodeId))
  );
  let removedArrowIds = new Set(snapshot.arrows.filter((arrow) => !arrows.includes(arrow)).map((arrow) => arrow.arrowId));
  while (arrows.some((arrow) => arrow.targetKind === "EDGE" && arrow.targetEdgeId !== null && removedArrowIds.has(arrow.targetEdgeId))) {
    arrows = arrows.filter((arrow) =>
      !(arrow.targetKind === "EDGE" && arrow.targetEdgeId !== null && removedArrowIds.has(arrow.targetEdgeId))
    );
    removedArrowIds = new Set(snapshot.arrows.filter((arrow) => !arrows.includes(arrow)).map((arrow) => arrow.arrowId));
  }
  const keptArrowIds = new Set(arrows.map((arrow) => arrow.arrowId));
  return Object.freeze({
    nodes: Object.freeze(snapshot.nodes.filter((node) => !excluded.has(node.nodeId))),
    arrows: Object.freeze(arrows),
    arrowOrder: Object.freeze(snapshot.arrowOrder.filter((arrowId) => keptArrowIds.has(arrowId))),
    operatorResolutions: Object.freeze(snapshot.operatorResolutions.filter((row) => !excluded.has(row.parentNodeId))),
    clusterRecords: snapshot.clusterRecords
  });
}

/**
 * DR-184-A / DR-186: project the append-only graph onto nodes with a judged
 * basis. A basis may arrive through a reviewed descendant or through a
 * reviewed source on an incoming arrow (including an EDGE-targeted arrow).
 * The fixed point carries the distinct reviewed nodes behind each standing
 * claim, so every class-D record has a real, non-zero basis count.
 */
export function projectJudgedStanding(
  snapshot: EvaluationSnapshot,
  reviewedNodeIds: readonly string[]
): {
  readonly snapshot: EvaluationSnapshot;
  readonly hiddenNodeIds: readonly string[];
  readonly derivedStandingNodeIds: readonly string[];
  readonly judgedBasisCounts: Readonly<Record<string, number>>;
} {
  const nodeIds = new Set(snapshot.nodes.map((node) => node.nodeId));
  const reviewed = new Set(reviewedNodeIds.filter((nodeId) => nodeIds.has(nodeId)));
  const basisByNode = new Map(snapshot.nodes.map((node) => [
    node.nodeId,
    new Set(reviewed.has(node.nodeId) ? [node.nodeId] : [])
  ] as const));
  const childrenByParent = new Map<string, string[]>();
  for (const node of snapshot.nodes) {
    if (node.parentNodeId === null || node.parentNodeId === undefined) continue;
    const children = childrenByParent.get(node.parentNodeId) ?? [];
    children.push(node.nodeId);
    childrenByParent.set(node.parentNodeId, children);
  }
  const arrowById = new Map(snapshot.arrows.map((arrow) => [arrow.arrowId, arrow] as const));
  const resolvedTarget = new Map<string, string | null>();
  const resolveTargetNode = (arrowId: string, visiting = new Set<string>()): string | null => {
    if (resolvedTarget.has(arrowId)) return resolvedTarget.get(arrowId)!;
    if (visiting.has(arrowId)) return null;
    const arrow = arrowById.get(arrowId);
    if (arrow === undefined) return null;
    visiting.add(arrowId);
    const target = arrow.targetKind === "NODE"
      ? arrow.targetNodeId
      : arrow.targetEdgeId === null ? null : resolveTargetNode(arrow.targetEdgeId, visiting);
    visiting.delete(arrowId);
    resolvedTarget.set(arrowId, target);
    return target;
  };
  const incomingByTarget = new Map<string, string[]>();
  for (const arrow of snapshot.arrows) {
    const targetNodeId = resolveTargetNode(arrow.arrowId);
    if (targetNodeId === null) continue;
    const sources = incomingByTarget.get(targetNodeId) ?? [];
    sources.push(arrow.sourceNodeId);
    incomingByTarget.set(targetNodeId, sources);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of snapshot.nodes) {
      const basis = basisByNode.get(node.nodeId)!;
      const contributors = [
        ...(childrenByParent.get(node.nodeId) ?? []),
        ...(incomingByTarget.get(node.nodeId) ?? [])
      ];
      for (const contributor of contributors) {
        for (const reviewedNodeId of basisByNode.get(contributor) ?? []) {
          if (basis.has(reviewedNodeId)) continue;
          basis.add(reviewedNodeId);
          changed = true;
        }
      }
    }
  }
  const hiddenNodeIds = snapshot.nodes
    .filter((node) => basisByNode.get(node.nodeId)!.size === 0)
    .map((node) => node.nodeId);
  const derivedStandingNodeIds = snapshot.nodes
    .filter((node) => !reviewed.has(node.nodeId) && basisByNode.get(node.nodeId)!.size > 0)
    .map((node) => node.nodeId);
  return Object.freeze({
    snapshot: snapshotWithoutNodes(snapshot, new Set(hiddenNodeIds)),
    hiddenNodeIds: Object.freeze(hiddenNodeIds),
    derivedStandingNodeIds: Object.freeze(derivedStandingNodeIds),
    judgedBasisCounts: Object.freeze(Object.fromEntries(
      derivedStandingNodeIds.map((nodeId) => [nodeId, basisByNode.get(nodeId)!.size])
    ))
  });
}

export type ReviewCatchUpRefusal =
  | "CATCH_UP_DISCLOSURE_MISMATCH"
  | "DIFFERENT_MAKER_REVIEWER_UNAVAILABLE"
  | "CATCH_UP_WOULD_DOWNGRADE"
  | "CATCH_UP_NUMBER_WOULD_MOVE";

/** The previous answer's class-H/class-D row, as the catch-up lane reads it. */
export interface StoredUnjudgedDisclosure {
  readonly call_site_key: string | null;
  readonly terminal_transport_outcome: "TIMED_OUT" | "FAILED" | null;
  /** Deliberately widened: this value arrives from a stored row, not from a literal. */
  readonly review_outcome: string | null;
}

/**
 * T6 / S4-2 / J14 (+ ADDENDUM) — the catch-up lane's read of the previous
 * answer's disclosure, and its refusal to propagate a malformed one.
 *
 * `prepareVersion` rebuilds every class-H/class-D record from the PREVIOUS
 * answer's records, so whatever shape it finds there it will write again. Two
 * lawful shapes exist: a transport outcome (the review never landed) or the
 * review outcome `cannot-assess` (it landed and could not judge). Anything
 * else — both at once, neither, a review arm naming an outcome that REACHED a
 * judgement, a record with no call site, or no record at all for a node the
 * standing projection set aside — is a typed loud stop.
 *
 * `agree` and `dispute` are refused here as well as at the contract, the writer
 * and the SQL layers (J14 addendum 1). The rule is restated at this layer
 * rather than assumed from the others because this is the one layer that reads
 * a row written by an EARLIER version of the schema, and the whole point of the
 * catch-up lane is that it runs long after the answer it rebuilds.
 */
export function assertUnjudgedDisclosureShape(
  nodeId: string,
  stored: StoredUnjudgedDisclosure | undefined
): {
  readonly callSiteKey: string;
  readonly terminalTransportOutcome: "TIMED_OUT" | "FAILED" | null;
  readonly reviewOutcome: "cannot-assess" | null;
} {
  const namesOneTrueReason = stored !== undefined
    && (stored.terminal_transport_outcome === null) !== (stored.review_outcome === null)
    && (stored.review_outcome === null || stored.review_outcome === "cannot-assess");
  if (stored === undefined || stored.call_site_key === null || !namesOneTrueReason) {
    throw new TypedDomainError("CATCH_UP_DISCLOSURE_MISMATCH", nodeId);
  }
  return Object.freeze({
    callSiteKey: stored.call_site_key,
    terminalTransportOutcome: stored.terminal_transport_outcome,
    reviewOutcome: stored.review_outcome === null ? null : "cannot-assess" as const
  });
}

/**
 * T5 r3 (codex r2 B1) — the review and the bearings that ONE call returned are
 * committed as a single fact, or not at all.
 *
 * `ledger.node_review` is append-only, node-unique, and
 * `JudgementRepository.readUnreviewedNodes` filters reviewed nodes out of all
 * future work. A review that commits on its own is therefore IRREVERSIBLE and
 * UNREPAIRABLE: if the magnitude write then fails, the edge stays UNKNOWN, a
 * retry cannot re-review the node (UNIQUE), and catch-up can no longer see it.
 * The bearing the model already produced — and that was already paid for — is
 * lost for the life of the run.
 *
 * Neither package may import the other (the declared architecture edges give
 * `judgement` and `graph` no dependency on each other), so the atomic
 * composition belongs here, at the composition root that already owns both.
 * Both production review sites — the in-run reviewer and the catch-up lane —
 * go through this function; there is no other way to persist a review.
 */
export async function recordReviewWithMeasurements(pool: Pool, input: {
  readonly runId: string;
  readonly nodeId: string;
  readonly authorRawArtifactRef: string;
  readonly reviewRawArtifactRef: string;
  readonly outcome: "agree" | "dispute" | "cannot-assess";
  readonly reasons: readonly string[];
  readonly measurements: readonly { readonly edgeId: string; readonly bearing: number | null }[];
}): Promise<string> {
  const judgements = new JudgementRepository(pool);
  return withRunContentLease(pool, [input.runId], async () => {
    // Encryption happens before the transaction opens, exactly as it did when
    // the review was written alone.
    const prepared = await judgements.prepareNodeReview({
      runId: input.runId,
      nodeId: input.nodeId,
      authorRawArtifactRef: input.authorRawArtifactRef,
      reviewRawArtifactRef: input.reviewRawArtifactRef,
      outcome: input.outcome,
      reasons: input.reasons
    });
    try {
      return await withWriteTransaction(pool, async (client) => {
        // The same run lock `withGraphWrite` takes, so a concurrent graph write
        // cannot interleave between the two halves of this one fact.
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [input.runId]);
        const nodeReviewId = await insertPreparedNodeReview(client, prepared);
        await recordEdgeMeasurementsOnClient(client, input.runId, input.measurements);
        return nodeReviewId;
      });
    } catch (error) {
      throw translateNodeReviewFailure(error);
    }
  });
}

export interface ReviewCatchUpNode {
  readonly nodeId: string;
  readonly statement: string;
  readonly authorMaker: string;
  readonly authorRawArtifactRef: string;
  /**
   * T5 / S3-1 — the edges this node sources that are still UNMEASURED.
   *
   * A catch-up review is a real reviewer visit, so it measures what it can. The
   * list is empty only when the node genuinely has nothing left to measure;
   * declaring an edge-owning node to have none would be a false statement, not
   * a missing measurement. Already-MEASURED edges are excluded at the reader:
   * the one-way ratchet in 0052 refuses a second write, so re-offering them
   * would ask the reviewer for a number nothing could record.
   */
  readonly sourcedEdges: readonly {
    readonly edgeId: string;
    readonly targetStatement: string;
    readonly polarity: "support" | "attack";
  }[];
}

export interface ReviewCatchUpReviewer {
  readonly maker: string;
  readonly providerRef: string;
  review(input: {
    readonly runId: string;
    readonly subjectItemId: string;
    readonly callSiteKey: string;
    readonly questionLine: string;
    readonly statement: string;
    readonly authorMaker: string;
    readonly providerRef: string;
    readonly contractHash: string;
    readonly bound: CallBound;
    /**
     * T5 / S3-1. Every edge the reviewed node still owns UNMEASURED, offered
     * for measurement on this one visit. A catch-up review is a real reviewer
     * visit and measures what it can.
     *
     * This list is empty ONLY when the node genuinely has nothing left to
     * measure — an already-MEASURED edge is excluded by the reader, because
     * 0052's one-way ratchet would refuse a second write. Declaring an
     * edge-owning node to have no edges is a FALSE statement, not a missing
     * measurement; that was finding F-T5-2 and it is outlawed, not documented.
     * A reviewer that looks and cannot say returns a null bearing instead,
     * which leaves the edge honestly UNKNOWN.
     */
    readonly edges: readonly {
      readonly edgeId: string;
      readonly targetStatement: string;
      readonly polarity: "support" | "attack";
    }[];
  }): Promise<{
    readonly outcome: "agree" | "dispute" | "cannot-assess";
    readonly reasons: readonly string[];
    readonly provenanceRef: string;
    /** One entry per offered edge — the same ONE call, no extra spend (S3-1). */
    readonly edgeMeasurements: readonly {
      readonly edgeId: string;
      readonly bearing: number | null;
    }[];
  }>;
}

export interface ReviewCatchUpVersionCandidate {
  readonly terminalBefore: "SERVED" | "DOWNGRADED" | "COMPONENTS_ONLY" | "BLOCKED";
  readonly terminalAfter: "SERVED" | "DOWNGRADED" | "COMPONENTS_ONLY" | "BLOCKED";
  readonly numberBefore: number | null;
  readonly numberAfter: number | null;
  readonly nowVisible: number;
  readonly stillSetAside: number;
  persist(): Promise<{ readonly answerVersion: number }>;
}

export interface ReviewCatchUpDependencies {
  withContentLease<T>(runId: string, use: () => Promise<T>): Promise<T>;
  /** The composition root probes these pinned members before any model spend. */
  probePinnedPanel(
    pinnedPanel: readonly { readonly maker: string; readonly providerRef: string }[]
  ): Promise<readonly ReviewCatchUpReviewer[]>;
  readUnreviewedNodes(runId: string): Promise<readonly ReviewCatchUpNode[]>;
  readDisclosedNodeIds(answerId: string, answerVersion: number): Promise<readonly string[]>;
  readLatestReviewerMaker(runId: string, authorMaker: string): Promise<string | null>;
  /**
   * T5 / S3-1 + codex r2 B1 — the review and the bearings that same call
   * returned are persisted together or not at all. There is deliberately no
   * way to record one without the other: a lone review is irreversible and
   * removes the node from every future work set.
   */
  recordReviewWithMeasurements(input: {
    readonly runId: string;
    readonly nodeId: string;
    readonly authorRawArtifactRef: string;
    readonly reviewRawArtifactRef: string;
    readonly outcome: "agree" | "dispute" | "cannot-assess";
    readonly reasons: readonly string[];
    readonly measurements: readonly { readonly edgeId: string; readonly bearing: number | null }[];
  }): Promise<string>;
  countRunModelAttempts(runId: string): Promise<number>;
  readPinnedMaximumAttempts(runId: string): Promise<number>;
  prepareVersion(input: {
    readonly runId: string;
    readonly answerId: string;
    readonly fromVersion: number;
  }): Promise<ReviewCatchUpVersionCandidate>;
}

export interface ReviewCatchUpReport {
  readonly runId: string;
  readonly answerId: string;
  readonly fromVersion: number;
  readonly toVersion: number | null;
  readonly examined: number;
  readonly reviewed: number;
  readonly stillUnreviewed: number;
  readonly nowVisible: number;
  readonly stillSetAside: number;
  readonly attemptsSpent: number;
  readonly envelopeRemaining: number;
  readonly refusal: ReviewCatchUpRefusal | null;
}

/**
 * C-2: retain the original work item as subjectItemId, retain the ruled JUDGE
 * bound, and isolate cumulative per-call-site accounting by invocation. The
 * run id remains unchanged, so the pinned run-wide ceiling still applies.
 */
export function reviewCatchUpCallSiteKey(invocationId: string, nodeId: string): string {
  return `JUDGE:review:catch-up:${invocationId}:${nodeId}`;
}

const terminalRank = Object.freeze({ BLOCKED: 0, COMPONENTS_ONLY: 1, DOWNGRADED: 2, SERVED: 3 });

export async function runReviewCatchUp(input: {
  readonly runId: string;
  readonly answerId: string;
  readonly fromVersion: number;
  readonly workItemId: string;
  readonly questionLine: string;
  readonly invocationId: string;
  readonly pinnedPanel: readonly { readonly maker: string; readonly providerRef: string }[];
  readonly judgeBound: CallBound;
  readonly judgeContractHash: string;
  readonly runDeathPolicy: RunDeathPolicy;
  readonly hold: HoldRecorder;
  readonly dependencies: ReviewCatchUpDependencies;
}): Promise<ReviewCatchUpReport> {
  return input.dependencies.withContentLease(input.runId,async () => {
  const beforeAttempts = await input.dependencies.countRunModelAttempts(input.runId);
  const maximumAttempts = await input.dependencies.readPinnedMaximumAttempts(input.runId);
  const reviewers = await input.dependencies.probePinnedPanel(input.pinnedPanel);
  const work = await input.dependencies.readUnreviewedNodes(input.runId);
  const disclosed = await input.dependencies.readDisclosedNodeIds(input.answerId, input.fromVersion);
  const sameSet = work.length === disclosed.length
    && work.every((node) => disclosed.includes(node.nodeId));
  const base = {
    runId: input.runId,
    answerId: input.answerId,
    fromVersion: input.fromVersion,
    examined: work.length
  } as const;
  const reportWithoutVersion = async (
    refusal: ReviewCatchUpRefusal,
    reviewed: number,
    stillUnreviewed: number
  ): Promise<ReviewCatchUpReport> => {
    const afterAttempts = await input.dependencies.countRunModelAttempts(input.runId);
    return Object.freeze({
      ...base, toVersion: null, reviewed, stillUnreviewed,
      nowVisible: 0, stillSetAside: stillUnreviewed,
      attemptsSpent: afterAttempts - beforeAttempts,
      envelopeRemaining: Math.max(0, maximumAttempts - afterAttempts), refusal
    });
  };
  if (!sameSet) return reportWithoutVersion("CATCH_UP_DISCLOSURE_MISMATCH", 0, work.length);
  if (work.some((node) => !reviewers.some((reviewer) => reviewer.maker !== node.authorMaker))) {
    return reportWithoutVersion("DIFFERENT_MAKER_REVIEWER_UNAVAILABLE", 0, work.length);
  }
  let reviewed = 0;
  for (const node of work) {
    const latestReviewerMaker = await input.dependencies.readLatestReviewerMaker(input.runId, node.authorMaker);
    const reviewer = selectDifferentMakerReviewer(node.authorMaker, reviewers, latestReviewerMaker);
    const callSiteKey = reviewCatchUpCallSiteKey(input.invocationId, node.nodeId);
    const outcome = await withCooldownRetry({
      runId: input.runId,
      callSiteKey,
      parentNodeId: node.nodeId,
      plannedLegCount: 1,
      baseMaxAttempts: input.judgeBound.maxAttempts,
      failureScope: "REVIEW",
      policy: input.runDeathPolicy,
      hold: input.hold,
      attempt: (maxAttempts) => reviewer.review({
        runId: input.runId,
        subjectItemId: input.workItemId,
        callSiteKey,
        questionLine: input.questionLine,
        statement: node.statement,
        authorMaker: node.authorMaker,
        providerRef: reviewer.providerRef,
        contractHash: input.judgeContractHash,
        bound: { ...input.judgeBound, maxAttempts },
        // T5 / S3-1: a catch-up review is a real reviewer visit. It measures
        // the edges this node still owns unmeasured — never a false empty list.
        edges: node.sourcedEdges
      })
    });
    if (outcome.kind === "HALTED") continue;
    await input.dependencies.recordReviewWithMeasurements({
      runId: input.runId,
      nodeId: node.nodeId,
      authorRawArtifactRef: node.authorRawArtifactRef,
      reviewRawArtifactRef: outcome.value.provenanceRef,
      outcome: outcome.value.outcome,
      reasons: outcome.value.reasons,
      // The magnitudes came back on the review call above; a cannot-assess
      // bearing is null and leaves its edge honestly UNKNOWN.
      measurements: outcome.value.edgeMeasurements
    });
    reviewed += 1;
  }
  if (reviewed === 0) {
    const afterAttempts = await input.dependencies.countRunModelAttempts(input.runId);
    return Object.freeze({
      ...base, toVersion: null, reviewed: 0, stillUnreviewed: work.length,
      nowVisible: 0, stillSetAside: work.length,
      attemptsSpent: afterAttempts - beforeAttempts,
      envelopeRemaining: Math.max(0, maximumAttempts - afterAttempts), refusal: null
    });
  }
  const candidate = await input.dependencies.prepareVersion({
    runId: input.runId, answerId: input.answerId, fromVersion: input.fromVersion
  });
  if (terminalRank[candidate.terminalAfter] < terminalRank[candidate.terminalBefore]) {
    return reportWithoutVersion("CATCH_UP_WOULD_DOWNGRADE", reviewed, work.length - reviewed);
  }
  // C-9/VROW-8: this refusal is deliberately load-bearing. Measured edge
  // magnitudes may make it fire; removing it silently changes a served number.
  if (!Object.is(candidate.numberAfter, candidate.numberBefore)) {
    return reportWithoutVersion("CATCH_UP_NUMBER_WOULD_MOVE", reviewed, work.length - reviewed);
  }
  const persisted = await candidate.persist();
  const afterAttempts = await input.dependencies.countRunModelAttempts(input.runId);
  return Object.freeze({
    ...base, toVersion: persisted.answerVersion, reviewed,
    stillUnreviewed: work.length - reviewed,
    nowVisible: candidate.nowVisible, stillSetAside: candidate.stillSetAside,
    attemptsSpent: afterAttempts - beforeAttempts,
    envelopeRemaining: Math.max(0, maximumAttempts - afterAttempts), refusal: null
  });
  });
}

export function createPostgresReviewCatchUpDependencies(input: {
  readonly pool: Pool;
  readonly reviewers: readonly {
    readonly maker: string;
    readonly providerRef: string;
    probe(): Promise<boolean>;
    readonly judge: Judge;
  }[];
  readonly scoringOperator: ScoringOperatorRegisterInput;
  readonly propagationContractHash: string;
  readonly propagationNumberKind: string;
  readonly propagationProducer: string;
  readonly judgementSelectionRule: Readonly<Record<string, unknown>>;
  readonly compositionBudget: CompositionBudgetResolution;
}): ReviewCatchUpDependencies {
  const judgements = new JudgementRepository(input.pool);
  const graph = new GraphRepository(input.pool);
  const ledger = new LedgerRepository(input.pool);
  const serve = new ServeRepository(input.pool);
  const budget = new BudgetRepository(input.pool);
  const resolveSnapshot = async (runId: string): Promise<EvaluationSnapshot> => {
    const materialised = await graph.materialiseSnapshot(runId);
    const targets = [...new Set(materialised.arrows.flatMap((arrow) =>
      arrow.targetKind === "NODE" && arrow.targetNodeId !== null ? [arrow.targetNodeId] : []
    ))];
    if (targets.length === 0) return materialised;
    const operator = resolveScoringOperator({
      parent: {}, run: {}, deployment: { scoringOperator: input.scoringOperator.deploymentRowValue }
    });
    return Object.freeze({
      ...materialised,
      operatorResolutions: Object.freeze(targets.map((parentNodeId) => Object.freeze({
        parentNodeId, operator: operator.value, suppliedBy: operator.suppliedBy
      })))
    });
  };
  const dependencies: ReviewCatchUpDependencies = {
    withContentLease: (runId,use) => withRunContentLease(input.pool,[runId],async () => use()),
    probePinnedPanel: async (pinnedPanel) => {
      const pinnedRefs = new Set(pinnedPanel.map((member) => member.providerRef));
      const candidates = input.reviewers.filter((reviewer) => pinnedRefs.has(reviewer.providerRef));
      const health = await Promise.all(candidates.map(async (reviewer) => ({ reviewer, healthy: await reviewer.probe() })));
      return Object.freeze(health.filter(({ healthy }) => healthy).map(({ reviewer }) => Object.freeze({
        maker: reviewer.maker,
        providerRef: reviewer.providerRef,
        review: reviewer.judge.review.bind(reviewer.judge)
      })));
    },
    readUnreviewedNodes: (runId) => judgements.readUnreviewedNodes(runId),
    readDisclosedNodeIds: (answerId, answerVersion) =>
      serve.readReviewCatchUpDisclosedNodeIds(answerId, answerVersion),
    readLatestReviewerMaker: (runId, maker) => judgements.readLatestReviewerMaker(runId, maker),
    recordReviewWithMeasurements: (record) => recordReviewWithMeasurements(input.pool, record),
    countRunModelAttempts: (runId) => budget.countRunModelAttempts(runId),
    readPinnedMaximumAttempts: async (runId) => (await budget.readPinnedBasis(runId)).maxModelAttempts,
    prepareVersion: async ({ runId, answerId, fromVersion }) => {
      const source = await serve.readReviewCatchUpSource(runId);
      if (source.answerId !== answerId || source.answerVersion !== fromVersion) {
        throw new TypedDomainError("CATCH_UP_SOURCE_VERSION_CHANGED", `${answerId}@${fromVersion}`);
      }
      const fullSnapshot = await resolveSnapshot(runId);
      const standing = projectJudgedStanding(fullSnapshot, await judgements.readReviewedNodeIds(runId));
      const propagation = evaluate(standing.snapshot);
      const lineage = await judgements.readJudgementLineage(runId);
      const propagationRunId = await ledger.recordPropagation({
        runId,
        inputHash: hash(standing.snapshot),
        contractHash: input.propagationContractHash,
        graphFingerprint: hash(propagation.graphFingerprintMaterial),
        arrowOrder: propagation.arrowOrder,
        clusterRecords: propagation.clusterRecords,
        operatorResolutions: propagation.operatorResolutions,
        transmissionReductions: propagation.transmissionReductions,
        liftRecords: propagation.liftRecords,
        judgementSelectionRule: input.judgementSelectionRule,
        sensitivityRecords: propagation.sensitivityRecords,
        strengths: propagation.strengths.map((strength) => {
          const own = lineage[strength.nodeId];
          if (own === undefined) throw new TypedDomainError("STRENGTH_LINEAGE_UNRESOLVED", strength.nodeId);
          return {
            ...strength,
            reducedJudgementRef: own.reducedJudgementRef,
            numberKind: input.propagationNumberKind,
            sourceRef: own.provenanceRef,
            producer: input.propagationProducer,
            replayHandle: `replay:${runId}:${strength.nodeId}`,
            wayOfKnowing: own.wayOfKnowing
          };
        })
      });
      const oldReviewRecords = new Map(source.answer.condition_mark_records
        .filter((record) => record.mark === "HIDDEN-UNJUDGEABLE" || record.mark === "DERIVED-STANDING-UNREVIEWED")
        .map((record) => [record.subject_ref, record] as const));
      // T10 / codex r1 B3: these records are HISTORY. One sealed before
      // migration 0055 carries the retired rule, and carrying it forward is the
      // point — relabelling it to today's rule would falsify how that answer was
      // actually chosen. The preserved shape is the only one that may hold a
      // retired rule, and only a superseding persist accepts it.
      const preservedRecords: PreservedConditionMarkRecord[] = source.answer.condition_mark_records
        .filter((record) => record.mark !== "HIDDEN-UNJUDGEABLE" && record.mark !== "DERIVED-STANDING-UNREVIEWED")
        .map((record) => ({
          mark: record.mark as ConditionMarkRecord["mark"], scope: record.scope,
          subjectRef: record.subject_ref, reason: record.reason, liftPath: record.lift_path,
          servedRootRule: record.served_root_rule, affectedNodeIds: record.affected_node_ids,
          callSiteKey: record.call_site_key, plannedLegCount: record.planned_leg_count,
          terminalTransportOutcome: record.terminal_transport_outcome,
          reviewOutcome: record.review_outcome,
          hiddenStrength: record.hidden_strength,
          hiddenScoreThreshold: record.hidden_score_threshold,
          hiddenScoreThresholdSourceRef: record.hidden_score_threshold_source_ref,
          excludedFromServedNumber: record.excluded_from_served_number,
          judgedBasisCount: record.judged_basis_count
        }));
      /**
       * T6 / S4-2 / J14 — the previous answer's disclosure is the provenance
       * this version rebuilds from, and it now has TWO lawful shapes: a
       * transport outcome (the review never landed) or a review outcome (it
       * landed and could not judge). A record naming neither, or naming both,
       * is still a typed loud stop — so is a hidden node with no record at all,
       * which is what every run carrying a cannot-assess review used to be.
       */
      const disclosureFields = (nodeId: string) =>
        assertUnjudgedDisclosureShape(nodeId, oldReviewRecords.get(nodeId));
      // The sentence follows the ROUTE, never the version being written: a
      // cannot-assess node must not be told its transport was exhausted, and
      // its lift is not a retry — `UNIQUE (node_id)` refuses a second review.
      const unjudgedDisclosure = (nodeId: string, kind: "hidden" | "derived") => {
        const fields = disclosureFields(nodeId);
        const unassessed = fields.reviewOutcome !== null;
        return {
          ...fields,
          reason: kind === "hidden"
            ? (unassessed
              ? "The cross-maker review returned cannot-assess; the node has no judged basis and is excluded from the served number"
              : "Cross-maker review transport exhausted; disclosed as unjudged and excluded from the served number")
            : (unassessed
              ? "This node's own cross-house review returned cannot-assess; it serves on the authority of its judged arguments, not on its own unjudged assertion"
              : "This node's own cross-house review did not land; it serves on the authority of its judged arguments, not on its own unreviewed assertion"),
          liftPath: unassessed
            ? "Ask again with material a cross-maker reviewer can assess; this run's review is sealed and cannot be retried"
            : "Restore a valid cross-maker review"
        } as const;
      };
      const reviewRecords: PreservedConditionMarkRecord[] = [
        ...standing.hiddenNodeIds.map((nodeId) => ({
          mark: "HIDDEN-UNJUDGEABLE" as const, scope: "node" as const, subjectRef: nodeId,
          servedRootRule: null,
          affectedNodeIds: Object.freeze([nodeId]), ...unjudgedDisclosure(nodeId, "hidden"),
          excludedFromServedNumber: true
        })),
        ...standing.derivedStandingNodeIds.map((nodeId) => ({
          mark: "DERIVED-STANDING-UNREVIEWED" as const, scope: "node" as const, subjectRef: nodeId,
          servedRootRule: null,
          affectedNodeIds: Object.freeze([nodeId]), ...unjudgedDisclosure(nodeId, "derived"),
          excludedFromServedNumber: false, judgedBasisCount: standing.judgedBasisCounts[nodeId]!
        }))
      ];
      const records = Object.freeze([...preservedRecords, ...reviewRecords]);
      const conditionMarks = Object.freeze([...new Set([
        ...source.answer.condition_marks.filter((mark) =>
          mark !== "HIDDEN-UNJUDGEABLE" && mark !== "DERIVED-STANDING-UNREVIEWED"),
        ...(standing.hiddenNodeIds.length === 0 ? [] : ["HIDDEN-UNJUDGEABLE"]),
        ...(standing.derivedStandingNodeIds.length === 0 ? [] : ["DERIVED-STANDING-UNREVIEWED"])
      ])]);
      const currentNumber = source.servedNumber;
      const nextStrength = currentNumber === null ? null
        : propagation.strengths.find((row) => row.nodeId === currentNumber.nodeId)?.strength ?? null;
      const result = {
        terminal: source.answer.terminal,
        answerForm: source.answer.answer_form as ServeGateResult["answerForm"],
        factBundle: { ...source.factBundle, conditionMarks },
        gateTrace: Object.freeze([]),
        conditionMarks,
        conformance: Object.freeze([]),
        coverageMode: "NOT_RUN" as const,
        segments: Object.freeze([]),
        compositionBudget: input.compositionBudget,
        confidenceBand: source.answer.confidence_band,
        bandCeiling: source.answer.band_ceiling === null ? null : {
          label: source.answer.band_ceiling.label,
          basis: source.answer.band_ceiling.basis,
          registerRowKey: source.answer.band_ceiling.register_row_key,
          registerVersion: source.answer.band_ceiling.register_version,
          sourceRef: source.answer.band_ceiling.source_ref,
          liftPath: source.answer.band_ceiling.lift_path
        },
        // DR-184 review catch-up appends a new VERSION of an answer that was
        // already synthesized: it re-reads standing, it never re-runs the
        // digest or the loop. So T9's four fields are absent rather than
        // fabricated — projecting a loop this path did not run would put a
        // synthesis record on an answer nobody synthesized.
        digest: null,
        loopRounds: Object.freeze([]),
        standingObjection: null,
        crashClass: null,
        projections: {
          reversalPoint: source.answer.reversal_point,
          buildsOnPrevious: source.factBundle.buildsOnPrevious,
          memoryDisclosure: source.factBundle.memoryDisclosure
        }
      } as const;
      return Object.freeze({
        terminalBefore: source.answer.terminal,
        terminalAfter: result.terminal,
        numberBefore: currentNumber?.value ?? null,
        numberAfter: nextStrength,
        nowVisible: standing.snapshot.nodes.length,
        stillSetAside: standing.hiddenNodeIds.length,
        persist: async () => serve.persist({
          runId, workItemId: source.workItemId,
          factBundleVersion: source.factBundleVersion,
          factBundleContentHash: hash(result.factBundle),
          factBundle: result.factBundle,
          result,
          segments: source.answer.composed_text.map((segment) => ({
            segmentId: segment.segment_id, text: segment.text,
            loadBearing: segment.load_bearing, assertedNodeRefs: Object.freeze([]),
            servedNumberRefs: segment.served_number_refs
          })),
          compositionRawArtifactRef: null,
          compositionAttempt: 0,
          conformanceRawArtifactRefs: Object.freeze([]),
          conditionMarkRecords: records,
          servedNumber: currentNumber === null || nextStrength === null ? null : {
            numberRef: currentNumber.numberRef, value: nextStrength,
            numberKind: currentNumber.numberKind, sourceRef: currentNumber.sourceRef,
            producer: currentNumber.producer,
            replayHandle: `replay:${runId}:${currentNumber.nodeId}:catch-up`,
            propagationRunId
          },
          supersedes: { answerId }
        })
      });
    }
  };
  return Object.freeze(dependencies);
}

export interface WalkingSkeletonSettings {
  readonly workerId: string;
  readonly claimMs: number;
  readonly claimMarginMs: number;
  readonly judgeBound: CallBound;
  readonly composerBound: CallBound;
  readonly conformanceBound: CallBound;
  readonly providerRef: string;
  readonly maker: string;
  readonly judgeContractHash: string;
  readonly composerContractHash: string;
  readonly conformanceContractHash: string;
  readonly propagationContractHash: string;
  readonly serveContractHash: string;
  /**
   * T9 RETIRED this setting's only reader inside the runner: composition
   * retries are gone, and the loop's bound is the sealed
   * `evaluatorLoopMaxRounds` row. It stays on the settings because the
   * deployment still declares it and T17's envelope formula still reads
   * `maxRecompose * fixedOrgansPerComposition` as its call-site term — a term
   * that is now WRONG for the serve leg (the real count is
   * `rounds x 2 roles`). Refitting that formula is T17's, and is reported as a
   * finding rather than changed here.
   */
  readonly maxRecompose: number;
  readonly factBundleVersion: number;
  readonly judgementNumberKind: string;
  readonly judgementProducer: string;
  readonly propagationNumberKind: string;
  readonly propagationProducer: string;
  readonly compositionRow?: CompositionMapRegisterRow;
  readonly servePolicy?: {
    readonly compositionBudgets: Readonly<Record<CompositionBudgetTier, CompositionBudgetResolution>>;
    readonly candidateConfidenceBand: string;
    readonly bandCeiling: BandCeilingRegisterRow;
  };
  readonly judgementPolicy?: {
    readonly selectionRule: JudgementSelectionRule;
    readonly earnedWeight: number;
    readonly judgeWeightVersion: string;
    readonly reducerVersion: string;
  };
  /**
   * S2-2 / T3: the sealed T16 panel inputs, READ from the register by the
   * deployment's boot (`readPanelWeightingControls` + `readVerdictLabelControls`)
   * and handed here whole. The runner never carries any of these values as a
   * code constant — a missing family is the register reader's loud failure, not
   * a default invented here.
   */
  readonly panelPolicy?: RunnerPanelPolicy;
  /**
   * S6-1 / T11: the sealed T16 verdict-label family as the runner consumes it,
   * READ from the register by the deployment's boot (`readVerdictLabelControls`).
   * Every served answer carries a code-derived label, so a deployment that never
   * sealed the family stops loudly at selection time rather than labelling on a
   * value this file invented.
   */
  readonly verdictLabelPolicy?: RunnerVerdictLabelPolicy;
  /**
   * S6-2 / T9: the sealed T16 synthesis-role family, READ from the register by
   * the deployment's boot (`readSynthesisRoleControls`). EVERY served statement
   * now comes out of the synthesizer/evaluator loop, so this is mandatory for
   * every maker count — the same shape as `verdictLabelPolicy` and for the same
   * reason (S06 codex r1 B1, board F33).
   */
  readonly synthesisRolePolicy?: RunnerSynthesisRolePolicy;
  readonly critique?: RunnerCritiqueSettings;
  readonly additionalMakers?: readonly RunnerCritiqueSettings[];
  /** DR-182 VROW-5: one immediate, no-hold health check at work-item claim. */
  readonly claimTimeProbe?: (member: DiscoveredPanelMember) => Promise<{
    readonly state: "HEALTHY" | "ABSENT";
    readonly modelId: string | null;
    readonly failureCode: string | null;
  }>;
  readonly scoringOperator?: ScoringOperatorRegisterInput;
  readonly runDeathPolicy?: RunDeathPolicy;
  readonly hiddenNodeScoreThreshold?: {
    readonly value: number;
    readonly sourceRef: string;
  };
  readonly holdRecorder?: HoldRecorder;
  readonly resolveTerminalActivations?: (input: {
    readonly runId: string;
    readonly waitingRows: readonly string[];
    /** The runner's own declaration of the terminal boundary being drained
     * (TERM-01/DR-139): this completion persists an answer record in the same
     * sequence. It is the same authority that supplies runId and waitingRows. */
    readonly completion: TerminalCompletionDeclaration;
  }) => Promise<readonly (CompletionActivationResolution & {
    /** Recorded execution of the row's scoped check, when one exists.
     * ACTIVE with no recorded execution is the DR-139(4) owed-check case. */
    readonly executedCheckRef?: string | null;
    /** DR-141(2): the row's evaluation consulted the DR-021 knob-10
     * question-type fallback; the travelling label rides the answer. */
    readonly typeFallbackConsulted?: boolean;
  })[]>;
}

export interface ValueOverlayExecutionInput {
  readonly runId: string;
  readonly propagationRunId: string;
  readonly criterionCandidates: readonly CriterionCandidate[];
  readonly actualEvidenceRefs: readonly string[];
  readonly options: readonly OptionVector[];
  readonly weightSource: WeightSource;
  readonly findingFacts: readonly string[];
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function parseContent<T>(content: string, schema: z.ZodType<T>, code: string): T {
  try {
    return schema.parse(JSON.parse(content));
  } catch (error) {
    throw new TypedDomainError(code, error instanceof Error ? error.message : String(error));
  }
}

function classifyStructuredContent<T>(content: string, schema: z.ZodType<T>): ContentClassification {
  let decoded: unknown;
  try {
    decoded = JSON.parse(content);
  } catch (error) {
    return { parseStatus: "PARSE_FAILED", parseError: error instanceof Error ? error.message : String(error) };
  }
  const parsed = schema.safeParse(decoded);
  return parsed.success
    ? { parseStatus: "PARSED", parseError: null }
    : { parseStatus: "SCHEMA_FAILED", parseError: parsed.error.message };
}

function buildSchemaRepairPacket(packet: PromptPacket, parseError: string): PromptPacket {
  return {
    messages: [...packet.messages, {
      role: "user",
      content: `The previous response violated the declared JSON contract. Machine parse error: ${parseError}\nReturn a new response that follows the system schema exactly.`
    }]
  };
}

/**
 * T9 (goal 263-266): a SYNTHESIZER or EVALUATOR call whose transport dies is
 * one of the four enumerated COMPONENTS_ONLY crash classes — a death, not a
 * quality judgement. It is typed HERE, at the seam, so the serve chain can name
 * the class without catching every error it sees. Content refusals keep their
 * existing organ code: a provider that answered with unusable content is a
 * contract error, not a dead transport.
 */
async function callSynthesisRole(
  provider: ProviderGateway,
  request: ProviderCallRequest,
  organFailureCode: string
): Promise<ProviderCallResult> {
  try {
    return await provider.call(request);
  } catch (error) {
    if (error instanceof ProviderContentUnacceptedError) {
      throw new TypedDomainError(organFailureCode, error.lastParseError);
    }
    if (error instanceof ProviderCallFailedError) {
      throw new TypedDomainError(
        "SYNTHESIS_TRANSPORT_DEATH",
        `${request.role} transport exhausted after ${String(error.attempts)} attempts at ${request.callSiteKey}`
      );
    }
    throw error;
  }
}

export function parseComposerOutput(content: string): z.infer<typeof compositionSchema> {
  return parseContent(content, compositionSchema, "COMPOSITION_CONTRACT_ERROR");
}

export interface DebateExpansionLeg {
  readonly round: number;
  readonly parentIndex: number;
  readonly childIndex: number;
  readonly polarity: "support" | "attack";
  readonly authorIndex: number;
}

export interface MultiMakerExpansionLeg extends DebateExpansionLeg {
  readonly rootIndex: number;
}

export interface CrossRootExchangeLeg {
  readonly authorIndex: number;
  readonly authorRootIndex: number;
  readonly targetRootIndex: number;
}

// The rule string is minted ONCE in the kernel vocabulary (serve records it,
// contract validates it, the DDL CHECKs it); the runner owns the SELECTOR and
// re-exports the rule so a reader of the selection finds both together.
export { SERVED_ROOT_SELECTION_RULE };

/** The margin between the served root and its runner-up, or why there is none. */
export type ServedRootMargin =
  | Readonly<{ kind: "MEASURED"; value: number }>
  | Readonly<{ kind: "ABSENT"; reason: "SINGLE_SERVABLE_ROOT" }>;

export interface ServedRootSelection<T> {
  readonly rule: ServedRootRule;
  readonly root: T;
  readonly servedStrength: number;
  readonly runnerUp: Readonly<{ nodeId: string; strength: number }> | null;
  readonly margin: ServedRootMargin;
  readonly tiebreak: "NOT_APPLIED" | "LEXICOGRAPHIC_NODE_ID";
}

/**
 * T10 (goal 188-195; rulings S6-1, S6-3) — PROPAGATION chooses the served root.
 *
 * DR-161's configuration-order rule is deleted (its retired string survives
 * only in migrations/0055_t10_served_root_selection.sql, which retires it):
 * the served number is the MAXIMUM propagated strength among the servable roots, so reordering the
 * configured providers cannot change the answer. An exact tie is broken by
 * lexicographic node id — deterministic and equally order-independent; a tie is
 * CONTESTED under T11's ladder anyway, because its margin is zero.
 *
 * The margin to the RUNNER-UP (the second-highest root under the same total
 * order, never the next configured one) travels with the selection and is
 * recorded on the propagation receipt. A single servable root has no runner-up,
 * so its margin is ABSENT with a reason — T11 rung 0 reads exactly that.
 *
 * A servable root with no propagated strength is a typed loud stop, never a
 * default: serving a number the graph never produced is the failure this
 * selector exists to make impossible.
 */
export function selectServedRootByStrength<T extends { readonly nodeId: string }>(
  servableRoots: readonly T[],
  strengths: readonly { readonly nodeId: string; readonly strength: number }[]
): ServedRootSelection<T> {
  if (servableRoots.length === 0) {
    throw new TypedDomainError("SERVED_ROOT_UNRESOLVED", "No servable maker root exists");
  }
  const byNodeId = new Map(strengths.map((row) => [row.nodeId, row.strength]));
  const ranked = servableRoots.map((root) => {
    const strength = byNodeId.get(root.nodeId);
    if (strength === undefined || !Number.isFinite(strength)) {
      throw new TypedDomainError("SERVED_ROOT_STRENGTH_UNRESOLVED", root.nodeId);
    }
    return { root, strength };
  }).sort((left, right) => right.strength - left.strength
    // Lexicographic on code units, NOT localeCompare: collation is
    // locale-dependent, and a tiebreak that changes with the host locale is not
    // the deterministic tiebreak the goal asks for.
    || (left.root.nodeId < right.root.nodeId ? -1 : left.root.nodeId > right.root.nodeId ? 1 : 0));
  const winner = ranked[0]!;
  const runnerUp = ranked[1];
  return Object.freeze({
    rule: SERVED_ROOT_SELECTION_RULE,
    root: winner.root,
    servedStrength: winner.strength,
    runnerUp: runnerUp === undefined
      ? null
      : Object.freeze({ nodeId: runnerUp.root.nodeId, strength: runnerUp.strength }),
    margin: runnerUp === undefined
      ? Object.freeze({ kind: "ABSENT" as const, reason: "SINGLE_SERVABLE_ROOT" as const })
      : Object.freeze({ kind: "MEASURED" as const, value: winner.strength - runnerUp.strength }),
    tiebreak: runnerUp !== undefined && runnerUp.strength === winner.strength
      ? "LEXICOGRAPHIC_NODE_ID"
      : "NOT_APPLIED"
  });
}

/** PANEL-01 rev3: budget records append without erasing prior honesty records. */
export function preserveEnvelopeTerminalConditionMarkRecords(
  existing: readonly ConditionMarkRecord[],
  budgetRecords: readonly ConditionMarkRecord[]
): readonly ConditionMarkRecord[] {
  return Object.freeze([...existing, ...budgetRecords]);
}

export interface FixedRootServeCandidate {
  readonly nodeId: string;
  readonly statement: string;
  readonly wayOfKnowing: WayOfKnowing;
  readonly provenanceRef: string;
  readonly locator: string | null;
  readonly restatementStatus: "PASS" | "FAIL" | "NOT_SAMPLED";
}

/** DR-159 B2-A: project exactly the selected root into the served-node set. */
export function buildFixedSingleRootServeNodes(
  authoredRoots: readonly FixedRootServeCandidate[],
  servedRootNodeId: string
): readonly ServeNode[] {
  const selectedRoots = authoredRoots.filter((root) => root.nodeId === servedRootNodeId);
  if (selectedRoots.length !== 1) {
    throw new TypedDomainError(
      "FIXED_SINGLE_ROOT_SERVE_VIOLATED",
      "DR-159 B2-A requires exactly one served root"
    );
  }
  return Object.freeze(selectedRoots.map((root) => Object.freeze({
    nodeId: root.nodeId,
    text: root.statement,
    wayOfKnowing: root.wayOfKnowing,
    provenanceRef: root.provenanceRef,
    locator: root.locator,
    restatementStatus: root.restatementStatus,
    loadBearing: true
  })));
}

/**
 * J23 / T9 — the SERVED and CITABLE node set follows the DIGEST.
 *
 * The goal's premise that T10 replaced `buildFixedSingleRootServeNodes` is
 * false: T10 replaced the served-root SELECTION RULE only, so the serve set
 * stayed one node and the composer could only ever cite `"primary"`. With one
 * node in the set, the way-of-knowing basis can only ever be 0/1 — production
 * shares were structurally incapable of being fractional.
 *
 * DR-159 B2-A, stated explicitly, is TWO constraints:
 *   (1) "project exactly the selected root into the served-node set" — exactly
 *       ONE maker POSITION is served;
 *   (2) the two-segment cap on composer output (`partitionServedSegments`,
 *       `RUNNER_COMPOSITION_SEGMENT_CAP`).
 *
 * This widening SATISFIES both rather than breaking either. Constraint (1) is
 * about which position is SERVED, not about which nodes may be CITED: exactly
 * one node here is load-bearing and it is the served root, and this function
 * refuses any other shape. The remaining materialized nodes — the losing maker
 * positions included — enter as CITABLE, NON-load-bearing evidence, which is
 * what the evaluator's fairness-to-losers and citation-tracing criteria require
 * a synthesizer to be able to reach. Constraint (2) is untouched: this changes
 * the citable node set, never the segment count.
 */
export function buildDigestFollowingServeNodes(input: {
  readonly authored: readonly FixedRootServeCandidate[];
  readonly servedRootNodeId: string;
}): readonly ServeNode[] {
  const served = buildFixedSingleRootServeNodes(input.authored, input.servedRootNodeId);
  const citable = input.authored
    .filter((node) => node.nodeId !== input.servedRootNodeId)
    .map((node) => Object.freeze({
      nodeId: node.nodeId,
      text: node.statement,
      wayOfKnowing: node.wayOfKnowing,
      provenanceRef: node.provenanceRef,
      locator: node.locator,
      restatementStatus: node.restatementStatus,
      loadBearing: false
    }));
  const nodes = Object.freeze([...served, ...citable]);
  if (nodes.filter((node) => node.loadBearing).length !== 1) {
    throw new TypedDomainError(
      "FIXED_SINGLE_ROOT_SERVE_VIOLATED",
      "DR-159 B2-A requires exactly one served root; widening the citable set may never add a second"
    );
  }
  if (new Set(nodes.map((node) => node.nodeId)).size !== nodes.length) {
    throw new TypedDomainError("SERVE_NODE_IDS_NOT_UNIQUE", "A materialized node appears twice in the serve set");
  }
  return nodes;
}

/** DR-159 B3-B: depth is a closed, ASK-time count of expansion rounds. */
export function resolveExpansionDepth(depthParams: Readonly<Record<string, unknown>>): number {
  const depth = depthParams.depth;
  if (!Number.isInteger(depth) || typeof depth !== "number" || depth < 1 || depth > 5) {
    throw new TypedDomainError(
      "RUN_DEPTH_PARAMS_INVALID",
      "DR-157/DR-159 require a pinned integer expansion depth from 1 through 5"
    );
  }
  return depth;
}

/** PANEL-01: every independently authored root owns a complete B3-B subtree. */
export function buildMultiMakerExpansionPlan(
  depth: number,
  effectiveMakerCount: number
): readonly MultiMakerExpansionLeg[] {
  const ruledDepth = resolveExpansionDepth({ depth });
  if (!Number.isInteger(effectiveMakerCount) || effectiveMakerCount < 2) {
    throw new TypedDomainError(
      "MULTI_MAKER_PLAN_REQUIRES_MULTIPLE_MAKERS",
      "The PANEL-01 multi-maker planner requires at least two configured makers"
    );
  }
  const legs: MultiMakerExpansionLeg[] = [];
  let nextNodeIndex = effectiveMakerCount;
  for (let rootIndex = 0; rootIndex < effectiveMakerCount; rootIndex += 1) {
    let frontier = [rootIndex];
    for (let round = 1; round <= ruledDepth; round += 1) {
      const authorIndex = (rootIndex + round) % effectiveMakerCount;
      const nextFrontier: number[] = [];
      for (const parentIndex of frontier) {
        for (const polarity of Array.from(
          { length: RUNNER_BRANCHING_FACTOR },
          (_, index) => index === 0 ? "support" as const : "attack" as const
        )) {
          const childIndex = nextNodeIndex++;
          legs.push(Object.freeze({ round, rootIndex, parentIndex, childIndex, polarity, authorIndex }));
          nextFrontier.push(childIndex);
        }
      }
      frontier = nextFrontier;
    }
  }
  return Object.freeze(legs);
}

/** One response per ordered distinct maker pair: defend one root against each other root. */
export function buildCrossRootExchangePlan(effectiveMakerCount: number): readonly CrossRootExchangeLeg[] {
  if (!Number.isInteger(effectiveMakerCount) || effectiveMakerCount < 1) {
    throw new TypedDomainError("RUN_MAKER_COUNT_INVALID", "The effective maker count must be a positive integer");
  }
  return Object.freeze(Array.from({ length: effectiveMakerCount }, (_, authorRootIndex) =>
    Array.from({ length: effectiveMakerCount }, (_, targetRootIndex) => targetRootIndex === authorRootIndex
      ? null
      : Object.freeze({ authorIndex: authorRootIndex, authorRootIndex, targetRootIndex }))
  ).flat().filter((leg): leg is CrossRootExchangeLeg => leg !== null));
}

export interface MakerPositionDisclosureRoot {
  readonly nodeId: string;
  readonly maker: string;
}

export function buildUnservedMakerPositionRecord(
  authoredMakerPositions: readonly MakerPositionDisclosureRoot[],
  servedRoot: MakerPositionDisclosureRoot
): ConditionMarkRecord {
  const unserved = authoredMakerPositions.filter((root) => root.nodeId !== servedRoot.nodeId);
  if (unserved.length === 0) {
    throw new TypedDomainError("UNSERVED_MAKER_POSITION_UNRESOLVED", "No unserved maker position exists");
  }
  const unservedDescription = unserved.map((root) => `${root.maker} position ${root.nodeId}`).join(", ");
  return Object.freeze({
    mark: "UNSERVED-MAKER-POSITION",
    scope: "answer",
    subjectRef: servedRoot.nodeId,
    reason: `The strongest post-exclusion maker root was served: ${servedRoot.maker} position ${servedRoot.nodeId}; ${unservedDescription} ${unserved.length === 1 ? "remains" : "remain"} graph-visible but unserved`,
    liftPath: unserved.length === 1
      ? "Serve the other maker root in a separately ruled answer"
      : "Serve another maker root in a separately ruled answer",
    servedRootRule: SERVED_ROOT_SELECTION_RULE,
    affectedNodeIds: Object.freeze([servedRoot.nodeId, ...unserved.map((root) => root.nodeId)])
  });
}

/**
 * DR-159 B2-A applies the two-segment cap to composer/conformance output.
 * The memory disclosure is a separately validated typed-renderer projection:
 * persist it for honesty, but never smuggle it into the conformance spend set.
 */
export function partitionServedSegments(
  composedSegments: readonly ComposedSegment[],
  renderedMemory: string | null
): {
  readonly conformanceSegments: readonly ComposedSegment[];
  readonly persistedSegments: readonly ComposedSegment[];
} {
  const conformanceSegments = Object.freeze([...composedSegments]);
  const persistedSegments = renderedMemory === null
    ? conformanceSegments
    : Object.freeze([
        ...conformanceSegments,
        Object.freeze({
          segmentId: "memory:disclosure",
          text: renderedMemory,
          loadBearing: false,
          assertedNodeRefs: Object.freeze([]),
          servedNumberRefs: Object.freeze([])
        })
      ]);
  return Object.freeze({ conformanceSegments, persistedSegments });
}

export function applySingleLineageBandCap(
  candidateBand: string,
  bandCeiling: BandCeilingRegisterRow
): string {
  const candidateIndex = bandCeiling.value.bandOrder.indexOf(candidateBand);
  if (candidateIndex < 1) {
    throw new TypedDomainError(
      "CRITIC_UNAVAILABLE_BAND_CAP_UNRESOLVED",
      `No ruled band exists immediately below ${candidateBand}`
    );
  }
  return bandCeiling.value.bandOrder[candidateIndex - 1]!;
}

async function runnerStage<T>(code: string, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof TypedDomainError) throw error;
    throw new TypedDomainError(code, code);
  }
}

export class WalkingSkeletonRunner {
  readonly #runs: RunRepository;
  readonly #work: WorkItemRepository;
  readonly #graph: GraphRepository;
  readonly #judge: Judge;
  readonly #judgements: JudgementRepository;
  readonly #ledger: LedgerRepository;
  readonly #budget: BudgetRepository;
  readonly #serve: ServeRepository;
  readonly #valuation: ValuationRepository;
  readonly #memory: MemoryRepository;
  readonly #providerProbes: ProviderProbeRepository;
  readonly #configuredMakers: readonly {
    readonly judge: Judge;
    readonly provider: ProviderGateway;
    readonly providerRef: string;
    readonly maker: string;
  }[];

  constructor(
    private readonly pool: Pool,
    private readonly provider: ProviderGateway,
    private readonly settings: WalkingSkeletonSettings
  ) {
    this.#runs = new RunRepository(pool);
    this.#work = new WorkItemRepository(pool);
    this.#graph = new GraphRepository(pool);
    this.#judge = new Judge(provider);
    this.#judgements = new JudgementRepository(pool);
    this.#ledger = new LedgerRepository(pool);
    this.#budget = new BudgetRepository(pool);
    this.#serve = new ServeRepository(pool);
    this.#valuation = new ValuationRepository(pool);
    this.#memory = new MemoryRepository(pool);
    this.#providerProbes = new ProviderProbeRepository(pool);
    this.#configuredMakers = Object.freeze([
      Object.freeze({ judge: this.#judge, provider, providerRef: settings.providerRef, maker: settings.maker }),
      ...(settings.critique === undefined ? [] : [Object.freeze({
        judge: new Judge(settings.critique.provider),
        provider: settings.critique.provider,
        providerRef: settings.critique.providerRef,
        maker: settings.critique.maker
      })]),
      ...(settings.additionalMakers ?? []).map((maker) => Object.freeze({
        judge: new Judge(maker.provider),
        provider: maker.provider,
        providerRef: maker.providerRef,
        maker: maker.maker
      }))
    ]);
  }

  async executeNext(): Promise<RunnerExecutionResult> {
    return this.execute();
  }

  async executeWorkItem(workItemId: string): Promise<RunnerExecutionResult> {
    return this.execute(workItemId);
  }

  async executeValueOverlay(input: ValueOverlayExecutionInput): Promise<MixedValueAnswer> {
    return withRunContentLease(this.pool,[input.runId],async () => {
    const frozen = await this.#valuation.readFrozenPropagation(input.propagationRunId);
    if (frozen.runId !== input.runId) {
      throw new TypedDomainError(
        "OVERLAY_RUN_MISMATCH",
        "A value overlay may only project over a propagation receipt from the same run"
      );
    }
    const materialised = await this.#graph.materialiseSnapshot(input.runId);
    const snapshot: EvaluationSnapshot = Object.freeze({
      ...materialised,
      // P13: recomputation consumes the recorded order and structural receipts;
      // it never asks graph materialisation to derive an order a second time.
      arrowOrder: frozen.arrowOrder,
      operatorResolutions: frozen.operatorResolutions as EvaluationSnapshot["operatorResolutions"],
      clusterRecords: frozen.clusterRecords
    });
    const overlay = buildValueOverlay({
      snapshot,
      recordedStrengths: frozen.strengths,
      criterionCandidates: input.criterionCandidates,
      actualEvidenceRefs: input.actualEvidenceRefs,
      options: input.options,
      weightSource: input.weightSource
    });
    await this.#valuation.recordOverlay({
      runId: input.runId,
      propagationRunId: input.propagationRunId,
      overlay
    });
    return serveMixedAnswer({
      phase: "VALUE",
      empiricalSettlementRef: input.propagationRunId,
      findingFacts: input.findingFacts,
      overlay
    });
    });
  }

  private async execute(workItemId?: string): Promise<RunnerExecutionResult> {
    const longestDeadline = Math.max(
      this.settings.judgeBound.deadlineMs,
      this.settings.composerBound.deadlineMs,
      this.settings.conformanceBound.deadlineMs
    );
    assertClaimCoversCall({
      claimMs: this.settings.claimMs,
      deadlineMs: longestDeadline,
      marginMs: this.settings.claimMarginMs,
      ...(this.settings.runDeathPolicy === undefined ? {} : {
        cooldownMs: this.settings.runDeathPolicy.cooldownMs,
        maxCooldownHoldsPerRun: this.settings.runDeathPolicy.maxCooldownHoldsPerRun
      })
    });
    const compositionRow = this.settings.compositionRow;
    if (compositionRow === undefined) {
      throw new TypedDomainError(
        "CLAIM_TYPE_COMPOSITION_MAP_UNRESOLVED",
        "S04 requires the V-ratified claim-type composition register row"
      );
    }
    const judgementPolicy = this.settings.judgementPolicy;
    if (judgementPolicy === undefined) {
      throw new TypedDomainError(
        "JUDGEMENT_POLICY_UNRESOLVED",
        "S04 requires V-ratified composition and judgement-selection register rows"
      );
    }
    const servePolicy = this.settings.servePolicy;
    if (servePolicy === undefined) {
      throw new TypedDomainError(
        "SERVE_POLICY_UNRESOLVED",
        "S05 requires V-ratified composition-budget and band-ceiling register rows"
      );
    }
    if (this.#configuredMakers.length > 1 && this.settings.scoringOperator === undefined) {
      // FAIR-01 × DR-074: the critique leg always yields an attack arrow, and
      // an arrow-bearing graph cannot propagate without the mandatory
      // deployment scoringOperator row. The value is V's at DR-023 — stop
      // loudly BEFORE any claim or model call, never invent it (AC-76/DR-039).
      throw new TypedDomainError(
        "SCORING_OPERATOR_UNRESOLVED",
        "DR-074: the mandatory deployment scoringOperator register row is unruled; its value is V's at DR-023 and is never invented (AC-76/DR-039)"
      );
    }
    if (this.#configuredMakers.length > 1 && this.settings.panelPolicy === undefined) {
      // S2-2 × J12: a multi-maker deployment that never sealed the T16 panel rows STOPS
      // LOUDLY, here — before the work item is claimed and before a single model call.
      // Recording a reason and grading the node on its author's own voice is the
      // silent-degradation shape the goal repeals; the Global DoD's "missing rows fail
      // loudly" and the scoringOperator precedent directly above both govern.
      throw new TypedDomainError(
        "PANEL_WEIGHTING_UNRESOLVED",
        "J12: a multi-maker run requires the sealed T16 panel-weighting rows (dispersion scale, repeated-family multiplier, downgrade bands, provider-family map) and the sealed disagreement threshold; they are read from the register and never invented"
      );
    }
    if (this.settings.verdictLabelPolicy === undefined) {
      // S6-1 / T11 x codex r1 B1: EVERY served answer carries a code-derived
      // three-state label, so the sealed T16 verdict-label family is mandatory
      // for every maker count — unlike J12's panel rows, which only bind at
      // M>=2. The gate sits HERE, beside J12's, before the work item is claimed
      // and before a single model call: a deployment that never handed the
      // runner these rows is going to refuse anyway, and refusing after
      // judgement and propagation bills it for a run that was always rejected.
      throw new TypedDomainError(
        "VERDICT_LABEL_CONTROLS_UNRESOLVED",
        "T11: the served answer's label reads gamma, the two cuts and the disagreement threshold from T16's sealed register rows; they are read from the register and never invented (goal 39-40)"
      );
    }
    if (this.settings.synthesisRolePolicy === undefined) {
      // S6-2 / T9 x J12 x board F33: EVERY served statement is written by the
      // synthesizer and graded by the evaluator, both of them NAMED provider
      // roles whose refs and loop bound are sealed T16 rows. So this family
      // binds at every maker count, and its gate sits HERE beside the other
      // two: refusing after judgement and propagation would bill the asker for
      // a run that could never have served an answer.
      throw new TypedDomainError(
        "SYNTHESIS_ROLE_CONTROLS_UNRESOLVED",
        "T9: the synthesizer and evaluator role refs and the evaluator loop bound are sealed T16 register rows (J8); they are read from the register and never invented (goal 39-40)"
      );
    }
    const claimInput = { workerId: this.settings.workerId, claimSeconds: this.settings.claimMs / 1_000 };
    const claimed = workItemId === undefined
      ? await this.#work.claimNext(claimInput)
      : await this.#work.claimById({ ...claimInput, workItemId });
    if (claimed === null) return { kind: "NO_WORK" };
    if (claimed.runId === null) throw new TypedDomainError("WORK_ITEM_WITHOUT_RUN", claimed.workItemId);
    const claimedRunId = claimed.runId;
    try {
    return await this.#memory.withDisclosureContentLease([claimedRunId],async () => {
    const runnerAttemptId = randomUUID();
    let run: Awaited<ReturnType<RunRepository["readFrozenHead"]>>;
    try {
      run = await this.#runs.readFrozenHead(claimedRunId);
    } catch (error) {
      if (error instanceof TypedDomainError) throw error;
      throw new TypedDomainError(
        "RUN_FROZEN_HEAD_READ_FAILED",
        "The frozen run could not be read through its required content lease"
      );
    }
    const preflightHaltedSites = new Map<string, {
      readonly outcome: "TIMED_OUT" | "FAILED";
      readonly ledgerEntryRef: string;
    }>();
    const cooldownAttempt = async <T>(input: {
      readonly callSiteKey: string;
      readonly parentNodeId: string | null;
      readonly plannedLegCount: number;
      readonly failureScope: "MAKER_POSITION" | "EXPANSION" | "REVIEW";
      readonly attempt: (maxAttempts: number) => Promise<T>;
    }): Promise<
      | { readonly kind: "AUTHORED"; readonly value: T }
      | { readonly kind: "HALTED"; readonly record: HaltedExpansionRecord }
    > => {
      const policy = this.settings.runDeathPolicy;
      if (policy === undefined) {
        return { kind: "AUTHORED", value: await input.attempt(this.settings.judgeBound.maxAttempts) };
      }
      const hold = this.settings.holdRecorder;
      if (hold === undefined) {
        throw new TypedDomainError("RUN_HOLD_RECORDER_UNRESOLVED", "runDeathPolicy requires a production hold recorder");
      }
      const preflight = preflightHaltedSites.get(input.callSiteKey);
      if (preflight !== undefined) {
        const record = Object.freeze({
          callSiteKey: input.callSiteKey,
          parentNodeId: input.parentNodeId,
          plannedLegCount: input.plannedLegCount,
          terminalTransportOutcome: preflight.outcome,
          lastLedgerEntryRef: preflight.ledgerEntryRef
        });
        await hold.record({
          kind: "ledger.could_not_do",
          state: input.failureScope === "EXPANSION"
            ? "EXPANSION_HALTED"
            : input.failureScope === "REVIEW" ? "REVIEW_HALTED" : "MAKER_POSITION_HALTED",
          runId: run.runId,
          callSiteKey: input.callSiteKey,
          parentNodeId: input.parentNodeId,
          holdMs: policy.cooldownMs,
          holdUntil: null,
          attemptsSpent: this.settings.judgeBound.maxAttempts + policy.finalRetryAttempts,
          transportOutcome: preflight.outcome,
          plannedLegCount: input.plannedLegCount
        });
        return { kind: "HALTED", record };
      }
      return withCooldownRetry({
        runId: run.runId,
        callSiteKey: input.callSiteKey,
        parentNodeId: input.parentNodeId,
        plannedLegCount: input.plannedLegCount,
        baseMaxAttempts: this.settings.judgeBound.maxAttempts,
        failureScope: input.failureScope,
        policy,
        hold,
        attempt: input.attempt
      });
    };
    let envelopeBasis: ReturnType<typeof parseCostEnvelopeBasis>;
    try {
      envelopeBasis = parseCostEnvelopeBasis(run.envelopeBasis);
    } catch {
      throw new TypedDomainError(
        "RUN_ENVELOPE_BASIS_INVALID",
        "The frozen run cost envelope does not satisfy the sealed runner contract"
      );
    }
    const expansionDepth = resolveExpansionDepth(run.depthParams);
    const configuredByProviderRef = new Map(this.#configuredMakers.map((maker) => [maker.providerRef, maker] as const));
    const absentAtClaim: Array<{ readonly member: DiscoveredPanelMember; readonly failureCode: string }> = [];
    const configuredMakers: Array<{
      readonly judge: Judge;
      readonly provider: ProviderGateway;
      readonly providerRef: string;
      readonly maker: string;
    }> = [];
    for (const member of run.discoveredPanel) {
      const configured = configuredByProviderRef.get(member.provider_ref);
      let state: "HEALTHY" | "ABSENT" = configured === undefined ? "ABSENT" : "HEALTHY";
      let modelId: string | null = configured === undefined ? null : member.model_id;
      let failureCode: string | null = configured === undefined ? "CLAIM_GATEWAY_UNRESOLVED" : null;
      if (configured !== undefined && this.settings.claimTimeProbe !== undefined) {
        try {
          const probe = await this.settings.claimTimeProbe(member);
          state = probe.state;
          modelId = probe.modelId;
          failureCode = probe.failureCode;
          if (state === "HEALTHY" && modelId !== member.model_id) {
            state = "ABSENT";
            modelId = null;
            failureCode = "CLAIM_MODEL_IDENTITY_CHANGED";
          }
        } catch (error) {
          state = "ABSENT";
          modelId = null;
          failureCode = error instanceof TypedDomainError ? error.code : "CLAIM_PROVIDER_PROBE_FAILED";
        }
      }
      if (state === "ABSENT") {
        const resolvedFailureCode = failureCode ?? "CLAIM_PROVIDER_ABSENT";
        await this.#providerProbes.record({
          probeEvidenceRef: randomUUID(),
          providerRef: member.provider_ref,
          maker: member.maker,
          state: "ABSENT",
          modelId: null,
          failureCode: resolvedFailureCode,
          probedAt: new Date()
        });
        absentAtClaim.push(Object.freeze({ member, failureCode: resolvedFailureCode }));
        continue;
      }
      if (this.settings.claimTimeProbe !== undefined) {
        await this.#providerProbes.record({
          probeEvidenceRef: randomUUID(),
          providerRef: member.provider_ref,
          maker: member.maker,
          state: "HEALTHY",
          modelId,
          failureCode: null,
          probedAt: new Date()
        });
      }
      configuredMakers.push(configured!);
    }
    if (configuredMakers.length === 0) {
      throw new TypedDomainError(
        "RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM",
        "Every provider pinned at ask time was absent when the runner claimed the work item"
      );
    }
    const effectiveMakerCount = configuredMakers.length;
    const primaryMaker = configuredMakers[0]!;
    const panelPolicy = this.settings.panelPolicy;
    // S2-2 / J13(b): one record per node whose panel degraded, bound to the node the
    // graph minted — the same discipline `bindWayOfKnowingDowngrade` follows. Declared
    // here because BOTH judgement producers (root and child) append to it.
    const panelDegradations: PanelDegradationRecord[] = [];

    /**
     * S2-2 / T3 — the judge panel for ONE authored node.
     *
     * Every OTHER healthy maker assesses the node; the author's own assessment
     * is one member. The author is handed to `runJudgePanel` as a member too,
     * so the FX-HR-H6 producer bulkhead is exercised by the code that owns it
     * and leaves a recorded note, rather than being pre-filtered away here.
     *
     * S4-1: this is node-local and is NOT the cross-maker review call — the
     * review leg (edge measurement) stays exactly where it was.
     *
     * Panel legs live in their OWN `PANEL:` call-site namespace. They are not
     * authoring legs and must never be counted as one: the expansion-leg
     * enumerations key off `JUDGE:%:root%`, so a panel call that borrowed the
     * `JUDGE:` prefix would silently join that set.
     */
    const runNodePanel = async (input: {
      readonly authorMaker: string;
      readonly authorProviderRef: string;
      readonly authorJudgementRef: string;
      readonly authorAssessment: JudgeAssessment;
      readonly authorTau: number;
      readonly claimType: ClaimType;
      readonly statement: string;
      readonly callSiteKey: string;
      readonly questionLine: string;
    }): Promise<{
      readonly selectedJudgementRef: string;
      readonly tau: number;
      readonly selectionScore: number;
      readonly rule: JudgementSelectionRule;
      readonly dispersion: number | null;
      readonly panelContractHashes: readonly string[];
      readonly disagreement: Readonly<Record<string, unknown>>;
      /**
       * J13(b): the canonical degradation marks this node earned, returned TYPED so the
       * caller can bind them to the node the graph mints. Reading them back out of the
       * untyped receipt JSON would be the facsimile pattern this mint exists to end.
       */
      readonly marks: readonly PanelDegradationMark[];
      readonly panelFailureReason: string | null;
    }> => {
      const judgeContractHash = this.settings.judgeContractHash;
      const authorOnlySelection = (): {
        readonly selectedJudgementRef: string;
        readonly tau: number;
        readonly selectionScore: number;
        readonly rule: JudgementSelectionRule;
      } => {
        const selected = selectReducedJudgement([{
          judgementRef: input.authorJudgementRef,
          tau: input.authorTau,
          effectiveWeight: judgementPolicy.earnedWeight
        }], judgementPolicy.selectionRule);
        if (selected.kind !== "SELECTED") {
          throw new TypedDomainError("NO_USABLE_JUDGEMENTS", "The panel produced no selectable judgement");
        }
        return {
          selectedJudgementRef: selected.selectedJudgementRef,
          tau: selected.tau,
          selectionScore: selected.selectionScore,
          rule: selected.rule
        };
      };

      // S2-2: the walking-skeleton literal is reachable at M=1 ONLY.
      if (effectiveMakerCount <= 1) {
        return Object.freeze({
          ...authorOnlySelection(),
          dispersion: null,
          panelContractHashes: Object.freeze([judgeContractHash]),
          disagreement: createUnmeasuredDisagreement(),
          marks: Object.freeze([]),
          panelFailureReason: null
        });
      }
      if (panelPolicy === undefined) {
        // Unreachable: the M>=2 loud stop above rejects this deployment before the
        // work item is claimed. Kept as a typed defence so the missing-row condition
        // can never re-acquire a degraded, proceeding shape (J12).
        throw new TypedDomainError(
          "PANEL_WEIGHTING_UNRESOLVED",
          "J12: a multi-maker run reached the panel without the sealed T16 panel-weighting rows"
        );
      }

      const panel = await runJudgePanel({
        artifactProducerRef: input.authorProviderRef,
        primary: {
          judgementRef: input.authorJudgementRef,
          assessment: input.authorAssessment,
          memberRole: input.authorMaker
        },
        members: configuredMakers.map((member) => ({
          memberRole: member.maker,
          actorRef: member.providerRef,
          contractHash: judgeContractHash,
          judge: async () => {
            const assessed = await member.judge.assess({
              runId: run.runId,
              subjectItemId: claimed.workItemId,
              callSiteKey: `${input.callSiteKey}:${member.providerRef}`,
              questionLine: input.questionLine,
              statement: input.statement,
              authorMaker: input.authorMaker,
              providerRef: member.providerRef,
              contractHash: judgeContractHash,
              bound: this.settings.judgeBound
            });
            return { judgementRef: assessed.judgementRef, assessment: assessed.assessment };
          }
        }))
      });

      // Each member's assessment is reduced through the SAME ratified
      // composition as the author's, so the taus are commensurable.
      const reducedMembers = panel.judgements.flatMap((entry) => {
        const reducedMember = reduceAssessment({
          claimType: input.claimType,
          assessment: entry.assessment,
          compositionRow,
          reducerVersion: judgementPolicy.reducerVersion
        });
        return reducedMember.kind === "REDUCED"
          ? [{ ...entry, tau: reducedMember.tau }]
          : [];
      });
      if (reducedMembers.length === 0) {
        throw new TypedDomainError("NO_USABLE_JUDGEMENTS", "The panel produced no reducible judgement");
      }

      const dispersion = measureDispersion(
        reducedMembers.map((entry) => ({ judgementRef: entry.judgementRef, tau: entry.tau })),
        {
          scale: panelPolicy.dispersionScale,
          rowKey: "dispersionScale",
          registerVersion: panelPolicy.registerVersion,
          sourceRef: panelPolicy.sourceRefs.dispersionScale ?? panelPolicy.unmappedReason
        }
      );

      const familyOf = (memberRole: string): JudgeFamily => {
        const member = configuredMakers.find((candidate) => candidate.maker === memberRole);
        const entry = member === undefined
          ? undefined
          : panelPolicy.providerFamilies.find((family) => family.providerRefs.includes(member.providerRef));
        return entry === undefined
          ? { kind: "UNKNOWN", reason: panelPolicy.unmappedReason }
          : { kind: "KNOWN", familyRef: entry.familyRef };
      };
      const weighted = applyCorrelatedErrorDiscount(
        reducedMembers.map((entry) => ({
          memberRole: entry.memberRole,
          earnedWeight: judgementPolicy.earnedWeight,
          family: familyOf(entry.memberRole)
        })),
        {
          repeatedFamilyMultiplier: panelPolicy.repeatedFamilyMultiplier,
          rowKey: "repeatedFamilyMultiplier",
          registerVersion: panelPolicy.registerVersion,
          sourceRef: panelPolicy.sourceRefs.repeatedFamilyMultiplier ?? panelPolicy.unmappedReason
        }
      );
      const selection = selectReducedJudgement(
        reducedMembers.map((entry, index) => ({
          judgementRef: entry.judgementRef,
          tau: entry.tau,
          effectiveWeight: weighted[index]!.effectiveWeight
        })),
        judgementPolicy.selectionRule
      );
      if (selection.kind !== "SELECTED") {
        throw new TypedDomainError("NO_USABLE_JUDGEMENTS", "The panel produced no selectable judgement");
      }

      // confirm-item 5. The author is always judgement[0]; every other entry is
      // a non-author voice that actually parsed.
      const nonAuthorVoices = reducedMembers.length - 1;
      const memberFailures = panel.notes.filter((note) => note.kind === "MEMBER_FAILED");
      const marks: PanelDegradationMark[] = [];
      if (nonAuthorVoices === 0) marks.push(PANEL_DEGRADED_SINGLE_VOICE_MARK);
      else if (memberFailures.length > 0) marks.push(PANEL_PARTIAL_MARK);
      // The reason names WHICH members fell over and how — a disclosure that says only
      // "partial" tells a reader nothing they can act on.
      const panelFailureReason = memberFailures.length === 0
        ? null
        : memberFailures.map((note) => `${note.memberRole}: ${note.failureKind}`).join("; ");

      const candidateBand = this.settings.servePolicy?.candidateConfidenceBand ?? null;
      const steppedDownBand = candidateBand === null
        ? null
        : panelPolicy.oneStepDown[candidateBand] ?? null;
      // A single surviving voice steps the band down one place in the sealed
      // vocabulary; a measured spread at or above the sealed threshold fires
      // the declared disagreement. Either way the downgrade is DECLARED, never
      // computed from a value this file carries.
      const disagreementFires = nonAuthorVoices === 0
        || (dispersion.kind === "MEASURED" && dispersion.value >= panelPolicy.disagreementThreshold);
      const declared = applyDeclaredDisagreement({
        fires: disagreementFires && candidateBand !== null && steppedDownBand !== null,
        predicateRef: panelPolicy.sourceRefs.disagreementThreshold ?? panelPolicy.unmappedReason,
        observationRef: panelPolicy.sourceRefs.dispersionScale ?? panelPolicy.unmappedReason,
        certaintyBand: candidateBand,
        downgradedBand: steppedDownBand
      });

      return Object.freeze({
        marks: Object.freeze([...marks]),
        panelFailureReason,
        selectedJudgementRef: selection.selectedJudgementRef,
        tau: selection.tau,
        selectionScore: selection.selectionScore,
        rule: selection.rule,
        dispersion: dispersion.kind === "MEASURED" ? dispersion.value : null,
        panelContractHashes: Object.freeze(reducedMembers.map(() => judgeContractHash)),
        disagreement: Object.freeze({
          ...declared,
          marks: Object.freeze(marks),
          dispersionAbsentReason: dispersion.kind === "ABSENT" ? dispersion.reason : null,
          panel: Object.freeze({
            authorMaker: input.authorMaker,
            authorProviderRef: input.authorProviderRef,
            voiceCount: reducedMembers.length,
            nonAuthorVoiceCount: nonAuthorVoices,
            members: Object.freeze(weighted.map((entry) => Object.freeze({
              memberRole: entry.memberRole,
              familyRef: entry.family.kind === "KNOWN" ? entry.family.familyRef : null,
              familyOrdinal: entry.familyOrdinal,
              earnedWeight: judgementPolicy.earnedWeight,
              effectiveWeight: entry.effectiveWeight
            }))),
            notes: Object.freeze(panel.notes.map((note) => Object.freeze({
              memberRole: note.memberRole,
              kind: note.kind,
              failureKind: note.failureKind,
              reason: note.reason
            })))
          })
        })
      });
    };

    const completable = await this.#ledger.findSuccessfulCommandArtifact({
      runId: run.runId,
      workItemId: claimed.workItemId
    });
    if (completable !== null) {
      await this.#work.settle({ workItemId: claimed.workItemId, ...completable });
      return { kind: "COMPLETED", answerId: completable.artifactRef };
    }
    for (const callSite of [
      {
        contractHash: this.settings.judgeContractHash,
        maxAttempts: this.settings.judgeBound.maxAttempts + (this.settings.runDeathPolicy?.finalRetryAttempts ?? 0)
      },
      { contractHash: this.settings.composerContractHash, maxAttempts: this.settings.composerBound.maxAttempts },
      { contractHash: this.settings.conformanceContractHash, maxAttempts: this.settings.conformanceBound.maxAttempts }
    ]) {
      const exhausted = await this.#ledger.findExhaustedModelAttempt({
        runId: run.runId,
        workItemId: claimed.workItemId,
        ...callSite
      });
      if (exhausted !== null) {
        if (exhausted.outcome === "OK") continue;
        if (callSite.contractHash === this.settings.judgeContractHash
          && exhausted.callSiteKey !== "JUDGE"
          && exhausted.callSiteKey !== "JUDGE:root:secondary") {
          preflightHaltedSites.set(exhausted.callSiteKey, {
            outcome: exhausted.outcome,
            ledgerEntryRef: exhausted.ledgerEntryRef
          });
          continue;
        }
        await this.#work.failFromExhaustedAttempt({ workItemId: claimed.workItemId, ...exhausted });
        return { kind: "TERMINAL_FAILED", artifactRef: exhausted.artifactRef };
      }
    }

    const judgementScheduledAt = new Date();
    await this.#ledger.append({
      runId: run.runId,
      attemptId: runnerAttemptId,
      actionKind: "JUDGEMENT_SCHEDULED",
      subjectItemId: claimed.workItemId,
      stanceAtAction: "UNASSIGNED",
      outcome: "OK",
      actorRef: this.settings.workerId,
      inputHash: hash({ questionLine: run.questionLine, workItemId: claimed.workItemId }),
      contractHash: this.settings.judgeContractHash,
      startedAt: judgementScheduledAt,
      finishedAt: new Date()
    });
    const primaryAttempt = await cooldownAttempt({
      callSiteKey: "JUDGE",
      parentNodeId: null,
      plannedLegCount: 1,
      failureScope: "MAKER_POSITION",
      attempt: (maxAttempts) => primaryMaker.judge.judge({
        runId: run.runId,
        subjectItemId: claimed.workItemId,
        callSiteKey: "JUDGE",
        questionLine: run.questionLine,
        providerRef: primaryMaker.providerRef,
        contractHash: this.settings.judgeContractHash,
        bound: { ...this.settings.judgeBound, maxAttempts }
      })
    });
    if (primaryAttempt.kind === "HALTED") {
      throw new TypedDomainError(
        "MAKER_POSITION_UNAVAILABLE",
        "The primary maker position failed after the full cooldown and final-retry courtesy"
      );
    }
    const judged = primaryAttempt.value;
    const reduced = reduceAssessment({
      claimType: judged.normalizedClaim.claimType,
      assessment: judged.assessment,
      compositionRow,
      reducerVersion: judgementPolicy.reducerVersion
    });
    if (reduced.kind !== "REDUCED") {
      throw new TypedDomainError("COMPOSITION_UNRESOLVED", `No ratified composition for ${reduced.claimType}`);
    }
    const selection = await runNodePanel({
      authorMaker: primaryMaker.maker,
      authorProviderRef: primaryMaker.providerRef,
      authorJudgementRef: judged.provenanceRef,
      authorAssessment: judged.assessment,
      authorTau: reduced.tau,
      claimType: judged.normalizedClaim.claimType,
      statement: judged.statement,
      callSiteKey: "PANEL:root",
      questionLine: run.questionLine
    });
    const nodeId = await this.#graph.withGraphWrite(run.runId, async (writer) => {
      const created = await writer.addNode({
        runId: run.runId,
        statementText: judged.statement,
        claimType: judged.normalizedClaim.claimType,
        parentNodeId: null,
        childKind: null,
        siblingOrdinal: 0,
        generationStatus: "complete",
        pathStatus: "active",
        explorationDecision: "continue",
        provenanceRef: judged.provenanceRef,
        wayOfKnowing: judged.wayOfKnowing,
        locator: judged.locator,
        valueLaden: judged.valueLaden
      });
      await writer.addStrangerRestatement({
        nodeId: created,
        text: judged.restatementText,
        checkStatus: judged.restatementStatus
      });
      return created;
    });
    for (const mark of selection.marks) {
      panelDegradations.push(Object.freeze({
        subjectRef: nodeId,
        mark,
        reason: selection.panelFailureReason ?? "Every non-author panel member failed"
      }));
    }
    const reducedJudgementId = await this.#judgements.recordReduced({
      runId: run.runId,
      nodeId,
      rawArtifactRef: judged.provenanceRef,
      tau: selection.tau,
      numberKind: this.settings.judgementNumberKind,
      producer: this.settings.judgementProducer,
      wayOfKnowing: judged.wayOfKnowing,
      uncertaintyLadderPosition: reduced.uncertaintyLadderPosition,
      uncertaintyDrivers: reduced.drivers,
      scoreCaps: reduced.caps,
      holes: reduced.holes,
      branchIdentifier: reduced.branch,
      reducerVersion: reduced.reducerVersion,
      judgeWeightVersion: judgementPolicy.judgeWeightVersion,
      selectedJudgementRef: selection.selectedJudgementRef,
      dispersion: selection.dispersion,
      panelContractHashes: selection.panelContractHashes,
      disagreement: selection.disagreement
    });

    interface AuthoredDebateNode {
      readonly nodeId: string;
      readonly statement: string;
      readonly provenanceRef: string;
      readonly reducedJudgementId: string;
      readonly wayOfKnowing: WayOfKnowing;
      readonly locator: string | null;
      readonly restatementStatus: "PASS" | "FAIL" | "NOT_SAMPLED";
      readonly reversalPoint: string;
      readonly authorIndex: number;
      readonly maker: string;
      /**
       * S6-1 / T11: the panel dispersion recorded on THIS node's reduced
       * judgement (T3's `dispersion`), carried so the winning root's
       * disagreement is read from the node that actually earned it. `null` is
       * s04's ABSENT case — fewer than two parseable judgements — and is a
       * runtime value the label ladder reads, never a zero it can compare.
       */
      readonly panelDispersion: number | null;
      /**
       * T5 / S3-1: every edge this node sources, carried to the node's ONE
       * review call so the reviewer measures them all on the visit it was
       * already making. A root sources none.
       */
      readonly sourcedEdges: readonly {
        readonly edgeId: string;
        readonly targetStatement: string;
        readonly polarity: "support" | "attack";
      }[];
    }
    const authoredNodes = new Map<number, AuthoredDebateNode>([[0, Object.freeze({
      nodeId,
      sourcedEdges: Object.freeze([]),
      statement: judged.statement,
      provenanceRef: judged.provenanceRef,
      reducedJudgementId,
      wayOfKnowing: judged.wayOfKnowing,
      locator: judged.locator,
      restatementStatus: judged.restatementStatus,
      reversalPoint: judged.assessment.critic.summary,
      panelDispersion: selection.dispersion,
      authorIndex: 0,
      maker: primaryMaker.maker
    })]]);
    const haltedExpansionRecords: HaltedExpansionRecord[] = [];
    // S2-3 / J5: way-of-knowing downgrades are bound to the node the graph
    // minted, never to the work item the judge was called with (codex T4-r1 B2).
    const wayOfKnowingDowngrades: WayOfKnowingDowngradeRecord[] = [];
    if (judged.wayOfKnowingDowngrade !== null) {
      wayOfKnowingDowngrades.push(bindWayOfKnowingDowngrade(judged.wayOfKnowingDowngrade, nodeId));
    }
    const hiddenReviewRecords: Array<{
      readonly nodeId: string;
      readonly record: HaltedExpansionRecord;
    }> = [];
    /**
     * T6 / S4-2 / J14 — the SECOND route into class H/D. The review LANDED and
     * returned `cannot-assess`, so the node carries no judged basis, exactly as
     * if the review had died — but the call succeeded, so there is no transport
     * outcome to name and `hiddenReviewRecords` above cannot hold it. The call
     * site is real and is captured at the site that made the call, never
     * reconstructed from the node id.
     */
    const unassessedReviewRecords: Array<{
      readonly nodeId: string;
      readonly callSiteKey: string;
      readonly outcome: "cannot-assess";
    }> = [];

    const authorPosition = async (input: {
      readonly authorIndex: number;
      readonly questionLine: string;
      readonly callSiteKey: string;
      readonly role: string;
      readonly parentNodeId: string | null;
      readonly childKind: "support" | "defeater" | null;
      readonly siblingOrdinal: number;
      readonly plannedLegCount: number;
      readonly explorationDecision: "continue" | "deepen" | "challenge";
      readonly edges: readonly {
        readonly targetNodeId: string;
        readonly targetStatement: string;
        readonly polarity: "support" | "attack";
      }[];
    }): Promise<
      | { readonly kind: "AUTHORED"; readonly value: AuthoredDebateNode }
      | { readonly kind: "HALTED"; readonly record: HaltedExpansionRecord }
    > => {
      const selectedMaker = configuredMakers[input.authorIndex];
      if (selectedMaker === undefined) {
        throw new TypedDomainError("DEBATE_MAKER_UNRESOLVED", `No configured maker exists at index ${input.authorIndex}`);
      }
        await this.#ledger.append({
          runId: run.runId,
          attemptId: runnerAttemptId,
          actionKind: "JUDGEMENT_SCHEDULED",
          subjectItemId: claimed.workItemId,
          stanceAtAction: "UNASSIGNED",
          outcome: "OK",
          actorRef: this.settings.workerId,
          inputHash: hash({ questionLine: input.questionLine, workItemId: claimed.workItemId }),
          contractHash: this.settings.judgeContractHash,
          startedAt: new Date(),
          finishedAt: new Date()
        });
      const childAttempt = await cooldownAttempt({
        callSiteKey: input.callSiteKey,
        parentNodeId: input.parentNodeId,
        plannedLegCount: input.plannedLegCount,
        failureScope: input.parentNodeId === null ? "MAKER_POSITION" : "EXPANSION",
        attempt: (maxAttempts) => selectedMaker.judge.judge({
          runId: run.runId,
          subjectItemId: claimed.workItemId,
          callSiteKey: input.callSiteKey,
          questionLine: input.questionLine,
          claimClassificationLine: run.questionLine,
          providerRef: selectedMaker.providerRef,
          contractHash: this.settings.judgeContractHash,
          bound: { ...this.settings.judgeBound, maxAttempts }
        })
      });
      if (childAttempt.kind === "HALTED") return childAttempt;
      const childJudged = childAttempt.value;
      const childReduced = reduceAssessment({
          claimType: childJudged.normalizedClaim.claimType,
          assessment: childJudged.assessment,
          compositionRow,
          reducerVersion: judgementPolicy.reducerVersion
        });
        if (childReduced.kind !== "REDUCED") {
          throw new TypedDomainError("COMPOSITION_UNRESOLVED", `No ratified composition for ${childReduced.claimType}`);
        }
        const childSelection = await runNodePanel({
          authorMaker: selectedMaker.maker,
          authorProviderRef: selectedMaker.providerRef,
          authorJudgementRef: childJudged.provenanceRef,
          authorAssessment: childJudged.assessment,
          authorTau: childReduced.tau,
          claimType: childJudged.normalizedClaim.claimType,
          statement: childJudged.statement,
          callSiteKey: `PANEL:${input.callSiteKey}`,
          questionLine: input.questionLine
        });
        const { created: childNodeId, minted: childSourcedEdges } = await this.#graph.withGraphWrite(run.runId, async (writer) => {
          const created = await writer.addNode({
            runId: run.runId,
            statementText: childJudged.statement,
            claimType: childJudged.normalizedClaim.claimType,
            parentNodeId: input.parentNodeId,
            childKind: input.childKind,
            siblingOrdinal: input.siblingOrdinal,
            generationStatus: "complete",
            pathStatus: "active",
            explorationDecision: input.explorationDecision,
            provenanceRef: childJudged.provenanceRef,
            wayOfKnowing: childJudged.wayOfKnowing,
            locator: childJudged.locator,
            valueLaden: childJudged.valueLaden
          });
          await writer.addStrangerRestatement({
            nodeId: created,
            text: childJudged.restatementText,
            checkStatus: childJudged.restatementStatus
          });
          const minted: { readonly edgeId: string; readonly targetStatement: string; readonly polarity: "support" | "attack" }[] = [];
          for (const edge of input.edges) {
            const edgeId = await writer.addEdge({
              runId: run.runId,
              sourceNodeId: created,
              targetKind: "NODE",
              targetNodeId: edge.targetNodeId,
              targetEdgeId: null,
              targetEdgePolarity: null,
              polarity: edge.polarity,
              kind: edge.polarity === "attack" ? "rebutting" : null,
              strength: null,
              magnitudeStatus: "UNKNOWN",
              // T5 / S3-1: the stamp names the role that will measure this edge.
              strengthSource: "REVIEWER",
              provenanceRef: childJudged.provenanceRef
            });
            minted.push({ edgeId, targetStatement: edge.targetStatement, polarity: edge.polarity });
          }
          return { created, minted: Object.freeze(minted) };
        });
        if (childJudged.wayOfKnowingDowngrade !== null) {
          wayOfKnowingDowngrades.push(bindWayOfKnowingDowngrade(childJudged.wayOfKnowingDowngrade, childNodeId));
        }
        for (const mark of childSelection.marks) {
          panelDegradations.push(Object.freeze({
            subjectRef: childNodeId,
            mark,
            reason: childSelection.panelFailureReason ?? "Every non-author panel member failed"
          }));
        }
        const childReducedJudgementId = await this.#judgements.recordReduced({
          runId: run.runId,
          nodeId: childNodeId,
          rawArtifactRef: childJudged.provenanceRef,
          tau: childSelection.tau,
          numberKind: this.settings.judgementNumberKind,
          producer: this.settings.judgementProducer,
          wayOfKnowing: childJudged.wayOfKnowing,
          uncertaintyLadderPosition: childReduced.uncertaintyLadderPosition,
          uncertaintyDrivers: childReduced.drivers,
          scoreCaps: childReduced.caps,
          holes: childReduced.holes,
          branchIdentifier: childReduced.branch,
          reducerVersion: childReduced.reducerVersion,
          judgeWeightVersion: judgementPolicy.judgeWeightVersion,
          selectedJudgementRef: childSelection.selectedJudgementRef,
          dispersion: childSelection.dispersion,
          panelContractHashes: childSelection.panelContractHashes,
          disagreement: childSelection.disagreement
        });
      return { kind: "AUTHORED", value: Object.freeze({
          nodeId: childNodeId,
          sourcedEdges: childSourcedEdges,
          statement: childJudged.statement,
          provenanceRef: childJudged.provenanceRef,
          reducedJudgementId: childReducedJudgementId,
          wayOfKnowing: childJudged.wayOfKnowing,
          locator: childJudged.locator,
          restatementStatus: childJudged.restatementStatus,
          reversalPoint: childJudged.assessment.critic.summary,
          panelDispersion: childSelection.dispersion,
          authorIndex: input.authorIndex,
          maker: selectedMaker.maker
        }) };
    };

    if (effectiveMakerCount > 1) {
      const secondary = await authorPosition({
        authorIndex: 1,
        questionLine: [
          "Independently author your own position on the question. Do not grade or imitate another maker.",
          `Question under debate: ${run.questionLine}`
        ].join("\n"),
        callSiteKey: "JUDGE:root:secondary",
        role: "secondary root author",
        parentNodeId: null,
        childKind: null,
        siblingOrdinal: 0,
        plannedLegCount: 1,
        explorationDecision: "continue",
        edges: []
      });
      if (secondary.kind === "HALTED") {
        throw new TypedDomainError(
          "MAKER_POSITION_UNAVAILABLE",
          "The secondary maker position failed after the full cooldown and final-retry courtesy"
        );
      }
      authoredNodes.set(1, secondary.value);
    }

    for (let makerIndex = 2; makerIndex < effectiveMakerCount; makerIndex += 1) {
      const additionalRoot = await authorPosition({
        authorIndex: makerIndex,
        questionLine: [
          "Independently author your own position on the question. Do not grade or imitate another maker.",
          `Question under debate: ${run.questionLine}`
        ].join("\n"),
        callSiteKey: `JUDGE:root:${makerIndex}`,
        role: "additional maker root author",
        parentNodeId: null,
        childKind: null,
        siblingOrdinal: 0,
        plannedLegCount: 1,
        explorationDecision: "continue",
        edges: []
      });
      if (additionalRoot.kind === "HALTED") {
        throw new TypedDomainError(
          "MAKER_POSITION_UNAVAILABLE",
          `Maker position ${makerIndex} failed after the full cooldown and final-retry courtesy`
        );
      }
      authoredNodes.set(makerIndex, additionalRoot.value);
    }

    // DR-184/C-10: reviews are interleaved at round boundaries. Coverage is
    // invariant; reviewer assignment may change because rotation observes the
    // latest landed review, and that behaviour change is deliberately declared.
    const reviewScheduledNodeIds = new Set<string>();
    const reviewPendingAuthoredNodes = async (): Promise<void> => {
      if (effectiveMakerCount <= 1) return;
      for (const authoredNode of authoredNodes.values()) {
        if (reviewScheduledNodeIds.has(authoredNode.nodeId)) continue;
        reviewScheduledNodeIds.add(authoredNode.nodeId);
        const latestReviewerMaker = await this.#judgements.readLatestReviewerMaker(run.runId, authoredNode.maker);
        const reviewer = selectDifferentMakerReviewer(authoredNode.maker, configuredMakers, latestReviewerMaker);
        try {
          const callSiteKey = `JUDGE:review:${authoredNode.nodeId}`;
          const reviewAttempt = await cooldownAttempt({
            callSiteKey,
            parentNodeId: authoredNode.nodeId,
            plannedLegCount: 1,
            failureScope: "REVIEW",
            attempt: (maxAttempts) => reviewer.judge.review({
              runId: run.runId,
              subjectItemId: claimed.workItemId,
              callSiteKey,
              questionLine: run.questionLine,
              statement: authoredNode.statement,
              authorMaker: authoredNode.maker,
              providerRef: reviewer.providerRef,
              contractHash: this.settings.judgeContractHash,
              bound: { ...this.settings.judgeBound, maxAttempts },
              // S3-1: this ONE call measures every edge the node sources.
              edges: authoredNode.sourcedEdges
            })
          });
          if (reviewAttempt.kind === "HALTED") {
            hiddenReviewRecords.push({ nodeId: authoredNode.nodeId, record: reviewAttempt.record });
            continue;
          }
          const review = reviewAttempt.value;
          // T5 / S3-1 + codex r2 B1: the review and the magnitudes it already
          // returned are ONE fact, committed in ONE transaction. Writing the
          // review alone is irreversible and would remove this node from every
          // future work set, stranding the bearing beyond any repair.
          await recordReviewWithMeasurements(this.pool, {
            runId: run.runId,
            nodeId: authoredNode.nodeId,
            authorRawArtifactRef: authoredNode.provenanceRef,
            reviewRawArtifactRef: review.provenanceRef,
            outcome: review.outcome,
            reasons: review.reasons,
            measurements: review.edgeMeasurements
          });
          // T6/J14: recorded only AFTER the review commits, so the disclosure
          // can never name an outcome the ledger does not hold.
          if (review.outcome === "cannot-assess") {
            unassessedReviewRecords.push({
              nodeId: authoredNode.nodeId, callSiteKey, outcome: review.outcome
            });
          }
        } catch (error) {
          if (error instanceof TypedDomainError && [
            "RUN_COST_ENVELOPE_EXHAUSTED",
            "CALL_BUDGET_EXHAUSTED",
            "PRODUCER_GRADING_FORBIDDEN"
          ].includes(error.code)) throw error;
          throw new TypedDomainError(
            "NODE_REVIEW_UNAVAILABLE",
            `No valid cross-maker review was recorded for node ${authoredNode.nodeId}`
          );
        }
      }
    };
    await reviewPendingAuthoredNodes();

    // PRO-01 × PANEL-01: each independently authored root owns its own B3-B
    // breadth-first pro/con tree, with real per-node maker lineage.
    const expansionPlan = effectiveMakerCount > 1
      ? buildMultiMakerExpansionPlan(expansionDepth, effectiveMakerCount)
      : [];
    const haltedIndices = new Set<number>();
    const subtreeIndices = (rootIndex: number): readonly number[] => {
      const indices = new Set([rootIndex]);
      for (const candidate of expansionPlan) {
        if (indices.has(candidate.parentIndex)) indices.add(candidate.childIndex);
      }
      return Object.freeze([...indices]);
    };
    let activeExpansionRound = expansionPlan[0]?.round ?? null;
    for (const leg of expansionPlan) {
      if (activeExpansionRound !== null && leg.round !== activeExpansionRound) {
        await reviewPendingAuthoredNodes();
        activeExpansionRound = leg.round;
      }
      if (haltedIndices.has(leg.parentIndex) || haltedIndices.has(leg.childIndex)) continue;
      const parent = authoredNodes.get(leg.parentIndex);
      if (parent === undefined) {
        throw new TypedDomainError("DEBATE_EXPANSION_PARENT_MISSING", `Node index ${leg.parentIndex}`);
      }
      const role = leg.polarity === "support" ? "defender" : "critic";
      const plannedSubtreeIndices = subtreeIndices(leg.childIndex);
      const childQuestionLine = leg.polarity === "support"
        ? [
            "A fair debate requires a genuine supporting case for every position, judged on its own merits.",
            `Question under debate: ${run.questionLine}`,
            `Position to defend: ${parent.statement}`,
            "State and defend the strongest genuine supporting reason for that position."
          ].join("\n")
        : [
            "A fair debate requires the strongest genuine counter-position, judged on its own merits.",
            `Question under debate: ${run.questionLine}`,
            `Position under critique: ${parent.statement}`,
            "State and defend the strongest genuine counter-position to that position."
          ].join("\n");
      const authored = await authorPosition({
        authorIndex: leg.authorIndex,
        questionLine: childQuestionLine,
        callSiteKey: `JUDGE:${role}:root${leg.rootIndex}:r${leg.round}:p${leg.parentIndex}`,
        role,
        parentNodeId: parent.nodeId,
        childKind: leg.polarity === "support" ? "support" : "defeater",
        siblingOrdinal: leg.polarity === "support" ? 1 : 2,
        plannedLegCount: plannedSubtreeIndices.length,
        explorationDecision: leg.polarity === "support" ? "deepen" : "challenge",
        edges: [{ targetNodeId: parent.nodeId, targetStatement: parent.statement, polarity: leg.polarity }]
      });
      if (authored.kind === "HALTED") {
        const indices = plannedSubtreeIndices;
        indices.forEach((index) => haltedIndices.add(index));
        haltedExpansionRecords.push({ ...authored.record, plannedLegCount: indices.length });
        continue;
      }
      authoredNodes.set(leg.childIndex, authored.value);
    }
    await reviewPendingAuthoredNodes();

    // DR-154(2) generalized proposal: each maker authors one ordered response
    // per other maker root. Each real response node defends its own root and
    // attacks its named target; both S07 edges carry UNKNOWN magnitude until
    // independently judged.
    for (const exchange of buildCrossRootExchangePlan(effectiveMakerCount)) {
      const authorRoot = authoredNodes.get(exchange.authorRootIndex);
      const targetRoot = authoredNodes.get(exchange.targetRootIndex);
      if (authorRoot === undefined || targetRoot === undefined) {
        throw new TypedDomainError("DEBATE_ROOT_MISSING", "A cross-root exchange requires both authored roots");
      }
      const authored = await authorPosition({
        authorIndex: exchange.authorIndex,
        questionLine: [
          "Author one direct cross-root response: defend your own position and attack the other maker's position.",
          `Question under debate: ${run.questionLine}`,
          `Your position: ${authorRoot.statement}`,
          `Other maker's position: ${targetRoot.statement}`
        ].join("\n"),
        callSiteKey: `JUDGE:cross-root:${exchange.authorRootIndex}->${exchange.targetRootIndex}`,
        role: "cross-root response",
        parentNodeId: authorRoot.nodeId,
        childKind: "support",
        // Root expansion occupies ordinals 1/2. Preserve M=2's historical
        // ordinal 3 while allocating one deterministic slot per other root.
        siblingOrdinal: 3 + (exchange.targetRootIndex < exchange.authorRootIndex
          ? exchange.targetRootIndex
          : exchange.targetRootIndex - 1),
        plannedLegCount: 1,
        explorationDecision: "challenge",
        edges: [
          { targetNodeId: authorRoot.nodeId, targetStatement: authorRoot.statement, polarity: "support" },
          { targetNodeId: targetRoot.nodeId, targetStatement: targetRoot.statement, polarity: "attack" }
        ]
      });
      if (authored.kind === "HALTED") {
        haltedExpansionRecords.push(authored.record);
      } else {
        const nextIndex = Math.max(...authoredNodes.keys()) + 1;
        authoredNodes.set(nextIndex, authored.value);
      }
    }
    await reviewPendingAuthoredNodes();

    const authoredNodeList = [...authoredNodes.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, authored]) => authored);
    const authoredMakerPositions = Array.from({ length: effectiveMakerCount }, (_, index) => authoredNodes.get(index))
      .filter((candidate): candidate is AuthoredDebateNode => candidate !== undefined);
    const materialised = await this.#graph.materialiseSnapshot(run.runId);
    // P8 × DR-074: an arrow-bearing graph propagates only under the ruled
    // deployment scoringOperator row, resolved through the SHIPPED chain with
    // the supplying level RECORDED on the receipt. Unruled ⇒ typed loud stop.
    const arrowTargetNodeIds = [...new Set(materialised.arrows.flatMap((arrow) =>
      arrow.targetKind === "NODE" && arrow.targetNodeId !== null ? [arrow.targetNodeId] : []
    ))];
    let snapshot: EvaluationSnapshot = materialised;
    if (arrowTargetNodeIds.length > 0) {
      const scoringRegisterRow = this.settings.scoringOperator;
      if (scoringRegisterRow === undefined) {
        throw new TypedDomainError(
          "SCORING_OPERATOR_UNRESOLVED",
          "DR-074: the mandatory deployment scoringOperator register row is unruled; its value is V's at DR-023 and is never invented (AC-76/DR-039)"
        );
      }
      const resolvedOperator = resolveScoringOperator({
        parent: {},
        run: {},
        deployment: { scoringOperator: scoringRegisterRow.deploymentRowValue }
      });
      snapshot = Object.freeze({
        ...materialised,
        operatorResolutions: Object.freeze(arrowTargetNodeIds.map((parentNodeId) => Object.freeze({
          parentNodeId,
          operator: resolvedOperator.value,
          suppliedBy: resolvedOperator.suppliedBy
        })))
      });
    }
    const reviewedNodeIds = effectiveMakerCount <= 1
      ? materialised.nodes.map((node) => node.nodeId)
      : await this.#judgements.readReviewedNodeIds(run.runId);
    const standing = projectJudgedStanding(snapshot, reviewedNodeIds);
    snapshot = standing.snapshot;
    const classHNodeIds = new Set(standing.hiddenNodeIds);
    const classDNodeIds = new Set(standing.derivedStandingNodeIds);
    const propagationStartedAt = new Date();
    const propagation = evaluate(snapshot);
    const threshold = this.settings.hiddenNodeScoreThreshold;
    const lowScoreRows = threshold === undefined
      ? []
      : propagation.strengths.filter((row) => row.strength <= threshold.value);
    const propagatedNodeIds = new Set(propagation.strengths.map((row) => row.nodeId));
    const servableMakerPositions = authoredMakerPositions.filter((root) => propagatedNodeIds.has(root.nodeId));
    if (servableMakerPositions.length === 0) {
      throw new TypedDomainError(
        "NO_SERVABLE_MAKER_POSITION_AFTER_REVIEW",
        "Every authored maker position was excluded after cross-maker review transport exhaustion"
      );
    }
    // T10: propagation picks the served root, configuration order does not.
    const servedRootSelection = selectServedRootByStrength(servableMakerPositions, propagation.strengths);
    const servedRoot = servedRootSelection.root;
    // T11: the three-state label is derived HERE — from the propagated numbers
    // only, before composition and before any synthesis step, so the derivation
    // stays acyclic (confirm-item 3: the round-3 objection is a mark, never a
    // label input). The mark it may earn is attached to the served answer's
    // result below, once the terminal is known.
    const verdictLabelControls = this.settings.verdictLabelPolicy;
    if (verdictLabelControls === undefined) {
      // Unreachable from executeWorkItem: the claim-time gate above refuses
      // first. Kept as the typed defence for any future caller that reaches
      // selection by another path — the label is never derived from a value
      // this file chose.
      throw new TypedDomainError(
        "VERDICT_LABEL_CONTROLS_UNRESOLVED",
        "T11: the served answer's label reads gamma, the two cuts and the disagreement threshold from T16's sealed register rows; a deployment that never sealed them stops loudly rather than labelling on invented values (goal 39-40)"
      );
    }
    const servedRootJudgement = authoredMakerPositions.find((root) => root.nodeId === servedRoot.nodeId);
    if (servedRootJudgement === undefined) {
      // Unreachable by construction (the servable set is a subset of the
      // authored one). Typed rather than optional-chained, so a future
      // refactor cannot turn "no such node" into "no disagreement".
      throw new TypedDomainError("SERVED_ROOT_JUDGEMENT_UNRESOLVED", servedRoot.nodeId);
    }
    const servedRootDispersion = servedRootJudgement.panelDispersion;
    const verdictLabelBasis: VerdictLabelBasis = Object.freeze({
      winner: servedRootSelection.servedStrength,
      margin: servedRootSelection.margin,
      // The NAMED quantity: the recorded panel dispersion of the WINNING root's
      // reduced judgement (T3's `dispersion`), on T16's seeded scale. Fewer than
      // two parseable judgements is ABSENT with s04's own reason.
      disagreement: servedRootDispersion === null
        ? Object.freeze({ kind: "ABSENT" as const, reason: "FEWER_THAN_TWO_PARSEABLE_JUDGEMENTS" })
        : Object.freeze({ kind: "MEASURED" as const, value: servedRootDispersion }),
      controls: Object.freeze({
        gamma: verdictLabelControls.gamma,
        highCut: verdictLabelControls.highCut,
        lowCut: verdictLabelControls.lowCut,
        disagreementThreshold: verdictLabelControls.disagreementThreshold
      })
    });
    const verdictLabel = deriveVerdictLabel(verdictLabelBasis);
    // J23: the citable set follows the DIGEST — same source, same membership,
    // so "every load-bearing claim traces to a digest node" is satisfiable by
    // construction rather than by the synthesizer guessing. Exactly one node is
    // load-bearing (DR-159 B2-A clause 1); the rest are citable evidence.
    const servedNodes = buildDigestFollowingServeNodes({
      authored: authoredNodeList,
      servedRootNodeId: servedRoot.nodeId
    });
    const replayHandle = `replay:${run.runId}:${servedRoot.nodeId}`;
    const propagationRunId = await this.#ledger.recordPropagation({
      runId: run.runId,
      inputHash: hash(snapshot),
      contractHash: this.settings.propagationContractHash,
      graphFingerprint: hash(propagation.graphFingerprintMaterial),
      arrowOrder: propagation.arrowOrder,
      clusterRecords: propagation.clusterRecords,
      operatorResolutions: propagation.operatorResolutions,
      transmissionReductions: propagation.transmissionReductions,
      liftRecords: propagation.liftRecords,
      // T10: the served-root decision and its MARGIN TO THE RUNNER-UP are
      // recorded on the propagation receipt — the same record that already
      // carries the judgement selection rule and the operator supplying level.
      servedRootSelection: {
        rule: servedRootSelection.rule,
        servedNodeId: servedRoot.nodeId,
        servedStrength: servedRootSelection.servedStrength,
        runnerUp: servedRootSelection.runnerUp,
        margin: servedRootSelection.margin,
        tiebreak: servedRootSelection.tiebreak,
        candidateCount: servableMakerPositions.length,
        // T11 reads the same numbers; recording the label beside them makes the
        // receipt self-checking rather than a pair of records that can drift.
        verdictLabel: {
          label: verdictLabel.label,
          rung: verdictLabel.rung,
          trigger: verdictLabel.trigger,
          basisAbsence: verdictLabel.basisAbsence,
          disagreement: verdictLabelBasis.disagreement,
          registerVersion: verdictLabelControls.registerVersion,
          sourceRefs: verdictLabelControls.sourceRefs
        }
      },
      judgementSelectionRule: {
        ...selection.rule,
        selectedJudgementRef: selection.selectedJudgementRef,
        selectionScore: selection.selectionScore
      },
      sensitivityRecords: propagation.sensitivityRecords,
      // FAIR-01/DR-115: every strength record cites ITS OWN node's judgement,
      // artifact and way of knowing — the position's lineage is never stamped
      // onto the counter's number. An unmapped node is a typed loud stop.
      strengths: propagation.strengths.map((strength) => {
        const lineage = authoredNodeList.find((candidate) => candidate.nodeId === strength.nodeId);
        if (lineage === undefined) {
          throw new TypedDomainError("STRENGTH_LINEAGE_UNRESOLVED", strength.nodeId);
        }
        return {
          ...strength,
          reducedJudgementRef: lineage.reducedJudgementId,
          numberKind: this.settings.propagationNumberKind,
          sourceRef: lineage.provenanceRef,
          producer: this.settings.propagationProducer,
          replayHandle: `replay:${run.runId}:${lineage.nodeId}`,
          wayOfKnowing: lineage.wayOfKnowing
        };
      })
    });
    await this.#ledger.append({
      runId: run.runId,
      attemptId: runnerAttemptId,
      actionKind: "PROPAGATION",
      subjectItemId: servedRoot.nodeId,
      stanceAtAction: "UNASSIGNED",
      outcome: "OK",
      actorRef: this.settings.propagationProducer,
      inputHash: hash(snapshot),
      contractHash: this.settings.propagationContractHash,
      rawArtifactRef: servedRoot.provenanceRef,
      startedAt: propagationStartedAt,
      finishedAt: new Date()
    });
    const memoryDisclosure = await this.#memory.readDisclosure(run.runId);
    const monoMakerConditionMarks = effectiveMakerCount === 1
      ? ["SINGLE-LINEAGE", "CRITIQUE-UNAVAILABLE"] as const
      : [] as const;
    /**
     * T6 / S4-2 / J14 — the two routes into class H/D, carried as ONE list.
     *
     * The standing consequence is identical either way, so the MARK is the same
     * and the class is not split; what differs is the REASON, which the record
     * has always existed to carry. Each route states its own truth: the
     * transport route names a transport outcome and a lift that is real (retry
     * the review), the cannot-assess route names the review outcome and a lift
     * that is honest about `UNIQUE (node_id)` — this run's review is sealed and
     * no retry can reach it.
     */
    const unjudgedReviewDisclosures: readonly {
      readonly nodeId: string;
      readonly callSiteKey: string;
      readonly terminalTransportOutcome: "TIMED_OUT" | "FAILED" | null;
      readonly reviewOutcome: "cannot-assess" | null;
      readonly hiddenReason: string;
      readonly derivedReason: string;
      readonly liftPath: string;
    }[] = Object.freeze([
      ...hiddenReviewRecords.map(({ nodeId, record }) => Object.freeze({
        nodeId,
        callSiteKey: record.callSiteKey,
        terminalTransportOutcome: record.terminalTransportOutcome,
        reviewOutcome: null,
        hiddenReason: "Cross-maker review transport exhausted; disclosed as unjudged and excluded from the served number",
        derivedReason: "This node's own cross-house review did not land; it serves on the authority of its judged arguments, not on its own unreviewed assertion",
        liftPath: "Restore a valid cross-maker review"
      })),
      ...unassessedReviewRecords.map(({ nodeId, callSiteKey, outcome }) => Object.freeze({
        nodeId,
        callSiteKey,
        terminalTransportOutcome: null,
        reviewOutcome: outcome,
        hiddenReason: "The cross-maker review returned cannot-assess; the node has no judged basis and is excluded from the served number",
        derivedReason: "This node's own cross-house review returned cannot-assess; it serves on the authority of its judged arguments, not on its own unjudged assertion",
        liftPath: "Ask again with material a cross-maker reviewer can assess; this run's review is sealed and cannot be retried"
      }))
    ]);
    const classHReviewRecords = unjudgedReviewDisclosures.filter(({ nodeId }) => classHNodeIds.has(nodeId));
    const classDReviewRecords = unjudgedReviewDisclosures.filter(({ nodeId }) => classDNodeIds.has(nodeId));
    const classHSubtree = (rootNodeId: string): readonly string[] => {
      const affected = new Set([rootNodeId]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const node of materialised.nodes) {
          if (node.parentNodeId === null || node.parentNodeId === undefined
            || !affected.has(node.parentNodeId) || affected.has(node.nodeId)) continue;
          affected.add(node.nodeId);
          changed = true;
        }
      }
      return Object.freeze([...affected].filter((nodeId) => classHNodeIds.has(nodeId)));
    };
    const hiddenConditionMarks = Object.freeze([
      ...(absentAtClaim.length > 0 ? ["CRITIQUE-UNAVAILABLE" as const] : []),
      ...(classHReviewRecords.length > 0 ? ["HIDDEN-UNJUDGEABLE" as const] : []),
      ...(classDReviewRecords.length > 0 ? ["DERIVED-STANDING-UNREVIEWED" as const] : []),
      ...(lowScoreRows.length > 0 ? ["HIDDEN-LOW-SCORE" as const] : []),
      ...(haltedExpansionRecords.length > 0 ? ["UNAUTHORED-BRANCH-HALTED" as const] : []),
      // S2-3 / J5: the honesty mark is only visible if it reaches the answer.
      ...(wayOfKnowingDowngrades.length > 0 ? ["WAY-OF-KNOWING-DOWNGRADED" as const] : []),
      // S2-2 / J13(b): same rule for the panel degradations — a mark recorded only on
      // the node's receipt is not disclosed to the reader of the answer.
      ...new Set(panelDegradations.map((record) => record.mark))
    ]);
    const factBundle: FactBundle = buildFactBundle({
      facts: Object.freeze([servedRoot.statement]),
      residualObjections: Object.freeze([]),
      badges: Object.freeze([]),
      conditionMarks: Object.freeze([...new Set([
        ...(effectiveMakerCount > 1 ? ["UNSERVED-MAKER-POSITION" as const] : [...monoMakerConditionMarks]),
        ...hiddenConditionMarks
      ])]),
      reversalPoint: servedRoot.reversalPoint,
      buildsOnPrevious: {
        value: memoryDisclosure?.matched === true,
        answerRef: memoryDisclosure?.prior?.answer_id ?? null
      },
      memoryDisclosure
    });
    let finalSegments: readonly ComposedSegment[] = [];
    let compositionRawArtifactRef: string | null = null;
    let compositionAttempt = 0;
    const conformanceRawArtifactRefs: string[] = [];
    let conditionMarkRecords: readonly ConditionMarkRecord[] = effectiveMakerCount === 1
      ? [
          Object.freeze({
            mark: "SINGLE-LINEAGE",
            scope: "answer",
            subjectRef: servedRoot.nodeId,
            reason: "MONO_MAKER_RUN",
            liftPath: "RUN_DIFFERENT_MAKER_CRITIQUE",
            servedRootRule: null,
            affectedNodeIds: Object.freeze([servedRoot.nodeId])
          }),
          Object.freeze({
            mark: "CRITIQUE-UNAVAILABLE",
            scope: "answer",
            subjectRef: servedRoot.nodeId,
            reason: [
              ...(absentAtClaim.length === 0 ? [] : [
                `CLAIM_PANEL_REVISED:${absentAtClaim.map(({ member, failureCode }) => `${member.provider_ref}=${failureCode}`).join(",")}`
              ]),
              `MONO_LINEAGE_DEPTH_NOT_EXPANDED:requested_depth=${expansionDepth}`
            ].join("|"),
            liftPath: "RUN_DIFFERENT_MAKER_CRITIQUE",
            servedRootRule: null,
            affectedNodeIds: Object.freeze([servedRoot.nodeId])
          })
        ]
      : [buildUnservedMakerPositionRecord(authoredMakerPositions, servedRoot)];
    conditionMarkRecords = Object.freeze([
      ...conditionMarkRecords,
      ...(absentAtClaim.length === 0 || effectiveMakerCount === 1 ? [] : [Object.freeze({
        mark: "CRITIQUE-UNAVAILABLE" as const,
        scope: "answer" as const,
        subjectRef: servedRoot.nodeId,
        reason: `CLAIM_PANEL_REVISED:${absentAtClaim.map(({ member, failureCode }) => `${member.provider_ref}=${failureCode}`).join(",")}`,
        liftPath: "RESTORE_PINNED_PROVIDER_AND_RUN_AGAIN",
        servedRootRule: null,
        affectedNodeIds: Object.freeze([servedRoot.nodeId])
      })]),
      ...classHReviewRecords.map((disclosure): ConditionMarkRecord => Object.freeze({
        mark: "HIDDEN-UNJUDGEABLE",
        scope: "node",
        subjectRef: disclosure.nodeId,
        reason: disclosure.hiddenReason,
        liftPath: disclosure.liftPath,
        servedRootRule: null,
        affectedNodeIds: classHSubtree(disclosure.nodeId),
        callSiteKey: disclosure.callSiteKey,
        plannedLegCount: null,
        terminalTransportOutcome: disclosure.terminalTransportOutcome,
        reviewOutcome: disclosure.reviewOutcome,
        hiddenStrength: null,
        hiddenScoreThreshold: null,
        hiddenScoreThresholdSourceRef: null,
        excludedFromServedNumber: true
      })),
      ...classDReviewRecords.map((disclosure): ConditionMarkRecord => Object.freeze({
        mark: "DERIVED-STANDING-UNREVIEWED",
        scope: "node",
        subjectRef: disclosure.nodeId,
        reason: disclosure.derivedReason,
        liftPath: disclosure.liftPath,
        servedRootRule: null,
        affectedNodeIds: Object.freeze([disclosure.nodeId]),
        callSiteKey: disclosure.callSiteKey,
        plannedLegCount: null,
        terminalTransportOutcome: disclosure.terminalTransportOutcome,
        reviewOutcome: disclosure.reviewOutcome,
        hiddenStrength: null,
        hiddenScoreThreshold: null,
        hiddenScoreThresholdSourceRef: null,
        excludedFromServedNumber: false,
        judgedBasisCount: standing.judgedBasisCounts[disclosure.nodeId]!
      })),
      ...lowScoreRows.map((row): ConditionMarkRecord => Object.freeze({
        mark: "HIDDEN-LOW-SCORE",
        scope: "node",
        subjectRef: row.nodeId,
        reason: `Recorded strength ${row.strength} is at or below the ruled hidden-node threshold`,
        liftPath: "Raise the recorded strength above the ruled threshold",
        servedRootRule: null,
        affectedNodeIds: Object.freeze([row.nodeId]),
        callSiteKey: null,
        plannedLegCount: null,
        terminalTransportOutcome: null,
        hiddenStrength: row.strength,
        hiddenScoreThreshold: threshold!.value,
        hiddenScoreThresholdSourceRef: threshold!.sourceRef,
        excludedFromServedNumber: false
      })),
      ...haltedExpansionRecords.map((record): ConditionMarkRecord => Object.freeze({
        mark: "UNAUTHORED-BRANCH-HALTED",
        scope: "node",
        subjectRef: record.parentNodeId!,
        reason: "Expansion halted after transport exhaustion; no node was authored to hide or reveal",
        liftPath: "Retry the halted authoring call in a new run",
        servedRootRule: null,
        affectedNodeIds: Object.freeze([record.parentNodeId!]),
        callSiteKey: record.callSiteKey,
        plannedLegCount: record.plannedLegCount,
        terminalTransportOutcome: record.terminalTransportOutcome,
        hiddenStrength: null,
        hiddenScoreThreshold: null,
        hiddenScoreThresholdSourceRef: null,
        excludedFromServedNumber: null
      })),
      // S2-3 / J5: one typed record per downgraded node, projected onto that
      // node through `affectedNodeIds` so the disclosure is visible where the
      // override happened — not only on the answer.
      // S2-2 / J13(b): one typed record per degraded panel, projected onto the node
      // whose panel degraded so the disclosure is visible where it happened.
      ...panelDegradations.map((record): ConditionMarkRecord => Object.freeze({
        mark: record.mark,
        scope: "node" as const,
        subjectRef: record.subjectRef,
        reason: record.reason,
        liftPath: record.mark === PANEL_DEGRADED_SINGLE_VOICE_MARK
          ? "Re-ask when another healthy maker can assess this node"
          : "Re-ask to collect the assessments the failed panel members owed",
        servedRootRule: null,
        affectedNodeIds: Object.freeze([record.subjectRef]),
        callSiteKey: null,
        plannedLegCount: null,
        terminalTransportOutcome: null,
        hiddenStrength: null,
        hiddenScoreThreshold: null,
        hiddenScoreThresholdSourceRef: null,
        excludedFromServedNumber: null
      })),
      ...wayOfKnowingDowngrades.map((record): ConditionMarkRecord => Object.freeze({
        mark: "WAY-OF-KNOWING-DOWNGRADED",
        scope: "node",
        subjectRef: record.subjectRef,
        reason: record.reason,
        liftPath: "Re-ask with a source the judge can pin, or read the node as reasoning",
        servedRootRule: null,
        affectedNodeIds: Object.freeze([record.subjectRef]),
        callSiteKey: null,
        plannedLegCount: null,
        terminalTransportOutcome: null,
        hiddenStrength: null,
        hiddenScoreThreshold: null,
        hiddenScoreThresholdSourceRef: null,
        excludedFromServedNumber: null
      }))
    ]);
    // ---- T9: the synthesis serve chain's inputs -------------------------
    const synthesisRoles = this.settings.synthesisRolePolicy;
    if (synthesisRoles === undefined) {
      // Unreachable from executeWorkItem: the claim-time gate refuses first.
      // Kept as the typed defence for any future caller that reaches serve by
      // another path — a role ref is never a value this file chose.
      throw new TypedDomainError(
        "SYNTHESIS_ROLE_CONTROLS_UNRESOLVED",
        "T9: the synthesizer and evaluator role refs and the evaluator loop bound are sealed T16 register rows (J8); a deployment that never sealed them stops loudly rather than synthesizing on invented identities (goal 39-40)"
      );
    }
    /**
     * J8: the role ref names a CONFIGURED PROVIDER IDENTITY. Resolving it by
     * lookup — never by position — is what keeps "the first configured
     * provider" from quietly becoming the synthesizer when the deployment
     * reorders its providers. An unresolvable ref is loud: synthesizing on a
     * provider the sealed row did not name is exactly the substitution the
     * sealed row exists to prevent.
     */
    const resolveSynthesisRoleMaker = (
      roleRef: string,
      role: "SYNTHESIZER" | "EVALUATOR"
    ): { readonly provider: ProviderGateway; readonly providerRef: string } => {
      const configured = this.#configuredMakers.find((maker) => maker.providerRef === roleRef);
      if (configured === undefined) {
        throw new TypedDomainError(
          "SYNTHESIS_ROLE_PROVIDER_UNRESOLVED",
          `${role} role ref ${roleRef} (register version ${String(synthesisRoles.registerVersion)}) names no configured provider on this deployment`
        );
      }
      return { provider: configured.provider, providerRef: configured.providerRef };
    };
    const strengthByNodeId = new Map(propagation.strengths.map((row) => [row.nodeId, row.strength] as const));
    const makerPositionNodeIds = new Set(authoredMakerPositions.map((root) => root.nodeId));
    const marksByNodeId = new Map<string, string[]>();
    for (const record of conditionMarkRecords) {
      for (const affected of record.affectedNodeIds) {
        const existing = marksByNodeId.get(affected) ?? [];
        if (!existing.includes(record.mark)) existing.push(record.mark);
        marksByNodeId.set(affected, existing);
      }
    }
    /**
     * DIGEST membership (goal 223-226): one entry per MATERIALIZED node, roots
     * and children alike. Not the served set, not the top-2, not the roots —
     * everything the debate authored. A node with no propagated strength keeps
     * its place with a null number; dropping it would be exactly the silent
     * subset the goal forbids.
     */
    const digestNodes: readonly DigestSourceNode[] = Object.freeze(authoredNodeList.map((node) => Object.freeze({
      nodeId: node.nodeId,
      statement: node.statement,
      finalStrength: strengthByNodeId.get(node.nodeId) ?? null,
      wayOfKnowing: node.wayOfKnowing,
      marks: Object.freeze([...(marksByNodeId.get(node.nodeId) ?? [])]),
      polarityRelations: Object.freeze(materialised.arrows
        .filter((arrow) => arrow.sourceNodeId === node.nodeId
          && arrow.targetKind === "NODE" && arrow.targetNodeId !== null)
        .map((arrow) => Object.freeze({
          polarity: arrow.polarity === "attack" ? "attack" as const : "support" as const,
          targetNodeId: arrow.targetNodeId!
        }))),
      isPosition: makerPositionNodeIds.has(node.nodeId),
      // A SURVIVING objection: it attacks something and it still carries a
      // propagated number at the end of the debate.
      isSurvivingObjection: strengthByNodeId.has(node.nodeId)
        && materialised.arrows.some((arrow) => arrow.sourceNodeId === node.nodeId && arrow.polarity === "attack")
    })));
    const serveStartedAt = new Date();
    const evaluateEnvelope = (): Promise<BudgetPressureDecision> => this.#budget.evaluateRunPressure({
      runId: run.runId,
      basis: envelopeBasis,
      pendingRows: BATTERY_BUDGET_CONTRACTS
        .filter((row) => row.budgetClass === "ENRICHMENT" || row.skipPolicy === "PROTECTED_CORE_REFUSES_SKIP")
        .map((row) => ({ batteryRowId: row.batteryRowId, affectedNodeIds: [servedRoot.nodeId] })),
      verifiedNodeIds: [servedRoot.nodeId]
    });
    const recordEnvelope = (decision: BudgetPressureDecision): Promise<void> => this.#budget.recordDecision({
      runId: run.runId,
      workItemId: claimed.workItemId,
      attemptId: runnerAttemptId,
      actorRef: "run-cost-envelope",
      contractHash: this.settings.serveContractHash,
      decision
    });
    const makeEnvelopeTerminal = async (
      decision: Extract<BudgetPressureDecision, { kind: "HARD_STOP" }>
    ) => {
      await recordEnvelope(decision);
      finalSegments = [];
      compositionRawArtifactRef = null;
      compositionAttempt = 0;
      conformanceRawArtifactRefs.length = 0;
      conditionMarkRecords = preserveEnvelopeTerminalConditionMarkRecords(conditionMarkRecords, [
        ...decision.enrichmentSkips.map((row): ConditionMarkRecord => Object.freeze({
          mark: row.conditionMark,
          scope: "node",
          subjectRef: row.batteryRowId,
          reason: "ENRICHMENT_ROW_SKIPPED_BY_BUDGET",
          liftPath: null,
          servedRootRule: null,
          affectedNodeIds: row.affectedNodeIds
        })),
        Object.freeze({
          mark: decision.terminal.conditionMark,
          scope: "answer",
          subjectRef: run.runId,
          reason: "RUN_COST_ENVELOPE_EXHAUSTED",
          liftPath: null,
          servedRootRule: null,
          affectedNodeIds: decision.terminal.servedNodeIds
        })
      ]);
      return createEnvelopeExhaustedResult({
        factBundle,
        compositionBudget: servePolicy.compositionBudgets[run.compositionBudgetTier],
        verifiedNodeIds: decision.terminal.servedNodeIds,
        skippedEnrichmentRows: decision.enrichmentSkips.map((row) => row.batteryRowId),
        // F4 / goal 248-251: the protected-core guard was keyed on R9's
        // GATE-HOOD, and T9 retired that gate — R9 is an evaluator objection
        // criterion now. So the restatement status is OBSERVED and DISCLOSED
        // here (it rides the trace as PROTECTED_CORE_GUARD_RETIRED when it is
        // not PASS) and no longer DECIDES. An exhausted envelope with no served
        // statement takes the envelope terminal either way.
        protectedCoreRestatement: servedRoot.restatementStatus,
        // Nothing has been persisted for this run yet at any of the three call
        // sites below: the answer is written after the chain returns. The
        // envelope terminal therefore never retracts a served answer.
        servedStatementExists: false
      });
    };
    /**
     * T6 / S4-2 — the review outcome reaches the certainty band.
     *
     * A cross-maker review that came back `dispute` is a DECLARED disagreement
     * about the debate's content, so it fires the same primitive T3's panel
     * spread fires: the band steps down through the SEALED one-step-down row,
     * never through arithmetic this file performs. It is read after every
     * review has landed, because that is the first moment the run knows what
     * the reviewers said.
     *
     * The provenance names what actually decided: the sealed downgrade-bands
     * row is the predicate consulted, and the observation is the node_review
     * rows themselves. The panel's numeric disagreement threshold plays NO
     * part on this path, so citing it here would be a false provenance.
     *
     * Deliberately a function called on the serve-gate path only. The band —
     * mono-lineage cap included — was already computed nowhere else, and
     * `applySingleLineageBandCap` can stop loudly; hoisting it would make an
     * envelope-terminal answer that never needed a band fail for the want of
     * one, which is a behaviour change this task did not ask for.
     */
    const servedCandidateConfidenceBand = async (): Promise<string> => {
      const capped = effectiveMakerCount === 1
        ? applySingleLineageBandCap(servePolicy.candidateConfidenceBand, servePolicy.bandCeiling)
        : servePolicy.candidateConfidenceBand;
      const disputedNodeIds = await this.#judgements.readDisputedNodeIds(run.runId);
      if (disputedNodeIds.length === 0) return capped;
      // A dispute can only exist where a cross-maker review ran, so the panel
      // rows are sealed whenever this fires (a mono-maker run reviews nothing).
      // The guard states that rather than assuming it.
      if (panelPolicy === undefined) {
        throw new TypedDomainError(
          "PANEL_WEIGHTING_UNRESOLVED",
          "J12: a disputed cross-maker review requires the sealed downgrade-bands row to declare its certainty downgrade"
        );
      }
      const steppedDown = panelPolicy.oneStepDown[capped] ?? null;
      return applyDeclaredDisagreement({
        fires: steppedDown !== null,
        predicateRef: panelPolicy.sourceRefs.downgradeBands ?? panelPolicy.unmappedReason,
        observationRef: `ledger.node_review:dispute:${disputedNodeIds.join(",")}`,
        certaintyBand: capped,
        downgradedBand: steppedDown
      }).certaintyBand ?? capped;
    };
    const initialEnvelopeDecision = await evaluateEnvelope();
    let result: Awaited<ReturnType<typeof runServeGateChain>>;
    // F4: no `restatementStatus === "PASS"` conjunct. The envelope terminal
    // fires on HARD_STOP whenever no served statement exists yet, independent
    // of restatement status — never serving over budget.
    if (initialEnvelopeDecision.kind === "HARD_STOP") {
      result = await makeEnvelopeTerminal(initialEnvelopeDecision);
    } else {
      await recordEnvelope(initialEnvelopeDecision);
      const candidateConfidenceBand = await servedCandidateConfidenceBand();
      try {
        result = await runnerStage("SERVE_GATE_CHAIN_FAILED", () => runServeGateChain({
      nodes: servedNodes,
      factBundle,
      compositionBudget: servePolicy.compositionBudgets[run.compositionBudgetTier],
      // T6 / S4-2: the mono-lineage cap and, on top of it, the declared
      // downgrade a disputed cross-maker review fires.
      candidateConfidenceBand,
      // T9: EVERY materialized node, with its number, its polarity relations,
      // its way of knowing and its marks. This list is the digest's membership
      // and the byte budget may not shorten it — only the summaries inside it.
      digestNodes,
      servedRootNodeId: servedRoot.nodeId,
      // T10/T11's numbers, derived BEFORE synthesis, handed to both roles so
      // the evaluator can check statement-label agreement against the label the
      // code produced rather than one the synthesizer asserted.
      codeLabel: Object.freeze({
        verdictLabel: verdictLabel.label,
        servedNodeId: servedRoot.nodeId,
        servedStrength: servedRootSelection.servedStrength,
        margin: servedRootSelection.margin.kind === "MEASURED" ? servedRootSelection.margin.value : null,
        registerVersion: verdictLabelControls.registerVersion
      }),
      // J8: the role refs and the loop bound are SEALED rows. Nothing here
      // defaults, derives or re-declares them.
      synthesisRoleControls: Object.freeze({
        synthesizerRoleRef: synthesisRoles.synthesizerRoleRef,
        evaluatorRoleRef: synthesisRoles.evaluatorRoleRef,
        evaluatorLoopMaxRounds: synthesisRoles.evaluatorLoopMaxRounds
      })
    }, {
      /**
       * The SYNTHESIZER role call. Fresh context: the wire payload IS the
       * recorded request, so "no debate transcript beyond the named artifacts"
       * is a property of the bytes that leave this process, not a claim about
       * them. On a retry the request carries the prior evaluator objection
       * VERBATIM — the loop converges by feedback, never by accident.
       */
      synthesize: async (request: SynthesizerRequest) => {
        const role = resolveSynthesisRoleMaker(request.roleRef, "SYNTHESIZER");
        const packet: PromptPacket = { messages: [
          { role: "system", content: "Return only JSON with a segments array of at most two {segment_id,text,node_refs,served_number_refs} entries. node_refs must name the node ids of the digest nodes whose facts the segment asserts, so every load-bearing claim traces to a digest node. Preserve the digest and add no facts. When the digest nodes a segment cites rest on reasoning alone, with no measured or looked-up evidence behind them, return at least two segments in order: the first segment states the provisional answer as a hypothesis; the second segment states the research plan that would lift it." },
          { role: "user", content: JSON.stringify(request) }
        ] };
        const response = await callSynthesisRole(role.provider, {
          runId: run.runId,
          subjectItemId: claimed.workItemId,
          // CALL SITE vs ROLE. The `role` is the T9 identity making the call;
          // the call-site KEY names the SLOT in the serve chain, and
          // `core.read_terminal_recorded_facts` (migrations/0049) counts
          // `COMPOSER:%` into `composer_calls`, which five battery-row
          // PREDICATES read as `>= 1`. T9 moved WHO calls and WHAT is asked,
          // not where the slot is, so the prefix stays and the role is named
          // inside it. Renaming the slots needs a migration that redefines
          // that function — filed as a follow-up, not smuggled in here.
          callSiteKey: `COMPOSER:SYNTHESIZER:${request.stage}:${request.round}`,
          role: "SYNTHESIZER",
          lane: "served",
          bound: this.settings.composerBound,
          contractHash: this.settings.composerContractHash,
          providerRef: role.providerRef,
          packet,
          classifyContent: (content) => classifyStructuredContent(content, compositionSchema),
          buildRepairPacket: ({ parseError }) => buildSchemaRepairPacket(packet, parseError)
        }, "COMPOSITION_CONTRACT_ERROR");
        const parsed = parseComposerOutput(response.content);
        const composedSegments = parsed.segments.map((segment) => {
          if (segment.segment_id === "memory:disclosure") {
            throw new TypedDomainError("COMPOSITION_CONTRACT_ERROR", "The memory disclosure segment id is reserved for the typed renderer");
          }
          return Object.freeze({
          segmentId: segment.segment_id,
          text: segment.text,
          loadBearing: false,
          // J23: a citation may name ANY node in the digest-following set by its
          // real id. `"primary"` stays admissible as the served root's alias so
          // sealed prompts and fixtures written against the one-node set keep
          // working; an unknown ref is still a loud contract error.
          assertedNodeRefs: Object.freeze(segment.node_refs.map((ref) => {
            if (ref === "primary") return servedRoot.nodeId;
            if (!servedNodes.some((node) => node.nodeId === ref)) {
              throw new TypedDomainError("COMPOSITION_CONTRACT_ERROR", `Unknown composition node ref ${ref}`);
            }
            return ref;
          })),
          servedNumberRefs: Object.freeze([...segment.served_number_refs])
          });
        });
        const renderedMemory = renderMemorySentence(factBundle.memoryDisclosure);
        validateMemorySentence(factBundle.memoryDisclosure, renderedMemory);
        const partitioned = partitionServedSegments(composedSegments, renderedMemory);
        finalSegments = partitioned.persistedSegments;
        compositionRawArtifactRef = response.rawArtifactRef;
        // `serve_state` reads this: round 1 COMPOSED, a later round
        // RECOMPOSED_ONCE. The loop round IS the composition attempt now.
        compositionAttempt = request.round;
        return partitioned.conformanceSegments;
      },
      /**
       * The EVALUATOR role call. It replaces BOTH retired provider limbs —
       * per-segment conformance and post-compose R9 — because both are now
       * objection criteria rather than terminals, and one grader that sees the
       * whole candidate can weigh them against each other.
       */
      evaluate: async (request: EvaluatorRequest): Promise<EvaluatorVerdict> => {
        const role = resolveSynthesisRoleMaker(request.roleRef, "EVALUATOR");
        const packet: PromptPacket = { messages: [
          { role: "system", content: "Return only JSON {satisfied,objection,criteria} where criteria is {fairness_to_losers,statement_label_agreement,no_overstatement,restatement,citation_tracing}, each a boolean. Set satisfied true only when every criterion is true. When satisfied is false, objection must state the objection in full; when it is true, objection must be null." },
          { role: "user", content: JSON.stringify(request) }
        ] };
        const response = await callSynthesisRole(role.provider, {
          runId: run.runId,
          subjectItemId: claimed.workItemId,
          // Same contract as the synthesizer's key above: `POST_COMPOSE_R9:%`
          // feeds `r9_calls`, which the R9 battery row prints in its executed
          // check ref. The evaluator IS the restatement check now, so the slot
          // is still occupied and the ref still names something that happened.
          callSiteKey: `POST_COMPOSE_R9:EVALUATOR:${request.round}`,
          role: "EVALUATOR",
          lane: "served",
          bound: this.settings.conformanceBound,
          contractHash: this.settings.conformanceContractHash,
          providerRef: role.providerRef,
          packet,
          classifyContent: (content) => classifyStructuredContent(content, evaluatorVerdictSchema),
          buildRepairPacket: ({ parseError }) => buildSchemaRepairPacket(packet, parseError)
        }, "EVALUATOR_CONTRACT_ERROR");
        conformanceRawArtifactRefs.push(response.rawArtifactRef);
        const parsed = parseContent(response.content, evaluatorVerdictSchema, "EVALUATOR_CONTRACT_ERROR");
        return Object.freeze({
          satisfied: parsed.satisfied,
          objection: parsed.objection,
          criteria: Object.freeze({
            fairnessToLosers: parsed.criteria.fairness_to_losers,
            statementLabelAgreement: parsed.criteria.statement_label_agreement,
            noOverstatement: parsed.criteria.no_overstatement,
            restatement: parsed.criteria.restatement,
            citationTracing: parsed.criteria.citation_tracing
          })
        });
      },
      applyBandCeiling: ({ basis, candidateConfidenceBand: band }) => deriveBandCeiling({
        basis,
        candidateConfidenceBand: band,
        row: servePolicy.bandCeiling
      })
        }));
      } catch (error) {
        if (!(error instanceof TypedDomainError) || error.code !== "RUN_COST_ENVELOPE_EXHAUSTED") throw error;
        const exhausted = await evaluateEnvelope();
        if (exhausted.kind !== "HARD_STOP") throw error;
        result = await makeEnvelopeTerminal(exhausted);
      }
      if (!result.conditionMarks.includes("DEFECT") && !result.conditionMarks.includes("ENVELOPE_EXHAUSTED")) {
        const finalEnvelopeDecision = await evaluateEnvelope();
        if (finalEnvelopeDecision.kind === "HARD_STOP") {
          result = await makeEnvelopeTerminal(finalEnvelopeDecision);
        } else {
          await recordEnvelope(finalEnvelopeDecision);
        }
      }
    }
    // The served number is the POSITION node's final strength — selected by
    // node identity, never by array position (a multi-node graph reorders).
    const strength = propagation.strengths.find((row) => row.nodeId === servedRoot.nodeId);
    if (strength === undefined) throw new TypedDomainError("EMPTY_PROPAGATION", run.runId);
    const terminalEvaluator = this.settings.resolveTerminalActivations;
    if (terminalEvaluator === undefined) {
      throw new TypedDomainError(
        "TERMINAL_ACTIVATION_EVALUATOR_UNRESOLVED",
        "Run completion cannot manufacture activation results for outstanding WAIT rows"
      );
    }
    const current = await runnerStage(
      "TERMINAL_STATE_READ_FAILED",
      () => this.#runs.readCurrentState(run.runId)
    );
    const resolutions = await runnerStage("TERMINAL_ACTIVATION_EVALUATION_FAILED", () => terminalEvaluator({
      runId: run.runId,
      waitingRows: current.activations.filter((row) => row.state === "WAIT").map((row) => row.batteryRowId),
      completion: Object.freeze({
        kind: "ANSWER_RECORD_PERSIST",
        servedNodeIds: Object.freeze([servedRoot.nodeId]),
        servedNumberPlanned: compositionEvidenceRequired(result)
      })
    }));
    await runnerStage(
      "TERMINAL_ACTIVATION_DRAIN_FAILED",
      () => this.#runs.drainWaitsForCompletion(run.runId, resolutions)
    );
    // DR-139(4): every row ACTIVE at terminal whose owed check has no recorded
    // execution rides the served answer as a typed loud condition mark naming
    // that check. Executing owed checks at terminal is the ruled follow-up,
    // out of TERM-01.
    const owedChecks = resolutions.filter(
      (resolution) => resolution.state === "ACTIVE" && (resolution.executedCheckRef ?? null) === null
    );
    if (owedChecks.length > 0) {
      conditionMarkRecords = Object.freeze([
        ...conditionMarkRecords,
        ...owedChecks.map((resolution): ConditionMarkRecord => Object.freeze({
          mark: "OWED-CHECK-UNEXECUTED",
          scope: "answer",
          subjectRef: resolution.batteryRowId,
          reason: `DR-139(4): ${resolution.batteryRowId} is ACTIVE at run completion and its owed check has no recorded execution`,
          liftPath: null,
          servedRootRule: null,
          affectedNodeIds: [servedRoot.nodeId]
        }))
      ]);
      if (!result.conditionMarks.includes("OWED-CHECK-UNEXECUTED")) {
        result = { ...result, conditionMarks: Object.freeze([...result.conditionMarks, "OWED-CHECK-UNEXECUTED"]) };
      }
    }
    // DR-141(2): whenever the terminal evaluation consulted the DR-021
    // knob-10 question-type fallback, its travelling label rides the served
    // answer — one named record per consulting battery row.
    const typeFallbackRows = resolutions.filter((resolution) => resolution.typeFallbackConsulted === true);
    if (typeFallbackRows.length > 0) {
      conditionMarkRecords = Object.freeze([
        ...conditionMarkRecords,
        ...typeFallbackRows.map((resolution): ConditionMarkRecord => Object.freeze({
          mark: "UNRESOLVED-TYPE-FALLBACK",
          scope: "answer",
          subjectRef: resolution.batteryRowId,
          reason: `DR-021 knob 10 · DR-141(2): ${resolution.batteryRowId} was evaluated through the factual question-type fallback because no recorded type resolution exists`,
          liftPath: null,
          servedRootRule: null,
          affectedNodeIds: [servedRoot.nodeId]
        }))
      ]);
      if (!result.conditionMarks.includes("UNRESOLVED-TYPE-FALLBACK")) {
        result = { ...result, conditionMarks: Object.freeze([...result.conditionMarks, "UNRESOLVED-TYPE-FALLBACK"]) };
      }
    }
    // T11 / confirm-item 6: an answer whose label was derived without a complete
    // basis says so ON THE ANSWER. The derivation itself happened before
    // composition; the disclosure is attached HERE, where the terminal is known,
    // because only a terminal that carries a served number carries a label —
    // exactly the pattern the owed-check and type-fallback disclosures use.
    // The SAME predicate serve uses for a usable verdict basis: a served number
    // on a SERVED or DOWNGRADED terminal. Anything else projects unavailability
    // and carries no label, so a basis mark there would name a label nobody was
    // shown. serve stops loudly if this and its own predicate ever disagree.
    const answerCarriesLabel = compositionEvidenceRequired(result)
      && (result.terminal === "SERVED" || result.terminal === "DOWNGRADED");
    if (answerCarriesLabel && verdictLabel.marks.length > 0) {
      conditionMarkRecords = Object.freeze([
        ...conditionMarkRecords,
        Object.freeze({
          mark: LABEL_BASIS_INCOMPLETE_MARK,
          scope: "answer",
          subjectRef: servedRoot.nodeId,
          reason: `The three-state label was derived without ${verdictLabel.basisAbsence.map((limb) => limb === "MARGIN"
            ? "a margin (no runner-up root exists to measure one against)"
            : "a disagreement measure (the winning root's panel returned fewer than two parseable judgements)").join(" and without ")}; the label is CONTESTED because a basis this thin can never print SUPPORTED`,
          liftPath: verdictLabel.basisAbsence.includes("MARGIN")
            ? "Run a second maker so a rival root exists to measure a margin against"
            : "Restore a second parseable panel judgement on the served root",
          servedRootRule: null,
          affectedNodeIds: [servedRoot.nodeId]
        } satisfies ConditionMarkRecord)
      ]);
      if (!result.conditionMarks.includes(LABEL_BASIS_INCOMPLETE_MARK)) {
        result = { ...result, conditionMarks: Object.freeze([...result.conditionMarks, LABEL_BASIS_INCOMPLETE_MARK]) };
      }
    }
    const persisted = await runnerStage("ANSWER_PERSIST_FAILED", () => this.#serve.persist({
      runId: run.runId,
      workItemId: claimed.workItemId,
      factBundleVersion: this.settings.factBundleVersion,
      factBundleContentHash: hash(factBundle),
      factBundle,
      result,
      segments: finalSegments,
      compositionRawArtifactRef,
      compositionAttempt,
      conformanceRawArtifactRefs,
      conditionMarkRecords,
      servedNumber: compositionEvidenceRequired(result) ? {
        numberRef: "number:final-strength",
        value: strength.strength,
        numberKind: this.settings.propagationNumberKind,
        sourceRef: servedRoot.provenanceRef,
        producer: this.settings.propagationProducer,
        replayHandle,
        propagationRunId
      } : null,
      // T11: the propagated numbers the label is derived from. serve re-derives
      // from these — the derivation is pure, so the runner's disclosure decision
      // above and the persisted label cannot disagree, and serve stops loudly if
      // they ever do.
      verdictLabelBasis: answerCarriesLabel ? verdictLabelBasis : null
    }));
    await runnerStage(
      "ANSWER_MEMORY_OBSERVATION_FAILED",
      () => this.#memory.observeAnswerContradiction(persisted.answerId, "memory:served-verdict-observer")
    );
    await runnerStage("SERVE_LEDGER_APPEND_FAILED", () => this.#ledger.append({
      runId: run.runId,
      attemptId: runnerAttemptId,
      actionKind: "SERVE",
      subjectItemId: persisted.answerId,
      stanceAtAction: "UNASSIGNED",
      outcome: "OK",
      actorRef: "serve-gate-chain",
      inputHash: hash({ factBundle, propagationRunId }),
      contractHash: this.settings.serveContractHash,
      startedAt: serveStartedAt,
      finishedAt: new Date()
    }));
    const wonSettlement = await this.#work.settle({
      workItemId: claimed.workItemId,
      attemptId: runnerAttemptId,
      artifactRef: persisted.answerId
    });
    if (wonSettlement) return { kind: "COMPLETED", answerId: persisted.answerId };
    const winningArtifact = await this.#work.readSettledArtifact(claimed.workItemId);
    if (winningArtifact === null) {
      throw new TypedDomainError("SETTLEMENT_RACE_WITHOUT_WINNER", claimed.workItemId);
    }
    return { kind: "COMPLETED", answerId: winningArtifact };
    });
    } catch (error) {
      if (error instanceof TypedDomainError) throw error;
      throw new TypedDomainError(
        "RUNNER_DISCLOSURE_PIPELINE_FAILED",
        "The runner failed inside its private-content disclosure lease"
      );
    }
  }
}

export type RunnerExecutionResult =
  | { readonly kind: "NO_WORK" }
  | { readonly kind: "COMPLETED"; readonly answerId: string }
  | { readonly kind: "TERMINAL_FAILED"; readonly artifactRef: string | null };

export interface RunnerFailureRecorder {
  recordTerminalFailure(input: {
    readonly runId: string;
    readonly workItemId: string;
    readonly reason: string;
  }): Promise<boolean>;
}

export function runnerTerminalFailureReason(error: unknown): string {
  if (error instanceof TypedDomainError) return `RUNNER_EXECUTION_FAILED:${error.code}`;
  const record = error !== null && typeof error === "object"
    ? error as Readonly<{ code?: unknown; message?: unknown; name?: unknown }>
    : undefined;
  const dependencyCode = typeof record?.code === "string"
    && /^[A-Z0-9_]{2,32}$/u.test(record.code)
    ? `DEPENDENCY_${record.code}`
    : undefined;
  const exactMessageCode = typeof record?.message === "string"
    && /^[A-Z][A-Z0-9_]{2,63}$/u.test(record.message)
    ? record.message
    : undefined;
  const errorClass = typeof record?.name === "string"
    ? record.name.replace(/([a-z])([A-Z])/gu, "$1_$2").toUpperCase()
    : undefined;
  const diagnostic = dependencyCode ?? exactMessageCode
    ?? (errorClass === undefined || !/^[A-Z][A-Z0-9_]{2,63}$/u.test(errorClass)
      ? "UNEXPECTED_ERROR"
      : errorClass);
  return `RUNNER_EXECUTION_FAILED:${diagnostic}`;
}

export function declareHatchetWalkingSkeletonTask(input: {
  readonly client: Pick<Hatchet, "task">;
  readonly runner: WalkingSkeletonRunner;
  readonly failures: RunnerFailureRecorder;
  readonly workflowName: string;
  readonly engineRetries: number;
}): TaskWorkflowDeclaration<{ runId: string; workItemId: string }, { kind: string; answerId?: string }> {
  if (!Number.isInteger(input.engineRetries) || input.engineRetries < 0) {
    throw new TypeError("Hatchet retry count must be a non-negative register value");
  }
  return input.client.task({
    name: input.workflowName,
    retries: input.engineRetries,
    fn: async (dispatch: { runId: string; workItemId: string }) => {
      try {
        const result = await input.runner.executeWorkItem(dispatch.workItemId);
        return result.kind === "COMPLETED"
          ? { kind: result.kind, answerId: result.answerId }
          : { kind: result.kind };
      } catch (error) {
        const recorded = await input.failures.recordTerminalFailure({
          runId: dispatch.runId,
          workItemId: dispatch.workItemId,
          reason: runnerTerminalFailureReason(error)
        });
        if (!recorded) {
          throw new TypedDomainError("RUNNER_FAILURE_STATE_NOT_RECORDED", dispatch.workItemId);
        }
        throw error;
      }
    }
  });
}

export function createPostgresProviderGateway(
  pool: Pool,
  options: Omit<OpenAICompatibleGatewayOptions, "persistRawArtifact" | "appendLedgerEntry" | "assertNoOpenWriteTransaction">
): ProviderGateway {
  const ledger = new LedgerRepository(pool);
  const budget = new BudgetRepository(pool);
  const http = new OpenAICompatibleProviderGateway({
    ...options,
    assertNoOpenWriteTransaction,
    persistRawArtifact: (artifact) => ledger.appendRawArtifact(artifact),
    appendLedgerEntry: async (entry) => (await ledger.append(entry)).ledgerEntryId
  });
  return {
    async call(request: ProviderCallRequest): Promise<ProviderCallResult> {
      if (request.runId === null) {
        throw new TypedDomainError(
          "PROVIDER_RUN_REQUIRED",
          "Every provider content operation must be bound to one leased run"
        );
      }
      const claimsEvaluatorScope=request.lane==="evaluator"
        || request.callSiteKey.startsWith("evaluator.")
        || request.subjectItemId.startsWith("evaluator:");
      let authenticatedEvaluatorScope=false;
      if (claimsEvaluatorScope) {
        if (request.lane!=="evaluator") {
          throw new TypedDomainError(
            "EVALUATOR_PROVIDER_SCOPE_UNAUTHORIZED",
            "Evaluator provider purpose, call site, and subject must agree"
          );
        }
        const authorized=await pool.query<{ authorized:boolean }>(
          `SELECT evaluator.provider_call_request_is_authorized($1,$2,$3,$4)
             AS authorized`,
          [request.runId,request.callSiteKey,request.subjectItemId,request.providerRef]
        );
        authenticatedEvaluatorScope=authorized.rows[0]?.authorized===true;
        if (!authenticatedEvaluatorScope) {
          throw new TypedDomainError(
            "EVALUATOR_PROVIDER_SCOPE_UNAUTHORIZED",
            "Evaluator provider purpose is not bound to a live evaluator attempt"
          );
        }
      }
      return withRunContentLease(pool,[request.runId],async () => {
      if (!authenticatedEvaluatorScope) {
        await budget.assertModelAttemptAllowed(request.runId!);
      }
      const consumed = await ledger.countModelAttempts({
        runId: request.runId,
        workItemId: request.subjectItemId,
        contractHash: request.contractHash,
        callSiteKey: request.callSiteKey
      });
      const remaining = remainingProviderAttempts(request.bound.maxAttempts, consumed);
      if (remaining <= 0) {
        throw new TypedDomainError("CALL_BUDGET_EXHAUSTED", request.subjectItemId);
      }
      return http.call({
        ...request,
        bound: { ...request.bound, maxAttempts: remaining }
      });
      });
    }
  };
}
