import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Pool } from "pg";
import {
  ProviderProbeRepository,
  RunRepository,
  assertNoOpenWriteTransaction,
  withRunContentLease,
  type CompletionActivationResolution,
  type DiscoveredPanelMember
} from "@debateai/db";
import {
  WorkItemRepository,
  assertClaimCoversCall,
  type TerminalCompletionDeclaration
} from "@debateai/battery";
import { GraphRepository } from "@debateai/graph";
import {
  Judge,
  JudgementRepository,
  createUnmeasuredDisagreement,
  reduceAssessment,
  selectReducedJudgement,
  type CompositionMapRegisterRow,
  type JudgementSelectionRule
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
  runServeGateChain,
  ServeRepository,
  type BandCeilingRegisterRow,
  type ComposedSegment,
  type CompositionBudgetResolution,
  type ConditionMarkRecord,
  type FactBundle,
  type ServeGateResult,
  type ServeNode
} from "@debateai/serve";
import { TypedDomainError, type CompositionBudgetTier, type WayOfKnowing } from "@debateai/kernel";
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
const conformanceSchema = z.object({ conforms: z.boolean(), findings: z.array(z.string()) }).strict();
const r9Schema = z.object({ pass: z.boolean() }).strict();

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

export interface ReviewCatchUpNode {
  readonly nodeId: string;
  readonly statement: string;
  readonly authorMaker: string;
  readonly authorRawArtifactRef: string;
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
  }): Promise<{
    readonly outcome: "agree" | "dispute" | "cannot-assess";
    readonly reasons: readonly string[];
    readonly provenanceRef: string;
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
  recordNodeReview(input: {
    readonly runId: string;
    readonly nodeId: string;
    readonly authorRawArtifactRef: string;
    readonly reviewRawArtifactRef: string;
    readonly outcome: "agree" | "dispute" | "cannot-assess";
    readonly reasons: readonly string[];
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
        bound: { ...input.judgeBound, maxAttempts }
      })
    });
    if (outcome.kind === "HALTED") continue;
    await input.dependencies.recordNodeReview({
      runId: input.runId,
      nodeId: node.nodeId,
      authorRawArtifactRef: node.authorRawArtifactRef,
      reviewRawArtifactRef: outcome.value.provenanceRef,
      outcome: outcome.value.outcome,
      reasons: outcome.value.reasons
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
    recordNodeReview: (record) => judgements.recordNodeReview(record),
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
      const preservedRecords: ConditionMarkRecord[] = source.answer.condition_mark_records
        .filter((record) => record.mark !== "HIDDEN-UNJUDGEABLE" && record.mark !== "DERIVED-STANDING-UNREVIEWED")
        .map((record) => ({
          mark: record.mark as ConditionMarkRecord["mark"], scope: record.scope,
          subjectRef: record.subject_ref, reason: record.reason, liftPath: record.lift_path,
          servedRootRule: record.served_root_rule, affectedNodeIds: record.affected_node_ids,
          callSiteKey: record.call_site_key, plannedLegCount: record.planned_leg_count,
          terminalTransportOutcome: record.terminal_transport_outcome,
          hiddenStrength: record.hidden_strength,
          hiddenScoreThreshold: record.hidden_score_threshold,
          hiddenScoreThresholdSourceRef: record.hidden_score_threshold_source_ref,
          excludedFromServedNumber: record.excluded_from_served_number,
          judgedBasisCount: record.judged_basis_count
        }));
      const transportFields = (nodeId: string) => {
        const old = oldReviewRecords.get(nodeId);
        if (old?.call_site_key === null || old?.terminal_transport_outcome === null || old === undefined) {
          throw new TypedDomainError("CATCH_UP_DISCLOSURE_MISMATCH", nodeId);
        }
        return { callSiteKey: old.call_site_key, terminalTransportOutcome: old.terminal_transport_outcome } as const;
      };
      const reviewRecords: ConditionMarkRecord[] = [
        ...standing.hiddenNodeIds.map((nodeId) => ({
          mark: "HIDDEN-UNJUDGEABLE" as const, scope: "node" as const, subjectRef: nodeId,
          reason: "Cross-maker review transport exhausted; disclosed as unjudged and excluded from the served number",
          liftPath: "Restore a valid cross-maker review", servedRootRule: null,
          affectedNodeIds: Object.freeze([nodeId]), ...transportFields(nodeId),
          excludedFromServedNumber: true
        })),
        ...standing.derivedStandingNodeIds.map((nodeId) => ({
          mark: "DERIVED-STANDING-UNREVIEWED" as const, scope: "node" as const, subjectRef: nodeId,
          reason: "This node's own cross-house review did not land; it serves on the authority of its judged arguments, not on its own unreviewed assertion",
          liftPath: "Restore a valid cross-maker review", servedRootRule: null,
          affectedNodeIds: Object.freeze([nodeId]), ...transportFields(nodeId),
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

async function callWithContentContract(
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

export const SERVED_ROOT_RULE = "first-configured-provider" as const;

/** DR-161: B2-A serves the root authored by the first configured provider. */
export function selectServedRoot<T>(configuredProviderRoots: readonly T[]): Readonly<{
  rule: typeof SERVED_ROOT_RULE;
  root: T;
}> {
  const root = configuredProviderRoots[0];
  if (root === undefined) throw new TypedDomainError("SERVED_ROOT_UNRESOLVED", "No configured provider root exists");
  return Object.freeze({ rule: SERVED_ROOT_RULE, root });
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
    reason: `The first post-exclusion configured maker root was served: ${servedRoot.maker} position ${servedRoot.nodeId}; ${unservedDescription} ${unserved.length === 1 ? "remains" : "remain"} graph-visible but unserved`,
    liftPath: unserved.length === 1
      ? "Serve the other maker root in a separately ruled answer"
      : "Serve another maker root in a separately ruled answer",
    servedRootRule: SERVED_ROOT_RULE,
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
      Object.freeze({ judge: this.#judge, providerRef: settings.providerRef, maker: settings.maker }),
      ...(settings.critique === undefined ? [] : [Object.freeze({
        judge: new Judge(settings.critique.provider),
        providerRef: settings.critique.providerRef,
        maker: settings.critique.maker
      })]),
      ...(settings.additionalMakers ?? []).map((maker) => Object.freeze({
        judge: new Judge(maker.provider),
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
    const claimInput = { workerId: this.settings.workerId, claimSeconds: this.settings.claimMs / 1_000 };
    const claimed = workItemId === undefined
      ? await this.#work.claimNext(claimInput)
      : await this.#work.claimById({ ...claimInput, workItemId });
    if (claimed === null) return { kind: "NO_WORK" };
    if (claimed.runId === null) throw new TypedDomainError("WORK_ITEM_WITHOUT_RUN", claimed.workItemId);
    const claimedRunId = claimed.runId;
    return this.#memory.withDisclosureContentLease([claimedRunId],async () => {
    const runnerAttemptId = randomUUID();
    const run = await this.#runs.readFrozenHead(claimedRunId);
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
    const envelopeBasis = parseCostEnvelopeBasis(run.envelopeBasis);
    const expansionDepth = resolveExpansionDepth(run.depthParams);
    const configuredByProviderRef = new Map(this.#configuredMakers.map((maker) => [maker.providerRef, maker] as const));
    const absentAtClaim: Array<{ readonly member: DiscoveredPanelMember; readonly failureCode: string }> = [];
    const configuredMakers: Array<{
      readonly judge: Judge;
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
      attempt: (maxAttempts) => this.#judge.judge({
        runId: run.runId,
        subjectItemId: claimed.workItemId,
        callSiteKey: "JUDGE",
        questionLine: run.questionLine,
        providerRef: this.settings.providerRef,
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
    const selection = selectReducedJudgement([{
      judgementRef: judged.provenanceRef,
      tau: reduced.tau,
      effectiveWeight: judgementPolicy.earnedWeight
    }], judgementPolicy.selectionRule);
    if (selection.kind !== "SELECTED") {
      throw new TypedDomainError("NO_USABLE_JUDGEMENTS", "The panel produced no selectable judgement");
    }
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
      dispersion: null,
      panelContractHashes: [this.settings.judgeContractHash],
      disagreement: createUnmeasuredDisagreement()
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
    }
    const authoredNodes = new Map<number, AuthoredDebateNode>([[0, Object.freeze({
      nodeId,
      statement: judged.statement,
      provenanceRef: judged.provenanceRef,
      reducedJudgementId,
      wayOfKnowing: judged.wayOfKnowing,
      locator: judged.locator,
      restatementStatus: judged.restatementStatus,
      reversalPoint: judged.assessment.critic.summary,
      authorIndex: 0,
      maker: this.settings.maker
    })]]);
    const haltedExpansionRecords: HaltedExpansionRecord[] = [];
    const hiddenReviewRecords: Array<{
      readonly nodeId: string;
      readonly record: HaltedExpansionRecord;
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
        const childSelection = selectReducedJudgement([{
          judgementRef: childJudged.provenanceRef,
          tau: childReduced.tau,
          effectiveWeight: judgementPolicy.earnedWeight
        }], judgementPolicy.selectionRule);
        if (childSelection.kind !== "SELECTED") {
          throw new TypedDomainError("NO_USABLE_JUDGEMENTS", `The ${input.role} produced no selectable judgement`);
        }
        const childNodeId = await this.#graph.withGraphWrite(run.runId, async (writer) => {
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
          for (const edge of input.edges) {
            await writer.addEdge({
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
              strengthSource: "EVIDENCE_VERIFIER",
              provenanceRef: childJudged.provenanceRef
            });
          }
          return created;
        });
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
          dispersion: null,
          panelContractHashes: [this.settings.judgeContractHash],
          disagreement: createUnmeasuredDisagreement()
        });
      return { kind: "AUTHORED", value: Object.freeze({
          nodeId: childNodeId,
          statement: childJudged.statement,
          provenanceRef: childJudged.provenanceRef,
          reducedJudgementId: childReducedJudgementId,
          wayOfKnowing: childJudged.wayOfKnowing,
          locator: childJudged.locator,
          restatementStatus: childJudged.restatementStatus,
          reversalPoint: childJudged.assessment.critic.summary,
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
              bound: { ...this.settings.judgeBound, maxAttempts }
            })
          });
          if (reviewAttempt.kind === "HALTED") {
            hiddenReviewRecords.push({ nodeId: authoredNode.nodeId, record: reviewAttempt.record });
            continue;
          }
          const review = reviewAttempt.value;
          await this.#judgements.recordNodeReview({
            runId: run.runId,
            nodeId: authoredNode.nodeId,
            authorRawArtifactRef: authoredNode.provenanceRef,
            reviewRawArtifactRef: review.provenanceRef,
            outcome: review.outcome,
            reasons: review.reasons
          });
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
        edges: [{ targetNodeId: parent.nodeId, polarity: leg.polarity }]
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
          { targetNodeId: authorRoot.nodeId, polarity: "support" },
          { targetNodeId: targetRoot.nodeId, polarity: "attack" }
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
    const servedRootSelection = selectServedRoot(servableMakerPositions);
    const servedRoot = servedRootSelection.root;
    const servedNodes = buildFixedSingleRootServeNodes(
      authoredMakerPositions,
      servedRoot.nodeId
    );
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
    const classHReviewRecords = hiddenReviewRecords.filter(({ nodeId }) => classHNodeIds.has(nodeId));
    const classDReviewRecords = hiddenReviewRecords.filter(({ nodeId }) => classDNodeIds.has(nodeId));
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
      ...(haltedExpansionRecords.length > 0 ? ["UNAUTHORED-BRANCH-HALTED" as const] : [])
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
      ...classHReviewRecords.map(({ nodeId, record }): ConditionMarkRecord => Object.freeze({
        mark: "HIDDEN-UNJUDGEABLE",
        scope: "node",
        subjectRef: nodeId,
        reason: "Cross-maker review transport exhausted; disclosed as unjudged and excluded from the served number",
        liftPath: "Restore a valid cross-maker review",
        servedRootRule: null,
        affectedNodeIds: classHSubtree(nodeId),
        callSiteKey: record.callSiteKey,
        plannedLegCount: null,
        terminalTransportOutcome: record.terminalTransportOutcome,
        hiddenStrength: null,
        hiddenScoreThreshold: null,
        hiddenScoreThresholdSourceRef: null,
        excludedFromServedNumber: true
      })),
      ...classDReviewRecords.map(({ nodeId, record }): ConditionMarkRecord => Object.freeze({
        mark: "DERIVED-STANDING-UNREVIEWED",
        scope: "node",
        subjectRef: nodeId,
        reason: "This node's own cross-house review did not land; it serves on the authority of its judged arguments, not on its own unreviewed assertion",
        liftPath: "Restore a valid cross-maker review",
        servedRootRule: null,
        affectedNodeIds: Object.freeze([nodeId]),
        callSiteKey: record.callSiteKey,
        plannedLegCount: null,
        terminalTransportOutcome: record.terminalTransportOutcome,
        hiddenStrength: null,
        hiddenScoreThreshold: null,
        hiddenScoreThresholdSourceRef: null,
        excludedFromServedNumber: false,
        judgedBasisCount: standing.judgedBasisCounts[nodeId]!
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
      }))
    ]);
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
        protectedCoreVerified: servedRoot.restatementStatus === "PASS"
      });
    };
    const initialEnvelopeDecision = await evaluateEnvelope();
    let result;
    if (initialEnvelopeDecision.kind === "HARD_STOP" && servedRoot.restatementStatus === "PASS") {
      result = await makeEnvelopeTerminal(initialEnvelopeDecision);
    } else {
      await recordEnvelope(initialEnvelopeDecision);
      try {
        result = await runServeGateChain({
      nodes: servedNodes,
      factBundle,
      maxRecompose: this.settings.maxRecompose,
      compositionBudget: servePolicy.compositionBudgets[run.compositionBudgetTier],
      strangerSampleRate: run.strangerSampleRate,
      candidateConfidenceBand: effectiveMakerCount === 1
        ? applySingleLineageBandCap(servePolicy.candidateConfidenceBand, servePolicy.bandCeiling)
        : servePolicy.candidateConfidenceBand
    }, {
      measureCompositionBundle: (facts) => Buffer.byteLength(JSON.stringify(facts), "utf8"),
      compose: async (facts, attempt) => {
        const packet: PromptPacket = { messages: [
          // TERM-01 rework 2 (S04 prompt class, composer organ): the system
          // prompt must declare the ruled serve-gate segment contract —
          // including the reasoning-only two-segment form — because the gate
          // is byte-strict and repairs nothing.
          { role: "system", content: "Return only JSON with a segments array of at most two {segment_id,text,node_refs,served_number_refs} entries. node_refs must name the supplied nodes whose facts the segment asserts. Preserve the fact bundle and add no facts. When the supplied nodes rest on reasoning alone, with no measured or looked-up evidence behind them, return at least two segments in order: the first segment states the provisional answer as a hypothesis; the second segment states the research plan that would lift it." },
          { role: "user", content: JSON.stringify({
            factBundle: facts,
            availableNodes: servedNodes.map((node) => ({ ref: "primary", nodeId: node.nodeId, fact: node.text })),
            availableServedNumberRefs: ["number:final-strength"]
          }) }
        ] };
        const response = await callWithContentContract(this.provider, {
          runId: run.runId,
          subjectItemId: claimed.workItemId,
          callSiteKey: `COMPOSER:${attempt}`,
          role: "COMPOSER",
          lane: "served",
          bound: this.settings.composerBound,
          contractHash: this.settings.composerContractHash,
          providerRef: this.settings.providerRef,
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
          assertedNodeRefs: Object.freeze(segment.node_refs.map((ref) => {
            if (ref !== "primary") {
              throw new TypedDomainError("COMPOSITION_CONTRACT_ERROR", `Unknown composition node ref ${ref}`);
            }
            return servedRoot.nodeId;
          })),
          servedNumberRefs: Object.freeze([...segment.served_number_refs])
          });
        });
        const renderedMemory = renderMemorySentence(facts.memoryDisclosure);
        validateMemorySentence(facts.memoryDisclosure, renderedMemory);
        const partitioned = partitionServedSegments(composedSegments, renderedMemory);
        finalSegments = partitioned.persistedSegments;
        compositionRawArtifactRef = response.rawArtifactRef;
        compositionAttempt = attempt;
        return partitioned.conformanceSegments;
      },
      selectSample: (segment, sampleRate) => {
        if (sampleRate <= 0) return false;
        if (sampleRate >= 1) return true;
        const sample = createHash("sha256").update(segment.segmentId).digest().readUInt32BE(0) / 0xffff_ffff;
        return sample < sampleRate;
      },
      conform: async (segment, state) => {
        const segmentIndex = finalSegments.findIndex((candidate) => candidate.segmentId === segment.segmentId);
        const packet: PromptPacket = { messages: [
          { role: "system", content: "Return only JSON {conforms,findings}. Judge this segment against the frozen fact bundle." },
          { role: "user", content: JSON.stringify({ factBundle, segment }) }
        ] };
        const response = await callWithContentContract(this.provider, {
          runId: run.runId,
          subjectItemId: claimed.workItemId,
          callSiteKey: `CONFORMANCE:${compositionAttempt}:${segmentIndex}`,
          role: "CONFORMANCE",
          lane: "served",
          bound: this.settings.conformanceBound,
          contractHash: this.settings.conformanceContractHash,
          providerRef: this.settings.providerRef,
          packet,
          classifyContent: (content) => classifyStructuredContent(content, conformanceSchema),
          buildRepairPacket: ({ parseError }) => buildSchemaRepairPacket(packet, parseError)
        }, "CONFORMANCE_CONTRACT_ERROR");
        conformanceRawArtifactRefs.push(response.rawArtifactRef);
        const parsed = parseContent(response.content, conformanceSchema, "CONFORMANCE_CONTRACT_ERROR");
        return { segmentId: segment.segmentId, state, conforms: parsed.conforms };
      },
      postComposeR9: async (segments) => {
        const packet: PromptPacket = { messages: [
          { role: "system", content: "Return only JSON {pass}. Apply the R9 stranger-restatement check to the composed verdict." },
          { role: "user", content: JSON.stringify({ question: run.questionLine, segments }) }
        ] };
        const response = await callWithContentContract(this.provider, {
          runId: run.runId,
          subjectItemId: claimed.workItemId,
          callSiteKey: `POST_COMPOSE_R9:${compositionAttempt}`,
          role: "CONFORMANCE",
          lane: "served",
          bound: this.settings.conformanceBound,
          contractHash: this.settings.conformanceContractHash,
          providerRef: this.settings.providerRef,
          packet,
          classifyContent: (content) => classifyStructuredContent(content, r9Schema),
          buildRepairPacket: ({ parseError }) => buildSchemaRepairPacket(packet, parseError)
        }, "POST_COMPOSE_R9_CONTRACT_ERROR");
        conformanceRawArtifactRefs.push(response.rawArtifactRef);
        return parseContent(response.content, r9Schema, "POST_COMPOSE_R9_CONTRACT_ERROR").pass;
      },
      applyBandCeiling: ({ basis, candidateConfidenceBand }) => deriveBandCeiling({
        basis,
        candidateConfidenceBand,
        row: servePolicy.bandCeiling
      })
        });
      } catch (error) {
        if (!(error instanceof TypedDomainError) || error.code !== "RUN_COST_ENVELOPE_EXHAUSTED") throw error;
        const exhausted = await evaluateEnvelope();
        if (exhausted.kind !== "HARD_STOP" || servedRoot.restatementStatus !== "PASS") throw error;
        result = await makeEnvelopeTerminal(exhausted);
      }
      if (!result.conditionMarks.includes("DEFECT") && !result.conditionMarks.includes("ENVELOPE_EXHAUSTED")) {
        const finalEnvelopeDecision = await evaluateEnvelope();
        if (finalEnvelopeDecision.kind === "HARD_STOP" && servedRoot.restatementStatus === "PASS") {
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
    const current = await this.#runs.readCurrentState(run.runId);
    const resolutions = await terminalEvaluator({
      runId: run.runId,
      waitingRows: current.activations.filter((row) => row.state === "WAIT").map((row) => row.batteryRowId),
      completion: Object.freeze({
        kind: "ANSWER_RECORD_PERSIST",
        servedNodeIds: Object.freeze([servedRoot.nodeId]),
        servedNumberPlanned: compositionEvidenceRequired(result)
      })
    });
    await this.#runs.drainWaitsForCompletion(run.runId, resolutions);
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
    const persisted = await this.#serve.persist({
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
      } : null
    });
    await this.#memory.observeAnswerContradiction(persisted.answerId, "memory:served-verdict-observer");
    await this.#ledger.append({
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
    });
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
  return error instanceof TypedDomainError
    ? `RUNNER_EXECUTION_FAILED:${error.code}`
    : "RUNNER_EXECUTION_FAILED:UNEXPECTED_ERROR";
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
