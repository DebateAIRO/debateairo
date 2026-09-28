import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Pool } from "pg";
import {
  ProviderProbeRepository,
  RunRepository,
  assertNoOpenWriteTransaction,
  insertCallPrompt,
  readRunRoleAssignment,
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
  type JudgeLeg,
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
  buildFramedPrompt,
  buildFramedRepairPrompt,
  schemaFailureLocator,
  type FramedPrompt,
  type PromptContract,
  OpenAICompatibleProviderGateway,
  PROVIDER_USAGE_CAP,
  ProviderCallFailedError,
  ProviderContentUnacceptedError,
  type CallBound,
  type ContentClassification,
  type OpenAICompatibleGatewayOptions,
  type PromptPacket,
  type ProviderCallRequest,
  type ProviderCallResult,
  type ProviderCostEnvelopeSeam,
  type ProviderGateway
} from "@debateai/providers";
import { RoleAssignmentSchema, canonicalPromptFingerprint, type RoleAssignment, type SeatCandidate } from "@debateai/scorecard";
import {
  BACKUP_MODEL_USED_MARK,
  buildFactBundle,
  compositionEvidenceRequired,
  createEnvelopeExhaustedResult,
  deriveBandCeiling,
  deriveVerdictLabel,
  LABEL_BASIS_INCOMPLETE_MARK,
  PROTECTED_CORE_GUARD_RETIRED_MARK,
  runServeGateChain,
  ServeRepository,
  toSynthesisPromptMaterial,
  SYNTHESIZER_PROMPT_CONTRACT,
  EVALUATOR_INSTRUCTIONS,
  type BandCeilingRegisterRow,
  type ComposedSegment,
  type CompositionBudgetResolution,
  type ConditionMarkRecord,
  seatBaseCallSiteKey,
  seatCallSiteKey,
  seatOfCallSiteKey,
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
import { SERVED_ROOT_SELECTION_RULE, TypedDomainError, exhaustive, type CompositionBudgetTier, type ServedRootRule, type WayOfKnowing } from "@debateai/kernel";
import { MemoryRepository, renderMemorySentence, validateMemorySentence } from "@debateai/memory";
import {
  backupModelUsedRecords,
  backupSwitchEventValue,
  buildAssignedRunSeatBook,
  buildLegacyRunSeatBook,
  createSeatCaller,
  effectiveSynthesisCollapse,
  legacySynthesisSeat,
  plannedSeatSlot,
  roleAssignmentSeatProblem,
  roleFallbackEventValue,
  seatSiteOrdinal,
  withEffectiveDegradedDiversity,
  type AssignedRunSeatBook,
  type ConfiguredSeatMaker,
  type LedgerSeatMove,
  type RouteHealth,
  type RunSeat,
  type RunSeatBook,
  type SeatIdentity,
  type SeatMember,
  type SeatSlot
} from "./run-seats.js";
import type { Hatchet, TaskWorkflowDeclaration } from "@hatchet-dev/typescript-sdk";

// Model scorecard A15/A16: the seat book and the seat caller live in their own module.
export * from "./run-seats.js";

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

/**
 * V-28 (DL4-F2) — WHICH CEILING STOPPED THE RUN, if either did.
 *
 * Two independent bounds refuse the next provider call, and the serve leg's
 * catch has to tell them apart from a genuine failure, which must keep
 * travelling. Both end the run the same way — the components-only envelope
 * terminal, which serves the nodes already verified — but they are reached by
 * different questions and are lifted by different operator actions, so the
 * distinction is named rather than inferred from a count.
 */
export const ENVELOPE_STOP_CODES = Object.freeze({
  /** The attempt ceiling pinned on the run head (`assertModelAttemptAllowed`). */
  RUN_COST_ENVELOPE_EXHAUSTED: "ATTEMPTS",
  /** The money ceiling sealed in `costEnvelopePolicy` (the gateway's seam). */
  RUN_COST_ENVELOPE_MONEY_REACHED: "MONEY",
  /**
   * RULING R2 (review round 2). A hosted vendor answered and reported no usage,
   * so the call cannot be billed and the money ceiling cannot be honoured for
   * anything that follows. That is a VENDOR or CONFIGURATION fault, not the
   * asker's, so the run ends the same clean way a money stop ends rather than
   * discarding work the asker will still be charged for. It keeps its own kind,
   * and therefore its own condition-mark reason: an operator told "you ran out
   * of money" would go and raise a ceiling that was never the problem.
   */
  PROVIDER_USAGE_UNREPORTED: "USAGE",
  /**
   * SMALL (round 3): a dead path today — the daily envelope is asked only when a
   * NEW run is admitted, never mid-run — and listed anyway, for consistency with
   * `RUN_LEVEL_SPEND_STOP_CODES` in the kernel. If it is ever raised while a run
   * is under way, the difference between being listed and not is the difference
   * between the run keeping its work and failing outright.
   *
   * ROUND 4, RULING R-C: its OWN kind. Round 3 filed it under `MONEY`, so the
   * record it would have minted carried the per-run reason and sent the
   * operator to raise the wrong ceiling. A spent day is lifted by waiting for
   * the next one, not by re-sealing the per-run envelope.
   */
  DAILY_COST_ENVELOPE_REACHED: "DAILY"
} as const);

export type EnvelopeStopKind = typeof ENVELOPE_STOP_CODES[keyof typeof ENVELOPE_STOP_CODES];

/**
 * The condition-mark record's reason, per stop: the operator's lift differs.
 * A bijection with `ENVELOPE_STOP_CODES` — each kind carries back the one code
 * that maps to it — and pinned as one by `v28-run-body-budget-stop.test.ts`, so
 * a kind can never again lift as another ceiling's.
 */
export const ENVELOPE_STOP_REASONS: Readonly<Record<EnvelopeStopKind, string>> = Object.freeze({
  ATTEMPTS: "RUN_COST_ENVELOPE_EXHAUSTED",
  MONEY: "RUN_COST_ENVELOPE_MONEY_REACHED",
  USAGE: "PROVIDER_USAGE_UNREPORTED",
  DAILY: "DAILY_COST_ENVELOPE_REACHED"
});

/**
 * ROUND 4, RULING R-B — what a reader is told to DO about an answer that rests
 * on one lineage because a spend bound stopped the run before the other maker
 * positions could be afforded. One lift per stop, because "re-ask with more
 * money", "wait for the next day" and "fix the vendor" are different actions.
 * The ATTEMPT ceiling is listed for completeness of the record: it is never a
 * run-body stop (`RUN_BODY_STOP_KINDS`), so no such record is ever minted for it.
 */
const SINGLE_LINEAGE_SPEND_STOP_LIFT_PATHS: Readonly<Record<EnvelopeStopKind, string>> = Object.freeze({
  ATTEMPTS: "Re-ask under a larger attempt ceiling so the other maker positions can be authored",
  MONEY: "Re-ask under a larger per-run cost envelope so the other maker positions can be afforded",
  USAGE: "Restore a vendor that reports usage, then re-ask so the other maker positions can be billed",
  DAILY: "Re-ask after the daily cost envelope resets so the other maker positions can be afforded"
});

/**
 * `null` for anything that is not one of the envelope refusals listed above.
 *
 * FW-F (final review, Minor): the membership question is `Object.hasOwn`, not a
 * plain index with a `?? null` miss. `TypedDomainError.code` is an unconstrained
 * `string`, and a plain object answers for every name `Object.prototype`
 * defines — `constructor` returned the `Object` function, `__proto__` the
 * prototype — each of them truthy, so the miss never fired and the caller was
 * told a spend bound had been reached. At the serve-chain catch that is a forced
 * hard stop whose condition-mark record reads `ENVELOPE_STOP_REASONS[<function>]`
 * = `undefined`: a terminal naming a ceiling nobody reached. Driven by
 * `tests/unit/v28-run-money-terminal.test.ts`.
 */
export function envelopeStopKind(error: unknown): EnvelopeStopKind | null {
  if (!(error instanceof TypedDomainError)) return null;
  return Object.hasOwn(ENVELOPE_STOP_CODES, error.code)
    ? ENVELOPE_STOP_CODES[error.code as keyof typeof ENVELOPE_STOP_CODES]
    : null;
}

/**
 * C1 (review round 2) — WHAT A RUN-BODY PHASE DOES WITH AN ENVELOPE REFUSAL.
 *
 * The envelope terminal cannot be built during authoring, expansion or review:
 * it needs the propagation, the served root and the fact bundle, and none of
 * them exists yet. So a spend refusal raised there cannot become a terminal on
 * the spot — it must STOP THE PHASE and let the run reach the envelope
 * evaluation that already stands in front of the serve chain, where the terminal
 * IS buildable and the components produced so far are what it serves.
 *
 * `null` means "this is not a phase stop, let it travel". The ATTEMPT ceiling is
 * deliberately `null`: it has always propagated from these phases, changing that
 * is a behaviour nobody ruled, and V-28 is about money.
 */
/**
 * C3 (re-review) — WHICH QUESTION THE ENVELOPE IS ASKED, per stop.
 *
 * Only the ATTEMPT ceiling asks "does ONE MORE attempt fit?" — the question
 * T17B's `pendingModelAttempts` exists for. Money and an unbillable vendor ask
 * neither of the attempt questions: a run can have dozens of attempts left and
 * still be unable to pay for, or bill, a single one, so the hard stop is
 * asserted on its own footing and the attempt count is reported as it stands.
 */
export function envelopeStopPendingAttempts(stop: EnvelopeStopKind): Readonly<{
  pendingModelAttempts: number;
  forceHardStop: boolean;
}> {
  return stop === "ATTEMPTS"
    ? Object.freeze({ pendingModelAttempts: 1, forceHardStop: false })
    : Object.freeze({ pendingModelAttempts: 0, forceHardStop: true });
}

/**
 * The kinds that stop a run-body phase, enumerated POSITIVELY: a fifth kind
 * added tomorrow does not become a phase stop by omission, it has to be listed
 * and reasoned about. `ATTEMPTS` is deliberately absent (see above).
 */
const RUN_BODY_STOP_KINDS: readonly EnvelopeStopKind[] = Object.freeze(["MONEY", "USAGE", "DAILY"]);

export function expansionPhaseStop(error: unknown): EnvelopeStopKind | null {
  const stop = envelopeStopKind(error);
  return stop !== null && RUN_BODY_STOP_KINDS.includes(stop) ? stop : null;
}

export type ReviewFailureOutcome =
  | { readonly kind: "RETHROW" }
  | { readonly kind: "BUDGET_STOP"; readonly stop: EnvelopeStopKind }
  | { readonly kind: "UNAVAILABLE" };

/**
 * C1, second half — the node-review catch had a rethrow list that did not know
 * about money, so a refusal raised during a review came out as
 * `NODE_REVIEW_UNAVAILABLE`: a diagnostic naming the wrong cause, and one no
 * envelope path can recognise. The list is a DECISION now, so it can be tested
 * instead of read.
 */
const REVIEW_RETHROWN_CODES: readonly string[] = Object.freeze([
  "RUN_COST_ENVELOPE_EXHAUSTED",
  "CALL_BUDGET_EXHAUSTED",
  "PRODUCER_GRADING_FORBIDDEN"
]);

export function reviewFailureOutcome(error: unknown): ReviewFailureOutcome {
  const stop = expansionPhaseStop(error);
  if (stop !== null) return Object.freeze({ kind: "BUDGET_STOP" as const, stop });
  if (error instanceof TypedDomainError && REVIEW_RETHROWN_CODES.includes(error.code)) {
    return Object.freeze({ kind: "RETHROW" as const });
  }
  return Object.freeze({ kind: "UNAVAILABLE" as const });
}

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

/**
 * V-11 (RUN1): the EVALUATOR's prompt contract. `EVALUATOR_CONTRACT_TEXT` is
 * the answer form — code's half — and `EVALUATOR_INSTRUCTIONS` (which already
 * shipped, inside the payload's `instructions` member) is the owners' slot.
 * Neither string is reworded; what moved is which compartment each sits in.
 */
export const EVALUATOR_PROMPT_CONTRACT: PromptContract = Object.freeze({
  contractId: "serve.evaluator.v1",
  instruction: EVALUATOR_INSTRUCTIONS,
  answerForm: EVALUATOR_CONTRACT_TEXT
});

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
 * Model scorecard A17 (spec §2.9) — THE SYNTHESIS PROMPT BUILDER, callable on
 * its own. Both runner closures build their packet here, and `moment:replay`
 * (`replayMoment`, acceptance/replay-moment.ts) calls this same function
 * through `captureMomentPacket` and `invokeMomentBuilder`
 * (acceptance/moment-tools.ts), so a replayed prompt is the live prompt by
 * construction. It stays in THIS module because the evaluator's contract is
 * declared here (the seeders import it and `f-sealedrows-a-dataflow` mocks that
 * export). `randomBytes` exists for the byte-equality test; production never
 * passes it.
 */
export function buildSynthesisRolePrompt(
  request: SynthesizerRequest | EvaluatorRequest,
  randomBytes?: (size: number) => Buffer
): FramedPrompt {
  return buildFramedPrompt({
    contract: request.role === "SYNTHESIZER" ? SYNTHESIZER_PROMPT_CONTRACT : EVALUATOR_PROMPT_CONTRACT,
    material: toSynthesisPromptMaterial(request),
    ...(randomBytes === undefined ? {} : { randomBytes })
  });
}

/** A17: the classification a live synthesis call applies, exported for replay. */
export function classifySynthesisRoleContent(role: SynthesisRoleName, content: string): ContentClassification {
  return role === "SYNTHESIZER"
    ? classifyStructuredContent(content, compositionSchema)
    : classifyStructuredContent(content, evaluatorVerdictSchema);
}

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

type JudgePanelNote = Awaited<ReturnType<typeof runJudgePanel>>["notes"][number];

/**
 * confirm-item 5 and A15d (controller carry 10) — the marks and the reason a
 * panel's LOST voices earn. Two notes are lost paid voices: a member that fell
 * over (`MEMBER_FAILED`), and a seat whose answer came back from the author's
 * own maker or route and was refused after the call
 * (`PRODUCER_GRADING_REFUSED_AFTER_CALL`, A15c). The author's own seat skipped
 * before any call (`PRODUCER_GRADING_FORBIDDEN`) is expected and lost nothing.
 * The reason names WHICH members were lost and how — a disclosure that says
 * only "partial" tells a reader nothing they can act on.
 */
export function panelDegradationOf(
  nonAuthorVoices: number,
  notes: readonly JudgePanelNote[]
): { readonly marks: readonly PanelDegradationMark[]; readonly panelFailureReason: string | null } {
  const lost = notes.filter((note) => note.kind === "MEMBER_FAILED" || note.kind === "PRODUCER_GRADING_REFUSED_AFTER_CALL");
  const marks: PanelDegradationMark[] = [];
  if (nonAuthorVoices === 0) marks.push(PANEL_DEGRADED_SINGLE_VOICE_MARK);
  else if (lost.length > 0) marks.push(PANEL_PARTIAL_MARK);
  return Object.freeze({
    marks: Object.freeze(marks),
    panelFailureReason: lost.length === 0
      ? null
      : lost.map((note) => note.kind === "PRODUCER_GRADING_REFUSED_AFTER_CALL"
        ? `${note.memberRole}: ${note.failureKind} (answered by ${note.answeringMemberRole})`
        : `${note.memberRole}: ${note.failureKind}`).join("; ")
  });
}

/**
 * A15d (controller carry 15) — the panel notes as the reduced judgement's
 * `disagreement.panel.notes` stores them. The post-call refusal keeps the maker
 * that ANSWERED beside the seat it answered for; every other note keeps its
 * exact stored shape.
 */
export function panelNoteRecords(notes: readonly JudgePanelNote[]): readonly Readonly<Record<string, string>>[] {
  return Object.freeze(notes.map((note) => Object.freeze(note.kind === "PRODUCER_GRADING_REFUSED_AFTER_CALL"
    ? {
      memberRole: note.memberRole,
      answeringMemberRole: note.answeringMemberRole,
      kind: note.kind,
      failureKind: note.failureKind,
      reason: note.reason
    }
    : {
      memberRole: note.memberRole,
      kind: note.kind,
      failureKind: note.failureKind,
      reason: note.reason
    })));
}

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
  /**
   * Model scorecard A15d (controller carry 3). DR-184-v5 provisions ONE
   * post-cooldown final retry per SITE — `2 * judge + final` across a seat's
   * two keys — but route health is re-probed at every claim, so a resumed pass
   * can seat the site's other member, whose key still holds a final retry of
   * its own. An assigned run's caller asks the ledger here whether the site's
   * OTHER seat key already spent one; if it did, the site halts on this
   * sequence's failure, with no hold and no wait. Absent (every legacy run),
   * the final retry is granted exactly as before.
   */
  readonly finalRetryPermitted?: () => Promise<boolean>;
  /**
   * Model scorecard A16a (controller ruling on concern 2): the site's TRUE
   * attempts, every seat key at the site counted off the ledger. A seat that
   * switched to its backup spent on TWO keys, and each error carries only its
   * own sequence, so an assigned run's hold and halt records read this instead.
   * Absent (every legacy run), they count the errors' attempts exactly as before.
   */
  readonly siteAttemptsSpent?: () => Promise<number>;
}): Promise<
  | { readonly kind: "AUTHORED"; readonly value: T }
  | { readonly kind: "HALTED"; readonly record: HaltedExpansionRecord }
> {
  const spent = async (fromErrors: number): Promise<number> =>
    input.siteAttemptsSpent === undefined ? fromErrors : await input.siteAttemptsSpent();
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
      attemptsSpent: await spent(attemptsSpent),
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
    if (input.finalRetryPermitted !== undefined && !(await input.finalRetryPermitted())) {
      return halted(error, error.attempts);
    }
    // DR-186(8): review gets every ruled provider attempt plus the final
    // attempt, but never holds the in-run loading page open.
    if (input.failureScope === "REVIEW") return finalAttempt(error);
    const holds = await input.hold.countCooldownHolds(input.runId);
    // DR-184/C-1: the run-wide cap bounds waiting only. It must never eat the
    // final attempt that the structural ceiling provisions at every site.
    if (holds >= input.policy.maxCooldownHoldsPerRun) return finalAttempt(error);
    const holdUntil = new Date(Date.now() + input.policy.cooldownMs).toISOString();
    const heldAttempts = await spent(error.attempts);
    await input.hold.record({
      kind: "node.retrying",
      state: "COOLDOWN_HOLD",
      runId: input.runId,
      callSiteKey: input.callSiteKey,
      parentNodeId: input.parentNodeId,
      holdMs: input.policy.cooldownMs,
      holdUntil,
      attemptsSpent: heldAttempts,
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
      attemptsSpent: heldAttempts,
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
  /** Probe sealed synthesis identities outside the selected plan's debate panel. */
  readonly claimTimeSynthesisRoleProbe?: (providerRef: string) => Promise<{
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

/**
 * L4-F11 / DL4-F4: the serve-chain repair packet used to append
 * `Machine parse error: ${parseError}` — the zod message, which quotes the
 * model's own rejected output — into a fresh user turn. It now appends one
 * fenced block carrying the typed code and the schema path, and
 * `buildFramedRepairPrompt` refuses anything that is not a machine locator.
 */
function buildSchemaRepairPacket(framed: FramedPrompt, rejected: {
  readonly parseStatus: string;
  readonly parseError: string;
}): PromptPacket {
  return buildFramedRepairPrompt(framed, schemaFailureLocator(rejected));
}

/**
 * T9 (goal 263-266): a SYNTHESIZER or EVALUATOR call whose transport dies is
 * one of the four enumerated COMPONENTS_ONLY crash classes — a death, not a
 * quality judgement. It is typed HERE, at the seam, so the serve chain can name
 * the class without catching every error it sees. Content refusals keep their
 * existing organ code: a provider that answered with unusable content is a
 * contract error, not a dead transport.
 */
// A16c fix round 1 (Minor 6): exported so its mapping of a bare usage cap is pinned by a unit test.
export async function callSynthesisRole<T>(
  call: () => Promise<T>,
  site: { readonly role: SynthesisRoleName; readonly callSiteKey: string },
  organFailureCode: string
): Promise<T> {
  // A15: the call is a SEAT call, so this translation sits OUTSIDE it — the
  // seat caller sees the raw provider failure (A16 decides a backup on it) and
  // only what finally leaves the seat is typed for the serve chain.
  try {
    return await call();
  } catch (error) {
    if (error instanceof ProviderContentUnacceptedError) {
      throw new TypedDomainError(organFailureCode, error.lastParseError);
    }
    if (error instanceof ProviderCallFailedError) {
      throw new TypedDomainError(
        "SYNTHESIS_TRANSPORT_DEATH",
        `${site.role} transport exhausted after ${String(error.attempts)} attempts at ${site.callSiteKey}`
      );
    }
    // A16: a usage cap that reached a synthesis role through BOTH members of its
    // seat (or a seat without a runner-up) is a dead transport for the serve
    // chain — the components-only TRANSPORT_DEATH class — never a crash. The
    // gateway wraps a cap as ProviderCallFailedError (pre-flight ruling F11), so
    // the branch above takes it; this one keeps a bare cap from a double safe.
    if (error instanceof TypedDomainError && error.code === PROVIDER_USAGE_CAP) {
      throw new TypedDomainError(
        "SYNTHESIS_TRANSPORT_DEATH",
        `${site.role} hit a subscription usage cap at ${site.callSiteKey}`
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

/**
 * RE-REVIEW 2(a) — WHAT AN ANSWER MAY SAY ABOUT THE MAKER POSITIONS BEHIND IT.
 *
 * One decision, taken once, because the answer says this in two places that must
 * agree: the fact bundle's condition MARKS and the condition-mark RECORDS that
 * `assertRequiredConditionMarkRecords` pairs with them. They were computed by
 * two separate `effectiveMakerCount > 1` tests, and a state where those two
 * disagree is an answer that asserts a mark nothing explains.
 *
 * THE STATE THAT EXPOSED IT. A spend stop on root 1 of a two-maker run leaves
 * one authored position while `effectiveMakerCount` is still 2 — it is the
 * planned panel size and is never recomputed. The old code then demanded an
 * UNSERVED position from a set that had none and threw
 * `UNSERVED_MAKER_POSITION_UNRESOLVED`, before the envelope evaluation and with
 * no catch between, so a root that had been authored, panelled, reviewed and
 * PAID FOR was discarded anyway.
 *
 * The rule is now about what EXISTS rather than about what was planned:
 *
 *  · a position was authored and not served  -> disclose it, as always;
 *  · a genuine mono-maker run                -> its own two marks, as always;
 *  · a multi-maker run with ONE authored root -> ROUND 4, RULING R-B: the answer
 *    SAYS it rests on one lineage. Round 3 said nothing here, on the ground that
 *    `SINGLE-LINEAGE` meant `MONO_MAKER_RUN`; but the mark is the closed
 *    vocabulary and the record's REASON is a free string, so the mark carries
 *    the truth and the reason names what actually happened: the run-level
 *    spend-stop code (`RUN_COST_ENVELOPE_MONEY_REACHED`,
 *    `PROVIDER_USAGE_UNREPORTED`, `DAILY_COST_ENVELOPE_REACHED`) — never
 *    `MONO_MAKER_RUN`, which means one maker was CONFIGURED, a different fact
 *    with a different lift. The only way the run body reaches one authored root
 *    at M > 1 is a spend stop (a halted root 1 throws `MAKER_POSITION_UNAVAILABLE`
 *    first), so that state with NO stop is refused loudly rather than given a
 *    mark with no reason.
 *
 * `monoMakerRecords` is REQUIRED (round 4, R-C): the marks and the records are
 * the two halves of one statement, and an optional half is how they diverge.
 */
export function buildMakerPositionDisclosure(input: Readonly<{
  effectiveMakerCount: number;
  runBodyBudgetStop: EnvelopeStopKind | null;
  authoredMakerPositions: readonly MakerPositionDisclosureRoot[];
  servedRoot: MakerPositionDisclosureRoot;
  monoMakerConditionMarks: readonly ConditionMarkRecord["mark"][];
  monoMakerRecords: readonly ConditionMarkRecord[];
}>): Readonly<{
  conditionMarks: readonly ConditionMarkRecord["mark"][];
  records: readonly ConditionMarkRecord[];
}> {
  if (input.effectiveMakerCount === 1) {
    return Object.freeze({
      conditionMarks: Object.freeze([...input.monoMakerConditionMarks]),
      records: Object.freeze([...input.monoMakerRecords])
    });
  }
  const unserved = input.authoredMakerPositions
    .filter((root) => root.nodeId !== input.servedRoot.nodeId);
  if (unserved.length === 0) {
    if (input.runBodyBudgetStop === null) {
      throw new TypedDomainError(
        "MAKER_POSITION_DISCLOSURE_UNRESOLVED",
        `A ${input.effectiveMakerCount}-maker run authored one maker position and no spend bound stopped it; the run body cannot produce this state and no lineage disclosure is minted without a reason`
      );
    }
    return Object.freeze({
      conditionMarks: Object.freeze(["SINGLE-LINEAGE" as const]),
      records: Object.freeze([Object.freeze({
        mark: "SINGLE-LINEAGE" as const,
        scope: "answer" as const,
        subjectRef: input.servedRoot.nodeId,
        reason: ENVELOPE_STOP_REASONS[input.runBodyBudgetStop],
        liftPath: SINGLE_LINEAGE_SPEND_STOP_LIFT_PATHS[input.runBodyBudgetStop],
        servedRootRule: null,
        affectedNodeIds: Object.freeze([input.servedRoot.nodeId])
      } satisfies ConditionMarkRecord)])
    });
  }
  return Object.freeze({
    conditionMarks: Object.freeze(["UNSERVED-MAKER-POSITION" as const]),
    records: Object.freeze([
      buildUnservedMakerPositionRecord(input.authoredMakerPositions, input.servedRoot)
    ])
  });
}

/** The footing on which judged standing is projected for the served answer. */
export type MakerPositionServeFooting = "MONO_MAKER" | "CROSS_REVIEWED" | "SPEND_STOPPED";

export interface MakerPositionServeDecision<T extends MakerPositionDisclosureRoot> {
  readonly footing: MakerPositionServeFooting;
  /** The node ids that seeded `projectJudgedStanding` — what "reviewed" meant on this footing. */
  readonly judgedStandingSeed: readonly string[];
  readonly standing: ReturnType<typeof projectJudgedStanding>;
  readonly propagation: PropagationOutcome;
  readonly servableMakerPositions: readonly T[];
  readonly servedRootSelection: ServedRootSelection<T>;
  readonly servedRoot: T;
  readonly disclosure: ReturnType<typeof buildMakerPositionDisclosure>;
}

/**
 * ROUND 4 (V-28, RULINGS R-A / R-B) — THE POST-AUTHORING SERVE DECISION, TAKEN ONCE.
 *
 * Three rounds fixed the joint where a spend refusal was RAISED and each moved
 * the death one statement downstream: `MAKER_POSITION_UNAVAILABLE`, then
 * `UNSERVED_MAKER_POSITION_UNRESOLVED`, then
 * `NO_SERVABLE_MAKER_POSITION_AFTER_REVIEW`. The mechanism never changed. With
 * two makers and root 1 refused, the review guard (rightly) reviews nothing —
 * MONEY would be refused again and USAGE would be a billed call — so the
 * reviewed set is empty, and the serve-time projection seeded judged standing
 * from `effectiveMakerCount <= 1 ? every node : the reviewed set`. That keys on
 * the PLANNED panel size, which is never recomputed, so a paid-for root 0 was
 * hidden for want of a review no money could buy, the propagation ran over zero
 * nodes, no authored root was servable, and the run threw.
 *
 * R-A: a spend-stopped multi-maker run is projected on the single-maker footing,
 * because no judged standing can be bought once the envelope is reached. The
 * M = 1 branch seeds EVERY materialised node, since a mono run never reviews;
 * here every node the stop DENIED a review seeds its own basis in the same
 * way. For a stop during root authoring, or on the first review call, that is
 * every node and the projection is the M = 1 branch character for character.
 * For a stop after reviews have landed, their outcomes are kept as they are:
 * `agree`/`dispute` seed as always, and a review that returned `cannot-assess`
 * or whose transport died (`unjudgedReviewNodeIds`) keeps its node hidden WITH
 * its T6 / J14 record — seeding those too would erase a reviewer's verdict and
 * drop its disclosure from the answer, which nobody ruled.
 *
 * ONE decision, because the projection at the serve site and the disclosure at
 * the fact bundle are two halves of the same statement about what the answer
 * rests on, and the round-3 fix proved that a decision taken in two places is
 * one the runner can reach in one place and not the other. Pure — no pool, no
 * `this` — so `v28-spend-stopped-serve-decision.test.ts` drives it with the
 * exact state the refusal leaves behind; the runner's wiring to it is pinned by
 * `tests/architecture/v28-serve-decision-wiring.test.ts`.
 */
export function decideMakerPositionServe<T extends MakerPositionDisclosureRoot>(input: Readonly<{
  effectiveMakerCount: number;
  runBodyBudgetStop: EnvelopeStopKind | null;
  /** The maker ROOTS that exist — what was authored, never what was planned. */
  authoredMakerPositions: readonly T[];
  /** The operator-resolved graph, before any standing projection. */
  snapshot: EvaluationSnapshot;
  materialisedNodeIds: readonly string[];
  /** Nodes whose cross-maker review LANDED as a judgement (`agree`/`dispute`). */
  reviewedNodeIds: readonly string[];
  /** Nodes a review RAN for and left without judged standing: transport died, or `cannot-assess`. */
  unjudgedReviewNodeIds: readonly string[];
  monoMakerConditionMarks: readonly ConditionMarkRecord["mark"][];
  /** The mono-maker records name the served root, which is only known here. */
  monoMakerRecords: (servedRoot: T) => readonly ConditionMarkRecord[];
}>): MakerPositionServeDecision<T> {
  const footing: MakerPositionServeFooting = input.effectiveMakerCount <= 1
    ? "MONO_MAKER"
    : input.runBodyBudgetStop === null ? "CROSS_REVIEWED" : "SPEND_STOPPED";
  const judgedStandingSeed: readonly string[] = (() => {
    switch (footing) {
      case "MONO_MAKER":
        return input.materialisedNodeIds;
      case "CROSS_REVIEWED":
        return input.reviewedNodeIds;
      case "SPEND_STOPPED": {
        const reviewed = new Set(input.reviewedNodeIds);
        const unjudged = new Set(input.unjudgedReviewNodeIds);
        return Object.freeze([
          ...input.reviewedNodeIds,
          ...input.materialisedNodeIds.filter((nodeId) => !reviewed.has(nodeId) && !unjudged.has(nodeId))
        ]);
      }
      default: return exhaustive(footing);
    }
  })();
  const standing = projectJudgedStanding(input.snapshot, judgedStandingSeed);
  const propagation = evaluate(standing.snapshot);
  const propagatedNodeIds = new Set(propagation.strengths.map((row) => row.nodeId));
  const servableMakerPositions = Object.freeze(
    input.authoredMakerPositions.filter((root) => propagatedNodeIds.has(root.nodeId))
  );
  if (servableMakerPositions.length === 0) {
    throw new TypedDomainError(
      "NO_SERVABLE_MAKER_POSITION_AFTER_REVIEW",
      "Every authored maker position was excluded after cross-maker review transport exhaustion"
    );
  }
  // T10: propagation picks the served root, configuration order does not.
  const servedRootSelection = selectServedRootByStrength(servableMakerPositions, propagation.strengths);
  const servedRoot = servedRootSelection.root;
  const disclosure = buildMakerPositionDisclosure({
    effectiveMakerCount: input.effectiveMakerCount,
    runBodyBudgetStop: input.runBodyBudgetStop,
    authoredMakerPositions: input.authoredMakerPositions,
    servedRoot,
    monoMakerConditionMarks: input.monoMakerConditionMarks,
    monoMakerRecords: input.monoMakerRecords(servedRoot)
  });
  return Object.freeze({
    footing,
    judgedStandingSeed: Object.freeze([...judgedStandingSeed]),
    standing,
    propagation,
    servableMakerPositions,
    servedRootSelection,
    servedRoot,
    disclosure
  });
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
    /**
     * A15d (controller carry 6) — a resumed pass's SPENT seat keys, by bare
     * site. A `<site>:seat:<slot>` key the preflight found at its allowance,
     * whose partner key holds fewer than `judge` attempts, is not a halt: the
     * member in that slot is ineligible for the site on this pass and its
     * partner answers instead (`spentSeatSlots`). A partner at `judge` or more
     * keeps today's halt or terminal (A16a carry 7). Should the site's seat
     * hold no such partner after all, the site halts exactly as today
     * (`spentSiteHalts`, the same record the preflight would have made).
     */
    const spentSeatSlots = new Map<string, SeatSlot>();
    const spentSiteHalts = new Map<string, {
      readonly outcome: "TIMED_OUT" | "FAILED";
      readonly ledgerEntryRef: string;
    }>();
    const cooldownAttempt = async <T>(input: {
      readonly callSiteKey: string;
      readonly parentNodeId: string | null;
      readonly plannedLegCount: number;
      readonly failureScope: "MAKER_POSITION" | "EXPANSION" | "REVIEW";
      readonly attempt: (maxAttempts: number) => Promise<T>;
      /**
       * A15: on an assigned run, the seat member this site calls first, or null
       * when the ledger left the site no member to call. Absent on the legacy
       * book, which keeps today's path byte for byte.
       */
      readonly seatMember?: SeatMember | null | undefined;
      /**
       * A16a fix round 1: the member the site's post-cooldown retry goes to,
       * asked between the sequences — the site's first member, or the other one
       * when a usage cap downed it (R4) — so carry 3 reads the key opposite the
       * member that ACTUALLY retries. Absent, `seatMember` is taken.
       */
      readonly retrySeatMember?: () => SeatMember | null;
    }): Promise<
      | { readonly kind: "AUTHORED"; readonly value: T }
      | { readonly kind: "HALTED"; readonly record: HaltedExpansionRecord }
    > => {
      // A15a (controller carry 4): holds, halts and their records name the SITE —
      // 0069's `core.progress_value_is_code_shaped` refuses a seat suffix on an
      // encrypted run, and the halt list is keyed by site. Callers already pass
      // the bare site; this keeps a marked key from ever reaching the record.
      const siteKey = seatBaseCallSiteKey(input.callSiteKey);
      const policy = this.settings.runDeathPolicy;
      if (policy === undefined) {
        return { kind: "AUTHORED", value: await input.attempt(this.settings.judgeBound.maxAttempts) };
      }
      const hold = this.settings.holdRecorder;
      if (hold === undefined) {
        throw new TypedDomainError("RUN_HOLD_RECORDER_UNRESOLVED", "runDeathPolicy requires a production hold recorder");
      }
      /**
       * A16a (controller ruling on concern 2): an assigned site's TRUE attempts —
       * both of its seat keys, off the ledger — for its hold and halt records. A
       * seat that switched to its backup spent on two keys; the legacy book has
       * one bare key and keeps today's arithmetic byte for byte.
       */
      const siteAttemptsSpent = input.seatMember === undefined ? undefined : async (): Promise<number> => {
        let total = 0;
        for (const seat of ["main", "runnerUp"] as const) {
          total += await this.#ledger.countModelAttempts({
            runId: run.runId,
            workItemId: claimed.workItemId,
            contractHash: this.settings.judgeContractHash,
            callSiteKey: seatCallSiteKey(siteKey, seat)
          });
        }
        return total;
      };
      const preflight = preflightHaltedSites.get(siteKey)
        ?? (input.seatMember === null ? spentSiteHalts.get(siteKey) : undefined);
      if (preflight !== undefined) {
        const record = Object.freeze({
          callSiteKey: siteKey,
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
          callSiteKey: siteKey,
          parentNodeId: input.parentNodeId,
          holdMs: policy.cooldownMs,
          holdUntil: null,
          attemptsSpent: siteAttemptsSpent === undefined
            ? this.settings.judgeBound.maxAttempts + policy.finalRetryAttempts
            : await siteAttemptsSpent(),
          transportOutcome: preflight.outcome,
          plannedLegCount: input.plannedLegCount
        });
        return { kind: "HALTED", record };
      }
      const seatMember = input.seatMember;
      return withCooldownRetry({
        runId: run.runId,
        callSiteKey: siteKey,
        parentNodeId: input.parentNodeId,
        plannedLegCount: input.plannedLegCount,
        baseMaxAttempts: this.settings.judgeBound.maxAttempts,
        failureScope: input.failureScope,
        policy,
        hold,
        attempt: input.attempt,
        ...(siteAttemptsSpent === undefined ? {} : { siteAttemptsSpent }),
        // A15d (controller carry 3, the ruling's preferred option): the site's
        // ONE final retry. A seat key past the sequence bound has spent it, so
        // the member answering here gets none when its partner's key has.
        // A16a: the post-cooldown retry never switches, and it goes to the
        // member that ran the site's first sequence — or, when a usage cap downed
        // that member, to the other one (fix round 1). `retrySeatMember`, asked
        // now, names it, so this reads exactly the key opposite the member that
        // retries; a backup that answered inside the first sequence left the
        // site done.
        ...(seatMember === undefined || seatMember === null ? {} : {
          finalRetryPermitted: async () => {
            const retrying = input.retrySeatMember?.() ?? seatMember;
            return await this.#ledger.countModelAttempts({
              runId: run.runId,
              workItemId: claimed.workItemId,
              contractHash: this.settings.judgeContractHash,
              callSiteKey: seatCallSiteKey(siteKey, retrying.pinnedAs === "MAIN" ? "runnerUp" : "main")
            }) <= this.settings.judgeBound.maxAttempts;
          }
        })
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
    /**
     * Model scorecard A15 (spec §2.7) — the role assignment the picker pinned at
     * ask admission, or null. Null is today's run exactly: the legacy seat book
     * below seats every claim-eligible debater in every role and keeps the
     * sealed synthesis refs. A pinned assignment that cannot seat a debate is a
     * TERMINAL refusal, like the other claim-time refusals: only a new ask can
     * repair it.
     */
    const pinnedRoleAssignment = await readRunRoleAssignment(this.pool, run.runId);
    let roleAssignment: RoleAssignment | null = null;
    if (pinnedRoleAssignment !== null) {
      const parsedAssignment = RoleAssignmentSchema.safeParse(pinnedRoleAssignment.assignment);
      const seatProblem = parsedAssignment.success
        ? roleAssignmentSeatProblem(parsedAssignment.data)
        : "the pinned assignment does not parse";
      if (!parsedAssignment.success || seatProblem !== null) {
        await this.#work.recordTerminalFailure({
          runId: run.runId,
          workItemId: claimed.workItemId,
          reason: "RUN_ROLE_ASSIGNMENT_INVALID"
        });
        throw new TypedDomainError(
          "RUN_ROLE_ASSIGNMENT_INVALID",
          `The run's pinned role assignment cannot seat a debate: ${seatProblem ?? "unparseable"}`
        );
      }
      // A14: the frozen ceiling provisions `panel_size` maker positions. More
      // debaters would author nodes the envelope never counted.
      if (parsedAssignment.data.roles.POSITION.length > envelopeBasis.panelSize) {
        throw new TypedDomainError(
          "RUN_ENVELOPE_BASIS_INVALID",
          `The frozen envelope provisions ${String(envelopeBasis.panelSize)} maker positions and the pinned assignment seats ${String(parsedAssignment.data.roles.POSITION.length)}`
        );
      }
      roleAssignment = parsedAssignment.data;
    }
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
    /**
     * A15: an assigned run's seats may name routes OUTSIDE the pinned debate
     * panel (a judge from a maker that is not debating, a runner-up). Each gets
     * the same one no-hold probe an out-of-panel synthesis role gets, pinned to
     * the candidate's model id; a route this deployment never configured is
     * ABSENT for the same reason a pinned member is. Routes the panel loop above
     * already probed reuse its verdict.
     */
    let assignedSeats: AssignedRunSeatBook | null = null;
    // A15d: the panel's own absences, kept before an assigned run re-reads
    // `absentAtClaim` as its dropped POSITION seats below; J24 (3) names a
    // sealed ref's failure from here. A legacy run's copy is the list itself.
    const panelAbsentAtClaim = Object.freeze([...absentAtClaim]);
    // A15d (fix round 1, minor 4): ONE verdict per route per claim. Declared
    // here so the sealed-ref probe below reuses what this block probed, rather
    // than probing a route twice and letting the claim disagree with itself.
    // Empty on a legacy run.
    const routeHealth = new Map<string, RouteHealth>();
    if (roleAssignment !== null) {
      for (const member of configuredMakers) routeHealth.set(member.providerRef, Object.freeze({ state: "HEALTHY" as const }));
      for (const absent of absentAtClaim) {
        routeHealth.set(absent.member.provider_ref, Object.freeze({ state: "ABSENT" as const, failureCode: absent.failureCode }));
      }
      const assignmentRoutes = new Map<string, SeatCandidate>();
      for (const seats of Object.values(roleAssignment.roles)) {
        for (const pinned of seats) {
          for (const candidate of [pinned.main, pinned.runnerUp]) {
            if (candidate !== null && !assignmentRoutes.has(candidate.providerRef)) {
              assignmentRoutes.set(candidate.providerRef, candidate);
            }
          }
        }
      }
      for (const candidate of assignmentRoutes.values()) {
        if (routeHealth.has(candidate.providerRef)) continue;
        const configured = configuredByProviderRef.get(candidate.providerRef);
        if (configured === undefined) {
          routeHealth.set(candidate.providerRef, Object.freeze({ state: "ABSENT" as const, failureCode: "CLAIM_GATEWAY_UNRESOLVED" }));
          continue;
        }
        if (this.settings.claimTimeSynthesisRoleProbe === undefined) {
          routeHealth.set(candidate.providerRef, Object.freeze({ state: "HEALTHY" as const }));
          continue;
        }
        let observation: {
          readonly state: "HEALTHY" | "ABSENT";
          readonly modelId: string | null;
          readonly failureCode: string | null;
        };
        try {
          observation = await this.settings.claimTimeSynthesisRoleProbe(candidate.providerRef);
        } catch (error) {
          observation = {
            state: "ABSENT", modelId: null,
            failureCode: error instanceof TypedDomainError ? error.code : "CLAIM_PROVIDER_PROBE_FAILED"
          };
        }
        const failureCode = observation.state === "HEALTHY" && observation.modelId === candidate.modelId
          ? null
          : observation.state === "HEALTHY"
            ? "CLAIM_MODEL_IDENTITY_CHANGED"
            : observation.failureCode ?? "CLAIM_PROVIDER_ABSENT";
        await this.#providerProbes.record({
          probeEvidenceRef: randomUUID(), providerRef: candidate.providerRef, maker: configured.maker,
          state: failureCode === null ? "HEALTHY" : "ABSENT",
          modelId: failureCode === null ? observation.modelId : null, failureCode, probedAt: new Date()
        });
        routeHealth.set(candidate.providerRef, failureCode === null
          ? Object.freeze({ state: "HEALTHY" as const })
          : Object.freeze({ state: "ABSENT" as const, failureCode }));
      }
      assignedSeats = buildAssignedRunSeatBook({
        assignment: roleAssignment, configured: configuredByProviderRef, routeHealth
      });
      // A POSITION seat with neither candidate claim-eligible is today's absent
      // maker: dropped, compacted and disclosed through the same
      // CLAIM_PANEL_REVISED record. A seat its runner-up saved is NOT absent —
      // its switch is disclosed as BACKUP-MODEL-USED (A16).
      absentAtClaim.splice(0, absentAtClaim.length, ...assignedSeats.droppedPositionSeats.map(({ candidate, failureCode }) => Object.freeze({
        member: Object.freeze({
          provider_ref: candidate.providerRef,
          maker: candidate.maker,
          model_id: candidate.modelId,
          probe_evidence_ref: "role-assignment",
          probed_at: "role-assignment"
        }),
        failureCode
      })));
    }
    if ((assignedSeats === null ? configuredMakers.length : assignedSeats.book.position.length) === 0) {
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
    // A plan selects debate voices; the register separately selects synthesis roles.
    // Reuse in-panel verdicts, including absence, and probe only out-of-panel roles.
    const synthesisMakers = [...configuredMakers];
    const synthesisFailures = new Map<string, string>();
    const panelRefs = new Set(run.discoveredPanel.map((member) => member.provider_ref));
    // A15: an assigned run takes a synthesis role from its ANSWER_WRITER /
    // ANSWER_CHECKER seat (spec §2.7; the owner relaxed J24's "never substitute"
    // for them on 2026-09-26), so THAT role's sealed ref is neither probed nor
    // enforced. A role the assignment leaves to its sealed ref — a FALLBACK seat
    // (pre-flight ruling F18) — keeps both exactly as today: skipping them would
    // call an out-of-panel sealed ref unprobed, and its absence would surface as
    // a mid-run death after the debate was paid for. A role whose pinned seat has
    // neither member claim-eligible is refused below, by its seat. The pre-claim
    // J24 (2) check above is unchanged.
    const sealedRefRoles = SYNTHESIS_ROLES.filter((role) => {
      if (assignedSeats === null) return true;
      const seatRole = role === "SYNTHESIZER" ? "ANSWER_WRITER" as const : "ANSWER_CHECKER" as const;
      return (role === "SYNTHESIZER" ? assignedSeats.book.answerWriter : assignedSeats.book.answerChecker) === null
        && !assignedSeats.unavailableSynthesis.some((entry) => entry.role === seatRole);
    });
    for (const roleRef of new Set(sealedRefRoles.map((role) => role === "SYNTHESIZER"
      ? synthesisRolePolicy.synthesizerRoleRef
      : synthesisRolePolicy.evaluatorRoleRef))) {
      if (panelRefs.has(roleRef)) continue;
      const configured = configuredByProviderRef.get(roleRef);
      if (configured === undefined || this.settings.claimTimeSynthesisRoleProbe === undefined) continue;
      // A15d (fix round 1, minor 4): a route the assignment also names was
      // probed above in this claim; its verdict stands, and no second probe row
      // is written for it.
      const claimVerdict = routeHealth.get(roleRef);
      if (claimVerdict !== undefined) {
        if (claimVerdict.state === "HEALTHY") synthesisMakers.push(configured);
        else synthesisFailures.set(roleRef, claimVerdict.failureCode);
        continue;
      }
      let observation;
      try {
        observation = await this.settings.claimTimeSynthesisRoleProbe(roleRef);
      } catch (error) {
        observation = {
          state: "ABSENT" as const, modelId: null,
          failureCode: error instanceof TypedDomainError ? error.code : "CLAIM_PROVIDER_PROBE_FAILED"
        };
      }
      const healthy = observation.state === "HEALTHY" && observation.modelId !== null;
      const failureCode = healthy ? null : observation.failureCode ?? "CLAIM_PROVIDER_ABSENT";
      await this.#providerProbes.record({
        probeEvidenceRef: randomUUID(), providerRef: roleRef, maker: configured.maker,
        state: healthy ? "HEALTHY" : "ABSENT",
        modelId: healthy ? observation.modelId : null, failureCode, probedAt: new Date()
      });
      if (healthy) synthesisMakers.push(configured);
      else synthesisFailures.set(roleRef, failureCode!);
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
    for (const role of sealedRefRoles) {
      const roleRef = role === "SYNTHESIZER"
        ? synthesisRolePolicy.synthesizerRoleRef
        : synthesisRolePolicy.evaluatorRoleRef;
      if (synthesisMakers.some((maker) => maker.providerRef === roleRef)) continue;
      const absent = panelAbsentAtClaim.find((entry) => entry.member.provider_ref === roleRef);
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
          absent_failure_code: absent?.failureCode ?? synthesisFailures.get(roleRef) ?? null
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
    // A15: the same refusal for an assigned run's synthesis seats — neither the
    // main nor the runner-up claim-eligible. Same event shape (0069 admits it
    // for encrypted runs), same terminal reason, no substitution.
    for (const unavailable of assignedSeats?.unavailableSynthesis ?? []) {
      const role = unavailable.role === "ANSWER_WRITER" ? "SYNTHESIZER" as const : "EVALUATOR" as const;
      await this.#runs.recordRunLifecycleEvent({
        runId: run.runId,
        kind: "ledger.could_not_do",
        value: {
          state: "SYNTHESIS_ROLE_PROVIDER_ABSENT",
          call_site_key: `${role}:${unavailable.candidate.providerRef}`,
          role_ref: unavailable.candidate.providerRef,
          role,
          absent_failure_code: unavailable.failureCode
        }
      });
      await this.#work.recordTerminalFailure({
        runId: run.runId,
        workItemId: claimed.workItemId,
        reason: `SYNTHESIS_ROLE_PROVIDER_ABSENT_AT_CLAIM:${role}`
      });
      throw new TypedDomainError(
        "SYNTHESIS_ROLE_PROVIDER_ABSENT_AT_CLAIM",
        `The pinned ${unavailable.role} seat had neither its main nor its runner-up claim-eligible (${unavailable.failureCode}); the run refuses rather than serving from a route the assignment did not name`
      );
    }
    const seatBook: RunSeatBook = assignedSeats?.book ?? buildLegacyRunSeatBook(configuredMakers);
    /**
     * Model scorecard A16c (R4; controller carries 8 and 15) — the progress
     * stream's side of every switch: the owner/admin record that names the
     * role, the seat, both routes, the cause and the key (the answer's own
     * record says it in plain words, below, before `serve.persist`). Withheld,
     * never refused, on a content-encrypted run (0069's closed progress shapes),
     * and told once per run however many passes make it.
     */
    const announceSwitch = async (
      value: Parameters<RunRepository["recordBackupSwitchEvent"]>[0]["value"]
    ): Promise<void> => {
      await this.#runs.recordBackupSwitchEvent({ runId: run.runId, value });
    };
    // A16a: the run id is part of every site's 80-20 ordinal (controller carry 1),
    // and the switches made at claim open the caller's switch record. A16c: each
    // switch made during a call, or through the ledger on a resumed pass, is told
    // BEFORE the other member is called.
    const seatCaller = createSeatCaller({
      assigned: seatBook.assigned,
      runId: run.runId,
      claimSwitches: assignedSeats?.claimSwitches ?? [],
      onSwitch: (record) => announceSwitch(backupSwitchEventValue(record))
    });
    // A16c (carries 8b and 8d): the switches made at claim, and the roles whose
    // pinned seats were ALL absent, so the debaters sit in them (A15d's
    // `fallbackRoles`) — only a role the assignment pinned seats for: a role it
    // left empty planned no model that could be unavailable.
    const fellBackRoles = (assignedSeats?.fallbackRoles ?? [])
      .filter((role) => (roleAssignment?.roles[role] ?? []).length > 0);
    for (const record of assignedSeats?.claimSwitches ?? []) await announceSwitch(backupSwitchEventValue(record));
    for (const role of fellBackRoles) {
      await announceSwitch(roleFallbackEventValue(role, roleAssignment?.roles[role] ?? [], role === "SUPPORT_ATTACK"
        ? seatBook.supportAttack
        : role === "JUDGE" ? seatBook.judge : seatBook.reviewer));
    }
    const effectiveMakerCount = seatBook.position.length;
    /**
     * A15 (R5) and controller ruling A14 (carry 1): debaters come from distinct
     * makers. On an assigned run a POSITION member may answer only when no OTHER
     * POSITION seat holds its maker — read off the CLAIMED book, never off who
     * happened to answer earlier on this pass, so a resumed pass finds the same
     * members eligible at every root. RoleAssignmentSchema already forbids a
     * shared POSITION maker, runner-ups included; this keeps the law where the
     * call is made. The legacy book is not re-validated.
     */
    const positionMakerIsFree = (seat: RunSeat, member: SeatIdentity): boolean => !seatBook.assigned
      || seatBook.position.every((other) => other === seat
        || [other.main, other.runnerUp].every((rival) => rival === null || rival.maker !== member.maker));
    /**
     * A15 (R5): the member that actually wrote each root; its cross-exchanges are
     * that member's. A15d (controller carries 1 and 2) seeds it from the LEDGER
     * before the first root: a root an earlier pass answered starts with the
     * member that answered it (the root call itself prefers that slot through
     * `ledgerSeatRule`). A16c (carry 14b): the separate `restoredRootMembers`
     * map this seeding used to go through was written and never read.
     */
    const positionAnswerers = new Map<number, SeatMember>();
    /**
     * A16a (controller rulings on carry 1 and on the resume gaps) — what
     * EARLIER passes of this work item recorded under each seat-marked key of
     * the judge contract and of the two synthesis contracts (their keys never
     * collide): its attempts, the order of its latest answer (an `OK` row; a
     * refused answer is `FAILED`), and the rows a spent site cites. Filled from
     * the ledger before the first root; empty on a first pass and on the legacy
     * book.
     */
    type SeatKeyRow = Awaited<ReturnType<LedgerRepository["readSeatMarkedModelCalls"]>>[number];
    const seatKeyHistory = new Map<string, {
      readonly attempts: number;
      readonly lastAnsweredAt: number | null;
      /**
       * A16c (controller carry 14a): the routes that ACTUALLY answered or
       * attempted under this key — the rows' actors. A cross-exchange keeps the
       * one key it holds when its root's writer changes, so a key's marker is
       * never read as who ran there.
       */
      readonly actors: ReadonlySet<string>;
      /** The key's latest row with an attempt id, and its latest failed one, each with its ledger order. */
      readonly latest: { readonly row: SeatKeyRow; readonly at: number } | null;
      readonly latestFailure: { readonly row: SeatKeyRow; readonly at: number } | null;
    }>();
    /** The base keys of every synthesis site an earlier pass recorded, by contract. */
    const synthesisSitesByContract = new Map<string, Set<string>>();
    const seatKeyOf = (baseKey: string, member: SeatMember): string =>
      seatCallSiteKey(baseKey, member.pinnedAs === "MAIN" ? "main" : "runnerUp");
    /**
     * A16a (controller rulings on carry 1 and on the resume gaps) — A15d's root
     * restoration, for EVERY seat site of the judge and synthesis contracts. The
     * seat caller's down marks live in memory only, so without this a resumed
     * pass would try a site's main first again after the runner-up took the
     * site over, and meet the main's spent key (`CALL_BUDGET_EXHAUSTED`). From
     * the ledger instead, among the members the call's own rule allows:
     *  · a slot that ANSWERED the site and can still be called (fewer than
     *    `bound` attempts) is PREFERRED — tried first, with the other member
     *    still its backup (A16a fix round 1: a preference, never a filter, so an
     *    outage on the restored slot moves the site to its backup as R4 says);
     *  · a slot at or over `bound` is never tried while another slot can still
     *    be called — a finished switch stays made, and a spent main hands the
     *    site to an untried runner-up as carry 6 does.
     * `bound` is the site's first-sequence allowance (`judge`, or the synthesis
     * role's). It restricts a two-member seat only, and only when a member
     * remains; A15d's carry-6 hand-off and carry-3 check are untouched, and the
     * per-key caps keep a cooldown site within 2j + f. `baseKeyOf` is the
     * member's key before its seat marker (the panel names the answering route
     * in its key).
     */
    const ledgerSeatRule = (
      seat: RunSeat,
      baseKeyOf: (member: SeatMember) => string,
      allowed: (member: SeatMember) => boolean,
      bound: number
    ): { readonly eligible: (member: SeatMember) => boolean; readonly prefer?: SeatSlot } => {
      const everyone = { eligible: () => true };
      if (!seatBook.assigned || seat.runnerUp === null) return everyone;
      const members = [seat.main, seat.runnerUp].filter(allowed);
      const historyOf = (member: SeatMember) => seatKeyHistory.get(seatKeyOf(baseKeyOf(member), member));
      const answeredAt = (member: SeatMember): number => historyOf(member)?.lastAnsweredAt ?? -1;
      const callable = members.filter((member) => (historyOf(member)?.attempts ?? 0) < bound);
      const answered = callable.filter((member) => answeredAt(member) >= 0)
        .sort((left, right) => answeredAt(right) - answeredAt(left))[0];
      const eligible = callable.length > 0 && callable.length < members.length
        ? (member: SeatMember): boolean => callable.some((usable) => usable.pinnedAs === member.pinnedAs)
        : everyone.eligible;
      return answered === undefined ? { eligible } : { eligible, prefer: answered.pinnedAs };
    };
    /**
     * A16a (controller ruling on resume gap 2) — whether EVERY member a site's
     * call may use was already at or over `bound` on an earlier pass, so the
     * site can make no call; null otherwise. The site then reaches today's clean
     * halt (a judge site) or terminal (roots 0/1, a synthesis site) instead of a
     * `CALL_BUDGET_EXHAUSTED` crash. A16a fix round 1: `failure` is the latest
     * FAILED or TIMED_OUT row of those keys, cited with its OWN outcome by a
     * halt, and null when they hold no failure at all (every attempt answered):
     * a halt names a transport outcome, and the database admits only those two,
     * so such a site is never halted on a made-up one. `latest` is the keys'
     * latest row; a terminal cites `failure ?? latest` (A16c, controller carry
     * 14c: an OK row would settle a FAILED work item on an answer's attempt).
     */
    const spentSiteRow = (slots: readonly SeatSlot[], baseKey: string, bound: number): {
      readonly failure: (SeatKeyRow & { readonly outcome: "FAILED" | "TIMED_OUT" }) | null;
      readonly latest: SeatKeyRow;
    } | null => {
      if (!seatBook.assigned || slots.length === 0) return null;
      const histories = slots.map((slot) => seatKeyHistory.get(seatCallSiteKey(baseKey, slot === "MAIN" ? "main" : "runnerUp")));
      if (histories.some((history) => (history?.attempts ?? 0) < bound)) return null;
      const latestOf = (pick: "latest" | "latestFailure") => histories
        .map((history) => history?.[pick] ?? null)
        .filter((entry): entry is { readonly row: SeatKeyRow; readonly at: number } => entry !== null)
        .sort((left, right) => right.at - left.at)[0]?.row ?? null;
      const latest = latestOf("latest");
      if (latest === null) return null;
      const failed = latestOf("latestFailure");
      return {
        failure: failed === null || failed.outcome === "OK" ? null : { ...failed, outcome: failed.outcome },
        latest
      };
    };
    const membersOf = (seat: RunSeat): readonly SeatMember[] =>
      seat.runnerUp === null ? [seat.main] : [seat.main, seat.runnerUp];
    /**
     * Model scorecard A16c (controller carries 8c, 13 and 14a) — the switch a
     * RESUMED pass makes through the ledger rather than inside a call. It exists
     * when the member R3's split plans for the site (`plannedSeatSlot`) is one
     * the call's fairness rule allows but the LEDGER bars (`eligible`: carry 6's
     * spent slot, or `ledgerSeatRule`'s slot at its bound), and the other member
     * can answer and never ran at the site on an earlier pass. "Ran" is read off
     * the rows' ACTORS (carry 14a), never a key's marker. When the other member
     * DID run there, an earlier pass already switched the site and told the
     * stream; this pass only re-asks the member that answered (node ids are
     * rebuilt), so there is no second switch to record (carry 13) — the answer
     * still discloses the stand-in from who answered (`BackupAnswer`).
     *
     * WHY READING THE ACTORS AND READING THE MARKER AGREE (fix round 1,
     * Minor 3 — keep the actor read; the `ran-by-marker` mutant survives for
     * exactly this reason). For ONE claim shape the two are the same fact:
     * a member always records under its OWN slot's marker (`keyOf` in
     * run-seats.ts), RoleAssignmentSchema forbids one route twice in a role,
     * and the one seat that keeps an older marker — a cross-exchange, which
     * follows its root's writer — has no runner-up, so it never reaches this
     * function. "The other member's route ran at the site" is then "the other
     * member's key holds rows". They part only when the claim SHAPE flips
     * between passes: a role that fell back to the debaters on one pass and not
     * on the next (or the reverse) leaves a site key such as `…:seat:main`
     * holding ANOTHER seat's route. Neither reading is exact there: if that
     * debater's route is this seat's runner-up, the actor read sees it as "ran
     * here" and suppresses a real move, while the marker read would count the
     * debater's rows against the wrong member. Only the progress stream is at
     * stake — the answer's disclosure counts who answered on this pass — and
     * the per-key caps still bound the site.
     */
    const newLedgerMove = (input: {
      readonly seat: RunSeat;
      readonly siteKey: string;
      readonly baseKeyOf: (member: SeatMember) => string;
      readonly fair: (candidate: SeatIdentity) => boolean;
      readonly eligible: (member: SeatMember) => boolean;
      readonly ordinal?: number;
    }): LedgerSeatMove | undefined => {
      const { seat } = input;
      if (!seatBook.assigned || seat.runnerUp === null) return undefined;
      const plannedSlot = plannedSeatSlot(seat, input.siteKey, {
        runId: run.runId, ...(input.ordinal === undefined ? {} : { ordinal: input.ordinal })
      });
      const planned = plannedSlot === seat.main.pinnedAs ? seat.main : seat.runnerUp;
      const other = planned === seat.main ? seat.runnerUp : seat.main;
      if (!input.fair(planned) || !input.fair(other) || input.eligible(planned) || !input.eligible(other)) return undefined;
      const otherRanHere = [planned, other].some((member) =>
        seatKeyHistory.get(seatKeyOf(input.baseKeyOf(member), member))?.actors.has(other.providerRef) === true);
      return otherRanHere
        ? undefined
        : Object.freeze({ from: plannedSlot, callSiteKey: seatKeyOf(input.baseKeyOf(planned), planned) });
    };
    /**
     * A15: who may answer ONE seat call at `siteKey` on this pass — the call's
     * own fairness rule, minus a member whose key the preflight found spent
     * (carry 6), then the ledger's record of earlier passes (A16a,
     * `ledgerSeatRule`). `seatMember` is the member the seat caller will call
     * first; it is undefined on the legacy book, which keeps today's cooldown
     * path, and null when no member can be called. A16a (resume gap 2): when
     * every usable key is already spent, `spent` is the row the site cites and
     * the site halts through `spentSiteHalts` without a call. A16c: the options
     * also carry the fairness rule alone (`fair`), so a member it bars is never
     * counted as a stand-in, and the switch the ledger itself makes, `newLedgerMove`.
     */
    const seatCallPlan = (seat: RunSeat, siteKey: string, rule?: (candidate: SeatIdentity) => boolean) => {
      const judgeAttempts = this.settings.judgeBound.maxAttempts;
      const fair = (candidate: SeatIdentity): boolean => rule === undefined || rule(candidate);
      const allowed = (member: SeatMember): boolean => fair(member) && spentSeatSlots.get(siteKey) !== member.pinnedAs;
      const fromLedger = ledgerSeatRule(seat, () => siteKey, allowed, judgeAttempts);
      const eligible = (member: SeatMember): boolean => allowed(member) && fromLedger.eligible(member);
      const ledgerMove = newLedgerMove({ seat, siteKey, baseKeyOf: () => siteKey, fair, eligible });
      // What every seat call at this site passes: who may answer, and the slot a resumed pass prefers.
      const options = Object.freeze({
        eligible,
        fair,
        ...(fromLedger.prefer === undefined ? {} : { prefer: fromLedger.prefer }),
        ...(ledgerMove === undefined ? {} : { ledgerMove })
      });
      const spent = spentSiteRow(membersOf(seat).filter(eligible).map((member) => member.pinnedAs), siteKey, judgeAttempts);
      // A16a fix round 1: a halt cites a real failure with its own outcome; a site whose spent
      // keys hold none keeps the gateway's refusal rather than a halt on a made-up outcome.
      const halts = spent !== null && spent.failure !== null;
      if (halts) {
        spentSiteHalts.set(siteKey, { outcome: spent.failure!.outcome, ledgerEntryRef: spent.failure!.ledgerEntryRef });
      }
      return Object.freeze({
        ...options,
        options,
        spent,
        seatMember: !seatBook.assigned ? undefined : halts ? null : seatCaller.plan(seat, siteKey, options),
        /** The member the site's post-cooldown retry goes to, asked between the sequences (A15d carry 3). */
        retryMember: () => (seatBook.assigned ? seatCaller.plan(seat, siteKey, options) : null)
      });
    };
    // A16a fix round 1: the root a resumed pass restores is PREFERRED through the
    // ledger rule (`seatCallPlan`'s `prefer`), no longer a filter, so its seat
    // keeps its backup; the ledger read still seeds `positionAnswerers`.
    const positionRule = (seat: RunSeat) => (member: SeatIdentity): boolean => positionMakerIsFree(seat, member);
    /**
     * Model scorecard A16c (controller carries 12 and 16) — THE SYNTHESIS SEATS
     * TAKE PART IN R3's 80-20 SPLIT, through the same site-pure ordinal every
     * other seat call reads (`seatSiteOrdinal`), hashed over the role's
     * RUN-LEVEL site — `COMPOSER:SYNTHESIZER` / `POST_COMPOSE_R9:EVALUATOR`, the
     * sites the serve chain's role controls are planned at — rather than a
     * round's own key. The writer and the checker are called once per ROUND, so
     * a per-round ordinal would flip identities mid-loop; one ordinal per run and
     * role makes a whole debate's synthesis use either the main or the runner-up
     * (R3), the same one on every resumed pass. Excluding them would make their
     * runner-ups backups only and silently drop the diversity the assignment
     * pinned for them. There is no second ordinal path (no run-wide hash, no
     * call index, no per-POSITION hash).
     */
    const synthesisOrdinal = (seat: RunSeat): number => seatSiteOrdinal({
      runId: run.runId,
      role: seat.role,
      pinnedSeatIndex: seat.pinnedSeatIndex,
      callSiteKey: seat.role === "ANSWER_CHECKER" ? "POST_COMPOSE_R9:EVALUATOR" : "COMPOSER:SYNTHESIZER"
    });
    /**
     * A16a (controller ruling on resume gap 1; fix round 1): who may answer a
     * synthesis site on this pass, and the slot it prefers — the ledger's record
     * of earlier passes, against the role's own sealed bound (`ledgerSeatRule`). A site no slot can answer
     * never gets here: the work item already failed terminally before the
     * first root.
     */
    const synthesisSeatOptions = (role: "SYNTHESIZER" | "EVALUATOR", seat: RunSeat, siteKey: string) => {
      const rule = ledgerSeatRule(seat, () => siteKey, () => true, role === "SYNTHESIZER"
        ? this.settings.synthesisRolePolicy.synthesizerBound.maxAttempts
        : this.settings.synthesisRolePolicy.evaluatorBound.maxAttempts);
      const ordinal = synthesisOrdinal(seat);
      // A16c (carry 8c): a spent main's synthesis handed to its backup on a resumed pass is a switch.
      const ledgerMove = newLedgerMove({ seat, siteKey, baseKeyOf: () => siteKey, fair: () => true, eligible: rule.eligible, ordinal });
      return {
        ordinal,
        eligible: rule.eligible,
        ...(rule.prefer === undefined ? {} : { prefer: rule.prefer }),
        ...(ledgerMove === undefined ? {} : { ledgerMove })
      };
    };
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

      // A15 (R5): the panel is the JUDGE seats. A seat whose every member is the
      // author's own maker is still handed over — under its main's maker and
      // route — so runJudgePanel records the FX-HR-H6 refusal exactly as it
      // always has. The seats that CAN judge are capped at `panel_size - 1` per
      // node, the panel basis (PANEL_SIZE_MINUS_ONE) the frozen ceiling was
      // minted for; on the legacy book the cap never binds.
      //
      // A15d (controller carry 9): "not the author" is the author's MAKER, not
      // its route — FX-HR-H6 is "no maker grades its own artifact", as A15c's
      // runJudgePanel and the database enforce it — so the seat caller never
      // pays for a call the panel would refuse, and a seat whose main shares the
      // author's maker is answered by its runner-up instead of being lost.
      const notTheAuthor = (member: SeatIdentity): boolean => member.maker !== input.authorMaker;
      const panelCallCap = Math.max(effectiveMakerCount, envelopeBasis.panelSize) - 1;
      let panelCallsPlanned = 0;
      const panelKeyFor = (member: SeatMember): string => `${input.callSiteKey}:${member.providerRef}`;
      const panelMembers = seatBook.judge.flatMap((seat) => {
        // A16a (controller ruling on carry 1; fix round 1): a panel site a slot
        // answered on an earlier pass is PREFERRED for that slot again, and the
        // other member stays its backup (`ledgerSeatRule`).
        const fromLedger = ledgerSeatRule(seat, panelKeyFor, notTheAuthor, this.settings.judgeBound.maxAttempts);
        const eligible = (member: SeatMember): boolean => notTheAuthor(member) && fromLedger.eligible(member);
        // A16c: the author rule alone (`fair`), so a member it bars is never a stand-in, and the
        // ledger's own switch at this panel site (carry 8c), keyed by each member's route.
        const ledgerMove = newLedgerMove({
          seat, siteKey: input.callSiteKey, baseKeyOf: panelKeyFor, fair: notTheAuthor, eligible
        });
        const panelOptions = {
          eligible,
          fair: notTheAuthor,
          ...(fromLedger.prefer === undefined ? {} : { prefer: fromLedger.prefer }),
          ...(ledgerMove === undefined ? {} : { ledgerMove })
        };
        const planned = seatCaller.plan(seat, input.callSiteKey, panelOptions);
        if (planned === null) {
          return [{
            memberRole: seat.main.maker,
            actorRef: seat.main.providerRef,
            contractHash: judgeContractHash,
            judge: async (): Promise<never> => {
              throw new TypedDomainError(
                "PRODUCER_GRADING_FORBIDDEN",
                `${seat.role} seat ${String(seat.pinnedSeatIndex)} holds only the author's own maker`
              );
            }
          }];
        }
        if (panelCallsPlanned >= panelCallCap) return [];
        panelCallsPlanned += 1;
        return [{
          memberRole: planned.maker,
          actorRef: planned.providerRef,
          contractHash: judgeContractHash,
          judge: async () => {
            const answered = await seatCaller.callSeat({
              seat,
              callSiteKey: input.callSiteKey,
              ...panelOptions,
              keyFor: panelKeyFor,
              call: (member, callSiteKey) => member.judge.assess({
                runId: run.runId,
                subjectItemId: claimed.workItemId,
                callSiteKey,
                questionLine: input.questionLine,
                statement: input.statement,
                authorMaker: input.authorMaker,
                providerRef: member.providerRef,
                contractHash: judgeContractHash,
                bound: this.settings.judgeBound
              })
            });
            // A15c (controller carry 7): the member that ANSWERED, route and
            // maker together — never one without the other.
            return {
              judgementRef: answered.value.judgementRef,
              assessment: answered.value.assessment,
              actorRef: answered.member.providerRef,
              memberRole: answered.member.maker
            };
          }
        }];
      });
      const panel = await runJudgePanel({
        artifactProducerRef: input.authorProviderRef,
        primary: {
          judgementRef: input.authorJudgementRef,
          assessment: input.authorAssessment,
          memberRole: input.authorMaker
        },
        members: panelMembers
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

      // A15 (R5; controller carry 7 — lands with E8): the discount keys on the
      // ROUTE THAT ANSWERED — `actorRef` on each panel entry — never on a maker
      // name looked up in a list, which could not tell two seats of one maker,
      // or a backup from another family, apart.
      const familyOf = (actorRef: string): JudgeFamily => {
        const entry = panelPolicy.providerFamilies.find((family) => family.providerRefs.includes(actorRef));
        return entry === undefined
          ? { kind: "UNKNOWN", reason: panelPolicy.unmappedReason }
          : { kind: "KNOWN", familyRef: entry.familyRef };
      };
      const weighted = applyCorrelatedErrorDiscount(
        reducedMembers.map((entry) => ({
          memberRole: entry.memberRole,
          earnedWeight: judgementPolicy.earnedWeight,
          family: familyOf(entry.actorRef)
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
      // A15d (controller carry 10): a paid voice the panel refused after the
      // call is lost exactly as a failed member is, and is disclosed with it.
      const { marks, panelFailureReason } = panelDegradationOf(nonAuthorVoices, panel.notes);

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
            // A15d (controller carry 15): a refusal after the call keeps the
            // maker that answered; every other note keeps its stored shape.
            notes: panelNoteRecords(panel.notes)
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
        // A15 (controller carry 5): an assigned run records `:seat:<main|runnerUp>`
        // keys, while the cooldown wrapper (and so this halt list) and the two
        // root exceptions name the SITE by its bare key.
        const exhaustedSite = seatBaseCallSiteKey(exhausted.callSiteKey);
        const isJudgeSite = callSite.contractHash === this.settings.judgeContractHash;
        const isExemptRoot = exhaustedSite === "JUDGE" || exhaustedSite === "JUDGE:root:secondary";
        /**
         * A15d (controller carry 6; fix round 1): a judge seat key at its
         * allowance does not end the site while its PARTNER key is not itself
         * spent — the partner answers it on this pass, and on every later pass
         * (a resume after the partner already answered finds the same spent key
         * again and must hand it over again, or the rescue would be undone).
         *
         * "Not itself spent" is the partner's REACHABLE allowance: the spent key
         * passed the sequence bound, so it has used the site's ONE post-cooldown
         * final retry and cooldownAttempt withholds the partner's (carry 3). The
         * partner may still run its first sequence while its key holds fewer than
         * `judge` attempts; at `judge` the gateway would refuse the call
         * (CALL_BUDGET_EXHAUSTED), so the site keeps today's halt or terminal.
         * The per-key gateway cap plus carry 3 bound the site at DR-184-v5's
         * `2 * judge + final`.
         *
         * Why the switch is lawful (R4: a backup follows a transport failure,
         * never a schema one): a key passes the sequence bound only through the
         * post-cooldown final retry, and cooldownAttempt runs that retry only
         * after the FIRST sequence ended in a transport exhaustion. The final
         * retry itself may have ended in a schema failure; the switch answers
         * the first sequence's transport exhaustion. That needs a final retry to
         * exist, hence the guard. Synthesis sites have no cooldown, so their
         * ledger cannot tell a transport exhaustion from a schema one; A16a
         * (controller ruling on resume gap 1) hands them over anyway, below,
         * because a work item re-claimed at all was not ended by a refused
         * answer — every error a pass throws records the item's terminal
         * failure — so its spent key comes from a pass that died mid-site.
         */
        const exhaustedMarker = seatOfCallSiteKey(exhausted.callSiteKey);
        // A16a (controller ruling on resume gap 1): an assigned run's synthesis
        // key is ONE of its site's two seat keys. Whether the site is spent — no
        // slot left that can be called — is decided with both keys in view, after
        // the ledger read below; a backup that answered it, or an untried one next
        // to this spent main, answers it again instead of the work item failing.
        if (!isJudgeSite && exhaustedMarker !== null) continue;
        if (isJudgeSite && exhaustedMarker !== null && (this.settings.runDeathPolicy?.finalRetryAttempts ?? 0) >= 1) {
          const spentSlot: SeatSlot = exhaustedMarker === "main" ? "MAIN" : "RUNNER_UP";
          const rootSeat = exhaustedSite === "JUDGE"
            ? seatBook.position[0]
            : exhaustedSite === "JUDGE:root:secondary" ? seatBook.position[1] : undefined;
          // A root that would otherwise fail terminally needs its partner seated
          // now; any other site halts as today if it turns out to have none.
          const partnerSeated = !isExemptRoot || (rootSeat !== undefined
            && [rootSeat.main, rootSeat.runnerUp].some((member) => member !== null && member.pinnedAs !== spentSlot));
          const partnerAttempts = partnerSeated
            ? await this.#ledger.countModelAttempts({
              runId: run.runId,
              workItemId: claimed.workItemId,
              contractHash: callSite.contractHash,
              callSiteKey: seatCallSiteKey(exhaustedSite, exhaustedMarker === "main" ? "runnerUp" : "main")
            })
            : null;
          if (partnerAttempts !== null && partnerAttempts < this.settings.judgeBound.maxAttempts) {
            spentSeatSlots.set(exhaustedSite, spentSlot);
            // The halt below is only the fallback for a site whose seat turns out
            // to hold no partner on this pass (cooldownAttempt reads it only when
            // no member is eligible): the same record the preflight made before.
            if (!isExemptRoot) {
              spentSiteHalts.set(exhaustedSite, { outcome: exhausted.outcome, ledgerEntryRef: exhausted.ledgerEntryRef });
            }
            continue;
          }
        }
        if (isJudgeSite && !isExemptRoot) {
          preflightHaltedSites.set(exhaustedSite, {
            outcome: exhausted.outcome,
            ledgerEntryRef: exhausted.ledgerEntryRef
          });
          continue;
        }
        await this.#work.failFromExhaustedAttempt({ workItemId: claimed.workItemId, ...exhausted });
        return { kind: "TERMINAL_FAILED", artifactRef: exhausted.artifactRef };
      }
    }
    /**
     * A15d (controller carries 1 and 2) — what earlier passes of this work item
     * recorded under seat keys, read once, before the first root. A root one of
     * them answered is answered by the SAME member again (and its cross-exchanges
     * with it), and a cross-exchange site keeps the one key it already holds.
     * Nothing here is in-memory state from an earlier pass: every choice below is
     * the site's identity plus this ledger.
     */
    const recordedSlotBySite = new Map<string, SeatSlot>();
    if (seatBook.assigned) {
      const answeredSlotBySite = new Map<string, SeatSlot>();
      let order = 0;
      for (const contractHash of [
        this.settings.judgeContractHash, this.settings.composerContractHash, this.settings.conformanceContractHash
      ]) {
        const isJudge = contractHash === this.settings.judgeContractHash;
        for (const row of await this.#ledger.readSeatMarkedModelCalls({
          runId: run.runId, workItemId: claimed.workItemId, contractHash
        })) {
          const site = seatBaseCallSiteKey(row.callSiteKey);
          if (isJudge) {
            const slot: SeatSlot = seatOfCallSiteKey(row.callSiteKey) === "main" ? "MAIN" : "RUNNER_UP";
            if (!recordedSlotBySite.has(site)) recordedSlotBySite.set(site, slot);
            if (row.outcome === "OK") answeredSlotBySite.set(site, slot);
          } else {
            synthesisSitesByContract.set(contractHash, (synthesisSitesByContract.get(contractHash) ?? new Set()).add(site));
          }
          // A16a: every seat key's history, for `ledgerSeatRule` and `spentSiteRow` (rows arrive in ledger order).
          const seen = seatKeyHistory.get(row.callSiteKey);
          const cited = row.attemptId === null ? null : { row, at: order };
          seatKeyHistory.set(row.callSiteKey, {
            attempts: (seen?.attempts ?? 0) + 1,
            lastAnsweredAt: row.outcome === "OK" ? order : seen?.lastAnsweredAt ?? null,
            actors: new Set([...(seen?.actors ?? []), row.actorRef]),
            latest: cited ?? seen?.latest ?? null,
            latestFailure: row.outcome !== "OK" && cited !== null ? cited : seen?.latestFailure ?? null
          });
          order += 1;
        }
      }
      seatBook.position.forEach((seat, rootIndex) => {
        const siteKey = rootIndex === 0 ? "JUDGE" : rootIndex === 1 ? "JUDGE:root:secondary" : `JUDGE:root:${String(rootIndex)}`;
        const slot = answeredSlotBySite.get(siteKey);
        const restored = [seat.main, seat.runnerUp].find((member): member is SeatMember => member !== null
          && member.pinnedAs === slot && spentSeatSlots.get(siteKey) !== slot);
        if (restored === undefined) return;
        positionAnswerers.set(rootIndex, restored);
      });
      /**
       * A16a (controller rulings on the resume gaps) — a site this pass could
       * make NO call at ends the way the preflight ends an exhausted key, before
       * any call is made: roots 0 and 1 and every synthesis site fail the work
       * item terminally (the other roots and every other judge site halt, through
       * `seatCallPlan`, when they are reached). A synthesis site with a slot that
       * can still be called is planned to it (`ledgerSeatRule`), so a backup that
       * answered it, or an untried one next to a spent main, answers it again.
       */
      const spentSites: { readonly row: SeatKeyRow }[] = [];
      for (const [rootIndex, siteKey] of [[0, "JUDGE"], [1, "JUDGE:root:secondary"]] as const) {
        const seat = seatBook.position[rootIndex];
        const spent = seat === undefined ? null : seatCallPlan(seat, siteKey, positionRule(seat)).spent;
        // A16c (controller carry 14c): the terminal cites the site's latest FAILURE — an OK row
        // would settle a FAILED work item on an answer's attempt. Only a site whose spent keys hold
        // no failure at all cites its latest row.
        if (spent !== null) spentSites.push({ row: spent.failure ?? spent.latest });
      }
      for (const synthesis of [
        {
          seat: seatBook.answerWriter,
          contractHash: this.settings.composerContractHash,
          bound: this.settings.synthesisRolePolicy.synthesizerBound.maxAttempts
        },
        {
          seat: seatBook.answerChecker,
          contractHash: this.settings.conformanceContractHash,
          bound: this.settings.synthesisRolePolicy.evaluatorBound.maxAttempts
        }
      ]) {
        for (const siteKey of synthesisSitesByContract.get(synthesis.contractHash) ?? []) {
          // A FALLBACK synthesis seat is the sealed ref's one member, recorded under `:seat:main`.
          const slots: readonly SeatSlot[] = synthesis.seat === null
            ? ["MAIN"]
            : membersOf(synthesis.seat)
              .filter(ledgerSeatRule(synthesis.seat, () => siteKey, () => true, synthesis.bound).eligible)
              .map((member) => member.pinnedAs);
          const spent = spentSiteRow(slots, siteKey, synthesis.bound);
          // A16c (carry 14c): the same rule for a synthesis site.
          if (spent !== null) spentSites.push({ row: spent.failure ?? spent.latest });
        }
      }
      const cited = spentSites.find((entry) => entry.row.attemptId !== null)?.row;
      if (cited !== undefined && cited.attemptId !== null) {
        await this.#work.failFromExhaustedAttempt({
          workItemId: claimed.workItemId, attemptId: cited.attemptId, artifactRef: cited.artifactRef
        });
        return { kind: "TERMINAL_FAILED", artifactRef: cited.artifactRef };
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
    const primarySeat = seatBook.position[0]!;
    const primaryPlan = seatCallPlan(primarySeat, "JUDGE", positionRule(primarySeat));
    const primaryAttempt = await cooldownAttempt({
      callSiteKey: "JUDGE",
      parentNodeId: null,
      plannedLegCount: 1,
      failureScope: "MAKER_POSITION",
      seatMember: primaryPlan.seatMember,
      retrySeatMember: primaryPlan.retryMember,
      attempt: (maxAttempts) => seatCaller.callSeat({
        seat: primarySeat,
        callSiteKey: "JUDGE",
        ...primaryPlan.options,
        call: (member, callSiteKey) => member.judge.judge({
          runId: run.runId,
          subjectItemId: claimed.workItemId,
          callSiteKey,
          // DL4-F4: the question travels as the question, in its own fenced
          // field; the leg's directive is code's and rides the system message.
          questionLine: run.questionLine,
          leg: { kind: "primary-root" },
          providerRef: member.providerRef,
          contractHash: this.settings.judgeContractHash,
          bound: { ...this.settings.judgeBound, maxAttempts }
        })
      })
    });
    if (primaryAttempt.kind === "HALTED") {
      throw new TypedDomainError(
        "MAKER_POSITION_UNAVAILABLE",
        "The primary maker position failed after the full cooldown and final-retry courtesy"
      );
    }
    const judged = primaryAttempt.value.value;
    // A15: the member that ANSWERED root 0 — its lineage, its panel's author
    // (controller carry 8), and the writer of its cross-exchanges.
    const primaryMaker = primaryAttempt.value.member;
    positionAnswerers.set(0, primaryMaker);
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
      /** A15: the seat member that actually wrote this node (main or runner-up). */
      readonly member: SeatMember;
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
      maker: primaryMaker.maker,
      member: primaryMaker
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
      /** A15: the seat that writes this node — POSITION, SUPPORT_ATTACK or a cross-exchange seat. */
      readonly seat: RunSeat;
      /**
       * DL4-F4: the authoring leg, TYPED. This parameter used to be a
       * `questionLine: string` that the four call sites below built by
       * concatenating a directive, the run's question and a previous model's
       * statement — the string the judge envelope then wrapped whole as one
       * "untrusted" field. There is no longer a parameter that can carry a
       * directive into the data or a statement into the directive.
       */
      readonly leg: JudgeLeg;
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
        await this.#ledger.append({
          runId: run.runId,
          attemptId: runnerAttemptId,
          actionKind: "JUDGEMENT_SCHEDULED",
          subjectItemId: claimed.workItemId,
          stanceAtAction: "UNASSIGNED",
          outcome: "OK",
          actorRef: this.settings.workerId,
          inputHash: hash({ leg: input.leg, questionLine: run.questionLine, workItemId: claimed.workItemId }),
          contractHash: this.settings.judgeContractHash,
          startedAt: new Date(),
          finishedAt: new Date()
        });
      const childPlan = seatCallPlan(
        input.seat,
        input.callSiteKey,
        input.seat.role === "POSITION" ? positionRule(input.seat) : undefined
      );
      const childAttempt = await cooldownAttempt({
        callSiteKey: input.callSiteKey,
        parentNodeId: input.parentNodeId,
        plannedLegCount: input.plannedLegCount,
        failureScope: input.parentNodeId === null ? "MAKER_POSITION" : "EXPANSION",
        seatMember: childPlan.seatMember,
        retrySeatMember: childPlan.retryMember,
        attempt: (maxAttempts) => seatCaller.callSeat({
          seat: input.seat,
          callSiteKey: input.callSiteKey,
          ...childPlan.options,
          call: (member, callSiteKey) => member.judge.judge({
            runId: run.runId,
            subjectItemId: claimed.workItemId,
            callSiteKey,
            questionLine: run.questionLine,
            leg: input.leg,
            providerRef: member.providerRef,
            contractHash: this.settings.judgeContractHash,
            bound: { ...this.settings.judgeBound, maxAttempts }
          })
        })
      });
      if (childAttempt.kind === "HALTED") return childAttempt;
      const childJudged = childAttempt.value.value;
      // A15: the member that ANSWERED — main or runner-up — is the node's maker
      // lineage, the panel's author (controller carry 8) and the reviewer rule's
      // author.
      const selectedMaker = childAttempt.value.member;
      if (input.seat.role === "POSITION") positionAnswerers.set(input.seat.seatIndex, selectedMaker);
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
          // The PANEL assesses a node against THE DEBATE'S QUESTION. It used to
          // receive the leg's concatenated instruction string, so a parent's
          // statement rode into the panel prompt as well (DL4-F4).
          questionLine: run.questionLine
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
          maker: selectedMaker.maker,
          member: selectedMaker
        }) };
    };

    /**
     * C1 (review round 2) — WHICH SPEND BOUND, IF ANY, STOPPED THIS RUN BODY.
     *
     * Set by the authoring, expansion and review phases when the gateway refuses
     * on money or on an unbillable vendor. It is NOT an error path: the phase
     * stops where it is, the run keeps everything it has produced, and the
     * envelope evaluation in front of the serve chain turns it into the ruled
     * components-only terminal. `null` all the way through is a run that was
     * never stopped by a spend bound, which is every run today.
     *
     * RE-REVIEW: declared HERE, before the secondary and additional ROOT loops.
     * Round 2 declared it after them, so a refusal while authoring root 1 or 2
     * threw MAKER_POSITION_UNAVAILABLE and discarded a root 0 that had already
     * been minted and panelled. Root 0 existing is exactly what makes the
     * terminal buildable, so that run had something to serve and served nothing.
     */
    let runBodyBudgetStop: EnvelopeStopKind | null = null;
    if (effectiveMakerCount > 1) {
      let secondary: Awaited<ReturnType<typeof authorPosition>> | null = null;
      try {
      secondary = await authorPosition({
        authorIndex: 1,
        seat: seatBook.position[1]!,
        leg: { kind: "independent-root" },
        callSiteKey: "JUDGE:root:secondary",
        role: "secondary root author",
        parentNodeId: null,
        childKind: null,
        siblingOrdinal: 0,
        plannedLegCount: 1,
        explorationDecision: "continue",
        edges: []
      });
      } catch (error) {
        const stop = expansionPhaseStop(error);
        if (stop === null) throw error;
        // Root 0 is already minted and panelled, so the run HAS something to
        // serve. Stopping here keeps it; throwing would discard it.
        runBodyBudgetStop = stop;
      }
      if (secondary !== null) {
        if (secondary.kind === "HALTED") {
          throw new TypedDomainError(
            "MAKER_POSITION_UNAVAILABLE",
            "The secondary maker position failed after the full cooldown and final-retry courtesy"
          );
        }
        authoredNodes.set(1, secondary.value);
      }
    }

    for (let makerIndex = 2; makerIndex < effectiveMakerCount; makerIndex += 1) {
      // RE-REVIEW C2(a): root 0 is minted, so the run has something to serve.
      if (runBodyBudgetStop !== null) break;
      let additionalRoot: Awaited<ReturnType<typeof authorPosition>>;
      try {
      additionalRoot = await authorPosition({
        authorIndex: makerIndex,
        seat: seatBook.position[makerIndex]!,
        leg: { kind: "independent-root" },
        callSiteKey: `JUDGE:root:${makerIndex}`,
        role: "additional maker root author",
        parentNodeId: null,
        childKind: null,
        siblingOrdinal: 0,
        plannedLegCount: 1,
        explorationDecision: "continue",
        edges: []
      });
      } catch (error) {
        const stop = expansionPhaseStop(error);
        if (stop === null) throw error;
        runBodyBudgetStop = stop;
        break;
      }
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
      // RE-REVIEW I5: three call sites are unconditional, and each review is a
      // billed call. The guard lives HERE rather than at each of them, so a
      // fourth call site added tomorrow inherits it.
      if (runBodyBudgetStop !== null) return;
      for (const authoredNode of authoredNodes.values()) {
        if (reviewScheduledNodeIds.has(authoredNode.nodeId)) continue;
        reviewScheduledNodeIds.add(authoredNode.nodeId);
        const latestReviewerMaker = await this.#judgements.readLatestReviewerMaker(run.runId, authoredNode.maker);
        const reviewCallSiteKey = `JUDGE:review:${authoredNode.nodeId}`;
        // A15 (R5): reviewers come from the REVIEWER seats, and a seat may review
        // only through a member of a different maker than the author — checked
        // per member, so whichever member answers is held to the same rule.
        const differentMaker = (member: SeatIdentity): boolean => member.maker !== authoredNode.maker;
        const reviewer = selectDifferentMakerReviewer(authoredNode.maker, seatBook.reviewer.flatMap((seat) => {
          const planned = seatCallPlan(seat, reviewCallSiteKey, differentMaker);
          const first = seatCaller.plan(seat, reviewCallSiteKey, planned.options);
          return first === null ? [] : [{ seat, maker: first.maker, plan: planned }];
        }), latestReviewerMaker);
        try {
          const callSiteKey = reviewCallSiteKey;
          const reviewAttempt = await cooldownAttempt({
            callSiteKey,
            parentNodeId: authoredNode.nodeId,
            plannedLegCount: 1,
            failureScope: "REVIEW",
            seatMember: reviewer.plan.seatMember,
            retrySeatMember: reviewer.plan.retryMember,
            attempt: (maxAttempts) => seatCaller.callSeat({
              seat: reviewer.seat,
              callSiteKey,
              ...reviewer.plan.options,
              call: (member, memberCallSiteKey) => member.judge.review({
                runId: run.runId,
                subjectItemId: claimed.workItemId,
                callSiteKey: memberCallSiteKey,
                questionLine: run.questionLine,
                statement: authoredNode.statement,
                authorMaker: authoredNode.maker,
                providerRef: member.providerRef,
                contractHash: this.settings.judgeContractHash,
                bound: { ...this.settings.judgeBound, maxAttempts },
                // S3-1: this ONE call measures every edge the node sources.
                edges: authoredNode.sourcedEdges
              })
            })
          });
          if (reviewAttempt.kind === "HALTED") {
            hiddenReviewRecords.push({ nodeId: authoredNode.nodeId, record: reviewAttempt.record });
            continue;
          }
          const review = reviewAttempt.value.value;
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
              // A15: the key the ledger holds for this review, seat marker included.
              nodeId: authoredNode.nodeId, callSiteKey: reviewAttempt.value.callSiteKey, outcome: review.outcome
            });
          }
        } catch (error) {
          const outcome = reviewFailureOutcome(error);
          if (outcome.kind === "RETHROW") throw error;
          // C1: a spend refusal stops REVIEWING, it does not fail the run. The
          // nodes already reviewed keep their reviews; the rest stay unreviewed
          // and are disclosed as such, exactly as they are when a reviewer's
          // transport dies.
          if (outcome.kind === "BUDGET_STOP") {
            runBodyBudgetStop = outcome.stop;
            return;
          }
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
      // C1: an earlier leg, or a review between rounds, reached a spend bound.
      // Expansion stops here and the run carries what it has to the envelope
      // evaluation in front of the serve chain, which turns it into the ruled
      // components-only terminal.
      if (runBodyBudgetStop !== null) break;
      if (activeExpansionRound !== null && leg.round !== activeExpansionRound) {
        await reviewPendingAuthoredNodes();
        activeExpansionRound = leg.round;
        // RE-REVIEW I5: the review above can itself reach the bound, and the
        // loop-top check has already run for this iteration. Without this the
        // leg below would be authored — one more billed call — after the run
        // was told it cannot pay.
        if (runBodyBudgetStop !== null) break;
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
      let authored: Awaited<ReturnType<typeof authorPosition>>;
      try {
      authored = await authorPosition({
        authorIndex: leg.authorIndex,
        // A15 (R5): the legs come from the SUPPORT_ATTACK seats, rotating as
        // today — `(rootIndex + round) % seatCount`, which on the legacy book
        // (one seat per debater) is exactly `leg.authorIndex`.
        seat: seatBook.supportAttack[(leg.rootIndex + leg.round) % seatBook.supportAttack.length]!,
        // DL4-F4, the leg that carried the injection: `parent.statement` is the
        // PREVIOUS model's output. It is material, it gets its own fenced
        // field, and the directive it used to be glued to is code's.
        leg: {
          kind: leg.polarity === "support" ? "support" : "attack",
          positionUnderDebate: parent.statement
        },
        callSiteKey: `JUDGE:${role}:root${leg.rootIndex}:r${leg.round}:p${leg.parentIndex}`,
        role,
        parentNodeId: parent.nodeId,
        childKind: leg.polarity === "support" ? "support" : "defeater",
        siblingOrdinal: leg.polarity === "support" ? 1 : 2,
        plannedLegCount: plannedSubtreeIndices.length,
        explorationDecision: leg.polarity === "support" ? "deepen" : "challenge",
        edges: [{ targetNodeId: parent.nodeId, targetStatement: parent.statement, polarity: leg.polarity }]
      });
      } catch (error) {
        // C1: a spend refusal is not an expansion failure. Nothing is recorded
        // as halted — the leg was never attempted against a vendor — and the
        // branch simply stops being expanded.
        const stop = expansionPhaseStop(error);
        if (stop === null) throw error;
        runBodyBudgetStop = stop;
        break;
      }
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
    //
    // A15 (R5; controller carries 2 and 11): a cross-exchange defends a root, so
    // it is written by the SAME member that ACTUALLY wrote that root — main or
    // runner-up, this pass's answer or the one the ledger restored — never by
    // the POSITION seat's main by default. The CROSS_EXCHANGE seats mirror the
    // claimed POSITION seats (A15b), so that member is already the right
    // candidate. A cross-exchange has no backup of its own (DR-184-v5: one key,
    // `judge + final`), so a site the ledger already holds under one marker
    // keeps that key on every later pass; the row's actor and candidate still
    // name the member that answered. That differs from the writer's own slot
    // whenever a later pass's root was written by the OTHER slot: a claim
    // re-probe seated the root differently (carry 3's class), or — since A16a
    // made the restored slot a preference — the slot an earlier pass restored
    // failed on this pass and its backup wrote the root. So a cross-exchange's
    // `:seat:` marker is the KEY the site is counted under, never a record of
    // who answered it: every disclosure reads the answering member or the
    // row's actor (A16c, controller carry 14a).
    const crossExchangeSeatFor = (exchange: CrossRootExchangeLeg): RunSeat => {
      const rootIndex = exchange.authorRootIndex;
      const siteKey = `JUDGE:cross-root:${exchange.authorRootIndex}->${exchange.targetRootIndex}`;
      const positionSeat = seatBook.position[rootIndex]!;
      const writer = positionAnswerers.get(rootIndex);
      if (writer === undefined) {
        throw new TypedDomainError("DEBATE_ROOT_MISSING", `Cross-exchange ${siteKey} has no written root ${String(rootIndex)}`);
      }
      const recorded = recordedSlotBySite.get(siteKey);
      return Object.freeze({
        role: "CROSS_EXCHANGE" as const,
        seatIndex: rootIndex,
        pinnedSeatIndex: positionSeat.pinnedSeatIndex,
        main: recorded === undefined || recorded === writer.pinnedAs ? writer : Object.freeze({ ...writer, pinnedAs: recorded }),
        runnerUp: null,
        diversityShare: 0,
        pinned: null
      });
    };
    for (const exchange of buildCrossRootExchangePlan(effectiveMakerCount)) {
      // C1: same rule as the expansion loop above.
      if (runBodyBudgetStop !== null) break;
      const authorRoot = authoredNodes.get(exchange.authorRootIndex);
      const targetRoot = authoredNodes.get(exchange.targetRootIndex);
      if (authorRoot === undefined || targetRoot === undefined) {
        throw new TypedDomainError("DEBATE_ROOT_MISSING", "A cross-root exchange requires both authored roots");
      }
      let authored: Awaited<ReturnType<typeof authorPosition>>;
      try {
      authored = await authorPosition({
        authorIndex: exchange.authorIndex,
        seat: crossExchangeSeatFor(exchange),
        leg: {
          kind: "cross-root",
          ownPosition: authorRoot.statement,
          otherMakersPosition: targetRoot.statement
        },
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
      } catch (error) {
        const stop = expansionPhaseStop(error);
        if (stop === null) throw error;
        runBodyBudgetStop = stop;
        break;
      }
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
    const monoMakerConditionMarks = effectiveMakerCount === 1
      ? ["SINGLE-LINEAGE", "CRITIQUE-UNAVAILABLE"] as const
      : [] as const;
    /**
     * The two records a genuine mono-maker run mints, built for the root the
     * decision below serves. Their reason is `MONO_MAKER_RUN` — one maker was
     * CONFIGURED — and they are consumed on the M = 1 footing only; a
     * multi-maker run cut short by a spend bound gets its own `SINGLE-LINEAGE`
     * record whose reason names the stop (round 4, R-B).
     */
    const monoMakerRecords = (monoServedRoot: AuthoredDebateNode): readonly ConditionMarkRecord[] => Object.freeze([
          Object.freeze({
            mark: "SINGLE-LINEAGE",
            scope: "answer",
            subjectRef: monoServedRoot.nodeId,
            reason: "MONO_MAKER_RUN",
            liftPath: "RUN_DIFFERENT_MAKER_CRITIQUE",
            servedRootRule: null,
            affectedNodeIds: Object.freeze([monoServedRoot.nodeId])
          }),
          Object.freeze({
            mark: "CRITIQUE-UNAVAILABLE",
            scope: "answer",
            subjectRef: monoServedRoot.nodeId,
            reason: [
              ...(absentAtClaim.length === 0 ? [] : [
                `CLAIM_PANEL_REVISED:${absentAtClaim.map(({ member, failureCode }) => `${member.provider_ref}=${failureCode}`).join(",")}`
              ]),
              `MONO_LINEAGE_DEPTH_NOT_EXPANDED:requested_depth=${expansionDepth}`
            ].join("|"),
            liftPath: "RUN_DIFFERENT_MAKER_CRITIQUE",
            servedRootRule: null,
            affectedNodeIds: Object.freeze([monoServedRoot.nodeId])
          })
    ] satisfies readonly ConditionMarkRecord[]);
    const propagationStartedAt = new Date();
    /**
     * ROUND 4 (V-28, R-A / R-B): projection, propagation, served-root selection
     * and the maker-position disclosure are ONE decision, taken here and read
     * again at the fact bundle. The reviewed set is read from the ledger only
     * when a review could have run; what it MEANS for the projection — the
     * footing — is the decision's, not this site's. A spend-stopped run is
     * projected on the single-maker footing (R-A): the review guard above
     * bought no review for the roots that exist, and none can be bought now.
     */
    const makerPositionServe = decideMakerPositionServe({
      effectiveMakerCount,
      runBodyBudgetStop,
      authoredMakerPositions,
      snapshot,
      materialisedNodeIds: materialised.nodes.map((node) => node.nodeId),
      reviewedNodeIds: effectiveMakerCount <= 1
        ? []
        : await this.#judgements.readReviewedNodeIds(run.runId),
      unjudgedReviewNodeIds: [
        ...hiddenReviewRecords.map(({ nodeId }) => nodeId),
        ...unassessedReviewRecords.map(({ nodeId }) => nodeId)
      ],
      monoMakerConditionMarks,
      monoMakerRecords
    });
    const standing = makerPositionServe.standing;
    snapshot = makerPositionServe.standing.snapshot;
    const classHNodeIds = new Set(standing.hiddenNodeIds);
    const classDNodeIds = new Set(standing.derivedStandingNodeIds);
    const propagation = makerPositionServe.propagation;
    const threshold = this.settings.hiddenNodeScoreThreshold;
    const lowScoreRows = threshold === undefined
      ? []
      : propagation.strengths.filter((row) => row.strength <= threshold.value);
    const servableMakerPositions = makerPositionServe.servableMakerPositions;
    const servedRootSelection = makerPositionServe.servedRootSelection;
    const servedRoot = makerPositionServe.servedRoot;
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
    /**
     * RE-REVIEW 2(a) / ROUND 4: the maker-position disclosure is the serve
     * decision's, taken above with the projection it belongs to, so the fact
     * bundle's marks and the records paired with them cannot disagree — and
     * cannot be reached at one site and not the other.
     */
    const factBundle: FactBundle = buildFactBundle({
      facts: Object.freeze([servedRoot.statement]),
      residualObjections: Object.freeze([]),
      badges: Object.freeze([]),
      conditionMarks: Object.freeze([...new Set([
        ...makerPositionServe.disclosure.conditionMarks,
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
    let conditionMarkRecords: readonly ConditionMarkRecord[] = makerPositionServe.disclosure.records;
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
    ): ConfiguredSeatMaker => {
      // codex r1 B1: this looked the ref up in `this.#configuredMakers` — the
      // UNFILTERED set — so a role provider that claim-time probing had already
      // found absent was still called here. It resolves against the
      // CLAIM-ELIGIBLE set now, and the claim-time discriminator above has
      // already refused this run if either sealed ref is missing from it, so
      // reaching this throw means a provider went away AFTER a healthy claim.
      const configured = synthesisMakers.find((maker) => maker.providerRef === roleRef);
      if (configured === undefined) {
        throw new TypedDomainError(
          "SYNTHESIS_ROLE_PROVIDER_UNRESOLVED",
          `${role} role ref ${roleRef} (register version ${String(synthesisRoles.registerVersion)}) is not among the claim-eligible providers`
        );
      }
      return configured;
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
    const evaluateEnvelope = (
      pendingModelAttempts = 0,
      forceHardStop = false
    ): Promise<BudgetPressureDecision> =>
      this.#budget.evaluateRunPressure({
        runId: run.runId,
        basis: envelopeBasis,
        pendingModelAttempts,
        forceHardStop,
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
      decision: Extract<BudgetPressureDecision, { kind: "HARD_STOP" }>,
      /**
       * V-28: WHICH ceiling stopped the run. The terminal and its condition mark
       * are the same for both — the answer a reader gets is components-only
       * either way — but the RECORD says which bound was reached, because
       * "re-ask with more attempts" and "re-ask with more money" are different
       * things for the operator to do and the lift path must not lie about it.
       */
      stop: EnvelopeStopKind = "ATTEMPTS"
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
          reason: ENVELOPE_STOP_REASONS[stop],
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
    /**
     * C1 (review round 2): the run body's own spend stop is asked HERE, the
     * first point at which the ruled terminal can be built — the propagation
     * has run, the served root is chosen and the fact bundle exists, so the
     * components the run produced before it ran out are exactly what this
     * terminal serves. A money or usage stop during authoring, expansion or
     * review arrives as `runBodyBudgetStop` rather than as an exception,
     * because there was no terminal to build where it was raised.
     */
    const initialEnvelopeDecision = await evaluateEnvelope(0, runBodyBudgetStop !== null);
    let result: Awaited<ReturnType<typeof runServeGateChain>>;
    // F4: no `restatementStatus === "PASS"` conjunct. The envelope terminal
    // fires on HARD_STOP whenever no served statement exists yet, independent
    // of restatement status — never serving over budget.
    if (initialEnvelopeDecision.kind === "HARD_STOP") {
      result = await makeEnvelopeTerminal(initialEnvelopeDecision, runBodyBudgetStop ?? "ATTEMPTS");
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
      // A15: an assigned run names the members its seat caller will call first
      // (A16's 80-20 ordinal chooses between main and runner-up); the loop bound
      // stays the sealed row's.
      synthesisRoleControls: Object.freeze({
        // A16a: planned as round 1's site will be (`synthesisSeatOptions`), so a
        // resumed pass names the slot the ledger hands that site to.
        synthesizerRoleRef: seatBook.answerWriter === null
          ? synthesisRoles.synthesizerRoleRef
          : seatCaller.plan(seatBook.answerWriter, "COMPOSER:SYNTHESIZER", {
            ...synthesisSeatOptions("SYNTHESIZER", seatBook.answerWriter,
              synthesisCallSiteKey({ role: "SYNTHESIZER", stage: "INITIAL", round: 1 }))
          })?.providerRef
            ?? seatBook.answerWriter.main.providerRef,
        evaluatorRoleRef: seatBook.answerChecker === null
          ? synthesisRoles.evaluatorRoleRef
          : seatCaller.plan(seatBook.answerChecker, "POST_COMPOSE_R9:EVALUATOR", {
            ...synthesisSeatOptions("EVALUATOR", seatBook.answerChecker, synthesisCallSiteKey({ role: "EVALUATOR", round: 1 }))
          })?.providerRef
            ?? seatBook.answerChecker.main.providerRef,
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
        // A15: an assigned run's ANSWER_WRITER seat; otherwise the sealed ref,
        // resolved against the claim-eligible set exactly as before (J8/J24).
        const writerSeat = seatBook.answerWriter
          ?? legacySynthesisSeat("ANSWER_WRITER", resolveSynthesisRoleMaker(request.roleRef, "SYNTHESIZER"));
        const writerSiteKey = synthesisCallSiteKey({
          role: "SYNTHESIZER", stage: request.stage, round: request.round
        });
        // DL4-F4 / L4-F11: the packet used to be a bare instruction plus one
        // `JSON.stringify` of the whole request — the model-authored digest
        // summaries and the prior objection sat in the same compartment as the
        // engine's own `instructions`, with nothing saying which was which.
        const framed = buildSynthesisRolePrompt(request);
        const packet = framed.packet;
        const answered = await callSynthesisRole(() => seatCaller.callSeat({
          seat: writerSeat,
          callSiteKey: writerSiteKey,
          ...synthesisSeatOptions("SYNTHESIZER", writerSeat, writerSiteKey),
          call: (member, callSiteKey) => member.provider.call({
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
            // A15: an assigned run appends the seat marker; the prefix stays.
            callSiteKey,
            role: "SYNTHESIZER",
            lane: "served",
            modelRole: "ANSWER_WRITER",
            // W10/3: the SYNTHESIZER's own sealed bound. It used to be
            // `composerBound` — an organ T9 retired — which is how the longest
            // generation in the system ended up with a 60-second clock while the
            // judge, answering about ONE node, had 180.
            bound: this.settings.synthesisRolePolicy.synthesizerBound,
            contractHash: this.settings.composerContractHash,
            providerRef: member.providerRef,
            packet,
            classifyContent: (content) => classifySynthesisRoleContent("SYNTHESIZER", content),
            buildRepairPacket: (rejected) => buildSchemaRepairPacket(framed, rejected)
          })
        }), { role: "SYNTHESIZER", callSiteKey: writerSiteKey }, "COMPOSITION_CONTRACT_ERROR");
        const response = answered.value;
        // codex r3 B2: the key the call was RECORDED under, seat marker included;
        // persistence binds this round's reference to exactly that ledger row.
        const synthesizerCallSiteKey = answered.callSiteKey;
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
        const checkerSeat = seatBook.answerChecker
          ?? legacySynthesisSeat("ANSWER_CHECKER", resolveSynthesisRoleMaker(request.roleRef, "EVALUATOR"));
        const checkerSiteKey = synthesisCallSiteKey({ role: "EVALUATOR", round: request.round });
        const framed = buildSynthesisRolePrompt(request);
        const packet = framed.packet;
        const answered = await callSynthesisRole(() => seatCaller.callSeat({
          seat: checkerSeat,
          callSiteKey: checkerSiteKey,
          ...synthesisSeatOptions("EVALUATOR", checkerSeat, checkerSiteKey),
          call: (member, callSiteKey) => member.provider.call({
            runId: run.runId,
            subjectItemId: claimed.workItemId,
            // Same contract as the synthesizer's key above: `POST_COMPOSE_R9:%`
            // feeds `r9_calls`, which the R9 battery row prints in its executed
            // check ref. The evaluator IS the restatement check now, so the slot
            // is still occupied and the ref still names something that happened.
            callSiteKey,
            role: "EVALUATOR",
            lane: "served",
            modelRole: "ANSWER_CHECKER",
            // W10/3: the EVALUATOR's own sealed bound, formerly CONFORMANCE's.
            bound: this.settings.synthesisRolePolicy.evaluatorBound,
            contractHash: this.settings.conformanceContractHash,
            providerRef: member.providerRef,
            packet,
            classifyContent: (content) => classifySynthesisRoleContent("EVALUATOR", content),
            buildRepairPacket: (rejected) => buildSchemaRepairPacket(framed, rejected)
          })
        }), { role: "EVALUATOR", callSiteKey: checkerSiteKey }, "EVALUATOR_CONTRACT_ERROR");
        const response = answered.value;
        const evaluatorCallSiteKey = answered.callSiteKey;
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
        const stop = envelopeStopKind(error);
        if (stop === null) throw error;
        // The gateway REFUSED a next provider call, so the question here is
        // whether one more attempt fits — not whether the run has overspent.
        // Asking with the pending attempt counted is what makes this context
        // stop sharing J28's branch: at `consumed == max` a completed run is
        // WITHIN and keeps its answer, while this refused attempt is a
        // HARD_STOP and gets the ruled components-only terminal instead of a
        // rethrow that produced no envelope record at all.
        //
        // V-28: a MONEY refusal asks neither of those questions. The run may
        // have dozens of attempts left and still be unable to pay for one, so
        // the pending attempt is 0 (it would be a falsehood about the attempt
        // ledger) and the hard stop is asserted on its own footing.
        // RE-REVIEW C3: which question this stop asks is a named decision, so a
        // third stop kind added tomorrow cannot quietly fall to the attempt
        // branch the way USAGE did.
        const asked = envelopeStopPendingAttempts(stop);
        const exhausted = await evaluateEnvelope(asked.pendingModelAttempts, asked.forceHardStop);
        // NO restatement conjunct. F4 / goal 248-251: the protected-core guard
        // was keyed on R9's gate-hood and is KNOWINGLY RETIRED with it, so the
        // envelope terminal fires on HARD_STOP whenever no served statement
        // exists yet, INDEPENDENT OF RESTATEMENT STATUS. The status is observed
        // and disclosed as a condition mark instead of deciding the terminal.
        // The two changes are orthogonal and both stand: T17B's `pendingModelAttempts`
        // fixes WHICH question is asked, F4 removes a guard from the answer.
        if (exhausted.kind !== "HARD_STOP") throw error;
        result = await makeEnvelopeTerminal(exhausted, stop);
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
    /**
     * Model scorecard A16c (R4/R6; controller carries 8, 9, 12, 13 and 15) —
     * every stand-in this answer's content came from is disclosed ON THE ANSWER,
     * whatever the terminal: this point is reached by the envelope, crash and
     * served paths alike (the owed-check pattern above).
     *
     * WHO answered is exact here although it is read off this pass: a resumed
     * pass re-authors every site (node ids are rebuilt, so no earlier answer is
     * reused), and the ledger decided who this pass asked — the slot an earlier
     * pass's switch left the site with is preferred, a spent one is handed over
     * — so a switch made on an earlier pass still shows as its stand-in answering
     * here, counted once (carry 13). A role whose pinned seats were all absent
     * counts when the debaters answered any of its calls (carry 8d). Plain words
     * only (carry 15); the internals rode the progress stream.
     */
    const backupRecords = backupModelUsedRecords({
      answers: seatCaller.backupAnswers(),
      fallbackRoles: fellBackRoles.filter((role) => seatCaller.answered(role).length > 0)
    }, servedRoot.nodeId);
    if (backupRecords.length > 0) {
      conditionMarkRecords = Object.freeze([...conditionMarkRecords, ...backupRecords]);
      if (!result.conditionMarks.includes(BACKUP_MODEL_USED_MARK)) {
        result = { ...result, conditionMarks: Object.freeze([...result.conditionMarks, BACKUP_MODEL_USED_MARK]) };
      }
    }
    /**
     * A16c (carry 9) — on an assigned run DEGRADED-DIVERSITY follows the writer
     * and checker that ACTUALLY answered: the ledger's seat-marked rows, read by
     * the ACTOR on each row (carry 14a), for exactly the artifacts this answer's
     * rounds cite — so a writer an earlier pass switched to and this pass asked
     * again counts, and a discarded pass's rounds never do. A crash answer is
     * left alone (W2). The legacy run keeps the sealed-ref rule.
     *
     * Fix round 1 (Minor 5): a failure of this READ is reported as the
     * terminal-state read it is — the stage the runner already uses for the
     * run's recorded state at terminal (`TERMINAL_STATE_READ_FAILED`, above) —
     * never as a persist failure: nothing has been persisted yet. No new code.
     */
    if (seatBook.assigned && result.crashClass === null) {
      const actorByArtifact = new Map<string, string>();
      for (const contractHash of [this.settings.composerContractHash, this.settings.conformanceContractHash]) {
        const rows = await runnerStage("TERMINAL_STATE_READ_FAILED", () => this.#ledger.readSeatMarkedModelCalls({
          runId: run.runId, workItemId: claimed.workItemId, contractHash
        }));
        for (const row of rows) {
          if (row.outcome === "OK" && row.artifactRef !== null) actorByArtifact.set(row.artifactRef, row.actorRef);
        }
      }
      const actorsOf = (artifactRefs: readonly string[]): readonly string[] => artifactRefs.flatMap((ref) => {
        const actor = actorByArtifact.get(ref);
        return actor === undefined ? [] : [actor];
      });
      result = withEffectiveDegradedDiversity(result, effectiveSynthesisCollapse(
        actorsOf(result.loopRounds.map((round) => round.candidateRef)),
        actorsOf(result.loopRounds.map((round) => round.verdictRef))
      ));
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
  "ANSWER_MODEL_ASSIGNMENT_INVALID",
  "ANSWER_PERSIST_FAILED",
  "ARROW_ENDPOINT_ABSENT",
  "ASK_MODEL_ASSIGNMENT_INVALID",
  "ASK_MODEL_CANDIDATE_UNAVAILABLE",
  "ASK_MODEL_STRENGTH_BUDGET_TOO_SMALL",
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
  "CALL_SITE_SEAT_ALREADY_MARKED",
  "CALL_SITE_SEAT_MARKER_REQUIRED",
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
  "COST_ENVELOPE_CEILING_INVALID",
  "COST_ENVELOPE_CHARGE_UNREPRESENTABLE",
  "COST_ENVELOPE_DAY_INVALID",
  "COST_ENVELOPE_GUARD_INPUT_INVALID",
  "COST_ENVELOPE_PRICE_INVALID",
  "COST_ENVELOPE_PRICE_UNPRICED",
  "COST_ENVELOPE_PROJECTION_INVALID",
  "COST_ENVELOPE_RESERVATION_TTL_INVALID",
  "COST_ENVELOPE_RUN_REQUIRED",
  "COST_ENVELOPE_SPEND_INVALID",
  "COST_ENVELOPE_USAGE_INVALID",
  "CRITERION_ID_DUPLICATE",
  "CRITERION_ID_INVALID",
  "CRITERION_LABEL_INVALID",
  "CRITIC_UNAVAILABLE_BAND_CAP_UNRESOLVED",
  "CRITIQUE_CONTEXT_NOT_ISOLATED",
  "DAILY_COST_ENVELOPE_REACHED",
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
  // FW-B / F-I2: the judgement package's closed leg table refuses an undeclared
  // material name (packages/judgement/src/index.ts) on the way INTO the frame,
  // so the refusal travels the same path a schema failure does.
  "JUDGE_LEG_MATERIAL_UNDECLARED",
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
  "MAKER_POSITION_DISCLOSURE_UNRESOLVED",
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
  // FW-B / F-I2: every refusal packages/providers/src/prompt-frame.ts can raise —
  // the BUILDER's six as well as the DOOR's five. A refused packet short-circuits
  // the gateway, is re-thrown by the phase catch and reaches the task boundary;
  // without these rows it became `UNRECOGNIZED_DOMAIN_ERROR` — durable state
  // naming nothing, which is the defect codex r1b F3 closed for the provider
  // subclasses. The list is swept from that file by test, so a seventh refusal
  // added there cannot land without a row here.
  "PROMPT_CANARY_UNAVAILABLE",
  "PROMPT_CONTRACT_INCOMPLETE",
  "PROMPT_FENCE_UNAVAILABLE",
  "PROMPT_FRAME_ABSENT",
  "PROMPT_FRAME_FENCE_FORGED",
  "PROMPT_FRAME_FENCE_MISMATCH",
  "PROMPT_FRAME_FOREIGN_TURN",
  "PROMPT_FRAME_MATERIAL_MALFORMED",
  "PROMPT_INSTRUCTION_RESERVED_TOKEN",
  "PROMPT_MATERIAL_FIELD_NAME_INVALID",
  "PROMPT_REPAIR_NOT_A_LOCATOR",
  "PROPAGATION_MAGNITUDE_INVALID",
  "PROPAGATION_RECEIPT_INVALID",
  "PROPAGATION_RECEIPT_MISSING",
  "PROPAGATION_STRENGTH_INVALID",
  "PROPER_SCORE_INVALID",
  "PROTECTED_CITATION_COMPARE_SKIPPED",
  "PROVIDER_CALL_FAILED",
  "PROVIDER_CALL_INSIDE_TRANSACTION",
  "PROVIDER_CONTENT_UNACCEPTED",
  "PROVIDER_CONTEXT_WINDOW_EXCEEDED",
  "PROVIDER_RUN_REQUIRED",
  "PROVIDER_THINKING_LEVEL_CHANGED",
  "PROVIDER_THINKING_LEVEL_UNSUPPORTED",
  "PROVIDER_USAGE_CAP",
  "PROVIDER_USAGE_INVALID",
  "PROVIDER_USAGE_UNREPORTED",
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
  "RUN_COST_ENVELOPE_MONEY_REACHED",
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
  "RUN_ROLE_ASSIGNMENT_INVALID",
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
  "STRUCTURAL_CEILING_BACKUPSEQUENCESPROVISIONED_INVALID",
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

/**
 * DL4-F1: whatever the task throws, the Hatchet SDK serialises its {message, stack} into
 * Hatchet's own store and to stderr — outside the AEAD boundary. A typed failure keeps its
 * code (the terminal vocabulary the callers and tests rely on) and loses its text; anything
 * else leaves as the bounded operational diagnostic. No cause, no foreign stack frames.
 */
function scrubbedTaskFailure(error: unknown): TypedDomainError {
  const code = error instanceof TypedDomainError ? error.code : runnerTerminalFailureReason(error);
  const scrubbed = new TypedDomainError(code, code);
  scrubbed.stack = `${scrubbed.name}: ${code}`;
  return scrubbed;
}

/**
 * L4-F6: the workflow input, validated before anything reads it. `.strict()` so
 * an extra key is a refusal rather than a silently ignored surprise, and the
 * refusal never quotes the value it refused (constraint 6) — a dispatch is
 * attacker-controllable, so its contents are exactly the class of text that
 * must not reach a log.
 */
const walkingSkeletonDispatchSchema = z.object({
  runId: z.string().uuid(),
  workItemId: z.string().uuid()
}).strict();

/**
 * AMENDMENT 2026-09-22 (SYNC2 §6.2). `@debateai/obs-capture` is a SECOND sink
 * for error text beside the job system's own Postgres and stderr, and it
 * carries whatever it is handed as `payload_ref` once an emitter is installed.
 * DL4-F1 scrubbed the first sink; this is the same treatment for the second:
 * a code and a machine PATH, never the error, whose message can hold model
 * output.
 *
 * EVERY `capture.emit` at a failure boundary goes through this builder. There
 * is no parameter for an error object on the envelope it returns.
 */
export function captureFailureEnvelope(input: {
  readonly error: unknown;
  readonly taxonomyClass: string;
  readonly capturePoint: string;
  readonly disposition: string;
  readonly source: string;
  readonly attemptIndex?: number;
}): Readonly<Record<string, unknown>> & { readonly code: string; readonly path: string } {
  return Object.freeze({
    code: input.error instanceof TypedDomainError ? input.error.code : "OBS_CAPTURE_SELF",
    // The bounded operational diagnostic: a closed alphabet derived from the
    // error's CLASS and SQLSTATE, never from its text.
    path: operationalDiagnosticOf(input.error),
    taxonomy_class: input.taxonomyClass,
    capture_point: input.capturePoint,
    disposition: input.disposition,
    source: input.source,
    ...(input.attemptIndex === undefined ? {} : { attempt_index: input.attemptIndex })
  });
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
      rawDispatch: { runId: string; workItemId: string },
      hatchetContext?: { retryCount?(): number }
    ) => {
      // L4-F6: BEFORE the runner, before the repository, before anything reads
      // a field — and, at INT2 (SYNC2 into integration), before the S06 capture
      // binding too, so an unvalidated dispatch string can never become an obs
      // context ref. A malformed dispatch is a typed refusal that names no value.
      const parsed = walkingSkeletonDispatchSchema.safeParse(rawDispatch);
      if (!parsed.success) {
        throw new TypedDomainError(
          "RUNNER_WORKFLOW_INPUT_INVALID",
          "RUNNER_WORKFLOW_INPUT_INVALID"
        );
      }
      const dispatch = parsed.data;
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
          // AMENDMENT 2026-09-22, routed at INT2: the envelope carries the
          // failure's CODE and its bounded diagnostic PATH. The error object
          // itself — whose message can hold model output — never enters the
          // second sink.
          capture?.emit(captureFailureEnvelope({
            error,
            taxonomyClass: "JOB_FAILURE",
            capturePoint: "job",
            disposition: "THROWN",
            source: "hatchet",
            attemptIndex
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
            capture?.emit(captureFailureEnvelope({
              error: recordingFailure,
              taxonomyClass: "JOB_FAILURE",
              capturePoint: "job",
              disposition: "HANDLED",
              source: "hatchet",
              attemptIndex
            }));
          }
          // DL4-F1 re-seated inside the restored S06 binding (DEV-SYNC 2026-09-22): the
          // error that leaves this task still IS the one that would have escaped without
          // any of the capture work — same code, same terminal vocabulary, same whether
          // recording succeeded or not (OBS-R064) — but its text and stack are scrubbed
          // before the Hatchet SDK writes them outside the AEAD boundary.
          throw scrubbedTaskFailure(error);
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
  options: Omit<OpenAICompatibleGatewayOptions, "persistRawArtifact" | "appendLedgerEntry" | "assertNoOpenWriteTransaction" | "persistCallPrompt">
    & {
      /**
       * V-28 (DL4-F2): the money bound, built per CALL from the run the gateway
       * was handed. A gateway is constructed once per target — the price is the
       * target's — but the spend belongs to the run, and one gateway serves
       * every run that reaches it, so the seam cannot be a construction-time
       * value. Absent = no money bound, which is local mode byte-for-byte.
       */
      readonly buildCostEnvelopeSeam?: (runId: string) => ProviderCostEnvelopeSeam;
    }
): ProviderGateway {
  const { buildCostEnvelopeSeam, ...gatewayOptions } = options;
  const ledger = new LedgerRepository(pool);
  const budget = new BudgetRepository(pool);
  const http = new OpenAICompatibleProviderGateway({
    ...gatewayOptions,
    assertNoOpenWriteTransaction,
    persistRawArtifact: (artifact) => ledger.appendRawArtifact(artifact),
    appendLedgerEntry: async (entry) => (await ledger.append(entry)).ledgerEntryId,
    // Model scorecard §2.3: every attempt's exact prompt, through the run's
    // content envelope (ledger.call_prompt). The fingerprint is the scorecard's
    // own canonical one, so a replayed moment is compared with the SAME
    // function that recorded it.
    persistCallPrompt: (prompt) => insertCallPrompt(pool, {
      runId: prompt.runId,
      attemptId: prompt.attemptId,
      promptText: prompt.promptText,
      promptFingerprint: canonicalPromptFingerprint(prompt.messages)
    })
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
          bound: { ...request.bound, maxAttempts: remaining },
          // DL4-F3: the pinned run ceiling is consulted before EVERY attempt of the gateway's
          // retry loop (B26c's hook, wired here), not only once per call; the refusal is the
          // run's own RUN_COST_ENVELOPE_EXHAUSTED and no ledger row is written for it. The
          // run id is the leased one the S06 seam bound above, not a re-read of the request.
          ...(authenticatedEvaluatorScope ? {} : {
            assertAttemptAllowed: () => budget.assertModelAttemptAllowed(leasedRunId)
          }),
          /**
           * V-28: the money envelope binds EVERY call, the authenticated evaluator
           * scope included. That scope is exempt from the ATTEMPT ceiling because
           * its attempts are billed to the evaluator rather than to the run
           * (`ledger_entry_is_authenticated_scope`), but its calls are made against
           * the same paid vendor with the same money, so exempting them from the
           * money ceiling would leave a hole the size of the evaluator leg. The run
           * id is the leased one, for the same reason as the attempt hook above.
           */
          ...(buildCostEnvelopeSeam === undefined ? {} : {
            costEnvelope: buildCostEnvelopeSeam(leasedRunId)
          })
        });
      } catch (error) {
        capture?.emit(captureFailureEnvelope({
          error,
          taxonomyClass: "PROVIDER_EXHAUSTED",
          capturePoint: "provider",
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
