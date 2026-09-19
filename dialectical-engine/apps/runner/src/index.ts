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
import { LedgerRepository, type AppendLedgerInput } from "@debateai/ledger";
import {
  ENGINE_BRANCHING_FACTOR,
  ENGINE_COMPOSITION_SEGMENT_CAP,
  ENGINE_FIXED_ORGANS_PER_COMPOSITION,
  ENGINE_MAX_RECOMPOSE,
  resolveScoringOperator,
  type AdaptiveStoppingControls
} from "@debateai/register";
import {
  BudgetRepository,
  BATTERY_BUDGET_CONTRACTS,
  parseCostEnvelopeBasis,
  type BudgetPressureDecision
} from "@debateai/budget";
import {
  countMeasuredEdges,
  decideBranchFreezes,
  decideRoundBoundary,
  evaluate,
  type BranchFreezeDecision,
  type EvaluationSnapshot,
  type NodeStrengthRecord,
  type PropagationOutcome,
  type RoundContinuationDecision
} from "@debateai/propagation";
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
  PROTECTED_CORE_GUARD_RETIRED_MARK,
  runServeGateChain,
  ServeRepository,
  toSynthesisPromptPayload,
  type BandCeilingRegisterRow,
  type ComposedSegment,
  type CompositionBudgetResolution,
  type ConditionMarkRecord,
  synthesisCallSiteKey,
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
import { EXPANSION_DEPTH_MAX, EXPANSION_DEPTH_MIN } from "@debateai/contract";
import { SERVED_ROOT_SELECTION_RULE, TypedDomainError, type CompositionBudgetTier, type ServedRootRule, type WayOfKnowing } from "@debateai/kernel";
import { MemoryRepository, renderMemorySentence, validateMemorySentence } from "@debateai/memory";
import type { Hatchet, TaskWorkflowDeclaration } from "@hatchet-dev/typescript-sdk";

/**
 * T9 / J24 — the two sealed synthesis roles, named ONCE. Every check that has
 * to refuse "without substitution" iterates this, so a role can never be
 * checked in one place and forgotten in another.
 */
export const SYNTHESIS_ROLES = Object.freeze(["SYNTHESIZER", "EVALUATOR"] as const);
export type SynthesisRoleName = typeof SYNTHESIS_ROLES[number];

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
/**
 * F-SEALEDROWS-A / codex r2 B1a · THE EVALUATOR CONTRACT TEXT, exported so the
 * conformance fingerprint can hash THE THING THAT IS SENT instead of searching
 * this file for it.
 *
 * Three locators died to get here, and all three failed the same way — they
 * could resolve to something that is not this prompt. Quoting the prompt's own
 * words matched ZERO when T9 reworded it (loud). Taking the first object with a
 * `criteria` member let an unrelated schema declared earlier win (quiet).
 * Balancing braces over raw text miscounted a `}` inside a string, comment,
 * regex or template literal, and — worse — matched a COMMENTED-OUT declaration
 * after a real rename, returning an unrelated prompt with exit 0 (quiet again).
 * Text is not syntax, and every lexical approximation of syntax has an input
 * that defeats it.
 *
 * So there is no locator. The seeders import this constant and digest it; the
 * call site below sends this constant. The hashed value and the sent value are
 * the same object, which no search can be wrong about.
 *
 * V RULING 2026-09-04 is preserved exactly: the conformance slot covers the
 * EVALUATOR prompt ALONE. The writer's prompt keeps its own
 * `composerContractHash`. The text is unchanged byte for byte by this move, so
 * the sealed fingerprint VALUE is unchanged.
 *
 * EDITING THIS STRING CHANGES A SEALED REGISTER VALUE. That is the intended
 * behaviour — the fingerprint exists to make the change visible — but it means
 * both deployment registers must be re-seeded when it moves.
 */
export const EVALUATOR_CONTRACT_TEXT =
  "Return only JSON {satisfied,objection,criteria} where criteria is {fairness_to_losers,statement_label_agreement,no_overstatement,restatement,citation_tracing}, each a boolean. Set satisfied true only when every criterion is true. When satisfied is false, objection must state the objection in full; when it is true, objection must be null.";

// codex r3 B1 part 2: EXPORTED so the schema/prompt agreement check can read the
// DECLARED criterion keys at runtime rather than scanning this file for them.
// Adding or renaming a criterion here without editing EVALUATOR_CONTRACT_TEXT is a
// real defect — providers follow the SENT prompt, so every response would omit a
// member this parser requires and the content-repair path would exhaust on a prompt
// that cannot satisfy its own schema. The test turns that red.
export const evaluatorVerdictSchema = z.object({
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
  /**
   * W10/3: the SEALED cost bound for each synthesis role, read from the T16
   * register family by the deployment's boot and handed here whole.
   *
   * REQUIRED, not optional, and that is the point: until this field existed the
   * synthesizer was handed COMPOSER's bound and the evaluator CONFORMANCE's —
   * two organs T9 retired, both at 60_000ms against the JUDGE's 180_000. An
   * optional field would have let a deployment keep borrowing them silently;
   * required makes every settings constructor a compile error until it says
   * which bound the role spends, which is the same guard board F33 chose for
   * `synthesisRolePolicy` itself.
   */
  readonly synthesizerBound: CallBound;
  readonly evaluatorBound: CallBound;
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
   * S3-2/S5-1 / T7: the sealed T16 adaptive-stopping rows (δ, ε), READ from the
   * register by the deployment's boot (`readAdaptiveStoppingControls`) and
   * handed here whole, exactly as `panelPolicy` is. The runner carries neither
   * value as a code constant and invents neither.
   */
  readonly stoppingPolicy?: AdaptiveStoppingControls;
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
  readonly synthesisRolePolicy: RunnerSynthesisRolePolicy;
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

/**
 * DR-159 B3-B: depth is a closed, ASK-time count of expansion rounds.
 * S1-1: the range itself is the contract's (EXPANSION_DEPTH_MIN/MAX) — this
 * guard is defence in depth behind the contract door, never a second source.
 */
export function resolveExpansionDepth(depthParams: Readonly<Record<string, unknown>>): number {
  const depth = depthParams.depth;
  if (!Number.isInteger(depth) || typeof depth !== "number"
    || depth < EXPANSION_DEPTH_MIN || depth > EXPANSION_DEPTH_MAX) {
    throw new TypedDomainError(
      "RUN_DEPTH_PARAMS_INVALID",
      `DR-157/DR-159 require a pinned integer expansion depth from ${EXPANSION_DEPTH_MIN} through ${EXPANSION_DEPTH_MAX}`
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

/**
 * T7 / S3-2 · ruling J15(a) — the GLOBAL round boundary, derived.
 *
 * `buildMultiMakerExpansionPlan` emits legs rootIndex-OUTER, round-INNER, so
 * `leg.round` RESETS at every root and a change in it is NOT a round boundary:
 * for M=2, depth 2 the sequence is `1,1,2,2,2,2 | 1,1,2,2,2,2`, and the change
 * at index 6 is root 0 finishing while root 1 has authored nothing. Acting on
 * that reading cut root 1 off the debate entirely.
 *
 * Round k is complete when EVERY root's round-k legs have completed — which, in
 * this ordering, is the LAST leg in the plan carrying round k. Returns leg index
 * → the round that completes at it.
 */
export function deriveGlobalRoundCompletions(
  plan: readonly MultiMakerExpansionLeg[]
): ReadonlyMap<number, number> {
  const finalIndexByRound = new Map<number, number>();
  plan.forEach((leg, index) => finalIndexByRound.set(leg.round, index));
  return Object.freeze(new Map([...finalIndexByRound]
    .sort(([leftRound], [rightRound]) => leftRound - rightRound)
    .map(([round, index]) => [index, round] as const)));
}

/**
 * T7 · ruling J15 ADDENDUM-2 — which frozen branches the decision can still
 * prevent from expanding.
 *
 * The global boundary lands late in a root-major plan, so by the time round k
 * completes, every root BEFORE the last has already authored its round-k
 * descendants. Freezing such a branch prevents nothing, and a
 * BRANCH-FROZEN-LOW-LEVERAGE mark on it would claim a skip that never happened
 * — a false honesty mark, which the goal repeals categorically (goal 26).
 *
 * A branch is preventable iff some leg AFTER the boundary would author beneath
 * it. Returns the preventable subset of `carryingChildIndices`, in the order
 * given.
 */
export function selectPreventableBranches(input: {
  readonly plan: readonly MultiMakerExpansionLeg[];
  readonly boundaryLegIndex: number;
  readonly carryingChildIndices: readonly number[];
}): readonly number[] {
  const subtreeOf = (childIndex: number): ReadonlySet<number> => {
    const indices = new Set([childIndex]);
    for (const candidate of input.plan) {
      if (indices.has(candidate.parentIndex)) indices.add(candidate.childIndex);
    }
    return indices;
  };
  return Object.freeze(input.carryingChildIndices.filter((childIndex) => {
    const subtree = subtreeOf(childIndex);
    return input.plan.some((leg, index) =>
      index > input.boundaryLegIndex && subtree.has(leg.parentIndex));
  }));
}

/**
 * T7 · codex B1 — the AUTHORITATIVE maker-root scope.
 *
 * `expectedRootCount` is the run's maker count and nothing else. This function
 * is deliberately blind to judged standing: it cannot narrow the scope to the
 * roots that happen to have been scored, because it is never told which those
 * are. A root the run never authored cannot be named, but it is still COUNTED,
 * so the shortfall reaches the decision instead of vanishing into a smaller
 * scope — which is exactly how r2 came to claim "no root moved > δ" about a
 * root it had never compared.
 */
export interface AuthoritativeRootScope {
  readonly expectedRootCount: number;
  readonly rootNodeIds: readonly string[];
}

export function selectAuthoritativeRootScope(input: {
  readonly effectiveMakerCount: number;
  readonly authoredRootNodeIdByMakerIndex: ReadonlyMap<number, string>;
}): AuthoritativeRootScope {
  if (!Number.isInteger(input.effectiveMakerCount) || input.effectiveMakerCount < 1) {
    throw new TypedDomainError(
      "STOPPING_ROOT_SCOPE_MAKER_COUNT_INVALID",
      "The authoritative root scope needs a positive integer maker count"
    );
  }
  return Object.freeze({
    expectedRootCount: input.effectiveMakerCount,
    rootNodeIds: Object.freeze(
      Array.from({ length: input.effectiveMakerCount }, (_, index) =>
        input.authoredRootNodeIdByMakerIndex.get(index))
        .flatMap((nodeId) => nodeId === undefined ? [] : [nodeId])
    )
  });
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
 * T7 / S3-2 · adaptive stopping — the branch-freeze disclosure.
 *
 * A canonical `CONDITION_MARKS` member, not a runner-local string: the kernel
 * mints it beside `LEVERAGE_UNRESOLVED`, mid-list, so the DR-176 tail that
 * `CONDITION_MARKS.slice(-4)` reads positionally is untouched.
 */
export const BRANCH_FROZEN_LOW_LEVERAGE_MARK = "BRANCH-FROZEN-LOW-LEVERAGE" as const;

/**
 * The typed record a frozen branch leaves behind. It names the branch, the
 * ROOT-SCOPED leverage that froze it (mission ruling J3), the ε it was measured
 * against, and WHERE that ε came from — a sealed T16 register row, never a code
 * constant. Without the source ref the disclosure could not be audited against
 * the register version the run actually read.
 */
export function buildBranchFrozenRecord(input: {
  readonly carryingNodeId: string;
  readonly leverage: number;
  readonly epsilon: number;
  readonly epsilonSourceRef: string;
  readonly rootNodeIds: readonly string[];
  readonly frozenSubtreeNodeIds: readonly string[];
}): ConditionMarkRecord {
  if (input.epsilonSourceRef.trim() === "") {
    throw new TypedDomainError(
      "BRANCH_FREEZE_EPSILON_PROVENANCE_MISSING",
      `The freeze of ${input.carryingNodeId} cannot be disclosed without the sealed epsilon row it used`
    );
  }
  return Object.freeze({
    mark: BRANCH_FROZEN_LOW_LEVERAGE_MARK,
    scope: "node",
    subjectRef: input.carryingNodeId,
    reason: `Adaptive stopping froze branch ${input.carryingNodeId}: its root-scoped leverage `
      + `${input.leverage} over roots ${input.rootNodeIds.join(", ")} is strictly below the sealed `
      + `branch-freeze epsilon ${input.epsilon} (${input.epsilonSourceRef}); nothing was expanded beneath it`,
    liftPath: "Lower the sealed branch-freeze epsilon, or judge material that gives this branch root leverage",
    servedRootRule: null,
    affectedNodeIds: Object.freeze([...input.frozenSubtreeNodeIds])
  });
}

export interface AdaptiveStoppingRoundInput {
  readonly runId: string;
  readonly attemptId: string;
  /** Expansion rounds finished so far. 0 means the round-1 floor is in force. */
  readonly completedRounds: number;
  readonly depthCeiling: number;
  /** J3: propagation has no root notion, so the runner supplies the root ids. */
  readonly rootNodeIds: readonly string[];
  /**
   * codex B1: the run's maker-root count, from `selectAuthoritativeRootScope`.
   * δ-convergence is refused unless the decision compared this many roots, so
   * no caller can buy a stop by handing down a narrower scope.
   */
  readonly expectedRootCount: number;
  readonly branchCarryingNodeIds: readonly string[];
  /**
   * J15 ADDENDUM-2: the subset of `branchCarryingNodeIds` whose expansion this
   * decision can still prevent. Leverage is computed for every carrying branch;
   * only a branch in THIS list may publish a freeze mark, because only its
   * freeze actually skipped anything.
   */
  readonly preventableCarryingNodeIds: readonly string[];
  readonly previousStrengths: readonly NodeStrengthRecord[] | null;
  readonly snapshot: EvaluationSnapshot;
  /** δ and ε as read from T16's sealed rows — never a constant in this file. */
  readonly controls: AdaptiveStoppingControls;
  readonly propagationContractHash: string;
  readonly propagationProducer: string;
}

export interface AdaptiveStoppingRoundDependencies {
  readonly appendLedger: (entry: AppendLedgerInput) => Promise<unknown>;
}

export interface AdaptiveStoppingRoundOutcome {
  readonly propagation: PropagationOutcome;
  readonly continuation: RoundContinuationDecision;
  readonly freezes: readonly BranchFreezeDecision[];
  readonly frozenCarryingNodeIds: readonly string[];
  readonly conditionMarkRecords: readonly ConditionMarkRecord[];
}

/**
 * T7 · one round boundary of the debate loop.
 *
 * PURE CODE by construction: it evaluates the snapshot it was handed and
 * decides. It reaches no provider and appends exactly one PROPAGATION ledger
 * row per round — the DoD's "zero model calls" is a property of this function's
 * dependency surface, which contains no model client at all, and the ledger row
 * is what lets an auditor prove it after the fact.
 *
 * The ε freeze is only consulted once round 1 has completed: `resolveLeverage`
 * refuses to answer before then, which is the round-1 floor at the leverage
 * door as well as at the loop's.
 */
export async function runAdaptiveStoppingRound(
  input: AdaptiveStoppingRoundInput,
  dependencies: AdaptiveStoppingRoundDependencies
): Promise<AdaptiveStoppingRoundOutcome> {
  const startedAt = new Date();
  const propagation = evaluate(input.snapshot);
  // J15(b): the evidence this decision had, carried onto its record.
  const measuredEdgeCount = countMeasuredEdges(input.snapshot);
  const continuation = decideRoundBoundary({
    completedRounds: input.completedRounds,
    depthCeiling: input.depthCeiling,
    rootNodeIds: input.rootNodeIds,
    expectedRootCount: input.expectedRootCount,
    previousStrengths: input.previousStrengths,
    currentStrengths: propagation.strengths,
    measuredEdgeCount,
    delta: input.controls.delta
  });
  const freezes = input.completedRounds < 1 || input.branchCarryingNodeIds.length === 0
    ? Object.freeze([])
    : decideBranchFreezes({
      completedRounds: input.completedRounds,
      sensitivityRecords: propagation.sensitivityRecords,
      branchCarryingNodeIds: input.branchCarryingNodeIds,
      rootNodeIds: input.rootNodeIds,
      epsilon: input.controls.epsilon
    });
  const frozen = freezes.filter((decision) => decision.verdict === "FROZEN");
  // J15 ADDENDUM-2: the freeze DECISION covers every carrying branch, but only a
  // freeze that actually prevented an expansion may claim to have done so.
  const preventable = new Set(input.preventableCarryingNodeIds);
  const frozenAndPrevented = frozen.filter((decision) => preventable.has(decision.carryingNodeId));
  const epsilonSourceRef = input.controls.sourceRefs.branchFreezeEpsilon ?? "";
  await dependencies.appendLedger({
    runId: input.runId,
    attemptId: input.attemptId,
    actionKind: "PROPAGATION",
    callSiteKey: `STOPPING:round:${input.completedRounds}`,
    subjectItemId: input.rootNodeIds[0]!,
    stanceAtAction: "UNASSIGNED",
    outcome: "OK",
    actorRef: input.propagationProducer,
    inputHash: hash(input.snapshot),
    contractHash: input.propagationContractHash,
    startedAt,
    finishedAt: new Date()
  });
  return Object.freeze({
    propagation,
    continuation,
    freezes,
    frozenCarryingNodeIds: Object.freeze(frozen.map((decision) => decision.carryingNodeId)),
    conditionMarkRecords: Object.freeze(frozenAndPrevented.map((decision) => buildBranchFrozenRecord({
      carryingNodeId: decision.carryingNodeId,
      leverage: decision.leverage,
      epsilon: input.controls.epsilon,
      epsilonSourceRef,
      rootNodeIds: input.rootNodeIds,
      frozenSubtreeNodeIds: [decision.carryingNodeId]
    })))
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

/**
 * Board F30 / T12 — ENFORCE the degraded-panel step-down T3 already RECORDS.
 *
 * T3's confirm-item 5 records, on every reduced judgement, that a panel
 * collapsed to the author's own voice (`PANEL-DEGRADED-SINGLE-VOICE`) and that
 * the certainty band therefore steps one place down through T16's sealed
 * `downgradeBands` row. Nothing consumed that record on the served answer:
 * `ledger.reduced_judgement.disagreement.certaintyEffect` said `DOWNGRADED`
 * while `serve.answer.confidence_band` still shipped the candidate band. A
 * downgrade that is recorded and not applied is the silent-degradation shape
 * the goal repeals, so the band lane applies it.
 *
 * SCOPE — the SERVED ROOT's own record. The band is the answer's confidence in
 * the served position, and J16(a) reads every answer-scope quantity from the
 * served root: T11 takes its dispersion from exactly that node. A panel that
 * degraded on a node which never reached the answer is still disclosed on that
 * node (`panelDegradations` → node-scope condition marks) and does not restate
 * the served claim's confidence. The disputed-review arm beside this one is
 * run-scope on purpose and for a different reason: a dispute is a DECLARED
 * disagreement about the debate's content, wherever it was declared.
 *
 * Only the single-voice collapse steps the band. `PANEL-PARTIAL` means some
 * members were lost, not that the author graded itself, and T3 does not record
 * a step-down for it — inventing one here would be this file deciding a band.
 *
 * The move itself is `applyDeclaredDisagreement`'s, over the mapping the SEALED
 * row supplies; no band value is chosen here. At the weakest band T16 seals the
 * one-step-down target as the band itself, so the floor is a fixed point.
 */
export function applyPanelDegradedBandStepDown(input: {
  readonly certaintyBand: string;
  readonly servedRootNodeId: string;
  readonly panelDegradations: readonly {
    readonly subjectRef: string;
    readonly mark: string;
  }[];
  readonly oneStepDown: Readonly<Record<string, string>>;
  readonly predicateRef: string;
}): {
  readonly certaintyBand: string;
  readonly certaintyEffect: "DOWNGRADED" | "UNCHANGED";
  readonly predicateRef: string;
  readonly observationRef: string | null;
} {
  const degraded = input.panelDegradations.some((record) =>
    record.subjectRef === input.servedRootNodeId
    && record.mark === PANEL_DEGRADED_SINGLE_VOICE_MARK);
  if (!degraded) {
    return Object.freeze({
      certaintyBand: input.certaintyBand,
      certaintyEffect: "UNCHANGED" as const,
      predicateRef: input.predicateRef,
      observationRef: null
    });
  }
  const observationRef =
    `ledger.reduced_judgement:${PANEL_DEGRADED_SINGLE_VOICE_MARK}:${input.servedRootNodeId}`;
  const steppedDown = input.oneStepDown[input.certaintyBand] ?? null;
  const declared = applyDeclaredDisagreement({
    fires: steppedDown !== null,
    predicateRef: input.predicateRef,
    observationRef,
    certaintyBand: input.certaintyBand,
    downgradedBand: steppedDown
  });
  return Object.freeze({
    certaintyBand: declared.certaintyBand ?? input.certaintyBand,
    certaintyEffect: declared.certaintyEffect,
    predicateRef: declared.predicateRef,
    observationRef
  });
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

  /**
   * P8 × DR-074: an arrow-bearing graph propagates only under the ruled
   * deployment scoringOperator row, resolved through the SHIPPED chain with the
   * supplying level RECORDED on the receipt. Unruled ⇒ typed loud stop.
   *
   * T7 lifted this out of the end-of-run path so the per-round stopping
   * propagation reads the graph through the SAME door; two doors would let the
   * rounds and the served answer disagree about what the graph is.
   */
  async #resolveOperatorResolvedSnapshot(runId: string): Promise<{
    readonly materialised: EvaluationSnapshot;
    readonly snapshot: EvaluationSnapshot;
  }> {
    const materialised = await this.#graph.materialiseSnapshot(runId);
    const arrowTargetNodeIds = [...new Set(materialised.arrows.flatMap((arrow) =>
      arrow.targetKind === "NODE" && arrow.targetNodeId !== null ? [arrow.targetNodeId] : []
    ))];
    if (arrowTargetNodeIds.length === 0) {
      return Object.freeze({ materialised, snapshot: materialised });
    }
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
    return Object.freeze({
      materialised,
      snapshot: Object.freeze({
        ...materialised,
        operatorResolutions: Object.freeze(arrowTargetNodeIds.map((parentNodeId) => Object.freeze({
          parentNodeId,
          operator: resolvedOperator.value,
          suppliedBy: resolvedOperator.suppliedBy
        })))
      })
    });
  }

  private async execute(workItemId?: string): Promise<RunnerExecutionResult> {
    // W10/3: the claim must cover the LONGEST call this execution can make, and
    // since the synthesis legs now spend their own sealed bounds those two
    // deadlines belong in the max. The composer/conformance pair STAYS: both are
    // still declared deployment bounds, `Math.max` makes a shorter one a no-op,
    // and dropping them would loosen the claim guard for no gain.
    const longestDeadline = Math.max(
      this.settings.judgeBound.deadlineMs,
      this.settings.composerBound.deadlineMs,
      this.settings.conformanceBound.deadlineMs,
      // Optional-chained ON PURPOSE, and `0` can never raise a maximum. The
      // ABSENT family is not this guard's to report: a caller who defeats the
      // required type (a JavaScript caller, a cast, settings built from parsed
      // data) must still reach the NAMED refusal below —
      // `SYNTHESIS_ROLE_CONTROLS_UNRESOLVED`, ~80 lines on — instead of dying
      // here on `Cannot read properties of undefined`. Measured: without this,
      // the test that pins that runtime gate reports a raw TypeError.
      // F2: `?.` on the POLICY alone was narrower than the case above. A policy
      // built from parsed data can arrive PRESENT with a bound missing, and
      // `?? 0` never saw it — the read of `.deadlineMs` died first. An
      // unresolved bound is refused HERE, under the SAME name, before the claim
      // and before anything is spent; `0` for an ABSENT family is unchanged, so
      // that case still reaches the gate below.
      //
      // Round 2: each bound is its OWN scalar argument, never a list. A numeric
      // ARRAY in shipped code is read by the S1-1 single-source oracle
      // (`tests/unit/s1-1-depth-contract.test.ts`) as a candidate domain for the
      // ruled depth ceiling, and one it cannot evaluate is conservatively a
      // site — this expression was flagged `[DOMAIN_ENUMERATION]` when it built
      // its arguments with `.map`. The maximum stays scalar for that reader.
      this.settings.synthesisRolePolicy === undefined
        ? 0
        : this.settings.synthesisRolePolicy.synthesizerBound?.deadlineMs ?? ((): never => {
          throw new TypedDomainError(
            "SYNTHESIS_ROLE_CONTROLS_UNRESOLVED",
            "T9: the sealed synthesizerBound is a T16 register row (J8); a synthesis-role policy that reached the runner without it is refused by name, never dereferenced (goal 39-40)"
          );
        })(),
      this.settings.synthesisRolePolicy === undefined
        ? 0
        : this.settings.synthesisRolePolicy.evaluatorBound?.deadlineMs ?? ((): never => {
          throw new TypedDomainError(
            "SYNTHESIS_ROLE_CONTROLS_UNRESOLVED",
            "T9: the sealed evaluatorBound is a T16 register row (J8); a synthesis-role policy that reached the runner without it is refused by name, never dereferenced (goal 39-40)"
          );
        })()
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
    if (this.#configuredMakers.length > 1 && this.settings.stoppingPolicy === undefined) {
      // S3-2/S5-1 × J12, same shape and same place: a multi-maker run is the only
      // run that expands, and expansion is what δ and ε govern. Running the
      // ceiling with the stopping rule quietly absent — or with a δ/ε invented
      // here — is the silent-degradation shape the mission repeals.
      throw new TypedDomainError(
        "ADAPTIVE_STOPPING_UNRESOLVED",
        "J12: a multi-maker run requires the sealed T16 adaptive-stopping rows (globalStopDelta, branchFreezeEpsilon); they are read from the register and never invented"
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
      //
      // T7 merge: this gate follows the two above rather than preceding them, so
      // each comment's "directly above"/"beside J12's" stays true. Order is not
      // observable to either lane's landed assertion — both fixtures omit ONE
      // policy from a helper that supplies all of them, so the other gate passes.
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
    // J24 discriminator (2) — the family being PRESENT is not the same as its
    // refs being RESOLVABLE. A sealed ref naming a provider this deployment
    // never configured can be refused before the work item is claimed, because
    // it needs no health information at all. Refusing here spends nothing.
    for (const role of SYNTHESIS_ROLES) {
      const roleRef = role === "SYNTHESIZER"
        ? this.settings.synthesisRolePolicy.synthesizerRoleRef
        : this.settings.synthesisRolePolicy.evaluatorRoleRef;
      if (!this.#configuredMakers.some((maker) => maker.providerRef === roleRef)) {
        throw new TypedDomainError(
          "SYNTHESIS_ROLE_PROVIDER_UNRESOLVED",
          `J24: the sealed ${role} role ref ${roleRef} (register version ${String(this.settings.synthesisRolePolicy.registerVersion)}) names no configured provider on this deployment; a sealed identity is never substituted`
        );
      }
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
      // J26(b): this refusal is TERMINAL for the work item, for the same reason
      // the sealed-role refusal below is — every pinned provider being absent is
      // a condition only a deployment change can fix, so leaving the item
      // CLAIMED hands it to the reaper to retry against an unchanged world.
      // MEASURED, not assumed: before this line the item was left CLAIMED with a
      // null terminal_reason, which the all-absent arm now pins.
      await this.#work.recordTerminalFailure({
        runId: run.runId,
        workItemId: claimed.workItemId,
        reason: "RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM"
      });
      throw new TypedDomainError(
        "RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM",
        "Every provider pinned at ask time was absent when the runner claimed the work item"
      );
    }
    const synthesisRolePolicy = this.settings.synthesisRolePolicy;
    if (synthesisRolePolicy === undefined) {
      // Unreachable: the pre-claim gate refuses first. Typed rather than
      // optional-chained so a future caller cannot reach synthesis without it.
      throw new TypedDomainError(
        "SYNTHESIS_ROLE_CONTROLS_UNRESOLVED",
        "T9: the sealed synthesis-role family is required before any role is resolved"
      );
    }
    // J24 discriminator (3) — the sealed refs are resolved against the
    // CLAIM-ELIGIBLE providers, i.e. after probing removed the absent ones. The
    // r1 defect was exactly here: the late resolver looked the ref up in the
    // UNFILTERED configured set, so a role provider that probing had just found
    // absent was still called, and its inevitable transport death was recorded
    // as an ordinary mid-call crash — a known role unavailability wearing the
    // costume of a runtime accident. Refuse instead, without substitution, and
    // leave a durable event naming the ROLE (J25: a disclosure a reader cannot
    // see is not a disclosure).
    for (const role of SYNTHESIS_ROLES) {
      const roleRef = role === "SYNTHESIZER"
        ? synthesisRolePolicy.synthesizerRoleRef
        : synthesisRolePolicy.evaluatorRoleRef;
      if (configuredMakers.some((maker) => maker.providerRef === roleRef)) continue;
      const absent = absentAtClaim.find((entry) => entry.member.provider_ref === roleRef);
      // J26(c): a refusal's own shape. No hold, no attempts, no legs — the three
      // zeros the first draft wrote were measurements nobody took.
      await this.#runs.recordRunLifecycleEvent({
        runId: run.runId,
        kind: "ledger.could_not_do",
        value: {
          state: "SYNTHESIS_ROLE_PROVIDER_ABSENT",
          call_site_key: `${role}:${roleRef}`,
          role_ref: roleRef,
          role,
          absent_failure_code: absent?.failureCode ?? null
        }
      });
      // J26(b): the refusal is TERMINAL for this work item. It is never released
      // or re-queued — retrying a sealed identity that is absent would loop
      // against a condition only a deployment change can fix, and substituting a
      // healthy provider is what J24 forbids. The state is recorded BEFORE the
      // throw so the terminal fact does not depend on who catches it.
      await this.#work.recordTerminalFailure({
        runId: run.runId,
        workItemId: claimed.workItemId,
        reason: `SYNTHESIS_ROLE_PROVIDER_ABSENT_AT_CLAIM:${role}`
      });
      throw new TypedDomainError(
        "SYNTHESIS_ROLE_PROVIDER_ABSENT_AT_CLAIM",
        `J24: the sealed ${role} role ref ${roleRef} was ${absent === undefined ? "not claim-eligible" : `absent at claim (${absent.failureCode})`}; the run refuses rather than serving from a provider the sealed row did not name`
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
      // W10/3: the CONTRACT HASH still names the OUTPUT contract (the composition
      // and verdict schemas), which this ticket does not touch — but the attempt
      // budget must be the one the call actually spends, and that is now the
      // synthesis role's sealed `maxAttempts`, not the retired organ's.
      {
        contractHash: this.settings.composerContractHash,
        maxAttempts: this.settings.synthesisRolePolicy.synthesizerBound.maxAttempts
      },
      {
        contractHash: this.settings.conformanceContractHash,
        maxAttempts: this.settings.synthesisRolePolicy.evaluatorBound.maxAttempts
      }
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
    // T7 / S3-2 + S5-1 · ruling J15(a) — adaptive stopping, evaluated at the
    // DERIVED global round boundary. `leg.round` resets at every root in this
    // root-major plan, so a change in it is not a boundary; round k completes at
    // the LAST leg carrying round k, when every root has finished round k.
    const globalRoundCompletions = deriveGlobalRoundCompletions(expansionPlan);
    const frozenIndices = new Set<number>();
    const branchFrozenRecords: ConditionMarkRecord[] = [];
    let previousRoundStrengths: readonly NodeStrengthRecord[] | null = null;
    /**
     * One GLOBAL round boundary: propagate (PURE CODE — no provider is reachable
     * from here), then apply the ε branch freeze and the global δ stop. Returns
     * true when the debate should stop expanding.
     */
    const closeGlobalRound = async (completedRounds: number, boundaryLegIndex: number): Promise<boolean> => {
      const stoppingPolicy = this.settings.stoppingPolicy;
      if (stoppingPolicy === undefined) return false;
      const { snapshot: roundSnapshot } = await this.#resolveOperatorResolvedSnapshot(run.runId);
      const roundStanding = projectJudgedStanding(
        roundSnapshot,
        await this.#judgements.readReviewedNodeIds(run.runId)
      );
      const scoredNodeIds = new Set(roundStanding.snapshot.nodes.map((node) => node.nodeId));
      // codex B1 / J15 ADDENDUM-2: the AUTHORITATIVE maker-root scope, NEVER
      // narrowed to the roots that happen to have standing. A root whose review
      // exhausted is uncomparable, and `decideRoundBoundary` refuses convergence
      // because of it — dropping it here is what let r2 claim "no root moved"
      // about a root it had never looked at.
      const rootScope = selectAuthoritativeRootScope({
        effectiveMakerCount,
        authoredRootNodeIdByMakerIndex: new Map(
          Array.from({ length: effectiveMakerCount }, (_, index) => [index, authoredNodes.get(index)] as const)
            .flatMap(([index, root]) => root === undefined ? [] : [[index, root.nodeId] as const])
        )
      });
      if (rootScope.rootNodeIds.length === 0) return false;
      // The branches that could expand next are the nodes this round authored.
      const branchCarryingNodeIds = expansionPlan
        .filter((candidate) => candidate.round === completedRounds
          && !haltedIndices.has(candidate.childIndex)
          && !frozenIndices.has(candidate.childIndex))
        .flatMap((candidate) => {
          const authored = authoredNodes.get(candidate.childIndex);
          return authored !== undefined && scoredNodeIds.has(authored.nodeId)
            ? [{ index: candidate.childIndex, nodeId: authored.nodeId }]
            : [];
        });
      // ...and only some of those still have anything left to prevent.
      const preventableIndices = new Set(selectPreventableBranches({
        plan: expansionPlan,
        boundaryLegIndex,
        carryingChildIndices: branchCarryingNodeIds.map((branch) => branch.index)
      }));
      const boundary = await runAdaptiveStoppingRound({
        runId: run.runId,
        attemptId: runnerAttemptId,
        completedRounds,
        depthCeiling: expansionDepth,
        rootNodeIds: rootScope.rootNodeIds,
        expectedRootCount: rootScope.expectedRootCount,
        branchCarryingNodeIds: branchCarryingNodeIds.map((branch) => branch.nodeId),
        preventableCarryingNodeIds: branchCarryingNodeIds
          .flatMap((branch) => preventableIndices.has(branch.index) ? [branch.nodeId] : []),
        previousStrengths: previousRoundStrengths,
        snapshot: roundStanding.snapshot,
        controls: stoppingPolicy,
        propagationContractHash: this.settings.propagationContractHash,
        propagationProducer: this.settings.propagationProducer
      }, { appendLedger: (entry) => this.#ledger.append(entry) });
      previousRoundStrengths = boundary.propagation.strengths;
      const frozenNodeIds = new Set(boundary.frozenCarryingNodeIds);
      for (const branch of branchCarryingNodeIds) {
        if (!frozenNodeIds.has(branch.nodeId)) continue;
        for (const index of subtreeIndices(branch.index)) frozenIndices.add(index);
      }
      for (const record of boundary.conditionMarkRecords) branchFrozenRecords.push(record);
      return boundary.continuation.kind === "STOP";
    };
    let activeExpansionRound = expansionPlan[0]?.round ?? null;
    let stoppedByAdaptiveRule = false;
    for (const [legIndex, leg] of expansionPlan.entries()) {
      if (activeExpansionRound !== null && leg.round !== activeExpansionRound) {
        await reviewPendingAuthoredNodes();
        activeExpansionRound = leg.round;
      }
      const skipped = haltedIndices.has(leg.parentIndex) || haltedIndices.has(leg.childIndex)
        || frozenIndices.has(leg.parentIndex) || frozenIndices.has(leg.childIndex);
      if (!skipped) {
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
      } else {
        authoredNodes.set(leg.childIndex, authored.value);
      }
      }
      // J15(a): every root has now finished this round, so the boundary is real.
      const completedRound = globalRoundCompletions.get(legIndex);
      if (completedRound !== undefined) {
        await reviewPendingAuthoredNodes();
        stoppedByAdaptiveRule = await closeGlobalRound(completedRound, legIndex);
        if (stoppedByAdaptiveRule) break;
      }
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
    const { materialised, snapshot: operatorResolvedSnapshot } =
      await this.#resolveOperatorResolvedSnapshot(run.runId);
    let snapshot: EvaluationSnapshot = operatorResolvedSnapshot;
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
      // T7 / S3-2: a branch the stopping rule froze is a skip, and the Scope law
      // requires every skip to be visible in the ANSWER, not only in a receipt.
      ...(branchFrozenRecords.length > 0 ? [BRANCH_FROZEN_LOW_LEVERAGE_MARK] : []),
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
      // T7 / S3-2: one typed record per frozen branch, minted at the round
      // boundary that froze it and carried whole to the answer.
      ...branchFrozenRecords,
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
      role: SynthesisRoleName
    ): { readonly provider: ProviderGateway; readonly providerRef: string } => {
      // codex r1 B1: this looked the ref up in `this.#configuredMakers` — the
      // UNFILTERED set — so a role provider that claim-time probing had already
      // found absent was still called here. It resolves against the
      // CLAIM-ELIGIBLE set now, and the claim-time discriminator above has
      // already refused this run if either sealed ref is missing from it, so
      // reaching this throw means a provider went away AFTER a healthy claim.
      const configured = configuredMakers.find((maker) => maker.providerRef === roleRef);
      if (configured === undefined) {
        throw new TypedDomainError(
          "SYNTHESIS_ROLE_PROVIDER_UNRESOLVED",
          `${role} role ref ${roleRef} (register version ${String(synthesisRoles.registerVersion)}) is not among the claim-eligible providers`
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
    /**
     * T17B/B1 — `pendingModelAttempts` names WHICH question is being asked.
     *
     * 0 (the default, and every caller that reports on what the run has already
     * spent) asks "has this run spent MORE than it was allowed?" — J28's
     * comparison, WITHIN at equality, unchanged.
     *
     * 1 asks "may this run spend ANOTHER attempt?", which is the only question
     * the refused-attempt catch below has ever been asking. At `consumed ==
     * max` those two have opposite answers, and before this argument existed
     * both were being derived from the post-consumption count alone.
     */
    const evaluateEnvelope = (pendingModelAttempts = 0): Promise<BudgetPressureDecision> =>
      this.#budget.evaluateRunPressure({
        runId: run.runId,
        basis: envelopeBasis,
        pendingModelAttempts,
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
        }),
        // F4 / J25: when the envelope terminal fires with the served root's R9
        // restatement FAILING, the retired guard gets a RECORD, not only a
        // trace token — `assertRequiredConditionMarkRecords` pairs every mark
        // with one, and a reader of the answer sees the record, never the trace.
        ...(servedRoot.restatementStatus === "PASS" ? [] : [Object.freeze({
          mark: PROTECTED_CORE_GUARD_RETIRED_MARK,
          scope: "answer" as const,
          subjectRef: servedRoot.nodeId,
          reason: `The envelope was exhausted with no served statement while the protected-core restatement status was ${servedRoot.restatementStatus}; under F4 that status is observed and disclosed, and no longer decides the terminal`,
          liftPath: "Re-ask with a larger cost envelope, or restore a restatement a stranger can verify",
          servedRootRule: null,
          affectedNodeIds: Object.freeze([servedRoot.nodeId])
        } satisfies ConditionMarkRecord)])
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
      const monoCapped = effectiveMakerCount === 1
        ? applySingleLineageBandCap(servePolicy.candidateConfidenceBand, servePolicy.bandCeiling)
        : servePolicy.candidateConfidenceBand;
      /**
       * F30: T3's recorded degraded-panel step-down, APPLIED to the served
       * answer. A mono-maker run has no panel at all, so this and the cap above
       * are mutually exclusive in practice; they are written as a chain because
       * each is an independent declared downgrade and neither may swallow the
       * other silently.
       */
      const servedRootPanelDegraded = panelDegradations.some((record) =>
        record.subjectRef === servedRoot.nodeId
        && record.mark === PANEL_DEGRADED_SINGLE_VOICE_MARK);
      if (servedRootPanelDegraded && panelPolicy === undefined) {
        // Unreachable: only an M>=2 run has a panel, and J12's claim-time gate
        // refuses an M>=2 deployment whose T16 panel rows were never sealed.
        // Typed rather than defaulted, so the missing-row condition can never
        // re-acquire a degraded, proceeding shape.
        throw new TypedDomainError(
          "PANEL_WEIGHTING_UNRESOLVED",
          "J12: a degraded panel requires the sealed downgrade-bands row to declare its certainty downgrade"
        );
      }
      const capped = panelPolicy === undefined ? monoCapped : applyPanelDegradedBandStepDown({
        certaintyBand: monoCapped,
        servedRootNodeId: servedRoot.nodeId,
        panelDegradations,
        oneStepDown: panelPolicy.oneStepDown,
        predicateRef: panelPolicy.sourceRefs.downgradeBands ?? panelPolicy.unmappedReason
      }).certaintyBand;
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
        const synthesizerCallSiteKey = synthesisCallSiteKey({
          role: "SYNTHESIZER", stage: request.stage, round: request.round
        });
        const packet: PromptPacket = { messages: [
          { role: "system", content: "Return only JSON with a segments array of at most two {segment_id,text,node_refs,served_number_refs} entries. node_refs must name the node ids of the digest nodes whose facts the segment asserts, so every load-bearing claim traces to a digest node. Preserve the digest and add no facts. When the digest nodes a segment cites rest on reasoning alone, with no measured or looked-up evidence behind them, return at least two segments in order: the first segment states the provisional answer as a hypothesis; the second segment states the research plan that would lift it." },
          { role: "user", content: toSynthesisPromptPayload(request) }
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
          callSiteKey: synthesizerCallSiteKey,
          role: "SYNTHESIZER",
          lane: "served",
          // W10/3: the SYNTHESIZER's own sealed bound. It used to be
          // `composerBound` — an organ T9 retired — which is how the longest
          // generation in the system ended up with a 60-second clock while the
          // judge, answering about ONE node, had 180.
          bound: this.settings.synthesisRolePolicy.synthesizerBound,
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
        return {
          candidate: partitioned.conformanceSegments,
          // codex r1 B2: the RECORDED artifact for THIS round. `compositionRawArtifactRef`
          // is overwritten by the next round, so the retry's back-reference has to be
          // the per-round value taken here, never that field read later.
          candidateRef: response.rawArtifactRef,
          // codex r3 B2: the producer identity travels with the reference, and
          // `persist` checks the pair against the ledger before committing.
          candidateCallSiteKey: synthesizerCallSiteKey
        };
      },
      /**
       * The EVALUATOR role call. It replaces BOTH retired provider limbs —
       * per-segment conformance and post-compose R9 — because both are now
       * objection criteria rather than terminals, and one grader that sees the
       * whole candidate can weigh them against each other.
       */
      evaluate: async (request: EvaluatorRequest) => {
        const role = resolveSynthesisRoleMaker(request.roleRef, "EVALUATOR");
        const evaluatorCallSiteKey = synthesisCallSiteKey({ role: "EVALUATOR", round: request.round });
        const packet: PromptPacket = { messages: [
          { role: "system", content: EVALUATOR_CONTRACT_TEXT },
          { role: "user", content: toSynthesisPromptPayload(request) }
        ] };
        const response = await callSynthesisRole(role.provider, {
          runId: run.runId,
          subjectItemId: claimed.workItemId,
          // Same contract as the synthesizer's key above: `POST_COMPOSE_R9:%`
          // feeds `r9_calls`, which the R9 battery row prints in its executed
          // check ref. The evaluator IS the restatement check now, so the slot
          // is still occupied and the ref still names something that happened.
          callSiteKey: evaluatorCallSiteKey,
          role: "EVALUATOR",
          lane: "served",
          // W10/3: the EVALUATOR's own sealed bound, formerly CONFORMANCE's.
          bound: this.settings.synthesisRolePolicy.evaluatorBound,
          contractHash: this.settings.conformanceContractHash,
          providerRef: role.providerRef,
          packet,
          classifyContent: (content) => classifyStructuredContent(content, evaluatorVerdictSchema),
          buildRepairPacket: ({ parseError }) => buildSchemaRepairPacket(packet, parseError)
        }, "EVALUATOR_CONTRACT_ERROR");
        conformanceRawArtifactRefs.push(response.rawArtifactRef);
        const parsed = parseContent(response.content, evaluatorVerdictSchema, "EVALUATOR_CONTRACT_ERROR");
        return Object.freeze({
          verdict: Object.freeze({
            satisfied: parsed.satisfied,
            objection: parsed.objection,
            criteria: Object.freeze({
              fairnessToLosers: parsed.criteria.fairness_to_losers,
              statementLabelAgreement: parsed.criteria.statement_label_agreement,
              noOverstatement: parsed.criteria.no_overstatement,
              restatement: parsed.criteria.restatement,
              citationTracing: parsed.criteria.citation_tracing
            })
          }),
          // J29: the evaluator's own recorded artifact, so the round's verdict
          // and objection resolve through `ledger.raw_artifact` rather than
          // being duplicated into a second plaintext table.
          verdictRef: response.rawArtifactRef,
          verdictCallSiteKey: evaluatorCallSiteKey
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
        // The gateway REFUSED a next provider call, so the question here is
        // whether one more attempt fits — not whether the run has overspent.
        // Asking with the pending attempt counted is what makes this context
        // stop sharing J28's branch: at `consumed == max` a completed run is
        // WITHIN and keeps its answer, while this refused attempt is a
        // HARD_STOP and gets the ruled components-only terminal instead of a
        // rethrow that produced no envelope record at all.
        const exhausted = await evaluateEnvelope(1);
        // NO restatement conjunct. F4 / goal 248-251: the protected-core guard
        // was keyed on R9's gate-hood and is KNOWINGLY RETIRED with it, so the
        // envelope terminal fires on HARD_STOP whenever no served statement
        // exists yet, INDEPENDENT OF RESTATEMENT STATUS. The status is observed
        // and disclosed as a condition mark instead of deciding the terminal.
        // The two changes are orthogonal and both stand: T17B's `pendingModelAttempts`
        // fixes WHICH question is asked, F4 removes a guard from the answer.
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

// ─── BEGIN OPERATIONAL DIAGNOSTIC ALPHABET ─────────────────────────────────────
// TWIN COPY. This block is byte-identical in apps/api/src/index.ts and
// apps/runner/src/index.ts, and `tests/unit/api-operational-error.test.ts`
// fails if the two copies drift. It is duplicated rather than shared because a
// shared module is outside this change's file contract (F-DIAG-OPERATIONAL-REGEX);
// the duplication is pinned by that test instead of by hand.
//
// WHAT IS BOUNDED HERE IS THE OUTPUT ALPHABET, not the input shape. Every string
// this block can return is a literal declared inside it. The caught value is only
// ever used as a LOOKUP KEY, and a key that misses becomes the fallback. Nothing
// is derived from the caught value — no substring of it is returned, no regex
// capture, no case transform.
//
// The two rules this replaces both returned caught text when it happened to LOOK
// like a constant: `message` was returned verbatim when it matched
// /^[A-Z][A-Z0-9_]{2,63}$/u, and `name` was camel-to-SNAKE upper-cased and
// returned when the result matched the same shape. `code` was forwarded verbatim
// as `DEPENDENCY_${code}` when it matched /^[A-Z0-9_]{2,32}$/u. All three are
// attacker- or driver-influenced text; an uppercase-shaped string is not a known
// constant (codex, sessions-argon2 r1 F2). A 20-character uppercase credential in
// `.code`, an upper-cased SQL fragment in `.message`, and a hex digest in `.name`
// all satisfied those shapes and were emitted verbatim.
//
// The TypedDomainError branch is bounded the same way (codex r1 F1): the kernel
// types that code as `string`, so it was an open passthrough too.
//
// This follows the pattern that landed in apps/api/src/risk-signal-identity.ts.

/** The one diagnostic emitted for anything not recognized below. */
const OPERATIONAL_DIAGNOSTIC_FALLBACK = "UNEXPECTED_ERROR";

/** The one diagnostic emitted for a TypedDomainError whose code is not declared below. */
const UNRECOGNIZED_DOMAIN_CODE = "UNRECOGNIZED_DOMAIN_ERROR";

/**
 * Every domain code this system declares. `TypedDomainError`'s constructor takes
 * `code: string` (packages/kernel/src/index.ts:388) and stores it without any
 * runtime restriction, so the typed branch was an open passthrough for whatever
 * a caller handed it — codex r1 F1, probe value `DIAG_REVIEW_SENTINEL`. The API
 * diagnostic is logged on every 5xx and the runner's is PERSISTED into
 * core.work_item.terminal_reason (packages/battery/src/index.ts:434) with no
 * later alphabet check, so the check has to happen here, at the boundary.
 *
 * This map bounds the DIAGNOSTIC only. No thrown error's code or message changes:
 * a declared code keeps its diagnostic exactly, and an undeclared one becomes
 * UNRECOGNIZED_DOMAIN_CODE. A TypeScript union would not do this job, because the
 * value arrives at runtime from a `string` field.
 *
 * SWEEP REVISION: the producer sweep reads the tree at dev
 * d5b4f7f568aceec55a9cfca72b62473e7ee26c19, and every cited line is a line of THAT
 * revision. The r1 artifact cited r0-tip line numbers while naming the base, which
 * was wrong for the two files this change itself edits (codex r1b C1).
 *
 * Scope: packages/**, apps/api/src/** and apps/runner/src/index.ts — the module
 * each formatter lives in, whose imports are the 14 @debateai packages plus zod,
 * pg and the Hatchet SDK — 90 files, tests excluded. Three producer forms:
 *
 *   420  `new TypedDomainError("CODE", …)` calls with a literal first argument.
 *     2  subclass declarations passing a literal code to super(). These are the
 *        only two classes extending TypedDomainError in the tree:
 *        ProviderCallFailedError (packages/providers/src/index.ts:52, super at :62
 *        → PROVIDER_CALL_FAILED) and ProviderContentUnacceptedError (:68, super at
 *        :78 → PROVIDER_CONTENT_UNACCEPTED), both thrown by the provider gateway at
 *        :491 and :499. A `new TypedDomainError(` sweep never visits super(), and
 *        the class-name map below cannot cover for the omission: these objects
 *        satisfy `instanceof TypedDomainError`, so this lookup answers first
 *        (codex r1b F3).
 *    13  calls whose first argument is a variable, each resolved to the literals its
 *        callers supply — the parseContent / callSynthesisRole / runnerStage /
 *        requireNonblank / nonBlank / requiredText / requireNonBlank code
 *        parameters, the DATABASE_POOL_FAILED constant, the settlement ternary, and
 *        the two template forms in packages/register (readFamily's family codes and
 *        STRUCTURAL_CEILING_*).
 *
 * The requireNonblank resolution is 12 literal-argument calls plus ONE loop — the
 * five `[input.x, "EVALUATOR_DOMAIN_*_INVALID"]` tuple pairs of
 * validateAdmissionIdentity (packages/evaluator/src/index.ts:1019-1026). An earlier
 * version matched any two-element array anywhere in that file, and so admitted
 * MATCHED_EXISTING (an admission decision), PROWESS_RANK (a phase-order member) and
 * UNASSESSABLE (a grade verdict) as though they were codes (codex r1b F2). None is
 * a domain code; all three are excluded, and both formatter tests now assert that
 * each of them is REFUSED.
 *
 * Per-code citations: logs/diag-bounded/r2-03-domain-code-citations.log.
 *
 * Over-inclusive within that scope, deliberately and in the safe direction: a
 * declared code that never arrives is inert, because a hit returns this list's own
 * literal. Membership is evidence of a code DECLARED at that file and line, not
 * proof that it propagates to a formatter — callSynthesisRole (apps/runner/src/
 * index.ts:1313-1321) deliberately replaces both provider codes with other typed
 * codes on its own path, and cooldown handling consumes some transport failures.
 * The expected membership is generated from those citations and committed in
 * tests/unit/api-operational-error.test.ts; both formatter tests compare this map
 * against it in BOTH directions, so a wrong member and a missing member each turn
 * a test red.
 */
const KNOWN_DOMAIN_CODES: readonly string[] = Object.freeze([
  "ABSENT_SIGNAL_HAS_FRESHNESS",
  "ADAPTIVE_STOPPING_CONTROLS_INVALID",
  "ADAPTIVE_STOPPING_CONTROLS_PROVENANCE_MISSING",
  "ADAPTIVE_STOPPING_CONTROLS_UNRESOLVED",
  "ADAPTIVE_STOPPING_UNRESOLVED",
  "ALGORITHM_REGISTER_ROWS_INVALID",
  "AMENDED_QUERY_REQUIRED",
  "AMENDMENT_REASON_REQUIRED",
  "ANSWER_INDEX_PAGE_INVALID",
  "ANSWER_MEMORY_OBSERVATION_FAILED",
  "ANSWER_PERSIST_FAILED",
  "ARROW_ENDPOINT_ABSENT",
  "ATTEMPT_ACCESS_DEPTH_MISSING",
  "AUTH_POLICY_INVALID",
  "AUTH_POLICY_UNRESOLVED",
  "BAND_CEILING_BAND_UNKNOWN",
  "BAND_CEILING_BASIS_INVALID",
  "BAND_CEILING_BASIS_MISMATCH",
  "BAND_CEILING_CUT_EMPTY",
  "BAND_CEILING_CUT_INVALID",
  "BAND_CEILING_DECISION_INVALID",
  "BAND_CEILING_FLOOR_BAND_INVALID",
  "BAND_CEILING_FLOOR_UNDESCRIBED",
  "BAND_CEILING_LABELS_INVALID",
  "BAND_CEILING_LABEL_INVALID",
  "BAND_CEILING_LABEL_UNKNOWN",
  "BAND_CEILING_LIFT_PATH_INVALID",
  "BAND_CEILING_ROW_INVALID",
  "BAND_CEILING_SOURCE_INVALID",
  "BAND_CEILING_VERSION_INVALID",
  "BAND_LABEL_INVALID",
  "BAND_LABEL_UNKNOWN",
  "BAND_ORDER_INVALID",
  "BLANK_QUERY_REFUSED",
  "BLOCKED_TERMINAL_RETIRED",
  "BRANCH_FREEZE_EPSILON_PROVENANCE_MISSING",
  "BUDGET_SKIP_AFFECTED_NODES_REQUIRED",
  "CALIBRATION_STRATEGY_INVALID",
  "CALL_BUDGET_EXHAUSTED",
  "CATCH_UP_ANSWER_NOT_FOUND",
  "CATCH_UP_DISCLOSURE_MISMATCH",
  "CATCH_UP_SOURCE_VERSION_CHANGED",
  "CATEGORICAL_SPAWN_CHILD_MISSING",
  "CLAIM_TYPE_COMPOSITION_MAP_INVALID",
  "CLAIM_TYPE_COMPOSITION_MAP_PROVENANCE_MISSING",
  "CLAIM_TYPE_COMPOSITION_MAP_UNRESOLVED",
  "COMPLETENESS_GATE_FAILED",
  "COMPOSITION_BUDGET_UNRESOLVED",
  "COMPOSITION_CONTRACT_ERROR",
  "COMPOSITION_UNRESOLVED",
  "CONDITION_MARK_AFFECTED_NODES_REQUIRED",
  "CONDITION_MARK_RECORD_REQUIRED",
  "CONDITION_MARK_RECORD_WITHOUT_MARK",
  "CONDITION_MARK_REVIEW_REASON_UNTRUE",
  "CONDITION_MARK_TRANSPORT_REASON_UNTRUE",
  "CONFIGURED_PROVIDER_SET_INVALID",
  "CONFIGURED_PROVIDER_SET_UNRESOLVED",
  "CONSUMER_AUTHORIZATION_FAILED",
  "CONSUMER_CONTENT_REFUSED",
  "CONSUMER_PROVIDER_FAILED",
  "CONSUMER_PROVIDER_TIMED_OUT",
  "CONSUMER_PUBLIC_CIPHER_UNAVAILABLE",
  "CONSUMER_PUBLIC_SAMPLE_UNAVAILABLE",
  "CONTENT_CIPHER_UNAVAILABLE",
  "CONTENT_LEASE_SCOPE_CHANGED",
  "CONTENT_LEASE_SCOPE_EXPANSION_FORBIDDEN",
  "CONVERGENCE_CONTROLS_INVALID",
  "CONVERGENCE_CONTROLS_PROVENANCE_MISSING",
  "CONVERGENCE_CONTROLS_UNRESOLVED",
  "CRITERION_ID_DUPLICATE",
  "CRITERION_ID_INVALID",
  "CRITERION_LABEL_INVALID",
  "CRITIC_UNAVAILABLE_BAND_CAP_UNRESOLVED",
  "CRITIQUE_CONTEXT_NOT_ISOLATED",
  "DATABASE_POOL_FAILED",
  "DEBATE_EXPANSION_PARENT_MISSING",
  "DEBATE_MAKER_UNRESOLVED",
  "DEBATE_ROOT_MISSING",
  "DECISION_IDEMPOTENCY_CONFLICT",
  "DECISION_IDENTITY_UNSERIALIZABLE",
  "DECISION_SPAWN_COUNT_INVALID",
  "DEEPENING_IDENTITY_MISSING",
  "DEEPENING_ROUND_INVALID",
  "DEPLOYMENT_REGISTER_UNAVAILABLE",
  "DERIVED_STANDING_RECORD_INVALID",
  "DIFFERENT_MAKER_REVIEWER_UNAVAILABLE",
  "DIGEST_NODE_IDS_NOT_UNIQUE",
  "DIGEST_NODE_SET_EMPTY",
  "DIGEST_SERVED_ROOT_ABSENT",
  "DISPUTED_RESOLUTION_REQUIRES_HUMAN",
  "DISTINCT_CERTIFICATION_CAPTURES_REQUIRED",
  "DUPLICATE_SNAPSHOT_NODE",
  "EDGE_BEARING_OUT_OF_RANGE",
  "EDGE_IDENTITY_CONFLICT",
  "EDGE_INTEGRITY_ERROR",
  "EDGE_MEASURED_MAGNITUDE_MISSING",
  "EDGE_MEASUREMENT_REFUSED",
  "EDGE_TARGET_MISSING",
  "EMPIRICAL_FINDINGS_MISSING",
  "EMPIRICAL_SETTLEMENT_MISSING",
  "EMPTY_DECISION_REASON",
  "EMPTY_EVENT_STREAM",
  "EMPTY_OVERLAY_OWNER",
  "EMPTY_PROPAGATION",
  "ENVELOPE_EXHAUSTED_WITHOUT_VERIFIED_COMPONENTS",
  "ENVELOPE_FORMULA_INPUTS_INVALID",
  "ENVELOPE_FORMULA_INPUTS_PROVENANCE_MISSING",
  "ENVELOPE_FORMULA_INPUTS_UNRESOLVED",
  "ENVELOPE_TERMINAL_OVER_SERVED_STATEMENT",
  "ENVELOPE_VERIFIED_NODE_SET_EMPTY",
  "EVALUATOR_ADDON_OUTPUT_INVALID",
  "EVALUATOR_ADDON_POLICY_INVALID",
  "EVALUATOR_ADDON_RUN_ID_INVALID",
  "EVALUATOR_CATALOG_UNAVAILABLE",
  "EVALUATOR_CONSUMER_MODEL_NOT_ENUMERATED",
  "EVALUATOR_CONTRACT_ERROR",
  "EVALUATOR_DOMAIN_ASSIGNMENT_ADMISSION_MISMATCH",
  "EVALUATOR_DOMAIN_ID_INVALID",
  "EVALUATOR_DOMAIN_MODEL_ID_INVALID",
  "EVALUATOR_DOMAIN_MODEL_VERSION_INVALID",
  "EVALUATOR_DOMAIN_PROPOSAL_ARTIFACT_MISMATCH",
  "EVALUATOR_DOMAIN_PROVENANCE_INVALID",
  "EVALUATOR_DOMAIN_PROVIDER_INVALID",
  "EVALUATOR_DOMAIN_REFUSAL_REASON_INVALID",
  "EVALUATOR_DOMAIN_RUN_ID_INVALID",
  "EVALUATOR_GROWN_DOMAIN_PROVENANCE_REQUIRED",
  "EVALUATOR_HARVEST_RUN_ID_INVALID",
  "EVALUATOR_MAKER_PANEL_COLLISION",
  "EVALUATOR_OBJECTION_MISSING",
  "EVALUATOR_PROFILE_DERIVATION_CONFLICT",
  "EVALUATOR_PROFILE_STRATEGY_ROW_KEY_INVALID",
  "EVALUATOR_PROFILE_STRATEGY_SOURCE_REF_INVALID",
  "EVALUATOR_PROVIDER_ENDPOINT_FORBIDDEN",
  "EVALUATOR_PROVIDER_FAMILY_INVALID",
  "EVALUATOR_PROVIDER_FAMILY_UNRESOLVED",
  "EVALUATOR_PROVIDER_PANEL_COLLISION",
  "EVALUATOR_PROVIDER_SCOPE_UNAUTHORIZED",
  "EVALUATOR_RANK_DERIVATION_CONFLICT",
  "EVALUATOR_TAGGER_ARTIFACT_REQUIRED",
  "EVALUATOR_TAGGER_MAKER_MISMATCH",
  "EVALUATOR_TAGGER_OUTPUT_INVALID",
  "EVALUATOR_TAG_EVENT_REASON_INVALID",
  "EVALUATOR_TAG_INPUT_HASH_INVALID",
  "EVALUATOR_TAG_PROVENANCE_INVALID",
  "EVALUATOR_TAG_QUESTION_INVALID",
  "EVALUATOR_TAG_RUN_ID_INVALID",
  "EVALUATOR_VERDICT_INCOHERENT",
  "EVIDENCE_ITEM_REF_REQUIRED",
  "EVIDENCE_REPLAY_HANDLE_REQUIRED",
  "EXPLORATION_FLOOR_INVALID",
  "EXTERNAL_RESOLVER_REQUIRED",
  "FIXED_SINGLE_ROOT_SERVE_VIOLATED",
  "FRESHNESS_BOUND_INVALID",
  "FRESHNESS_REGISTER_ROW_REQUIRED",
  "FRESHNESS_SOURCE_MISSING",
  "GRAPH_CHILD_STRUCTURE_INVALID",
  "GRAPH_CYCLE_DETECTED",
  "GRAPH_CYCLE_WRITE_REJECTED",
  "GRAPH_PARENT_NOT_FOUND",
  "GRAPH_ROOT_STRUCTURE_INVALID",
  "GRAPH_RUN_MISMATCH",
  "HIDDEN_CONDITION_MARK_RECORD_INVALID",
  "HONESTY_FIELD_MISSING",
  "INCONSISTENT_PRE_COMPOSITION_EVIDENCE",
  "INDEPENDENT_BUDGET_MARKS_CONFLATED",
  "INSTRUMENT_REF_REQUIRED",
  "INVALID_COMPOSITION_ATTEMPT",
  "JUDGEMENT_POLICY_UNRESOLVED",
  "JUDGE_PARSE_FAILURE",
  "JUDGE_SCHEMA_FAILURE",
  "LABEL_BASIS_DISCLOSURE_MISMATCH",
  "LEVERAGE_ROOT_SCOPE_EMPTY",
  "LEVERAGE_ROUND_INCOMPLETE",
  "LEVERAGE_SUBTREE_ROOT_UNRECORDED",
  "LIFT_TARGET_ABSENT",
  "LIVENESS_AFFECTED_EMPTY",
  "LIVENESS_NODE_NOT_FOUND",
  "LIVENESS_PARENT_CYCLE",
  "LIVENESS_POLICY_INVALID",
  "LIVENESS_POLICY_PROVENANCE_MISSING",
  "LIVENESS_POLICY_UNRESOLVED",
  "LIVENESS_QUERY_INVALID",
  "LIVENESS_THRESHOLD_INVALID",
  "LIVENESS_TIME_INVALID",
  "MAKER_INVENTORY_UNSATISFIED",
  "MAKER_POLICY_INVALID",
  "MAKER_POSITION_UNAVAILABLE",
  "MALFORMED_ARROW_ORDER",
  "MEMORY_ASKER_SCOPE_MISMATCH",
  "MEMORY_DIFFERENCE_REQUIRED",
  "MEMORY_DISCLOSURE_GATE_FAILED",
  "MEMORY_MATCH_FACT_REQUIRED",
  "MEMORY_PRIOR_ANSWER_MISSING",
  "MEMORY_PULL_CAP_EXCEEDED",
  "MEMORY_PULL_POLICY_INVALID",
  "MEMORY_PULL_UNPINNED",
  "MEMORY_QUESTION_EMPTY",
  "MEMORY_QUESTION_NOT_CANONICAL",
  "MEMORY_RUN_NOT_FOUND",
  "MEMORY_RUN_NOT_OWNED",
  "MISSING_COMPOSITION_ARTIFACT",
  "MODEL_ASSERTED_EVIDENCE_SCORE_REFUSED",
  "MODEL_FAMILY_REQUIRED",
  "MULTI_MAKER_PLAN_REQUIRES_MULTIPLE_MAKERS",
  "NEGATIVE_CAPTURE_REQUIRED",
  "NODE_ID_REQUIRED",
  "NODE_REVIEW_PARSE_FAILURE",
  "NODE_REVIEW_SCHEMA_FAILURE",
  "NODE_REVIEW_UNAVAILABLE",
  "NONSPAWNING_DECISION_HAS_CHILD",
  "NO_ELIGIBLE_MODEL",
  "NO_SERVABLE_MAKER_POSITION_AFTER_REVIEW",
  "NO_USABLE_JUDGEMENTS",
  "OFF_PLAN_QUERY_REFUSED",
  "OFF_SUBJECT_SHARE_REQUIRED",
  "OPERATOR_RESOLUTION_MISSING",
  "OPPOSITION_QUERY_REQUIRED",
  "OPTION_CRITERION_UNRESOLVED",
  "OPTION_ID_DUPLICATE",
  "OPTION_ID_INVALID",
  "OPTION_LABEL_INVALID",
  "ORG_POLICY_PROFILE_INVALID",
  "OVERLAY_DETACHMENT_VIOLATION",
  "OVERLAY_RUN_MISMATCH",
  "OWNER_ASK_ADMISSION_SCOPE_EXPANSION_FORBIDDEN",
  "OWNER_PRIVATE_HISTORY_SCAN_SATURATED",
  "PANEL_DISCOVERY_POLICY_UNRESOLVED",
  "PANEL_WEIGHTING_CONTROLS_INVALID",
  "PANEL_WEIGHTING_CONTROLS_PROVENANCE_MISSING",
  "PANEL_WEIGHTING_CONTROLS_UNRESOLVED",
  "PANEL_WEIGHTING_UNRESOLVED",
  "PARTIAL_SCORE_RUN_IDENTITY",
  "POSITIVE_CAPTURE_REQUIRED",
  "PRESENT_SIGNAL_FRESHNESS_UNKNOWN",
  "PRIVATE_CONTENT_ERASED",
  "PRODUCER_GRADING_FORBIDDEN",
  "PRODUCING_RUN_REQUIRED",
  "PRODUCT_ROLE_POLICY_DUPLICATE",
  "PRODUCT_ROLE_POLICY_INVALID",
  "PRODUCT_ROLE_POLICY_PROVENANCE_MISSING",
  "PRODUCT_ROLE_POLICY_REGISTER_COUNT_MISMATCH",
  "PRODUCT_ROLE_POLICY_REGISTER_UNSEALED",
  "PRODUCT_ROLE_POLICY_UNRESOLVED",
  "PROPAGATION_MAGNITUDE_INVALID",
  "PROPAGATION_RECEIPT_INVALID",
  "PROPAGATION_RECEIPT_MISSING",
  "PROPAGATION_STRENGTH_INVALID",
  "PROPER_SCORE_INVALID",
  "PROTECTED_CITATION_COMPARE_SKIPPED",
  "PROVIDER_CALL_FAILED",
  "PROVIDER_CALL_INSIDE_TRANSACTION",
  "PROVIDER_CONTENT_UNACCEPTED",
  "PROVIDER_RUN_REQUIRED",
  "PUBLICATION_LEASE_SCOPE_EXPANSION_FORBIDDEN",
  "QUERY_SET_REF_REQUIRED",
  "RAW_ARTIFACT_RUN_REQUIRED",
  "RECONSTRUCTION_INPUT_MISSING",
  "RECOVERY_POLICY_DUPLICATE",
  "RECOVERY_POLICY_INVALID",
  "RECOVERY_POLICY_PROVENANCE_MISSING",
  "RECOVERY_POLICY_REGISTER_COUNT_MISMATCH",
  "RECOVERY_POLICY_REGISTER_UNSEALED",
  "RECOVERY_POLICY_UNRESOLVED",
  "REGENERATION_POLICY_MISMATCH",
  "REGENERATION_POLICY_UNRECORDED",
  "REGENERATION_REJECTION_EVIDENCE_MISSING",
  "RETIRED_SERVED_ROOT_RULE_NOT_WRITABLE",
  "REVISION_TRIGGER_NOT_FOUND",
  "RISK_TIER_POLICY_INVALID",
  "RISK_TIER_POLICY_PROVENANCE_MISSING",
  "RISK_TIER_POLICY_UNRESOLVED",
  "RIVAL_CARVER_UNAVAILABLE",
  "RUNNER_DISCLOSURE_PIPELINE_FAILED",
  "RUNNER_FAILURE_STATE_NOT_RECORDED",
  "RUN_CONTENT_ENCRYPTION_REQUIRED",
  "RUN_CONTENT_ROLLBACK_INCOMPLETE",
  "RUN_COST_ENVELOPE_EXHAUSTED",
  "RUN_COST_ENVELOPE_UNRESOLVED",
  "RUN_DEPTH_PARAMS_INVALID",
  "RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM",
  "RUN_ENVELOPE_BASIS_INVALID",
  "RUN_FROZEN_HEAD_READ_FAILED",
  "RUN_HOLD_RECORDER_UNRESOLVED",
  "RUN_LEGACY_ASKER_INVALID",
  "RUN_MAKER_COUNT_INVALID",
  "RUN_NOT_FOUND",
  "RUN_OWNER_INVALID",
  "RUN_OWNER_RAW_ID_FORBIDDEN",
  "RUN_OWNER_REF_INVALID",
  "RUN_PRINCIPAL_SESSION_MISMATCH",
  "SCALAR_DECISION_CANNOT_SPAWN",
  "SCORECARD_INTERVAL_INVALID",
  "SCORECARD_TASK_CLASS_AMBIGUOUS",
  "SCORECARD_TASK_CLASS_MAP_INVALID",
  "SCORECARD_TASK_CLASS_UNRESOLVED",
  "SCORED_REJECTED_EVIDENCE_REFUSED",
  "SCORING_OPERATOR_UNRESOLVED",
  "SELF_ROUTING_FORBIDDEN",
  "SENSITIVITY_FEEDBACK_ORDER_INVALID",
  "SEQUENCE_ALLOCATION_FAILED",
  "SERVED_NUMBER_NOT_FOUND",
  "SERVED_ROOT_JUDGEMENT_UNRESOLVED",
  "SERVED_ROOT_STRENGTH_UNRESOLVED",
  "SERVED_ROOT_UNRESOLVED",
  "SERVED_STATEMENT_CITES_NO_VERIFIED_NODE",
  "SERVE_GATE_CHAIN_FAILED",
  "SERVE_ITEMS_NOT_A_LIST",
  "SERVE_ITEM_INVALID",
  "SERVE_ITEM_OUT_OF_NODE_SET",
  "SERVE_LEDGER_APPEND_FAILED",
  "SERVE_NODE_IDS_NOT_UNIQUE",
  "SERVE_NODE_SET_EMPTY",
  "SERVE_OUTPUT_NOT_FROM_LEDGER",
  "SERVE_POLICY_UNRESOLVED",
  "SERVE_STATUS_UNKNOWN",
  "SESSION_POLICY_INVALID",
  "SESSION_POLICY_UNRESOLVED",
  "SETTLEMENT_FIELD_REQUIRED",
  "SETTLEMENT_IDENTITY_INVALID",
  "SETTLEMENT_NUMBER_INVALID",
  "SETTLEMENT_PROVENANCE_INVALID",
  "SETTLEMENT_RACE_WITHOUT_WINNER",
  "SETTLEMENT_READ_BACK_FAILED",
  "SHADOW_SUBJECT_REQUIRED",
  "SHADOW_UNLOCK_REQUIRED",
  "SOURCE_REF_REQUIRED",
  "SPAWN_SLOT_IDENTITY_CONFLICT",
  "STOPPING_DEPTH_CEILING_INVALID",
  "STOPPING_EXPECTED_ROOT_COUNT_INVALID",
  "STOPPING_MEASURED_EDGE_COUNT_INVALID",
  "STOPPING_PREVIOUS_ROUND_MISSING",
  "STOPPING_ROOT_SCOPE_EMPTY",
  "STOPPING_ROOT_SCOPE_MAKER_COUNT_INVALID",
  "STOPPING_ROOT_SCOPE_OVERFULL",
  "STOPPING_ROOT_STRENGTH_UNRESOLVED",
  "STOPPING_ROUND_COUNT_INVALID",
  "STORED_RESULT_MISSING",
  "STRENGTH_LINEAGE_UNRESOLVED",
  "STRUCTURAL_CEILING_BRANCHINGFACTOR_INVALID",
  "STRUCTURAL_CEILING_COMPOSITIONSEGMENTCAP_INVALID",
  "STRUCTURAL_CEILING_COMPOSITION_SHAPE_INCOHERENT",
  "STRUCTURAL_CEILING_DEPTH_ABOVE_SEALED_MAXIMUM",
  "STRUCTURAL_CEILING_DEPTH_INVALID",
  "STRUCTURAL_CEILING_EVALUATORMAXROUNDS_INVALID",
  "STRUCTURAL_CEILING_FINALRETRYATTEMPTS_INVALID",
  "STRUCTURAL_CEILING_FIXEDORGANSPERCOMPOSITION_INVALID",
  "STRUCTURAL_CEILING_INPUTS_UNRESOLVED",
  "STRUCTURAL_CEILING_JUDGEMAXATTEMPTS_INVALID",
  "STRUCTURAL_CEILING_MAXCOOLDOWNHOLDSPERRUN_INVALID",
  "STRUCTURAL_CEILING_MAXDEPTH_INVALID",
  "STRUCTURAL_CEILING_MAXRECOMPOSE_INVALID",
  "STRUCTURAL_CEILING_ORGANMAXATTEMPTS_INVALID",
  "STRUCTURAL_CEILING_PANELSIZE_INVALID",
  "STRUCTURAL_CEILING_REVIEWERCALLSPERNODE_INVALID",
  "STRUCTURAL_CEILING_SYNTHESIS_ROUNDS_INCOHERENT",
  "STRUCTURAL_CEILING_SYNTHESIZERMAXROUNDS_INVALID",
  "STRUCTURAL_CEILING_TREE_INVALID",
  "SUPERSEDED_ANSWER_IDENTITY_MISMATCH",
  "SUPERSEDED_ANSWER_NOT_FOUND",
  "SYNTHESIS_CANDIDATE_REF_MISSING",
  "SYNTHESIS_LOOP_PRODUCED_NO_CANDIDATE",
  "SYNTHESIS_NO_ARTIFACT",
  "SYNTHESIS_REQUEST_NOT_FRESH_CONTEXT",
  "SYNTHESIS_ROLE_CONTROLS_INVALID",
  "SYNTHESIS_ROLE_CONTROLS_PROVENANCE_MISSING",
  "SYNTHESIS_ROLE_CONTROLS_UNRESOLVED",
  "SYNTHESIS_ROLE_PROVIDER_ABSENT_AT_CLAIM",
  "SYNTHESIS_ROLE_PROVIDER_UNRESOLVED",
  "SYNTHESIS_ROUND_ARTIFACT_UNRESOLVED",
  "SYNTHESIS_TRANSPORT_DEATH",
  "TERMINAL_ACTIVATION_DRAIN_FAILED",
  "TERMINAL_ACTIVATION_EVALUATION_FAILED",
  "TERMINAL_ACTIVATION_EVALUATOR_UNRESOLVED",
  "TERMINAL_ACTIVATION_UNRESOLVED",
  "TERMINAL_FACT_READ_FAILED",
  "TERMINAL_ROW_NOT_EVALUATABLE",
  "TERMINAL_STATE_READ_FAILED",
  "TIER_PROVENANCE_MISSING",
  "UNDERCUT_TARGET_INVALID",
  "UNSERVED_MAKER_POSITION_UNRESOLVED",
  "UNSUPPRESSED_BAND_REQUIRED",
  "VALUE_CRITERIA_EMPTY",
  "VALUE_OPTIONS_INSUFFICIENT",
  "VALUE_PHASE_NOT_READY",
  "VERDICT_LABEL_BASIS_UNRESOLVED",
  "VERDICT_LABEL_CONTROLS_INVALID",
  "VERDICT_LABEL_CONTROLS_PROVENANCE_MISSING",
  "VERDICT_LABEL_CONTROLS_UNRESOLVED",
  "VERDICT_LABEL_INPUT_INVALID",
  "WAIT_RESOLUTION_INCOMPLETE",
  "WAIT_RESOLUTION_NOT_CURRENT",
  "WAY_OF_KNOWING_DOWNGRADE_NODE_UNRESOLVED",
  "WEIGHT_CRITERION_INVALID",
  "WEIGHT_VALUE_INVALID",
  "WEIGHT_VECTOR_CRITERIA_MISMATCH",
  "WEIGHT_VECTOR_EMPTY",
  "WEIGHT_VECTOR_ZERO",
  "WORK_ITEM_WITHOUT_RUN"
]);

const KNOWN_DOMAIN_DIAGNOSTICS: ReadonlyMap<string, string> = new Map(
  KNOWN_DOMAIN_CODES.map((code) => [code, code] as const)
);

/**
 * Failure constants that can arrive as the `message` of a PLAIN error (not a
 * TypedDomainError, which is answered by its own `code` above) on the paths these
 * two formatters see. Two producer categories, both enumerated mechanically at
 * commit d5b4f7f568aceec55a9cfca72b62473e7ee26c19 and cited per constant in
 * logs/diag-bounded/r0-03-allow-list-citations.log (the saved artifact name):
 *
 *   TypeScript  grep -rEn 'new (Error|TypeError|RangeError|SyntaxError)("[A-Z][A-Z0-9_]{1,63}"'
 *               --include='*.ts' packages apps/api/src | grep -v /tests/
 *   PostgreSQL  grep -rnoE "MESSAGE *= *'[A-Z][A-Z0-9_]{1,63}'" migrations/*.sql
 *               (a RAISE EXCEPTION reaches the driver as DatabaseError.message)
 *
 * Scope of that sweep, and what it deliberately leaves out: apps/ui,
 * apps/evaluator-worker, apps/replay and apps/scheduler are separate processes
 * that neither formatter's module imports; every apps/runner/src/dev-*.ts and
 * main.ts constant is excluded because apps/runner/src/index.ts imports none of
 * those modules, so none of them is reachable from executeWorkItem.
 *
 * WHAT MEMBERSHIP MEANS: the sweep is evidence that the constant is a LITERAL
 * MESSAGE DECLARED at that file and line. It is NOT evidence that the constant
 * propagates to a formatter, and several demonstrably do not — codex r1 traced
 * PROVIDER_PROBE_RESPONSE_INVALID (consumed by the catch at provider-probe.ts:115)
 * and PSEUDONYM_ALLOCATION_EXHAUSTED (replaced by AUTH_REGISTRATION_FAILED at
 * registration.ts:1437). The list is an over-approximation, on purpose and in the
 * safe direction: admitting a constant that never arrives costs nothing, because
 * the value returned on a hit is this block's own literal. Under-inclusion costs
 * only diagnostic detail — an unlisted constant degrades to the error-class
 * category or to the fallback, which is safe and visible. Both copies are
 * identical, so a constant that can only reach one formatter is inert in the other.
 */
const KNOWN_FAILURE_CONSTANTS: readonly string[] = Object.freeze([
  "ACCOUNT_CREATE_OUTCOME_MISSING",
  "ACCOUNT_CREATE_RECEIPT_INVALID",
  "ACCOUNT_DUPLICATE_ID_MISSING",
  "ACCOUNT_ERASURE_PREPARED",
  "ACCOUNT_NOTIFICATION_CHANNEL_REQUIRED",
  "ACCOUNT_NOT_ACTIVE",
  "ACCOUNT_RECOVERY_BINDING_IMMUTABLE",
  "ADDON_GRADING_LINEAGE_UNRESOLVED",
  "ARGON2_POOL_CAPACITY_INVALID",
  "ARGON2_POOL_WORKER_COUNT_INVALID",
  "ASK_ADMISSION_DATABASE_POOLS_MUST_BE_SEPARATE",
  "ATTEMPT_LEDGER_CONSUMPTION_INVALID",
  "ATTEMPT_LEDGER_PENDING_INVALID",
  "AUDIT_ATTEMPT_NOT_CONSUMED",
  "AUDIT_ATTEMPT_REQUIRED",
  "AUDIT_CANONICAL_VALUE_INVALID",
  "AUDIT_CHAIN_INVALID",
  "AUDIT_CONTEXT_DIGEST_INVALID",
  "AUDIT_EVENT_INVALID",
  "AUDIT_EVENT_SEMANTICS_INVALID",
  "AUDIT_EVENT_TARGET_INVALID",
  "AUDIT_EVENT_TYPE_RESERVED",
  "AUDIT_OPERATION_CAPABILITY_REQUIRED",
  "AUDIT_SUCCESS_REQUIRES_DOMAIN_CAPABILITY",
  "AUDIT_TOKEN_MUST_BE_RANDOM_UUID_V4",
  "AUTHORIZATION_DATABASE_URL_MUST_BE_SEPARATE",
  "AUTHORIZATION_DATABASE_URL_REQUIRED",
  "AUTH_RATE_LIMIT_POLICY_INVALID",
  "AUTH_RISK_SIGNAL_CONTEXT_INVALID",
  "AUTH_RISK_SIGNAL_CROSS_ACCOUNT",
  "AUTH_RISK_SIGNAL_IMMUTABLE",
  "AUTH_RISK_SIGNAL_KIND_INVALID",
  "AUTH_RISK_SIGNAL_POISONED",
  "AUTH_RISK_SIGNAL_PURGE_LIMIT_INVALID",
  "AUTH_RISK_SIGNAL_PURGE_OUTCOME_INVALID",
  "AUTH_RISK_SIGNAL_SCAN_SATURATED",
  "AUTH_RISK_SIGNAL_SCOPE_AMBIGUOUS",
  "AUTH_RISK_SIGNAL_SCOPE_UNRESOLVED",
  "BLIND_SAMPLE_REASONS_INVALID",
  "CAPTURE_QUEUE_CAPACITY_INVALID",
  "CONFIGURED_PROVIDER_DUPLICATE",
  "CONSUMER_OUTPUT_WRITE_FAILED",
  "CONSUMER_PROVIDER_ISOLATION_FAILED",
  "CONTENT_ATTESTATION_INVALID",
  "CONTENT_ATTESTATION_REQUIRED",
  "CONTENT_ATTESTATION_RUN_UNRESOLVED",
  "CONTENT_ATTESTATION_SCOPE_UNRESOLVED",
  "CONTENT_ATTESTATION_SECRET_UNRESOLVED",
  "CONTENT_ATTESTATION_STATE_INVALID",
  "CONTENT_BLIND_INDEX_CARRIER_UNDECLARED",
  "CONTENT_BLIND_INDEX_STATE_INVALID",
  "CONTENT_BLIND_INDEX_V1_KEY_MUST_BE_RETIRED",
  "CONTENT_BLIND_INDEX_V1_ROWS_FORBIDDEN",
  "CONTENT_CIPHER_ALREADY_CONFIGURED",
  "CONTENT_DERIVED_LOCATOR_CARRIER_UNDECLARED",
  "CONTENT_DERIVED_LOCATOR_V1_ROWS_FORBIDDEN",
  "CONTENT_ENCRYPTION_KEY_PATHS_REQUIRED",
  "CONTENT_LEASE_RUN_REQUIRED",
  "CONTENT_LEASE_UNLOCK_FAILED",
  "CONTENT_LOCATOR_RUN_UNRESOLVED",
  "CONTENT_PROVISION_DATABASE_ROLE_ATTESTATION_FAILED",
  "CONTENT_PROVISION_DATABASE_ROLE_MUST_BE_ISOLATED",
  "CONTENT_PROVISION_DATABASE_URL_MUST_BE_SEPARATE",
  "CONVERGENCE_EPSILON_INVALID",
  "ENCRYPTED_RUN_OWNER_INVALID",
  "ENCRYPTED_RUN_OWNER_TRANSFER_REQUIRES_REWRAP",
  "ERASURE_DATABASE_ROLE_ATTESTATION_FAILED",
  "ERASURE_DATABASE_ROLE_MUST_BE_ISOLATED",
  "ERASURE_DATABASE_URL_MUST_BE_SEPARATE",
  "ERASURE_NOTIFICATION_BINDING_IMMUTABLE",
  "ERASURE_NOTIFICATION_CHANNEL_INVALID",
  "ERASURE_NOTIFICATION_ERROR_CODE_INVALID",
  "ERASURE_NOTIFICATION_LEASE_UNLOCK_FAILED",
  "ERASURE_NOTIFICATION_REQUEST_INVALID",
  "EVALUATOR_ADDON_ADVISORY_UNLOCK_FAILED",
  "EVALUATOR_ADDON_OBSERVATION_CONFLICT",
  "EVALUATOR_ADDON_RUN_ORDINAL_INVALID",
  "EVALUATOR_ADDON_SAMPLE_INTERVAL_INVALID",
  "EVALUATOR_ADDON_TIME_INVALID",
  "EVALUATOR_CONSUMER_SELECTION_INVALID",
  "EVALUATOR_CONSUMER_SELECTION_TIME_INVALID",
  "EVALUATOR_DEV_MENU_DATABASE_URL_REQUIRED",
  "EVALUATOR_DEV_MENU_PRODUCTION_FORBIDDEN",
  "EVALUATOR_DEV_MENU_REGISTER_VERSION_REQUIRED",
  "EVALUATOR_HARVEST_TIME_INVALID",
  "EVALUATOR_JUDGE_RANK_INVALID",
  "EVALUATOR_JUDGE_SEAT_COUNT_INVALID",
  "EVALUATOR_LEDGER_SCOPE_UNAUTHORIZED",
  "EVALUATOR_PRIVATE_CONSUMER_OUTPUT_FORBIDDEN",
  "EVALUATOR_PROFILE_DERIVATION_VERSION_INVALID",
  "EVALUATOR_PROFILE_TIME_INVALID",
  "EVALUATOR_PUBLIC_AGGREGATE_OUTPUT_REQUIRED",
  "EVALUATOR_REGISTER_VERSION_INVALID",
  "EVALUATOR_SEAT_COUNT_INVALID",
  "EVALUATOR_SEAT_SHARE_CANDIDATE_DUPLICATE",
  "EVALUATOR_SEAT_SHARE_DEPTH_INVALID",
  "EVALUATOR_SEAT_SHARE_FORMULA_VERSION_INVALID",
  "EVALUATOR_SEAT_SHARE_POLICY_RECEIPT_INVALID",
  "EVALUATOR_SEAT_SHARE_PREMIUM_DEPTH_INVALID",
  "EVALUATOR_SEAT_SHARE_PROWESS_RANK_INVALID",
  "EVALUATOR_SEAT_SHARE_RELATIVE_COST_INVALID",
  "EVALUATOR_SEAT_SHARE_WEIGHT_INVALID",
  "EVALUATOR_SHADOW_DECISION_WRITE_FAILED",
  "IDENTITY_CHANNEL_UNSUPPORTED",
  "IDENTITY_CHILD_PARENT_IMMUTABLE",
  "IDENTITY_OWNER_REF_IMMUTABLE",
  "IDENTITY_PSEUDONYM_IMMUTABLE",
  "IDENTITY_USER_NOT_FOUND",
  "LEGACY_RUN_CLAIM_INVALID",
  "LEGACY_RUN_CLAIM_RESULT_INVALID",
  "LOGIN_RISK_SIGNAL_SCOPE_UNRESOLVED",
  "MAIL_OPERATOR_CODE_INVALID",
  "MFA_FAILURE_REASON_INVALID",
  "MFA_POLICY_UNRESOLVED",
  "MFA_RECOVERY_CODE_SET_INVALID",
  "MODEL_CALL_USAGE_EMPTY",
  "MODEL_CALL_USAGE_INVALID",
  "MODEL_CALL_USAGE_TOKEN_INVALID",
  "MODEL_CALL_USAGE_TOTAL_MISMATCH",
  "MODEL_CALL_USAGE_WRITE_FAILED",
  "OBS_CAPTURE_SELF_TEMPLATE_MISSING",
  "OWNED_RUN_LOCK_SCOPE_INVALID",
  "OWNER_ASK_ADMISSION_LEASE_UNLOCK_FAILED",
  "OWNER_REF_UNRESOLVED",
  "OWN_MAIL_CONFIGURATION_INVALID",
  "PASSKEY_CREDENTIAL_BINDING_IMMUTABLE",
  "PASSKEY_SIGNATURE_COUNTER_DECREASE",
  "PRIVATE_CONTENT_ERASED",
  "PRIVATE_CONTENT_OWNER_INACTIVE",
  "PRIVATE_ERASURE_AUDIT_BINDING_REQUIRED",
  "PRODUCER_GRADING_FORBIDDEN",
  "PROVIDER_DISCOVERY_TARGETS_INVALID",
  "PROVIDER_DISCOVERY_TARGETS_REQUIRED",
  "PROVIDER_DISCOVERY_TARGET_BASE_URL_INVALID",
  "PROVIDER_DISCOVERY_TARGET_DUPLICATE",
  "PROVIDER_DISCOVERY_TARGET_SET_MISMATCH",
  "PROVIDER_PROBE_FRESHNESS_INVALID",
  "PROVIDER_PROBE_INVALID",
  "PROVIDER_PROBE_RESPONSE_INVALID",
  "PROVIDER_PROBE_TIMEOUT_INVALID",
  "PROVIDER_PROBE_UNAVAILABLE",
  "PSEUDONYM_ALLOCATION_EXHAUSTED",
  "PUBLICATION_AUDIT_HEAD_CHANGED",
  "PUBLICATION_CLEANUP_DATABASE_ROLE_INVALID",
  "PUBLICATION_CLEANUP_DATABASE_URL_MUST_BE_SEPARATE",
  "PUBLICATION_CLEANUP_DATABASE_URL_REQUIRED",
  "PUBLICATION_DATABASE_ROLES_MUST_BE_SEPARATE",
  "PUBLICATION_DATABASE_ROLE_ATTESTATION_FAILED",
  "PUBLICATION_KEY_DOMAIN_MUST_BE_SEPARATE",
  "PUBLICATION_KEY_EXISTS",
  "PUBLICATION_KEY_PATHS_REQUIRED",
  "PUBLICATION_KEY_PROVISION_CLEANUP_PENDING",
  "PUBLICATION_KEY_PROVISION_INTENT_INCOMPLETE",
  "PUBLICATION_KEY_STORE_PATH_REQUIRED",
  "PUBLICATION_LEASE_REF_REQUIRED",
  "PUBLICATION_LEASE_UNLOCK_FAILED",
  "PUBLICATION_REF_ALLOCATION_FAILED",
  "PUBLICATION_REF_REPLAY",
  "PUBLICATION_REQUIRES_CONTENT_ENCRYPTION",
  "PUBLICATION_V2_AUDIT_BINDING_REQUIRED",
  "PUBLICATION_V2_REF_BINDING_REQUIRED",
  "PUBLIC_AGGREGATE_PROVIDER_CONFIGURATION_INVALID",
  "RATE_LIMIT_REFUSAL_AGGREGATE_INVALID",
  "RAW_ARTIFACT_RUN_REQUIRED",
  "RECOVERY_ENUMERATION_FLOOR_INVALID",
  "RECOVERY_PUBLIC_RESPONSE_POLICY_INVALID",
  "RECOVERY_RISK_SIGNAL_SCOPE_UNRESOLVED",
  "RECOVERY_START_CANDIDATE_AMBIGUOUS",
  "RECOVERY_START_INPUT_INVALID",
  "RECOVERY_START_OUTCOME_INVALID",
  "REDACTOR_RETURNED_UNBRANDED_ENVELOPE",
  "REGISTER_REQUIRED_ROW_VERSION_INVALID",
  "REGISTRATION_HASH_CANCELLED",
  "RELATIVE_COST_RUNTIME_CLASS_MISMATCH",
  "RELATIVE_COST_WINDOW_INVALID",
  "RELATIVE_COST_WINDOW_ORDER_INVALID",
  "RESEND_COOLDOWN_INVALID",
  "RESEND_RECEIPT_INVALID",
  "RUN_CONTENT_KEY_EXISTS",
  "RUN_CONTENT_KEY_OWNER_REF_INVALID",
  "RUN_CONTENT_KEY_RUN_ID_INVALID",
  "RUN_CONTENT_KEY_STORE_PATH_REQUIRED",
  "RUN_CONTENT_KEY_USER_ID_INVALID",
  "RUN_EXECUTION_REF_ALLOCATION_FAILED",
  "RUN_EXECUTION_REF_REQUIRED",
  "RUN_KEY_PROVISION_INTENT_INCOMPLETE",
  "RUN_LEGACY_ASKER_INVALID",
  "RUN_OWNERSHIP_OWNER_REF_NOT_ACTIVE",
  "RUN_OWNERSHIP_OWNER_REF_NOT_UUID_V4",
  "RUN_OWNERSHIP_PRINCIPAL_INVALID",
  "RUN_OWNERSHIP_RUN_NOT_FOUND",
  "RUN_OWNER_REF_INVALID",
  "S10_ENCRYPTED_RUN_OWNER_REWRAP_REQUIRED",
  "S10_IDENTITY_SESSION_REF_MIGRATION_REQUIRED",
  "S10_PUBLICATION_ACTOR_REF_MIGRATION_REQUIRED",
  "S10_WHATSAPP_CHANNEL_UNSUPPORTED",
  "S7_RAW_USER_ID_IN_IMMUTABLE_MEMORY",
  "S7_RAW_USER_ID_IN_IMMUTABLE_RUN",
  "SERVER_RUN_ENCRYPTION_INTENT_REQUIRED",
  "SESSION_BINDING_KEY_INVALID",
  "SESSION_CREDENTIAL_HASH_INVALID",
  "SETTLEMENT_WATCH_HANDLE_REQUIRED",
  "SPOOL_ENVELOPE_MAX_BYTES_INVALID",
  "SPOOL_ENVELOPE_TOO_LARGE",
  "SPOOL_FD_IDENTITY_CHANGED",
  "SPOOL_FD_INVALID",
  "SPOOL_REQUIRES_POST_REDACTION_ENVELOPE",
  "SPOOL_REQUIRES_PREPARED_POST_REDACTION_RECORD",
  "SPOOL_STREAM_POISONED",
  "SPOOL_WRITE_INCOMPLETE",
  "USER_DEK_STORE_PATH_REQUIRED",
  "USER_DEK_STORE_USER_ID_INVALID",
  "VERIFICATION_DELIVERY_OUTCOME_INVALID",
  "ZONE_FLUSH_INTERVAL_INVALID",
  "ZONE_FLUSH_JITTER_INVALID"
]);

/**
 * Keyed by `message`, valued by this block's own literal, so the string returned
 * on a hit is never the caught object's string even when the two are equal.
 */
const KNOWN_FAILURE_MESSAGES: ReadonlyMap<string, string> = new Map(
  KNOWN_FAILURE_CONSTANTS.map((constant) => [constant, constant] as const)
);

/**
 * Recognized Node/libuv system codes, keyed by `error.code`. A Node system
 * rejection is a plain `Error` whose class says nothing, so `code` is consulted
 * before `name`. Node's much larger `ERR_*` vocabulary is deliberately absent:
 * those arrive with a class that the class map below already answers.
 */
const DEPENDENCY_CODE_CATEGORIES: ReadonlyMap<string, string> = new Map([
  ["ENOENT", "DEPENDENCY_NODE_ENOENT"],
  ["EACCES", "DEPENDENCY_NODE_EACCES"],
  ["EPERM", "DEPENDENCY_NODE_EPERM"],
  ["EISDIR", "DEPENDENCY_NODE_EISDIR"],
  ["ENOTDIR", "DEPENDENCY_NODE_ENOTDIR"],
  ["EEXIST", "DEPENDENCY_NODE_EEXIST"],
  ["EMFILE", "DEPENDENCY_NODE_EMFILE"],
  ["ENFILE", "DEPENDENCY_NODE_ENFILE"],
  ["ENOSPC", "DEPENDENCY_NODE_ENOSPC"],
  ["ECONNREFUSED", "DEPENDENCY_NODE_ECONNREFUSED"],
  ["ECONNRESET", "DEPENDENCY_NODE_ECONNRESET"],
  ["ECONNABORTED", "DEPENDENCY_NODE_ECONNABORTED"],
  ["ETIMEDOUT", "DEPENDENCY_NODE_ETIMEDOUT"],
  ["ENOTFOUND", "DEPENDENCY_NODE_ENOTFOUND"],
  ["EPIPE", "DEPENDENCY_NODE_EPIPE"],
  ["EHOSTUNREACH", "DEPENDENCY_NODE_EHOSTUNREACH"],
  ["ENETUNREACH", "DEPENDENCY_NODE_ENETUNREACH"],
  ["EADDRINUSE", "DEPENDENCY_NODE_EADDRINUSE"],
  ["EAI_AGAIN", "DEPENDENCY_NODE_EAI_AGAIN"],
  ["ABORT_ERR", "DEPENDENCY_NODE_ABORT_ERR"]
]);

/**
 * PostgreSQL SQLSTATE CLASS (the first two characters of a five-character code),
 * keyed by class and valued by this block's own literal. The full published class
 * vocabulary of PostgreSQL's error-codes appendix is enumerated rather than the
 * subset this system raises today, because the appendix is a closed contract and
 * a subset would silently degrade an unfamiliar-but-real server rejection.
 *
 * The class, not the five-character code, is the unit: `DEPENDENCY_${code}` used
 * to forward all five characters, and a five-character code is a value the server
 * chose, not one this block declared. Two characters are used only as a lookup
 * key; the string returned is the literal on the right.
 */
const SQLSTATE_CLASS_CATEGORIES: ReadonlyMap<string, string> = new Map([
  ["00", "DEPENDENCY_SQL_00_SUCCESS"],
  ["01", "DEPENDENCY_SQL_01_WARNING"],
  ["02", "DEPENDENCY_SQL_02_NO_DATA"],
  ["03", "DEPENDENCY_SQL_03_STATEMENT_INCOMPLETE"],
  ["08", "DEPENDENCY_SQL_08_CONNECTION"],
  ["09", "DEPENDENCY_SQL_09_TRIGGERED_ACTION"],
  ["0A", "DEPENDENCY_SQL_0A_FEATURE_UNSUPPORTED"],
  ["0B", "DEPENDENCY_SQL_0B_TRANSACTION_INITIATION"],
  ["0F", "DEPENDENCY_SQL_0F_LOCATOR"],
  ["0L", "DEPENDENCY_SQL_0L_GRANTOR"],
  ["0P", "DEPENDENCY_SQL_0P_ROLE_SPECIFICATION"],
  ["0Z", "DEPENDENCY_SQL_0Z_DIAGNOSTICS"],
  ["20", "DEPENDENCY_SQL_20_CASE_NOT_FOUND"],
  ["21", "DEPENDENCY_SQL_21_CARDINALITY"],
  ["22", "DEPENDENCY_SQL_22_DATA_EXCEPTION"],
  ["23", "DEPENDENCY_SQL_23_INTEGRITY_CONSTRAINT"],
  ["24", "DEPENDENCY_SQL_24_CURSOR_STATE"],
  ["25", "DEPENDENCY_SQL_25_TRANSACTION_STATE"],
  ["26", "DEPENDENCY_SQL_26_STATEMENT_NAME"],
  ["27", "DEPENDENCY_SQL_27_TRIGGERED_DATA_CHANGE"],
  ["28", "DEPENDENCY_SQL_28_AUTHORIZATION"],
  ["2B", "DEPENDENCY_SQL_2B_DEPENDENT_PRIVILEGES"],
  ["2D", "DEPENDENCY_SQL_2D_TRANSACTION_TERMINATION"],
  ["2F", "DEPENDENCY_SQL_2F_ROUTINE_EXCEPTION"],
  ["34", "DEPENDENCY_SQL_34_CURSOR_NAME"],
  ["38", "DEPENDENCY_SQL_38_EXTERNAL_ROUTINE"],
  ["39", "DEPENDENCY_SQL_39_EXTERNAL_ROUTINE_INVOCATION"],
  ["3B", "DEPENDENCY_SQL_3B_SAVEPOINT"],
  ["3D", "DEPENDENCY_SQL_3D_CATALOG_NAME"],
  ["3F", "DEPENDENCY_SQL_3F_SCHEMA_NAME"],
  ["40", "DEPENDENCY_SQL_40_TRANSACTION_ROLLBACK"],
  ["42", "DEPENDENCY_SQL_42_ACCESS_OR_SYNTAX"],
  ["44", "DEPENDENCY_SQL_44_WITH_CHECK_OPTION"],
  ["53", "DEPENDENCY_SQL_53_INSUFFICIENT_RESOURCES"],
  ["54", "DEPENDENCY_SQL_54_PROGRAM_LIMIT"],
  ["55", "DEPENDENCY_SQL_55_OBJECT_STATE"],
  ["57", "DEPENDENCY_SQL_57_OPERATOR_INTERVENTION"],
  ["58", "DEPENDENCY_SQL_58_SYSTEM"],
  ["72", "DEPENDENCY_SQL_72_SNAPSHOT_FAILURE"],
  ["F0", "DEPENDENCY_SQL_F0_CONFIG_FILE"],
  ["HV", "DEPENDENCY_SQL_HV_FOREIGN_DATA_WRAPPER"],
  ["P0", "DEPENDENCY_SQL_P0_PLPGSQL"],
  ["XX", "DEPENDENCY_SQL_XX_INTERNAL"]
]);

/**
 * Recognized error classes, keyed by `error.name`. The domain entries are the
 * classes that set `this.name` in apps/ and packages/, read at the commit above;
 * `pg`'s DatabaseError sets `name` to the wire message type, so an ordinary query
 * rejection arrives as "error". The `Development*` and production-CLI classes are
 * absent for the same reason their constants are: apps/runner/src/index.ts imports
 * none of those modules.
 */
const ERROR_CLASS_CATEGORIES: ReadonlyMap<string, string> = new Map([
  ["Error", "ERROR"],
  ["TypeError", "TYPE_ERROR"],
  ["RangeError", "RANGE_ERROR"],
  ["SyntaxError", "SYNTAX_ERROR"],
  ["ReferenceError", "REFERENCE_ERROR"],
  ["EvalError", "EVAL_ERROR"],
  ["URIError", "URI_ERROR"],
  ["AggregateError", "AGGREGATE_ERROR"],
  ["AbortError", "ABORT_ERROR"],
  ["ZodError", "SCHEMA_VALIDATION_ERROR"],
  ["error", "DATABASE_ERROR"],
  ["DatabaseError", "DATABASE_ERROR"],
  ["TypedDomainError", "TYPED_DOMAIN_ERROR"],
  ["Argon2InfrastructureError", "HASHING_UNAVAILABLE"],
  ["AskRefusal", "ASK_REFUSAL"],
  ["AuthFlowError", "AUTH_FLOW_ERROR"],
  ["ContractHttpError", "CONTRACT_HTTP_ERROR"],
  ["CryptoError", "CRYPTO_ERROR"],
  ["CryptoAuthenticationError", "CRYPTO_ERROR"],
  ["CryptoInputError", "CRYPTO_ERROR"],
  ["KekUnresolvedError", "CRYPTO_ERROR"],
  ["RuntimeKekUnresolvedError", "CRYPTO_ERROR"],
  ["PublicationKeyUnresolvedError", "CRYPTO_ERROR"],
  ["RunContentKeyUnresolvedError", "CRYPTO_ERROR"],
  ["MailDeliveryError", "MAIL_DELIVERY_ERROR"],
  ["MalformedRequestError", "MALFORMED_REQUEST_ERROR"],
  ["MfaEnrollmentHttpError", "MFA_ENROLLMENT_HTTP_ERROR"],
  ["PanelMemberFailure", "PANEL_MEMBER_FAILURE"],
  ["ProviderCallFailedError", "PROVIDER_CALL_FAILED_ERROR"],
  ["ProviderContentUnacceptedError", "PROVIDER_CONTENT_UNACCEPTED_ERROR"],
  ["RunnerStartupReconciliationError", "RUNNER_STARTUP_RECONCILIATION_ERROR"],
  ["GracefulShutdownError", "GRACEFUL_SHUTDOWN_ERROR"]
]);

/**
 * The complete diagnostic vocabulary for a caught operational failure: a
 * TypedDomainError's own code, or one literal declared above.
 */
function operationalDiagnosticOf(error: unknown): string {
  if (error instanceof TypedDomainError) {
    return KNOWN_DOMAIN_DIAGNOSTICS.get(error.code) ?? UNRECOGNIZED_DOMAIN_CODE;
  }
  const record = error !== null && typeof error === "object"
    ? error as Readonly<{ code?: unknown; message?: unknown; name?: unknown }>
    : undefined;
  if (typeof record?.message === "string") {
    const known = KNOWN_FAILURE_MESSAGES.get(record.message);
    if (known !== undefined) return known;
  }
  if (typeof record?.code === "string") {
    const byCode = DEPENDENCY_CODE_CATEGORIES.get(record.code);
    if (byCode !== undefined) return byCode;
    if (record.code.length === 5) {
      const bySqlstateClass = SQLSTATE_CLASS_CATEGORIES.get(record.code.slice(0, 2));
      if (bySqlstateClass !== undefined) return bySqlstateClass;
    }
  }
  if (typeof record?.name === "string") {
    const byClass = ERROR_CLASS_CATEGORIES.get(record.name);
    if (byClass !== undefined) return byClass;
  }
  return OPERATIONAL_DIAGNOSTIC_FALLBACK;
}
// ─── END OPERATIONAL DIAGNOSTIC ALPHABET ───────────────────────────────────────

/** The `reason` recorded by recordTerminalFailure, and persisted with the run. */
export function runnerTerminalFailureReason(error: unknown): string {
  return `RUNNER_EXECUTION_FAILED:${operationalDiagnosticOf(error)}`;
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
    // S06 capture binding. It was written in e8d99d33 and destroyed by the
    // conflict resolution in merge 1c9578a2, which took the mainline side of
    // this file whole; the test that specifies it survived the same merge.
    // Restored here. Observability never changes product semantics: every
    // capture is optional (`capture?.`), the emitter is total, and the error
    // that escapes is the one that would have escaped without any of this.
    fn: async (
      dispatch: { runId: string; workItemId: string },
      hatchetContext?: { retryCount?(): number }
    ) => {
      const capture = await import("@debateai/obs-capture").catch(() => undefined);
      // Read the SDK accessor inside a guard: a throwing retryCount() must not
      // reject the task before executeWorkItem has run (s06-rework-1.md §4).
      let observedRetryCount: unknown;
      try {
        observedRetryCount = hatchetContext?.retryCount?.();
      } catch {
        observedRetryCount = undefined;
      }
      const attemptIndex = typeof observedRetryCount === "number"
        && Number.isSafeInteger(observedRetryCount)
        && observedRetryCount >= 0
        ? observedRetryCount
        : 0;
      const execute = async () => {
        try {
          const result = await input.runner.executeWorkItem(dispatch.workItemId);
          return result.kind === "COMPLETED"
            ? { kind: result.kind, answerId: result.answerId }
            : { kind: result.kind };
        } catch (error) {
          capture?.emit(Object.freeze({
            code: error instanceof TypedDomainError ? error.code : "OBS_CAPTURE_SELF",
            error,
            taxonomy_class: "JOB_FAILURE",
            capture_point: "job",
            disposition: "THROWN",
            source: "hatchet",
            attempt_index: attemptIndex
          }));
          const recorded = await input.failures.recordTerminalFailure({
            runId: dispatch.runId,
            workItemId: dispatch.workItemId,
            reason: runnerTerminalFailureReason(error)
          });
          if (!recorded) {
            // OBS-R064: a handler that cannot record the failure must still
            // propagate the ORIGINAL error. The unrecorded state is an alarm
            // alongside it, never a replacement for it.
            const recordingFailure = new TypedDomainError(
              "RUNNER_FAILURE_STATE_NOT_RECORDED",
              dispatch.workItemId
            );
            capture?.emit(Object.freeze({
              code: recordingFailure.code,
              error: recordingFailure,
              taxonomy_class: "JOB_FAILURE",
              capture_point: "job",
              disposition: "HANDLED",
              source: "hatchet",
              attempt_index: attemptIndex
            }));
          }
          throw error;
        }
      };
      if (capture === undefined) return execute();
      return capture.runWithObsContext(Object.freeze({
        run_ref: Object.freeze({ kind: "run", value: dispatch.runId }),
        work_item_ref: Object.freeze({ kind: "work_item", value: dispatch.workItemId })
      }), execute);
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
      // S06 gateway seam, restored with the task binding above (e8d99d33,
      // lost in merge 1c9578a2). The run this call is bound to joins the
      // ambient context; the caller's own fields are preserved.
      const leasedRunId = request.runId;
      const capture = await import("@debateai/obs-capture").catch(() => undefined);
      const execute = async (): Promise<ProviderCallResult> => {
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
      return withRunContentLease(pool,[leasedRunId],async () => {
      if (!authenticatedEvaluatorScope) {
        await budget.assertModelAttemptAllowed(leasedRunId);
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
      try {
        return await http.call({
          ...request,
          bound: { ...request.bound, maxAttempts: remaining }
        });
      } catch (error) {
        capture?.emit(Object.freeze({
          code: error instanceof TypedDomainError ? error.code : "OBS_CAPTURE_SELF",
          error,
          taxonomy_class: "PROVIDER_EXHAUSTED",
          capture_point: "provider",
          disposition: "THROWN",
          source: "first_party"
        }));
        throw error;
      }
      });
      };
      if (capture === undefined) return execute();
      const ambient = capture.getObsContext();
      return capture.runWithObsContext(Object.freeze({
        ...ambient,
        run_ref: Object.freeze({ kind: "run", value: leasedRunId })
      }), execute);
    }
  };
}
