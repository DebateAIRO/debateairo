import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Pool } from "pg";
import {
  ProviderProbeRepository,
  RunCostSubstitutionRepository,
  RunRepository,
  ServeDisclosureRepository,
  assertNoOpenWriteTransaction,
  insertCallPrompt,
  readRunRoleAssignment,
  readRunRoleRotation,
  withRunContentLease,
  withWriteTransaction,
  type CompletionActivationResolution,
  type DiscoveredPanelMember,
  type RunCostSubstitutionReason,
  type RunRoleRotationRecord,
  type ServeDisclosureFloorState,
  type ServeDisclosureRecord
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
  parseStructuredArtifact,
  reduceAssessment,
  parsedStructuredRepairs,
  runJudgePanel,
  selectReducedJudgement,
  judgeLegLengthStep,
  JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT,
  type ClaimType,
  type CompositionMapRegisterRow,
  type JudgeAssessment,
  type JudgeFamily,
  type JudgeLeg,
  type JudgementSelectionRule,
  type HonestSelectionRule,
  type EngineReviewStatus,
  type WayOfKnowingDowngradeRecord,
  PointInvestigationRepository,
  VerdictVoteRepository,
  askComparingJudge,
  type PointInvestigationSeat,
  type StoredVerdictVote
} from "@debateai/judgement";
import { LedgerRepository, type AppendLedgerInput } from "@debateai/ledger";
import {
  ENGINE_BRANCHING_FACTOR,
  ENGINE_COMPOSITION_SEGMENT_CAP,
  ENGINE_FIXED_ORGANS_PER_COMPOSITION,
  ENGINE_MAX_RECOMPOSE,
  engineOfRun,
  lengthGuidanceAllowanceTokens,
  readVerdictLabelControls,
  resolveScoringOperator,
  type AdaptiveStoppingControls,
  type EngineSettings,
  type LengthGuidance
} from "@debateai/register";
import {
  BudgetRepository,
  BATTERY_BUDGET_CONTRACTS,
  attemptCeilingForPhase,
  parseCostEnvelopeBasis,
  projectedCallCeilingMicros,
  RUN_COST_ENVELOPE_ROOM_KEPT,
  sharedWallReached,
  type BudgetPressureDecision,
  type CostEnvelopePhase,
  type PersonAllowanceSource,
  type ProviderTargetPrice,
  type SharedWallApplication
} from "@debateai/budget";
import {
  countMeasuredEdges,
  decideBranchFreezes,
  decideRoundBoundary,
  evaluate,
  resolveLeverage,
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
  contentFollowUpSentence,
  fixReplyStructure,
  parsedWithRepairs,
  replyFailureClassOf,
  promptContractFingerprintText,
  schemaFailureLocator,
  structureRepairOriginalKey,
  type FramedPrompt,
  type PromptContract,
  OpenAICompatibleProviderGateway,
  PROVIDER_USAGE_CAP,
  ProviderCallFailedError,
  ProviderContentUnacceptedError,
  ProviderStructureUnrepairedError,
  lengthRetryTokenCeiling,
  providerTargetPrice,
  rememberingAcceptedReply,
  type CallBound,
  type ContentClassification,
  type ModelJsonRepair,
  type ModelReplyFacts,
  type OpenAICompatibleGatewayOptions,
  type PromptPacket,
  type ProviderCallRequest,
  type ProviderCallResult,
  type ProviderCostEnvelopeSeam,
  type ProviderDiscoveryTarget,
  type ProviderGateway,
  type ReplyFailureClass
} from "@debateai/providers";
import { RoleAssignmentSchema, canonicalPromptFingerprint, type RoleAssignment, type SeatCandidate } from "@debateai/scorecard";
import {
  assertEvaluatorVerdict,
  BACKUP_MODEL_USED_MARK,
  buildFactBundle,
  compositionEvidenceRequired,
  createEnvelopeExhaustedResult,
  deriveBandCeiling,
  deriveVerdictLabel,
  digestLeverageByNodeId,
  digestPointsOmitted,
  idShapedTokensIn,
  keepsCompleteSynthesisRounds,
  nodeIdsNamedInText,
  synthesisWordingIndex,
  synthesisWordingRefusalsIn,
  SYNTHESIS_WORDING_REFUSALS,
  type SynthesisWordingIndex,
  LABEL_BASIS_INCOMPLETE_MARK,
  PROTECTED_CORE_GUARD_RETIRED_MARK,
  resolveDigestNodeRef,
  runServeGateChain,
  ServeRepository,
  toSynthesisPromptMaterial,
  SYNTHESIZER_PROMPT_CONTRACT,
  SYNTHESIZER_CONTRACTS_FINGERPRINT_TEXT,
  SYNTHESIZER_LENGTH_PROMPT_CONTRACT,
  EVALUATOR_INSTRUCTIONS,
  EVALUATOR_V1_INSTRUCTIONS,
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
  type JudgesVerdict,
  type PreservedConditionMarkRecord,
  type ServeGateResult,
  type ServeNode,
  type SynthesisDigest,
  type SynthesizerRequest,
  type VerdictLabelBasis,
  type VerdictLabelDerivation,
  verdictDerivationOfJudges
} from "@debateai/serve";
import { EXPANSION_DEPTH_MAX, EXPANSION_DEPTH_MIN, debateShapeSettingsOf } from "@debateai/contract";
import {
  MapChoiceRepository, mapAnswersArgued, mapCheckFailedMergedAnswerIds, mapCheckFailedStatements, mapLimitsFor, type MapResult
} from "@debateai/map";
import {
  argumentLanguageDirective,
  questionLanguageFromRun,
  questionLanguageSentence,
  replyLanguageCheckFor,
  withQuestionLanguageField,
  type QuestionLanguage,
  LENGTH_GUIDANCE_START,
  LENGTH_GUIDANCE_STEPS,
  lengthGuidanceText,
  lengthGuidanceField,
  LENGTH_SENTENCE_ANSWER_CHECKER,
  type CharactersPerWord,
  type LengthCallStep,
  type LengthGuide,
  type LengthGuidanceStep,
  ENGINE2_REDUCER_VERSION,
  comparingJudgeCallSiteKey,
  engineMaterialOf,
  pointInvestigationMaterialOf,
  SERVED_ROOT_SELECTION_RULE,
  SERVED_ROOT_SELECTION_RULE_JUDGES,
  TypedDomainError,
  exhaustive,
  LEGACY_RELEASE_KEY,
  type CompositionBudgetTier,
  type ServedRootRule,
  type WayOfKnowing
} from "@debateai/kernel";
import { MemoryRepository, renderMemorySentence, validateMemorySentence } from "@debateai/memory";
import type { StoryCostFallback, StorySnapshotFailure, StoryWriteInput } from "@debateai/story";
import {
  backupModelUsedRecords,
  backupSwitchEventValue,
  buildAssignedRunSeatBook,
  buildLegacyRunSeatBook,
  createSeatCaller,
  effectiveSynthesisCollapse,
  legacySynthesisSeat,
  pinnedPositionOrder,
  plannedSeatSlot,
  roleAssignmentSeatProblem,
  roleFallbackEventValue,
  rotateSeats,
  rotatedSeatSelection,
  seatRotationOffset,
  seatSiteOrdinal,
  stampCandidateGateway,
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
import { buildStoryRunSnapshot, storyAlsoRaisedFrom, storyAnswersNoteFrom, storyBackupCandidatesFrom, storyBackupMakersFrom, storyRotationRoleMakers, storySeatRoleMaker } from "./story-snapshot.js";
import {
  shapeCloseCallExtraSeats, shapeCloseCallFires, shapeCloseCallFold, shapeDistinctMakerOptions, shapeRankScrutiny, shapeSelectChains,
  type ScrutinyCandidate
} from "./shape-select.js";
import {
  createRunnerMapCaller, engineMapCheckUnbudgeted, mapConditionRecords, mapStageSeats, resolveShapeMap, rootZeroEngineMaterialCharsFor, rootZeroKeepRoomMicros,
  rootZeroMapMaterialCharsFor, rootZeroRoomAttempts, rootZeroRoomRefs, runMapStage, shapeEngineRootMaterial, shapeRootMaterial
} from "./map-stage.js";
import {
  buildScrutinyLegs, buildShapePlan, shapeLegCanRun, shapePositionCount, shapePositionsForTodaysOpening, shapePositionsFromMap,
  type ShapeLeg, type ShapePlan, type ShapePositionPlan
} from "./shape-plan.js";
import {
  shapeDistinctMakers, shapeHandOverRoot, shapeMakerBar, shapeRootMakerBar, shapeSeatOrder, shapeWriterSeat
} from "./shape-seats.js";
import { keepAliveProviderGateway, runKeepAliveScope, startRunKeepAlive, type RunnerTaskControl } from "./run-keep-alive.js";
import type { RunnerRetirementSignal, TaskExecutionCounter } from "./runner-retirement.js";
import { EMPTY_REPLAY_BOOK, readReplayBook, replayingGateway, type ReplayBook } from "./run-replay.js";
import type { RunInFlight } from "./run-in-flight.js";
import type { DebateShapeRunnerSettings } from "./debate-shape-boot.js";
import type { EngineRunnerSettings } from "./engine-boot.js";
import { CALL_LANE_HELD_BACK, CALL_LANE_STOPPED, type CallScheduler, type CallSubject, type CallTicket } from "./call-scheduler.js";
import { createOrderedRecorder, type OrderedRecorder } from "./ordered-recorder.js";
import { laneGateway, type CallSubjectResolver } from "./call-lane-gateway.js";
import {
  assertFairInvestigator, engineFactsWithInvestigations, engineInvestigatedStatuses, engineInvestigationCandidates,
  investigatedStatusEntry, namedCodeDefect, pointInvestigationRowOfStored, recordPointInvestigationRows,
  runPointInvestigations, type PointInvestigationRow
} from "./engine-investigations.js";
import { engineMaterialGraphOf, engineMaterialInvestigationsOf, engineMaterialSourceOf, readEngineReviews } from "./engine-material-reader.js";
import { engineMapFactsOf, enginePositionWordsOf, engineSourceWithMap, type EngineMapFacts } from "./engine-map-facts.js";
import {
  comparingJudgeCodeDefect,
  comparingJudgesSourceOf,
  endsThisCopy,
  runComparingJudges,
  storedVoteOnConflict,
  type RecordedComparingJudgeVote
} from "./engine-judging.js";
import { engineHonestSelectionRule, honestAuthorOnly, reduceHonest } from "./engine-reduce.js";
import {
  engineCatchUpSelectionRule, engineLinkedGraph, engineNodeFactsOf, engineOwnReplyEdgeIdsOf, engineUnassessedRecords,
  pointInvestigationStandings, type EngineLinkedGraph, type EngineNodeFacts
} from "./engine-links.js";
import {
  createRunSitOutBook,
  runPanelRevisedReason,
  reviewEndsForMembersSatOut,
  type RunResilienceSettings,
  type RunSitOutBook,
  type RunSitOutView
} from "./run-sit-out.js";

// Model scorecard A15/A16: the seat book and the seat caller live in their own module.
export * from "./run-seats.js";
// Run resilience (spec 2026-10-12, fix (d)): the per-run sit-out book lives in its own module.
export * from "./run-sit-out.js";

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

const machineIdentifierSchema = z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9:._-]*$/u);

/**
 * V-28 (DL4-F2) — WHICH CEILING STOPPED THE RUN, if either did.
 *
 * Two independent bounds refuse the next provider call, and the serve leg's
 * catch has to tell them apart from a genuine failure, which must keep
 * travelling. Both end the run the same way, but they are reached by different
 * questions and are lifted by different operator actions, so the distinction is
 * named rather than inferred from a count.
 *
 * ENGINE MONEY RULE (spec §14.4.1), TASK M2 — "the same way" depends on WHERE
 * the refusal lands. While the debate is argued, every kind below stops the
 * ARGUING and the run goes on to write its answer with the tree it has
 * (`RUN_BODY_STOP_KINDS`); the stop rides the answer as its envelope record
 * (`runBodyStopDisclosure`). On an answer-writing call it still takes the
 * components-only envelope terminal, which serves the nodes already verified
 * (Task M3 puts a cheaper-model fallback in front of that).
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
   * B9 (budget spec §2.9): under the new costEnvelopePolicy members the seam's
   * shared wall raises it mid-run, at the site day's finish edge; under the old
   * ones it is still asked only when a NEW run is admitted. It is listed for
   * consistency with `RUN_LEVEL_SPEND_STOP_CODES` in the kernel. Raised while a
   * run is under way, the difference between being listed and not is the
   * difference between the run keeping its work and failing outright.
   *
   * ROUND 4, RULING R-C: its OWN kind. Round 3 filed it under `MONEY`, so the
   * record it would have minted carried the per-run reason and sent the
   * operator to raise the wrong ceiling. A spent day is lifted by waiting for
   * the next one, not by re-sealing the per-run envelope.
   */
  DAILY_COST_ENVELOPE_REACHED: "DAILY",
  /**
   * B9 (budget spec §2.9, paid-plans spec §2.4.1): one of the run owner's
   * allowance windows would be crossed at its finish edge (110%). Its OWN
   * kind, for ruling R-C's reason: it is lifted by the person's window
   * resetting or a larger plan, not by the site's day or the run's ceiling.
   */
  PERSON_ALLOWANCE_REACHED: "ALLOWANCE"
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
  DAILY: "DAILY_COST_ENVELOPE_REACHED",
  ALLOWANCE: "PERSON_ALLOWANCE_REACHED"
});

/**
 * ROUND 4, RULING R-B — what a reader is told to DO about an answer that rests
 * on one lineage because a spend bound stopped the run before the other maker
 * positions could be afforded. One lift per stop, because "re-ask with more
 * money", "wait for the next day" and "fix the vendor" are different actions.
 * The ATTEMPT ceiling was listed only for completeness of the record while it
 * failed the run instead of stopping it; since Task M2 it is a run-body stop
 * (`RUN_BODY_STOP_KINDS`) and its lift is used like the others.
 *
 * B9: the ALLOWANCE lift is the OPERATOR's. It stays on the record, and the
 * reader's honesty drawer never prints it (`liftPathIsOperatorOnly`,
 * apps/ui/lib/v3/labels.ts), because it is English and names engine words and
 * the run owner in the third person.
 */
const SINGLE_LINEAGE_SPEND_STOP_LIFT_PATHS: Readonly<Record<EnvelopeStopKind, string>> = Object.freeze({
  ATTEMPTS: "Re-ask under a larger attempt ceiling so the other maker positions can be authored",
  MONEY: "Re-ask under a larger per-run cost envelope so the other maker positions can be afforded",
  USAGE: "Restore a vendor that reports usage, then re-ask so the other maker positions can be billed",
  DAILY: "Re-ask after the daily cost envelope resets so the other maker positions can be afforded",
  ALLOWANCE: "Re-ask after the run owner's allowance window resets, or on a larger plan, so the other maker positions can be afforded"
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
 * A spend refusal raised during authoring, expansion or review must STOP THE
 * PHASE, never travel: travelling discards what the run already paid for. C1
 * then carried the stop to the envelope evaluation in front of the serve chain,
 * which turned it into the components-only terminal. Since Task M2 (spec
 * §14.4.1) that evaluation no longer reads it: the run goes on to write its
 * answer with what it has, and the stop rides the answer as its envelope
 * record (`runBodyStopDisclosure`).
 *
 * `null` means "this is not a phase stop, let it travel".
 *
 * ENGINE MONEY RULE (spec §14.4.1), TASK M2: the ATTEMPT ceiling is a phase stop
 * too. It used to be deliberately `null` — it propagated from these phases and
 * FAILED the run — because V-28 was about money. The owner's rule is that a cost
 * bound never costs the person their answer, and the attempt ceiling is a cost
 * bound by count, so it now stops the arguing like money does (the controller's
 * ruling R10, 2026-09-27).
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
 * and reasoned about. Since Task M2 that is every kind: `ATTEMPTS` was
 * deliberately absent until the engine money rule (see above), and B9 added
 * `ALLOWANCE`, the run owner's window.
 */
const RUN_BODY_STOP_KINDS: readonly EnvelopeStopKind[] = Object.freeze(["ATTEMPTS", "MONEY", "USAGE", "DAILY", "ALLOWANCE"]);

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
 *
 * Task M2: `RUN_COST_ENVELOPE_EXHAUSTED` left this list. The attempt ceiling is
 * a phase stop now (`RUN_BODY_STOP_KINDS`), so a review it refuses is a
 * `BUDGET_STOP` — the entry here could no longer be reached.
 *
 * L4-F9 repair: a debate that must stop (its claim taken, or its time limit
 * reached) is not one unavailable review; the stop leaves as it arrived.
 *
 * Parallel calls (Task 10, fix round 1): neither is a review the debate's
 * STOPPED lane refused unsent (CALL_LANE_STOPPED). Another chain failed and
 * stopped the lane; the refusal leaves as it arrived, so the runner throws that
 * real failure instead of this node's review (`throwBodyFailure` sets the
 * refusal aside).
 *
 * Parallel calls (Task 12): nor is a review the lane HELD BACK at dispatch
 * because the arguing had stopped while it waited (CALL_LANE_HELD_BACK). It
 * leaves as it arrived, and the chain that asked for it simply ends there
 * (`runChain`): a review never asked, never a failure.
 */
const REVIEW_RETHROWN_CODES: readonly string[] = Object.freeze([
  "CALL_BUDGET_EXHAUSTED",
  "PRODUCER_GRADING_FORBIDDEN",
  "RUNNER_CLAIM_LOST",
  "RUNNER_TIME_LIMIT_REACHED",
  "RUNNER_RETIRING",
  CALL_LANE_STOPPED,
  CALL_LANE_HELD_BACK
]);

/** Parallel calls (Task 12): a call the debate's lane held back at dispatch — never sent (spec §2.3, O6). */
function callHeldBack(error: unknown): boolean {
  return error instanceof TypedDomainError && error.code === CALL_LANE_HELD_BACK;
}

/**
 * L4-F9: the keep-alive's refusal — the debate must make no further model call (its claim taken, or its time up; and,
 * side-by-side spec §4, its release retiring).
 */
function keepAliveStop(error: unknown): boolean {
  return error instanceof TypedDomainError && (error.code === "RUNNER_CLAIM_LOST" || error.code === "RUNNER_TIME_LIMIT_REACHED"
    || error.code === "RUNNER_RETIRING");
}

export function reviewFailureOutcome(error: unknown): ReviewFailureOutcome {
  const stop = expansionPhaseStop(error);
  if (stop !== null) return Object.freeze({ kind: "BUDGET_STOP" as const, stop });
  if (error instanceof TypedDomainError && REVIEW_RETHROWN_CODES.includes(error.code)) {
    return Object.freeze({ kind: "RETHROW" as const });
  }
  return Object.freeze({ kind: "UNAVAILABLE" as const });
}

/**
 * Engine 2 (spec §4.2b, E13): what one failed investigation call means. The keep-alive's refusal and a stopped lane
 * leave as they arrived (the debate must make no further call). No answer or vendor failure fails the debate: a reply
 * still refused after LG-A's repairs, a vendor error or a spend refusal leaves the point at the reduced weight
 * (INVESTIGATION_UNAVAILABLE), and none is a run-body stop. A code defect does fail it (below).
 */
export function pointInvestigationFailureOutcome(error: unknown): "RETHROW" | "UNAVAILABLE" {
  if (keepAliveStop(error)) return "RETHROW";
  if (error instanceof TypedDomainError && error.code === CALL_LANE_STOPPED) return "RETHROW";
  // A14 fix round 1 (PF-R2a8.17): a code defect fails the debate, as a defect should. A seat with no eligible member,
  // and a TypeError the code NAMED (its message is a code: POINT_INVESTIGATION_*, LENGTH_*, ENGINE_MATERIAL_INVALID:…)
  // inside the call's builders. Decided by the code, never by the class: fetch's own network failure is a TypeError
  // ("fetch failed") and stays unavailable.
  if (error instanceof TypedDomainError && error.code === "DEBATE_MAKER_UNRESOLVED") return "RETHROW";
  // R2a final wave (re-review Minor 3): a reply refused after the repairs is unavailable BY NAME, whatever carries it,
  // before the code-shape rule below could read it as a defect.
  if (error instanceof Error && POINT_INVESTIGATION_REPLY_REFUSALS.has(error instanceof TypedDomainError ? error.code : error.message)) {
    return "UNAVAILABLE";
  }
  if (namedCodeDefect(error)) return "RETHROW";
  return "UNAVAILABLE";
}

/** The investigator's reply refusals (packages/judgement's reader): a reply, never a code defect. */
const POINT_INVESTIGATION_REPLY_REFUSALS: ReadonlySet<string> = new Set(["POINT_INVESTIGATION_PARSE_FAILURE", "POINT_INVESTIGATION_SCHEMA_FAILURE"]);

/** A content-free code (a domain code or a system one such as ECONNRESET). */
const FAILURE_CODE_SHAPE = /^[A-Z][A-Z0-9_]{0,63}$/u;

/**
 * Engine 2 (A14 fix round 1): what an unavailable investigation call is named in the runner's line: its typed code, or
 * a code-shaped `code` property (ECONNRESET), else its class name. Never its message: it may carry vendor or AI text.
 */
export function pointInvestigationFailureCode(error: unknown): string {
  if (error instanceof TypedDomainError) return error.code;
  if (typeof error !== "object" || error === null) return "UNKNOWN";
  const code = (error as { readonly code?: unknown }).code;
  if (typeof code === "string" && FAILURE_CODE_SHAPE.test(code)) return code;
  // R2a final wave (re-review Minor 4): Node's fetch throws TypeError("fetch failed") with the socket's code on its cause.
  const cause: unknown = (error as { readonly cause?: unknown }).cause;
  const causeCode = typeof cause === "object" && cause !== null ? (cause as { readonly code?: unknown }).code : undefined;
  if (typeof causeCode === "string" && FAILURE_CODE_SHAPE.test(causeCode)) return causeCode;
  const name: unknown = (error as { readonly constructor?: { readonly name?: unknown } }).constructor?.name;
  return typeof name === "string" && /^[A-Za-z][A-Za-z0-9]{0,63}$/u.test(name) ? name : "UNKNOWN";
}

/** Engine 2 (A14 fix round 1): the runner's content-free investigation line. Codes and ids only, never debate or model text. */
export function logPointInvestigation(event: string, detail: Readonly<Record<string, unknown>>): void {
  console.warn(JSON.stringify({ ...detail, kind: "DEBATEAI_POINT_INVESTIGATION", event }));
}

/**
 * Engine 2 (R2b): the runner's content-free judging line, one per judge whose call failed (the step records it as
 * JUDGE_FAILED). Codes and ids only, never debate or model text, as the investigation line.
 */
export function logComparingJudge(event: string, detail: Readonly<Record<string, unknown>>): void {
  console.warn(JSON.stringify({ ...detail, kind: "DEBATEAI_COMPARING_JUDGE", event }));
}

/**
 * ENGINE MONEY RULE (spec §14.4.1), TASK M2 — WHAT A NODE'S PANEL DOES WITH A
 * STOP RAISED BY ONE OF ITS MEMBERS.
 *
 * A run-level spend stop is never noted as a member failure (C2(b)). Since the
 * M2 polish that includes the attempt ceiling, which used to be noted as a
 * PROVIDER_ERROR member failure. On today's serial path (the debate's lane
 * admits one call) the panel asks its members one at a time and asks no
 * further member after the stop; when the debate's calls run together
 * (`askTogether`, ruling R32) every member was already asked at once, and the
 * first stop in member order is the panel's stop once every member settled.
 *
 *  · "TRAVEL" — every node but the first root: the panel rethrows the stop, and
 *    the phase catch that authored the node records it (the node is not
 *    minted, and the run goes on to its answer with what it has).
 *  · "AUTHOR_ONLY" — the first root's panel (`PANEL:root`). Nothing exists yet
 *    to answer from but this node, so letting the stop travel would fail the
 *    whole work item. The panel returns the voices it had already heard
 *    (`onRunLevelSpendStop: "RETURN_HEARD"`), the node rests on them — on the
 *    author's own judgement alone when none was heard — and the stop is handed
 *    back for the caller to record.
 *
 * `null` means "let it travel".
 */
export type PanelSpendStopRule = "AUTHOR_ONLY" | "TRAVEL";

export function panelSpendStop(error: unknown, rule: PanelSpendStopRule): EnvelopeStopKind | null {
  return rule === "AUTHOR_ONLY" ? expansionPhaseStop(error) : null;
}

/**
 * ENGINE MONEY RULE (spec §14.4.1), TASK M2 — THE ONE STOP THAT STILL ENDS A RUN
 * WITHOUT AN ANSWER.
 *
 * If the author's own FIRST call — the first root's judgement — is refused by a
 * ceiling, nothing exists to answer from: no node, no label, nothing a floor
 * could print. That is not money deciding the outcome; the owner's rule counts
 * it as technical. It fails TYPED, under its own code, so the operator is told
 * which kind of limit to look at.
 *
 * The code names the usual cause, a ceiling below one call. The MESSAGE does
 * not assume it (M2 review polish): a crash followed by a re-claim carries the
 * earlier claim's attempts and spend over, so a ceiling that fits one call can
 * still refuse the first call of the re-claim. So the message states both
 * readings and keeps the refusal's own evidence verbatim — for money, "spent X
 * of Y … the next call could cost Z" — which is what tells them apart. The
 * refusal is also kept as the `cause`.
 *
 * Only the two CEILINGS map here. A vendor that reports no usage and a spent day
 * are not a ceiling below one call: each already fails typed under its own code,
 * and each is lifted differently (ruling R-C). `null` means "let it travel as it
 * is".
 */
const FIRST_CALL_CEILING_KINDS: readonly EnvelopeStopKind[] = Object.freeze(["ATTEMPTS", "MONEY"]);

export function firstCallCeilingFailure(error: unknown): TypedDomainError | null {
  const stop = envelopeStopKind(error);
  if (stop === null || !FIRST_CALL_CEILING_KINDS.includes(stop)) return null;
  const evidence = error instanceof Error ? error.message : String(error);
  const failure = new TypedDomainError(
    "RUN_CEILING_BELOW_FIRST_CALL",
    `${ENVELOPE_STOP_REASONS[stop]} refused the first position's own call, so nothing exists to answer from.`
      + " Either the run's ceiling for arguing is below one call, or an earlier claim of this run"
      + ` spent it before a re-claim. The refusal said: ${evidence}`
  );
  failure.cause = error;
  return failure;
}

/**
 * ENGINE MONEY RULE (spec §14.4.1), TASK M2 — THE STOP WHILE ARGUING, KEPT ON THE
 * ANSWER IT NO LONGER PREVENTS.
 *
 * Before M2 a stop while arguing forced the envelope terminal, whose answer-scope
 * `ENVELOPE_EXHAUSTED` record named the stop — and that record is what told a
 * reader (the honesty drawer's "Run envelope exhausted") the debate was cut
 * short. The terminal is gone from that path; the record is not. It is the same
 * record, minted AFTER the serve chain, the way the owed-check and type-fallback
 * disclosures are, so:
 *
 *  · the answer-writer's own input is unchanged by it;
 *  · the chain's post-answer envelope check, which treats the mark as "the
 *    envelope terminal already fired", still runs.
 *
 * `null` — nothing to add:
 *
 *  · the run was never stopped;
 *  · the answer already carries the mark, because a refused ANSWER-WRITING call
 *    took the envelope terminal with its own record;
 *  · the answer is DEFECT: serve's own rule keeps DEFECT and ENVELOPE_EXHAUSTED
 *    independent terminals.
 */
export function runBodyStopDisclosure(input: Readonly<{
  runBodyBudgetStop: EnvelopeStopKind | null;
  resultConditionMarks: readonly string[];
  runId: string;
  servedRootNodeId: string;
}>): ConditionMarkRecord | null {
  if (input.runBodyBudgetStop === null) return null;
  if (input.resultConditionMarks.includes("ENVELOPE_EXHAUSTED")) return null;
  if (input.resultConditionMarks.includes("DEFECT")) return null;
  return Object.freeze({
    mark: "ENVELOPE_EXHAUSTED" as const,
    scope: "answer" as const,
    subjectRef: input.runId,
    reason: ENVELOPE_STOP_REASONS[input.runBodyBudgetStop],
    liftPath: null,
    servedRootRule: null,
    affectedNodeIds: Object.freeze([input.servedRootNodeId])
  } satisfies ConditionMarkRecord);
}

const compositionSchema = z.object({
  segments: z.array(z.object({
    segment_id: machineIdentifierSchema,
    text: z.string().trim().min(1),
    node_refs: z.array(machineIdentifierSchema),
    served_number_refs: z.array(machineIdentifierSchema)
  }).strict()).min(1).max(RUNNER_COMPOSITION_SEGMENT_CAP, "Composer output exceeds the engine segment cap")
}).strict();
/**
 * LG-A (spec 2026-10-15, L31): the writer's answer form (v4, as v3) asks for no served number ("served_number_refs is always []",
 * packages/serve/src/synthesis.ts), so a reply that left the list out has exactly one value it could have meant. The fixer
 * reads this twin, which pins it, and fills it (ONLY_VALUE_FILLED); acceptance is still `compositionSchema`'s, unchanged.
 */
const compositionFixGuide = z.object({
  segments: z.array(z.object({
    segment_id: machineIdentifierSchema,
    text: z.string().trim().min(1),
    node_refs: z.array(machineIdentifierSchema),
    served_number_refs: z.array(machineIdentifierSchema).max(0)
  }).strict()).min(1).max(RUNNER_COMPOSITION_SEGMENT_CAP)
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
 * V-11 (RUN1): the EVALUATOR's prompt contract as it first shipped, kept as
 * history byte for byte. `EVALUATOR_CONTRACT_TEXT` is the answer form — code's
 * half — and `EVALUATOR_V1_INSTRUCTIONS` (which already shipped, inside the
 * payload's `instructions` member) is the owners' slot. Its fingerprint is the
 * `conformanceContractHash` of every register version sealed before v2 (the
 * preview's version 11 among them).
 */
export const EVALUATOR_V1_PROMPT_CONTRACT: PromptContract = Object.freeze({
  contractId: "serve.evaluator.v1",
  instruction: EVALUATOR_V1_INSTRUCTIONS,
  answerForm: EVALUATOR_CONTRACT_TEXT
});

/**
 * PRACTICE DEBATE 3 (2026-10-12): `serve.evaluator.v2`, what the runner sends.
 * Only the owners' instruction slot changed (owner approved 2026-10-12,
 * `EVALUATOR_INSTRUCTIONS`): the checker now also grades the reader's rule the
 * writer's `serve.synthesizer.v3` instruction states (v4 keeps that instruction). The answer form is the
 * same sealed `EVALUATOR_CONTRACT_TEXT`, so the verdict schema below is
 * unchanged. A new instruction is a new contract id, never an edit, and a new
 * `conformanceContractHash` the register must carry before the runner starts
 * (`assertRegisterPromptContractHashes`).
 */
export const EVALUATOR_PROMPT_CONTRACT: PromptContract = Object.freeze({
  contractId: "serve.evaluator.v2",
  instruction: EVALUATOR_INSTRUCTIONS,
  answerForm: EVALUATOR_CONTRACT_TEXT
});

/**
 * Length guidance (spec 2026-10-15 §3.2): `serve.evaluator.length.v1`, v2's instruction plus the checker's one sentence,
 * v2's answer form (so the verdict schema is unchanged). Its two targets arrive as material fields: `answer_length` (the
 * writer's) and `length` (its own reply's). Sent only for a run admitted with the length row; every other checker call
 * is v2's, byte for byte.
 */
export const EVALUATOR_LENGTH_CONTRACT_ID = "serve.evaluator.length.v1" as const;
export const EVALUATOR_LENGTH_PROMPT_CONTRACT: PromptContract = Object.freeze({
  contractId: EVALUATOR_LENGTH_CONTRACT_ID,
  instruction: `${EVALUATOR_INSTRUCTIONS} ${LENGTH_SENTENCE_ANSWER_CHECKER}`,
  answerForm: EVALUATOR_CONTRACT_TEXT
});
/** What `conformanceContractHash` seals from length guidance on: v2, then its length variant (as the writer's seal). */
export const EVALUATOR_CONTRACTS_FINGERPRINT_TEXT: string = [
  promptContractFingerprintText(EVALUATOR_PROMPT_CONTRACT),
  promptContractFingerprintText(EVALUATOR_LENGTH_PROMPT_CONTRACT)
].join("\n---\n");

/**
 * The fingerprints of the three prompt contracts this code SENDS, derived
 * exactly as the register's builder derives its rows
 * (`computeDevelopmentContractRows` in `./dev-deployment-register.ts`; that
 * builder keeps its own three lines on purpose, so
 * `tests/unit/f-sealedrows-a-dataflow.test.ts` can prove the row follows the
 * exported contract it imports).
 */
export function codePromptContractHashes(): Readonly<{ judge: string; composer: string; conformance: string }> {
  const digest = (text: string): string => createHash("sha256").update(text).digest("hex");
  return Object.freeze({
    judge: digest(JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT),
    composer: digest(SYNTHESIZER_CONTRACTS_FINGERPRINT_TEXT),
    conformance: digest(EVALUATOR_CONTRACTS_FINGERPRINT_TEXT)
  });
}

/** The register row each prompt fingerprint is sealed in, and the contract it names. */
const REGISTER_PROMPT_CONTRACT_ROWS = Object.freeze([
  { key: "judge", rowKey: "judgeContractHash" },
  { key: "composer", rowKey: "composerContractHash" },
  { key: "conformance", rowKey: "conformanceContractHash" }
] as const);

/**
 * PRACTICE DEBATE 3 (2026-10-12) — A PROMPT FINGERPRINT MISMATCH IS NEVER SILENT.
 * The runner records every judge, answer-writer and answer-checker call under
 * the fingerprint the REGISTER holds (`judgeContractHash`, `composerContractHash`,
 * `conformanceContractHash`), never under the one the code computes. Shipping a
 * new sealed prompt without a new register version therefore used to log the
 * new prompt's calls under the old prompt's fingerprint, with nothing red
 * anywhere. The runner's boot (main.ts) and the practice composition now call
 * this right after reading the register: a register that does not carry the
 * fingerprint of a prompt this code sends refuses the start, naming the row.
 *
 * Only the three PROMPT fingerprints are compared. `propagationContractHash`
 * and `serveContractHash` are digests of whole source files, which move with
 * any edit of those files; refusing on them would refuse every code-only
 * release, which is a separate owner decision.
 */
export function assertRegisterPromptContractHashes(
  registerHashes: Readonly<{ judge: string; composer: string; conformance: string }>,
  registerVersion: string | number | bigint
): void {
  const code = codePromptContractHashes();
  const differing = REGISTER_PROMPT_CONTRACT_ROWS.filter(({ key }) => registerHashes[key] !== code[key]);
  if (differing.length === 0) return;
  throw new TypedDomainError(
    "REGISTER_PROMPT_CONTRACT_HASH_MISMATCH",
    `Register version ${String(registerVersion)} does not carry the prompt fingerprints this code sends: `
    + differing.map(({ key, rowKey }) => `${rowKey} is ${registerHashes[key]}, the code's is ${code[key]}`).join("; ")
    + ". Publish a register version from this code and pin it in REGISTER_VERSION before starting the runner."
  );
}

/**
 * The contract with its language sentence, added at call time (never sealed: the synthesizer and evaluator fingerprints
 * exclude it). Without a lock, today's directive byte for byte; with a shaped run's lock (question-language spec
 * 2026-10-13 L6), THE one named sentence.
 */
function promptContractInArgumentLanguage(
  contract: PromptContract,
  argumentLanguageName: string,
  questionLanguage: QuestionLanguage | null = null
): PromptContract {
  return Object.freeze({
    ...contract,
    instruction: questionLanguage === null
      ? `${contract.instruction} ${argumentLanguageDirective(argumentLanguageName)}`
      : `${contract.instruction} ${questionLanguageSentence(questionLanguage)}`
  });
}

export function buildSynthesizerPromptPacket(request: SynthesizerRequest, argumentLanguageName: string): PromptPacket {
  return buildSynthesisRolePrompt(request, argumentLanguageName).packet;
}

export function buildEvaluatorPromptPacket(request: EvaluatorRequest, argumentLanguageName: string): PromptPacket {
  return buildSynthesisRolePrompt(request, argumentLanguageName).packet;
}

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
}).strict().superRefine((verdict, context) => {
  // D2: a localized "none" sentinel (e.g. "niciuna") is a repairable schema
  // failure. Criteria agreement and objection text stay dev's single
  // enforcement in serve's assertEvaluatorVerdict.
  if (verdict.satisfied && verdict.objection !== null) {
    context.addIssue({ code: "custom", path: ["objection"], message: "a satisfied verdict requires the JSON null literal" });
  }
});

/**
 * Model scorecard A17 (spec §2.9) — THE SYNTHESIS PROMPT BUILDER, callable on
 * its own. Both runner closures build their packet here, and `moment:replay`
 * (`replayMoment`, acceptance/replay-moment.ts) calls this same function
 * through `captureMomentPacket` and `invokeMomentBuilder`
 * (acceptance/moment-tools.ts), so a replayed prompt is the live prompt by
 * construction. It stays in THIS module because the evaluator's contract is
 * declared here (the seeders import it and `f-sealedrows-a-dataflow` mocks that
 * export). `randomBytes` exists for the byte-equality test; production never
 * passes it. Paid plans S1a: it writes in the question's language (dev's
 * argument-language rule, D2), so the replayed prompt is the live one.
 * Question language (spec 2026-10-13 L6): with a shaped run's lock, the named
 * sentence replaces the directive and the `question_language` field rides LAST
 * (after `answer_length`); without one (null), the packet is today's, byte for byte.
 */
export function buildSynthesisRolePrompt(
  request: SynthesizerRequest | EvaluatorRequest,
  argumentLanguageName: string,
  randomBytes?: (size: number) => Buffer,
  length: RoleLength | null = null,
  questionLanguage: QuestionLanguage | null = null
): FramedPrompt {
  // Length guidance (spec 2026-10-15 §3.2): the writer with a target takes its length variant; the checker takes its own
  // only with its own target (`ownWords`, a run admitted with the length row). Every other call: today's packet.
  const writerLengthed = request.role === "SYNTHESIZER" && length !== null;
  const checkerLengthed = request.role === "EVALUATOR" && length !== null && length.ownWords !== null;
  // V-MINIMUM-PAYLOAD: the one projection, applied once; a length variant only appends its own fields after it.
  const material = toSynthesisPromptMaterial(request);
  return buildFramedPrompt({
    contract: promptContractInArgumentLanguage(
      request.role === "SYNTHESIZER"
        ? (writerLengthed ? SYNTHESIZER_LENGTH_PROMPT_CONTRACT : SYNTHESIZER_PROMPT_CONTRACT)
        : (checkerLengthed ? EVALUATOR_LENGTH_PROMPT_CONTRACT : EVALUATOR_PROMPT_CONTRACT),
      argumentLanguageName,
      questionLanguage
    ),
    // The language field wraps the ONE projection (and the length fields after it): it rides LAST; with no lock
    // `withQuestionLanguageField` returns the same array, today's bytes.
    material: withQuestionLanguageField(
      writerLengthed ? [...material, answerLengthField(length)]
        : checkerLengthed ? [...material, answerLengthField(length),
          lengthGuidanceField(length.ownWords!, length.languageCode, length.charactersPerWord)]
          : material,
      questionLanguage),
    ...(randomBytes === undefined ? {} : { randomBytes })
  });
}

/**
 * Spec §3.3 step 8: the writer's call bound is max(sealed bound, the answer length's writerBound) — never under the
 * sealed bound, never under the row's writer bound. Null (no shape): the sealed bound itself, the same object.
 */
export function shapeWriterBound(bound: CallBound, writerBound: number | null): CallBound {
  if (writerBound === null) return bound;
  if (!Number.isSafeInteger(writerBound) || writerBound < 1) throw new TypeError("SHAPE_WRITER_BOUND_INVALID");
  if (writerBound <= bound.tokenCeiling) return bound;
  return Object.freeze({ ...bound, tokenCeiling: writerBound });
}

/**
 * Length guidance (spec 2026-10-15 §3.3; INTERFACE §5.6): a debate step's call bound sized from the run's frozen numbers,
 * max(today, thinking room + runaway x words x tokens per word), the raise clamped to 32,768; never below today's. Row
 * absent (null), and every step sized elsewhere (the story: LG-D; the map: map-stage.ts; the structure repair: LG-A),
 * the bound itself, the same object.
 */
export function guidedCallBound(bound: CallBound, step: LengthCallStep, guidance: LengthGuidance | null): CallBound {
  if (guidance === null || !(LENGTH_GUIDANCE_STEPS as readonly string[]).includes(step)) return bound;
  const tokenCeiling = lengthGuidanceAllowanceTokens(guidance, step as LengthGuidanceStep, bound.tokenCeiling);
  return tokenCeiling === bound.tokenCeiling ? bound : Object.freeze({ ...bound, tokenCeiling });
}

/**
 * Length guidance (spec 2026-10-15 §3.2): one step's target for a judge, panel or review call, spread into the call's
 * input, from a run's receipt `length` and its stored language tag; nothing without the receipt's `length` (today's
 * request, byte for byte). The run's own calls and the review catch-up both use it (Task 12 review 3).
 */
export function lengthGuideFrom(guidance: LengthGuidance | null, step: LengthGuidanceStep, languageCode: string):
  Readonly<{ length?: LengthGuide }> {
  return guidance === null ? {}
    : { length: Object.freeze({ words: guidance.steps[step], languageCode, charactersPerWord: guidance.charactersPerWord }) };
}

/**
 * What a synthesis call is told about length (INTERFACE §5.4): the writer's target (`answer_length`), the checker's own
 * reply target (`ownWords`, LG-C2), the run's language tag (zh / ja / th name characters) and the row's factors. A run
 * without the length row but with the shape passes the shape's words with `languageCode: null`: today's "about N words".
 */
export type RoleLength = Readonly<{
  answerWords: number; ownWords: number | null; languageCode: string | null; charactersPerWord: CharactersPerWord;
}>;

/** The writer's `answer_length` field from a RoleLength: today's `synthesizerAnswerLengthField` text when it names words. */
function answerLengthField(length: RoleLength): Readonly<{ name: "answer_length"; content: string }> {
  return Object.freeze({ name: "answer_length", content: lengthGuidanceText(length.answerWords, length.languageCode, length.charactersPerWord) });
}

/** A17: the classification a live synthesis call applies, exported for replay (LG-A: the writer through its fix guide, as live). */
export function classifySynthesisRoleContent(role: SynthesisRoleName, content: string, reply?: ModelReplyFacts): ContentClassification {
  return role === "SYNTHESIZER"
    ? classifyStructuredContent(content, compositionSchema, reply, compositionFixGuide)
    : classifyStructuredContent(content, evaluatorVerdictSchema, reply);
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
 *
 * Paid plans S1a: dev's Task M2 rule (a panel a spend stop cut short is
 * PANEL-PARTIAL and names the stop) and B9c's (a seat left out for money names
 * the stop's own code, once) live here too, so every panel of an assigned run
 * and of a legacy one is disclosed by the one function.
 */
export function panelDegradationOf(
  nonAuthorVoices: number,
  notes: readonly JudgePanelNote[],
  spendStop: EnvelopeStopKind | null = null
): { readonly marks: readonly PanelDegradationMark[]; readonly panelFailureReason: string | null } {
  // The lost voices (the scorecard's two kinds). Named as dev's M2 names them:
  // tests/architecture/v28-serve-decision-wiring.test.ts pins the PANEL-PARTIAL
  // statement below, once in this file, by this name. B9c's SPEND_REFUSED seat
  // (a MEMBER_FAILED note) is a lost voice like any other.
  const memberFailures = notes.filter((note) => note.kind === "MEMBER_FAILED" || note.kind === "PRODUCER_GRADING_REFUSED_AFTER_CALL");
  const marks: PanelDegradationMark[] = [];
  if (nonAuthorVoices === 0) marks.push(PANEL_DEGRADED_SINGLE_VOICE_MARK);
  else if (memberFailures.length > 0 || spendStop !== null) marks.push(PANEL_PARTIAL_MARK);
  // The reason names WHICH members were lost and how. B9: a seat left out for
  // money names the stop's own code, once, exactly as a stop on the first root's
  // panel does (the honesty drawer's `panelSpendStopKind` reads it the same way:
  // the budget). Task M2: a panel a spend stop cut short also names the stop,
  // which is why the members after it never spoke.
  const reasons = [
    ...memberFailures.filter((note) => note.failureKind !== "SPEND_REFUSED")
      .map((note) => note.kind === "PRODUCER_GRADING_REFUSED_AFTER_CALL"
        ? `${note.memberRole}: ${note.failureKind} (answered by ${note.answeringMemberRole})`
        : `${note.memberRole}: ${note.failureKind}`),
    ...new Set(memberFailures
      .filter((note) => note.kind === "MEMBER_FAILED" && note.failureKind === "SPEND_REFUSED")
      .map((note) => note.reason)),
    ...(spendStop === null ? [] : [ENVELOPE_STOP_REASONS[spendStop]])
  ];
  return Object.freeze({
    marks: Object.freeze(marks),
    panelFailureReason: reasons.length === 0 ? null : reasons.join("; ")
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

/**
 * Owner ruling 2026-10-10 — "shuffled per debate, then taken in turn". Each
 * maker's place in one debate's reviewer circle: a key seeded by the run id
 * alone (no clock, no Math.random), so the same debate always draws the same
 * circle and different debates draw different ones. Sorting by a seeded key is
 * a seeded shuffle that does not depend on the order the panel lists its
 * makers in, and a maker missing from one node's candidates (down, or its
 * seat's member filtered) does not reorder the others.
 */
function reviewerTurnKey(runId: string, maker: string): string {
  return createHash("sha256")
    .update(JSON.stringify(["debateai:reviewer-turn-order:v1", runId, maker]), "utf8")
    .digest("hex");
}

const compareReviewerTurn = (
  left: { readonly key: string; readonly maker: string },
  right: { readonly key: string; readonly maker: string }
): number => left.key < right.key ? -1 : left.key > right.key ? 1 : left.maker < right.maker ? -1 : left.maker > right.maker ? 1 : 0;

/** One debate's reviewer circle: the distinct makers in their seeded order. */
export function reviewerTurnOrder(runId: string, makers: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(makers)]
    .map((maker) => ({ maker, key: reviewerTurnKey(runId, maker) }))
    .sort(compareReviewerTurn)
    .map((entry) => entry.maker));
}

/**
 * The reviewer of one node: always a different maker from its author, taken
 * IN TURN round this debate's seeded circle (`reviewerTurnOrder`). The turn
 * after the author's latest recorded reviewer is the next maker clockwise that
 * is not the author; an author with no review yet starts at the maker after
 * itself, so a debate's first reviews go once round the whole circle and every
 * maker reviews. One author's reviews therefore spread over the other makers
 * to within one review of each other.
 *
 * A pure function of (run, author, candidate makers, latest reviewer): the only
 * moving input is the latest reviewer, which changes only when a review for
 * that author LANDS — and a reviewed node is never reviewed again — so a
 * retried node is given the same reviewer. Of several candidates of the chosen
 * maker (two refs of one model), the first listed is taken, as before.
 */
export function selectDifferentMakerReviewer<T extends { readonly maker: string }>(
  runId: string,
  authorMaker: string,
  configuredMakers: readonly T[],
  latestReviewerMaker: string | null = null
): T {
  const candidates = configuredMakers.filter((candidate) => candidate.maker !== authorMaker);
  if (candidates.length === 0) {
    throw new TypedDomainError(
      "DIFFERENT_MAKER_REVIEWER_UNAVAILABLE",
      `No configured maker differs from node author ${authorMaker}`
    );
  }
  const circle = [...new Set(candidates.map((candidate) => candidate.maker))]
    .map((maker) => ({ maker, key: reviewerTurnKey(runId, maker) }))
    .sort(compareReviewerTurn);
  // The place the turn moves on from: the latest reviewer's, or the author's own
  // when it has none (or the latest is the author's maker, which cannot review).
  const from = latestReviewerMaker === null || latestReviewerMaker === authorMaker ? authorMaker : latestReviewerMaker;
  const fromEntry = { maker: from, key: reviewerTurnKey(runId, from) };
  const next = circle.find((entry) => compareReviewerTurn(entry, fromEntry) > 0) ?? circle[0]!;
  return candidates.find((candidate) => candidate.maker === next.maker)!;
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
  /**
   * Parallel AI calls (spec 2026-10-12 §2.3): takes one of the run's cooldown
   * holds, or refuses (false) when the run already holds `cap`. Present, it
   * replaces `withCooldownRetry`'s "count, then compare", which two sites
   * failing together would both pass. `reservingHoldRecorder` supplies it.
   */
  reserveHold?(runId: string, cap: number): Promise<boolean>;
  record(event: HoldProgressEvent): Promise<void>;
  wait(cooldownMs: number): Promise<void>;
}

/**
 * Parallel AI calls (spec 2026-10-12 §2.3) — THE RUN-WIDE HOLD CAP UNDER
 * CONCURRENT FAILURES. Wraps a recorder with an in-memory reservation per run:
 * `reserveHold` counts its hold as reserved synchronously, BEFORE it reads the
 * run's recorded holds, and admits it iff recorded + reserved <= cap, where
 * reserved is the count it saw when it reserved (itself included). Refused, it
 * releases at once; admitted, it stays reserved until the hold's COOLDOWN_HOLD
 * record has committed (or failed), when the database count takes over.
 *
 * The reserved count is the one taken at reservation, not one read after the
 * count returns: a hold that commits and releases while this one's count is
 * being read may be missing from that count, and would then be in neither
 * number. Taken at reservation, the later of two reservations always sees the
 * earlier (reserved, or by then recorded — at worst counted twice, which only
 * refuses). One runner process owns a claimed debate, so the count is exact.
 */
export function reservingHoldRecorder(recorder: HoldRecorder): HoldRecorder {
  const reserved = new Map<string, number>();
  const release = (runId: string): void => {
    const held = reserved.get(runId) ?? 0;
    if (held <= 1) reserved.delete(runId);
    else reserved.set(runId, held - 1);
  };
  return Object.freeze({
    countCooldownHolds: (runId: string) => recorder.countCooldownHolds(runId),
    reserveHold: async (runId: string, cap: number): Promise<boolean> => {
      const held = (reserved.get(runId) ?? 0) + 1;
      reserved.set(runId, held);
      let recorded: number;
      try {
        recorded = await recorder.countCooldownHolds(runId);
      } catch (error) {
        release(runId);
        throw error;
      }
      if (recorded + held <= cap) return true;
      release(runId);
      return false;
    },
    record: async (event: HoldProgressEvent): Promise<void> => {
      if (event.kind !== "node.retrying" || event.state !== "COOLDOWN_HOLD") return recorder.record(event);
      try {
        await recorder.record(event);
      } finally {
        release(event.runId);
      }
    },
    wait: (cooldownMs: number) => recorder.wait(cooldownMs)
  });
}

/**
 * Parallel AI calls (spec 2026-10-12 §2.1) — A REPLY'S PARENT, SAVED LATER. A support/attack reply and a
 * cross-exchange start their author call once the parent's AUTHOR call has returned (they need only its text), so the
 * parent's node — whose id its save mints — may not exist yet when the reply's call fails. `saved` is that id once
 * the parent is saved, or null when it never is (the reply is then dropped unsaved). Every record that names the
 * parent waits for it (`laterParentHold`), so it names the node the serial run's record names.
 */
interface LaterParentNode {
  readonly saved: Promise<string | null>;
}

/**
 * Parallel AI calls, ruling R26b — THE CHAIN STEP A MODEL CALL BELONGS TO: its place in today's serial order (the
 * runner's `ChainRank`), so a member that sits out can be placed where today's loop would first have seen it.
 */
const chainStageScope = new AsyncLocalStorage<{ readonly rank: readonly number[] }>();

/** The hold recorder of one site whose parent is saved later: each record waits for the parent's id and names it. */
function laterParentHold(recorder: HoldRecorder, parent: LaterParentNode): HoldRecorder {
  const reserve = recorder.reserveHold;
  return Object.freeze({
    countCooldownHolds: (runId: string) => recorder.countCooldownHolds(runId),
    ...(reserve === undefined ? {} : { reserveHold: (runId: string, cap: number) => reserve.call(recorder, runId, cap) }),
    record: async (event: HoldProgressEvent): Promise<void> => recorder.record({ ...event, parentNodeId: await parent.saved }),
    wait: (cooldownMs: number) => recorder.wait(cooldownMs)
  });
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
  /**
   * Run resilience (spec 2026-10-12, fix (d); ruling R-a): a failure after which the cooldown hold and the final
   * retry would only ask a member that now sits out the rest of the run — a call that ended in the vendor's gate-proven
   * unbilled refusal (review amendment R-d: never the gate's own), an unavailable gate, or a member already sitting
   * out, each seen through the run's sit-out book (`RunSitOutBook.haltsAtOnce`). Such a failure HALTS at
   * once: no ten-minute hold, no final retry. Absent (hosted, local, every direct caller), every failure keeps
   * today's path.
   */
  readonly haltsAtOnce?: (error: ProviderCallFailedError) => boolean;
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
    if (input.haltsAtOnce?.(error) === true) return halted(error, error.attempts);
    if (input.finalRetryPermitted !== undefined && !(await input.finalRetryPermitted())) {
      return halted(error, error.attempts);
    }
    // DR-186(8): review gets every ruled provider attempt plus the final
    // attempt, but never holds the in-run loading page open.
    if (input.failureScope === "REVIEW") return finalAttempt(error);
    let holdUntil: string;
    let heldAttempts: number;
    if (input.hold.reserveHold !== undefined) {
      // Parallel AI calls (spec 2026-10-12 §2.3): the reservation is taken
      // last, so nothing that can fail lies between it and the COOLDOWN_HOLD
      // record that releases it. Refused, the site keeps its final attempt.
      heldAttempts = await spent(error.attempts);
      if (!(await input.hold.reserveHold(input.runId, input.policy.maxCooldownHoldsPerRun))) return finalAttempt(error);
      holdUntil = new Date(Date.now() + input.policy.cooldownMs).toISOString();
    } else {
      const holds = await input.hold.countCooldownHolds(input.runId);
      // DR-184/C-1: the run-wide cap bounds waiting only. It must never eat the
      // final attempt that the structural ceiling provisions at every site.
      if (holds >= input.policy.maxCooldownHoldsPerRun) return finalAttempt(error);
      holdUntil = new Date(Date.now() + input.policy.cooldownMs).toISOString();
      heldAttempts = await spent(error.attempts);
    }
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
  | "CATCH_UP_NUMBER_WOULD_MOVE"
  | "CATCH_UP_FLOOR_WOULD_MOVE";

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
    readonly argumentLanguageName?: string;
    /** P2d Task 7c: the run's lock, exactly as the runner's own review sends it (`JudgeSubjectInput.questionLanguage`). */
    readonly questionLanguage?: QuestionLanguage;
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

/**
 * ENGINE MONEY RULE, TASK M5 review (M1) — a floor answer's floor, as the
 * catch-up compares it: the leading position and its label. `verdictState` is
 * null when the leading position MOVED: its label is not re-derived, because
 * the move alone refuses the version.
 */
export interface ReviewCatchUpFloor {
  readonly leadingNodeId: string;
  /** The owner's floor list's own type: it carries SPLIT (R2b, ruling E8), as the stored floor does. */
  readonly verdictState: ServeDisclosureFloorState | null;
}

export interface ReviewCatchUpVersionCandidate {
  readonly terminalBefore: "SERVED" | "DOWNGRADED" | "COMPONENTS_ONLY" | "BLOCKED";
  readonly terminalAfter: "SERVED" | "DOWNGRADED" | "COMPONENTS_ONLY" | "BLOCKED";
  readonly numberBefore: number | null;
  readonly numberAfter: number | null;
  /**
   * M5 review (M1): the floor of the answer being superseded (null when it has
   * none), and the floor re-derived from the catch-up's own propagation (null
   * when no servable position is left). A superseding version carries the
   * floor forward on the owner's record, so it may not move it.
   */
  readonly floorBefore: ReviewCatchUpFloor | null;
  readonly floorAfter: ReviewCatchUpFloor | null;
  readonly nowVisible: number;
  readonly stillSetAside: number;
  persist(): Promise<{ readonly answerVersion: number }>;
}

/**
 * One member review catch-up may ask. On an ASSIGNED run it is a pinned REVIEWER
 * seat's member and carries the candidate it answers as, so its calls go out at
 * that candidate's thinking level and are recorded under its candidate id and
 * scorecard version, exactly as the run's own reviews were (final review m5). A
 * legacy run's pinned panel members carry no candidate.
 */
export interface ReviewCatchUpPinnedMember {
  readonly maker: string;
  readonly providerRef: string;
  readonly candidate?: SeatCandidate;
  readonly scorecardVersion?: number | null;
}

/**
 * Final review m5: the members of an assignment's pinned REVIEWER seats, in seat
 * order, each main before its runner-up, each with its candidate and the
 * assignment's scorecard version. These are the models the drawer lists under
 * "Reviewing the arguments", and the only ones an assigned run's catch-up asks.
 */
export function pinnedReviewerMembers(assignment: RoleAssignment): readonly ReviewCatchUpPinnedMember[] {
  return Object.freeze((assignment.roles.REVIEWER ?? []).flatMap((seat) =>
    [seat.main, ...(seat.runnerUp === null ? [] : [seat.runnerUp])].map((candidate) => Object.freeze({
      maker: candidate.maker,
      providerRef: candidate.providerRef,
      candidate,
      scorecardVersion: assignment.scorecardVersion
    }))));
}

export interface ReviewCatchUpDependencies {
  withContentLease<T>(runId: string, use: () => Promise<T>): Promise<T>;
  /**
   * Final review m5: the run's pinned REVIEWER seats (`pinnedReviewerMembers`),
   * or null when the run pinned no role assignment — the legacy run, whose
   * catch-up keeps its pinned panel. An unreadable pin refuses loudly.
   */
  readPinnedReviewers(runId: string): Promise<readonly ReviewCatchUpPinnedMember[] | null>;
  /** The composition root probes these pinned members before any model spend. */
  probePinnedPanel(
    pinnedPanel: readonly ReviewCatchUpPinnedMember[]
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
  /** The pinned attempt ceiling the catch-up's own (BODY) calls are held to (Task M1). */
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
  readonly argumentLanguageName?: string;
  /**
   * P2d Task 7c (controller ruling D-CATCHUP; ruling L-SHAPED-ONLY): the run's stored tag and its frozen receipt
   * (`core.run.envelope_basis`), both as `RunRepository.readFrozenHead` returns them. The receipt decides the lock
   * exactly as the runner decides it for its own reviews (`runQuestionLanguageLock`): a receipt with a shape locks every
   * catch-up review to the stored pair; a receipt with no shape, or none given, keeps today's review.
   */
  readonly argumentLanguageTag?: string;
  readonly envelopeBasis?: unknown;
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
  // P2d Task 7c (controller ruling D-CATCHUP): THE RUN'S LOCK, read off its receipt as the runner reads it. The Postgres
  // reader above has already parsed this same receipt, so one that does not parse is refused there, as today.
  // The run's stored tag, as the lock and the length target both read it ("und" when none was given).
  const catchUpTag = input.argumentLanguageTag ?? "und";
  const catchUpLanguage: QuestionLanguage | null = input.envelopeBasis === undefined ? null
    : runQuestionLanguageLock(parseCostEnvelopeBasis(input.envelopeBasis).shape ?? null, {
      argumentLanguageTag: catchUpTag,
      argumentLanguageName: input.argumentLanguageName ?? "the same language as the question"
    });
  const catchUpLanguageInput = catchUpLanguage === null ? {} : { questionLanguage: catchUpLanguage };
  // Length guidance: a catch-up review is sized and told like the run's own reviews, from the same receipt (never the
  // row), in the run's stored tag (Task 12 review 3).
  const catchUpLength = input.envelopeBasis === undefined ? null : parseCostEnvelopeBasis(input.envelopeBasis).length ?? null;
  const catchUpGuide = lengthGuideFrom(catchUpLength, "reviewer", catchUpTag);
  // Final review m5: an assigned run's catch-up reviews come from its pinned
  // REVIEWER seats — the models the drawer lists for reviewing — never from the
  // pinned panel, which on such a run is the POSITION mains. A legacy run keeps
  // its pinned panel exactly as before.
  const pinnedReviewers = await input.dependencies.readPinnedReviewers(input.runId);
  const reviewers = await input.dependencies.probePinnedPanel(pinnedReviewers ?? input.pinnedPanel);
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
    const reviewer = selectDifferentMakerReviewer(input.runId, node.authorMaker, reviewers, latestReviewerMaker);
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
        argumentLanguageName: input.argumentLanguageName ?? "the same language as the question",
        ...catchUpLanguageInput,
        ...catchUpGuide,
        statement: node.statement,
        authorMaker: node.authorMaker,
        providerRef: reviewer.providerRef,
        contractHash: input.judgeContractHash,
        bound: { ...guidedCallBound(input.judgeBound, "reviewer", catchUpLength), maxAttempts },
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
  // Engine money rule, M5 review (M1): a floor answer has no served number, so
  // the guard above can never see its label move. Its floor — the leading
  // position and the label — is re-derived from the same propagation, and a
  // version that would move either is refused the same way.
  if (catchUpFloorWouldMove(candidate.floorBefore, candidate.floorAfter)) {
    return reportWithoutVersion("CATCH_UP_FLOOR_WOULD_MOVE", reviewed, work.length - reviewed);
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

/** A floor moved when it is gone, led by another position, or labelled otherwise. */
export function catchUpFloorWouldMove(before: ReviewCatchUpFloor | null, after: ReviewCatchUpFloor | null): boolean {
  if (before === null) return false;
  return after === null || after.leadingNodeId !== before.leadingNodeId || after.verdictState !== before.verdictState;
}

/**
 * ENGINE MONEY RULE, TASK M5 review (M1) — THE FLOOR, RE-DERIVED from a
 * catch-up's own propagation, the way the runner derived it: the servable
 * maker positions (the graph's parentless, non-folder nodes that propagated)
 * are ranked by `selectServedRootByStrength`; when the same position leads, its
 * label is re-derived by the sealed `deriveVerdictLabel` from the new winning
 * strength and margin, the SAME disagreement the floor's label read (the
 * leading position's recorded panel dispersion, which a review never changes)
 * and the label controls of the register version the floor's receipt names.
 */
export function rederiveCatchUpFloor(input: Readonly<{
  nodes: readonly Readonly<{ nodeId: string; parentNodeId?: string | null; isFolder?: boolean }>[];
  strengths: readonly Readonly<{ nodeId: string; strength: number }>[];
  leadingNodeId: string;
  disagreement: VerdictLabelBasis["disagreement"];
  controls: VerdictLabelBasis["controls"];
}>): ReviewCatchUpFloor | null {
  const propagated = new Set(input.strengths.map((row) => row.nodeId));
  const servable = input.nodes.filter((node) =>
    (node.parentNodeId ?? null) === null && node.isFolder !== true && propagated.has(node.nodeId));
  if (servable.length === 0) return null;
  const selection = selectServedRootByStrength(servable, input.strengths);
  if (selection.root.nodeId !== input.leadingNodeId) {
    return Object.freeze({ leadingNodeId: selection.root.nodeId, verdictState: null });
  }
  const label = deriveVerdictLabel(Object.freeze({
    winner: selection.servedStrength,
    margin: selection.margin,
    disagreement: input.disagreement,
    controls: input.controls
  }));
  return Object.freeze({ leadingNodeId: selection.root.nodeId, verdictState: label.label });
}

/** Engine 2 (R2b): a floor's label receipt says the comparing judges chose it (its stored served-root rule). */
export function floorDecidedByJudges(servedRootRule: string | null): boolean {
  return servedRootRule === SERVED_ROOT_SELECTION_RULE_JUDGES;
}

export function createPostgresReviewCatchUpDependencies(input: {
  readonly pool: Pool;
  readonly reviewers: readonly {
    readonly maker: string;
    readonly providerRef: string;
    probe(): Promise<boolean>;
    readonly judge: Judge;
    /** Final review m5: the route's own gateway, which a pinned candidate's stamp wraps. */
    readonly provider: ProviderGateway;
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
  const disclosures = new ServeDisclosureRepository(input.pool);
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
    readPinnedReviewers: async (runId) => {
      const pinned = await readRunRoleAssignment(input.pool, runId);
      if (pinned === null) return null;
      const parsed = RoleAssignmentSchema.safeParse(pinned.assignment);
      if (!parsed.success) {
        throw new TypedDomainError(
          "RUN_ROLE_ASSIGNMENT_INVALID",
          "The run's pinned role assignment does not parse, so its reviewer seats cannot be named"
        );
      }
      return pinnedReviewerMembers(parsed.data);
    },
    probePinnedPanel: async (pinnedPanel) => {
      const pinnedByRef = new Map(pinnedPanel.map((member) => [member.providerRef, member] as const));
      const candidates = input.reviewers.filter((reviewer) => pinnedByRef.has(reviewer.providerRef));
      const health = await Promise.all(candidates.map(async (reviewer) => ({ reviewer, healthy: await reviewer.probe() })));
      return Object.freeze(health.filter(({ healthy }) => healthy).map(({ reviewer }) => {
        // Final review m5: a pinned REVIEWER seat's member answers as its candidate
        // (A15 R1: the level on the wire, the candidate id and version on the ledger
        // row), through the same stamp the run's own seats use. A legacy member has none.
        const pinned = pinnedByRef.get(reviewer.providerRef);
        const judge = pinned?.candidate === undefined
          ? reviewer.judge
          : new Judge(stampCandidateGateway(reviewer.provider, pinned.candidate, pinned.scorecardVersion ?? null));
        return Object.freeze({
          maker: reviewer.maker,
          providerRef: reviewer.providerRef,
          review: judge.review.bind(judge)
        });
      }));
    },
    readUnreviewedNodes: (runId) => judgements.readUnreviewedNodes(runId),
    readDisclosedNodeIds: (answerId, answerVersion) =>
      serve.readReviewCatchUpDisclosedNodeIds(answerId, answerVersion),
    readLatestReviewerMaker: (runId, maker) => judgements.readLatestReviewerMaker(runId, maker),
    recordReviewWithMeasurements: (record) => recordReviewWithMeasurements(input.pool, record),
    countRunModelAttempts: (runId) => budget.countRunModelAttempts(runId),
    // Task M1: the catch-up's JUDGE calls are BODY calls, refused at the pinned
    // ceiling less the answer's reserve, so what is left is measured against
    // that same ceiling (a receipt with no reserve gives the whole ceiling).
    readPinnedMaximumAttempts: async (runId) => attemptCeilingForPhase(await budget.readPinnedBasis(runId), "BODY"),
    prepareVersion: async ({ runId, answerId, fromVersion }) => {
      const source = await serve.readReviewCatchUpSource(runId);
      if (source.answerId !== answerId || source.answerVersion !== fromVersion) {
        throw new TypedDomainError("CATCH_UP_SOURCE_VERSION_CHANGED", `${answerId}@${fromVersion}`);
      }
      const fullSnapshot = await resolveSnapshot(runId);
      const reviewedNodeIds = await judgements.readReviewedNodeIds(runId);
      // Engine 2 (spec §4.2a; INTERFACE §7.2): the catch-up scores the graph with the link rules, as the run did; the
      // own-reply links are read from the graph (the save sites' record died with the run), and the investigations
      // from their record (A14).
      const engine = engineOfRun(await budget.readPinnedBasis(runId));
      const linked = engine.engine !== 2 ? null : engineLinkedGraph({
        engine, snapshot: fullSnapshot, reviewedNodeIds,
        disputedNodeIds: await judgements.readDisputedNodeIds(runId),
        cannotAssessNodeIds: await judgements.readCannotAssessNodeIds(runId),
        ownReplyEdgeIds: engineOwnReplyEdgeIdsOf(fullSnapshot),
        // A14: the run's investigation outcomes, read back (HOLDS = AGREE; FAILS = DISPUTE, its links still at the
        // cannot-assess weight; a dead end stays cannot-assess). R2a W4: codes only, nothing decrypted.
        investigated: new Map((await new PointInvestigationRepository(input.pool).readPointInvestigationResultsForRun(runId))
          .flatMap(investigatedStatusEntry))
      });
      const standing = projectJudgedStanding(linked === null ? fullSnapshot : linked.snapshot,
        linked === null ? reviewedNodeIds : linked.reviewedNodeIds);
      const propagation = evaluate(standing.snapshot);
      // Engine 2 (OVERVIEW §4 item 1): this version keeps the run's own judgement-selection rule, read from the previous
      // propagation version before this one is written; engine 1 records the boot rule, byte for byte, and reads nothing.
      const catchUpSelectionRule = engineCatchUpSelectionRule({
        engine, bootRule: input.judgementSelectionRule,
        previousRule: engine.engine === 2 ? await ledger.readLatestJudgementSelectionRule(runId) : null
      });
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
        judgementSelectionRule: catchUpSelectionRule,
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
        .filter((record) => record.mark !== "HIDDEN-UNJUDGEABLE" && record.mark !== "DERIVED-STANDING-UNREVIEWED"
          // Engine 2: the reduced-weight records are rebuilt below from this propagation's own reading.
          && (linked === null || record.mark !== "UNASSESSED-AT-REDUCED-WEIGHT"))
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
        })),
        // Engine 2: one record per cannot-assess point no investigation settled.
        ...(linked === null ? [] : engineUnassessedRecords(linked))
      ];
      const records = Object.freeze([...preservedRecords, ...reviewRecords]);
      const conditionMarks = Object.freeze([...new Set([
        ...source.answer.condition_marks.filter((mark) =>
          mark !== "HIDDEN-UNJUDGEABLE" && mark !== "DERIVED-STANDING-UNREVIEWED"
          && (linked === null || mark !== "UNASSESSED-AT-REDUCED-WEIGHT")),
        ...(standing.hiddenNodeIds.length === 0 ? [] : ["HIDDEN-UNJUDGEABLE"]),
        ...(standing.derivedStandingNodeIds.length === 0 ? [] : ["DERIVED-STANDING-UNREVIEWED"]),
        ...(linked === null || linked.unassessedNodeIds.length === 0 ? [] : ["UNASSESSED-AT-REDUCED-WEIGHT"])
      ])]);
      const currentNumber = source.servedNumber;
      const nextStrength = currentNumber === null ? null
        : propagation.strengths.find((row) => row.nodeId === currentNumber.nodeId)?.strength ?? null;
      // M5 review (M1): the floor the answer carries on the owner's record, and
      // the one this propagation would give it.
      const floorReceipt = await disclosures.readLatestFloorReceipt(answerId);
      const floorBefore: ReviewCatchUpFloor | null = floorReceipt === null ? null : Object.freeze({
        leadingNodeId: floorReceipt.floor.leadingNodeId,
        verdictState: floorReceipt.floor.verdictState
      });
      const floorAfter = floorReceipt === null ? null : await (async () => {
        // Engine 2 (R2b, spec §4.7): a floor the comparing judges chose stands as stored; a review never re-opens their
        // vote. It reads no ladder controls: its label never came from them, and the register version it names may carry
        // none (plan Task B12's harness) (pre-flight PF-R2b7.2). The rule is the label receipt's own (the propagation
        // receipt's served-root selection), never a condition-mark record's (controller carry 14).
        if (floorDecidedByJudges(floorReceipt.servedRootRule)) {
          return Object.freeze({ leadingNodeId: floorReceipt.floor.leadingNodeId, verdictState: floorReceipt.floor.verdictState });
        }
        const controls = await readVerdictLabelControls(input.pool, floorReceipt.registerVersion);
        return rederiveCatchUpFloor({
          nodes: fullSnapshot.nodes,
          strengths: propagation.strengths,
          leadingNodeId: floorReceipt.floor.leadingNodeId,
          disagreement: floorReceipt.disagreement,
          controls: Object.freeze({
            gamma: controls.gamma,
            highCut: controls.highCut,
            lowCut: controls.lowCut,
            disagreementThreshold: controls.disagreementThreshold
          })
        });
      })();
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
        floorBefore,
        floorAfter,
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
  /**
   * Side-by-side spec §3: the release this runner runs as (RELEASE_KEY). It claims, renews, sweeps and fails only work
   * items of runs stamped with this key; another release's item is NO_WORK (RUNNER_RELEASE_MISMATCH). Absent means
   * `legacy` (runs written before 0123 or without a key); every shipped composition sets it.
   */
  readonly releaseKey?: string;
  /**
   * Side-by-side spec §4 (D1): a retiring release "stops claiming; it lets calls in flight settle". Once claims are
   * stopped `execute` answers NO_WORK before anything else (one RUNNER_RETIRING line); once calls are stopped every
   * running debate's next model call is refused unsent (RUNNER_RETIRING). Either way the work item is left as is for
   * this release's backstop, which sets it aside FAILED with the waiver (spec §4 step 3); the §3 fence keeps every
   * other release off it. Absent: the runner never retires (today's runner).
   */
  readonly retirement?: Pick<RunnerRetirementSignal, "claimsStopped" | "callsStopped">;
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
  /**
   * VERDICT STORY (docs/superpowers/specs/2026-09-26-verdict-story-design.md).
   * Written after the work item is settled, inside this run's content lease,
   * and never able to change the answer, the label or the work item. OPTIONAL
   * on purpose: an absent writer means no story (every fixture, and the
   * acceptance root, which stays story-free on register v3).
   */
  readonly story?: {
    writeAfterSettle(input: StoryWriteInput): Promise<void>;
    reportSnapshotFailure(failure: StorySnapshotFailure): void;
  };
  /**
   * ENGINE MONEY RULE (spec 2026-09-26 §14.4.2), TASK M3: each provider
   * target's price (`buildProviderPriceMap`), so a MONEY refusal of an
   * answer-writing call tries the cheaper claim-eligible makers first. Never
   * sealed. OPTIONAL with an EMPTY default rather than a required family: local
   * mode has no prices and no money ceiling (so it can never need the order),
   * the acceptance root runs local, and a missing map only changes the ORDER of
   * the tries — the per-call seam still decides what fits. The shipped runner
   * passes it (pinned by `tests/unit/m3-serve-fallback.test.ts`).
   */
  readonly providerPrices?: ProviderPriceMap;
  /**
   * LG-A (Task 14 carry): the most one structure-repair call can be projected at, on the repair target
   * (`previewStructureRepairCeiling`), when the route is wired; absent or null: no route. Root 0's room adds that call to
   * its first attempt and its own retry, at the target's price in `providerPrices` (`rootZeroKeepRoomMicros`): a routed
   * root 0 may send its first POST, the repair call and its own second POST (refused-repair salvage B), so its room never
   * under-counts them. No price for the target (local mode) adds nothing. Set, it also has a reclaim replay the calls A1
   * and B answered (`replayingGateway`).
   */
  readonly structureRepairCeiling?: Readonly<{ providerRef: string; requestBytes: number; completionTokenCeiling: number }> | null;
  /**
   * ENGINE MONEY RULE (spec §14.4.5), TASK M3: where the owner-side disclosure
   * row goes (default: `ServeDisclosureRepository` on the runner's pool) and
   * where a failure to write it is logged (default: one code-only JSON line).
   * The row can never change the answer: its writer never throws.
   */
  readonly serveDisclosure?: Readonly<{
    store?: Pick<ServeDisclosureRepository, "insert">;
    log?: (event: string, detail: Readonly<Record<string, unknown>>) => void;
  }>;
  /**
   * B9 (budget spec §2.9): a call made while arguing that is refused for money —
   * the run's own ceiling, the site's day or the owner's window at a finish
   * edge — is retried at the same call site with the same framed prompt on the
   * run's other claim-eligible makers, cheapest first (`providerPrices`); the
   * first position's own call gets the same try. A cheaper maker that cannot
   * serve (a dead transport, content refused after its repairs) hands the
   * search on, and when nobody serves the planned refusal travels: while
   * arguing, a clean stop, never a failed run. On the first position's own
   * call a cheaper maker whose transport died hands its ProviderCallFailedError
   * back, so the cooldown holds and retries; RUN_CEILING_BELOW_FIRST_CALL is
   * raised only when every maker refused. Panel seats never move; a seat
   * refused for money is left out, as a failed seat is today, on every panel.
   * `true` only in hosted mode with the costEnvelopePolicy row's three band
   * members (the shipped main.ts: `envelopeBand !== null`); absent is today's
   * behaviour: no call while arguing ever moves, and a money-refused seat
   * stops the arguing as M2 rules.
   */
  readonly bodyCostFallback?: boolean;
  /**
   * B9: where each moved call's owner record goes (default:
   * `RunCostSubstitutionRepository` on the runner's pool) and where the moved
   * call and a failed write are logged (default: `logBodyCostFallback`). The
   * record can never change the debate: its writer never throws.
   */
  readonly costSubstitutions?: Readonly<{
    store?: Pick<RunCostSubstitutionRepository, "record">;
    log?: (event: string, detail: Readonly<Record<string, unknown>>) => void;
  }>;
  /**
   * Debate shape (spec 2026-10-12 §3.3 step 1): where a shaped run's map is stored and read back (a re-claimed run
   * reuses its stored map and asks nothing again). Absent: the runner's pool. Never read by a run without a shape.
   */
  readonly mapChoices?: Readonly<{
    store: Pick<MapChoiceRepository, "writeMapRun" | "writeMapPosition" | "readMapResultForRun">;
  }>;
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
  /**
   * Role rotation, Task 11 (orchestrator ruling 2026-10-11): may the SEALED answer-role ref `roleRef` stand in for a
   * rotated debate's pinned member that is not claim-eligible? Only when the debate's start-of-debate estimate already
   * covers that ref's model. Absent: yes — off the preview the estimate prices the sealed roles exactly as for a debate
   * that is not rotated. The preview's runner answers with `previewSealedRoleFallbackCovered` (its rotated estimate
   * prices only the panel's models). No: the pinned role refuses with today's J24.
   */
  readonly answerRoleFallbackCovered?: (input: Readonly<{
    roleRef: string;
    panel: readonly DiscoveredPanelMember[];
  }>) => boolean;
  /**
   * Run resilience (spec docs/superpowers/specs/2026-10-12-preview-run-resilience-design.md; rulings R-a, R-b, R-c):
   * the preview's facts about each provider ref — the gate its calls go through and the model it serves — and, by
   * being set at all, the preview's run resilience:
   *  · (b) the re-claim check reads each maker's own attempts (the counting gateway already does, per request);
   *  · (d) a per-run sit-out book (`createRunSitOutBook`) wraps every claim-eligible maker's gateway: a model whose
   *    call ends in gate-proven unbilled refusals, or every member behind a gate that is unavailable (fix (c)), sits
   *    out the rest of the run, with no ten-minute hold (R-a); roots, panels, reviews, expansion, the answer roles and
   *    the story leave it out and keep their existing disclosures (R-b);
   *  · (a) the answer and story roles move on, with ROLE_UNAVAILABLE, from a member that sits out.
   * Absent (hosted and local, R-c): every one of those paths is today's, byte for byte. main.ts sets it from
   * `previewRunResilience` on the preview only.
   */
  readonly runResilience?: RunResilienceSettings;
  /**
   * Parallel AI calls (spec docs/superpowers/specs/2026-10-12-parallel-calls-design.md §3.2): the runner's one call
   * scheduler. Each claimed debate opens a lane in it, and every claim-eligible maker's gateway (its judge's too) goes
   * through that lane, outside the sit-out book, so body, serve and story calls all wait for a slot under the register's
   * limits (absent row: one call at a time per debate). The lane closes when `execute` ends, after the story. Absent:
   * nothing is wrapped, today's runner (and, like an absent row, today's one-call-after-another debate: Task 10).
   */
  readonly callScheduler?: CallScheduler;
  /**
   * Debate shape (spec 2026-10-12 §3): set at boot when the register seals debateShapePolicy (with its map hash).
   * A run whose receipt carries a shape needs it (DEBATE_SHAPE_RUNNER_UNCONFIGURED otherwise, Task 12); a run without
   * one never reads it. Absent: today's runner. A shaped run reads its map hash (the map's calls are checked against
   * it) and argues the shape (Task 13: the Phase 2a per-run refusal is gone).
   */
  readonly debateShape?: DebateShapeRunnerSettings | null;
  /**
   * Engine redesign (spec 2026-10-15 §3.3; INTERFACE §2.3): set at boot when the register seals an engineVersionPolicy row
   * (enabled or not) with the length row and the code's engineContractHash. A run whose receipt carries `engine` needs it
   * (ENGINE_RUNNER_UNCONFIGURED otherwise); a run without the member never reads it. Absent: engine 1, today's runner.
   */
  readonly engine?: EngineRunnerSettings | null;
  /**
   * The model, vendor and preview gate each provider ref's calls use (`previewCallSubjects` on the preview,
   * `targetCallSubjects` elsewhere). Read only with `callScheduler`; absent, each ref is its own model behind no gate.
   */
  readonly callSubjects?: CallSubjectResolver;
  /**
   * Ruling R31 (preview only): awaited by every lane call BEFORE it asks for a slot (`laneGateway`'s `beforeSlot`).
   * main.ts sets it to the runner-wide busy coordinator's `admit(subject.model)`, so a call to a busy model waits
   * holding no debate, model or gate slot. Read only with `callScheduler`; absent (hosted and local), nothing waits
   * before the slot.
   */
  readonly callBeforeSlot?: (subject: CallSubject) => Promise<void>;
  /**
   * Spec §3.6: where the claim renewals of a running debate go — a repository on the runner's own small keep-alive
   * pool, so a burst of a debate's writes never keeps a renewal waiting for a connection. Absent: the runner's pool.
   */
  readonly renewals?: Pick<WorkItemRepository, "renewClaim">;
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

/**
 * FIX-HS1-eval-fence (hate-speech TEST rehearsal, 2026-09-30): a model reply
 * read as a structured value. The evaluator and the composer used to read it
 * with a strict `JSON.parse`, so a schema-valid verdict inside a ```json fence
 * ended live runs `EVALUATOR_CONTRACT_ERROR`, while the judge and panel paths
 * already read theirs with `parseStructuredArtifact` (raw, one fence, the first
 * balanced object). Every runner reader decodes here, the judge path's way, so
 * a call's classifier and its parser accept the same replies. A reply no
 * strategy decodes is refused exactly as before: the raw parse's own message.
 *
 * FIX-HS1-eval-fence-r1 (re-check B1, ruling V-24): the judge path's fallback
 * takes the FIRST balanced object, so "PASS, then FAIL" read as PASS and the
 * synthesis loop stopped without the objection the final verdict asked for.
 * A reply that is not raw JSON and opens two or more top-level objects is
 * refused before any strategy runs — the pre-fix refusal, re-asked as before.
 *
 * LG-A (L34): a decoded reply carries `repairs`, every repair the decode made, in order (none for raw JSON; the syntax
 * pass's list for SYNTAX_REPAIRED), so the reading (`readStructuredValue`) logs each one ahead of the fixer's.
 */
type DecodedReply =
  | { readonly decoded: true; readonly value: unknown; readonly repairs: readonly ModelJsonRepair[] }
  | { readonly decoded: false; readonly message: string };

/**
 * How many top-level `{` a reply opens, counting at most two. Outside an
 * object every character is prose, so a stray quote cannot hide a brace;
 * inside one, JSON strings are skipped, so a brace an objection quotes is not
 * a second object. An object left open (a cut reply) still counts. One linear
 * pass: model text is untrusted (CI-1b).
 */
function topLevelObjectsOpened(content: string): number {
  let opened = 0;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (const character of content) {
    if (depth > 0 && inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === "\"") inString = false;
      continue;
    }
    if (character === "{") {
      if (depth === 0 && ++opened > 1) return opened;
      depth += 1;
    } else if (depth > 0 && character === "}") depth -= 1;
    else if (depth > 0 && character === "\"") inString = true;
  }
  return opened;
}

/**
 * All-steps format robustness (2026-10-12): the judge path's strategies now end with the story's two late repairs
 * (straight quotes inside a text escaped; only for a reply that finished normally, closing brackets), so `ending` —
 * how the reply ended, as the gateway saw it — is passed through. Without it the ending is unknown and the last repair
 * is not made. The decoded reply names every repair it needed, in order (LG-A, L34: a reply read through the syntax
 * pass, SYNTAX_REPAIRED, carries its repairs too; the classification's `jsonRepair` / `jsonRepairs`).
 */
function decodeStructuredReply(content: string, ending?: ModelReplyFacts): DecodedReply {
  try {
    return { decoded: true, value: JSON.parse(content), repairs: [] };
  } catch (error) {
    const refused: DecodedReply = { decoded: false, message: error instanceof Error ? error.message : String(error) };
    if (topLevelObjectsOpened(content) > 1) return refused;
    const tolerant = parseStructuredArtifact(content, z.unknown(), ending);
    return tolerant.kind === "PARSED" ? { decoded: true, value: tolerant.value, repairs: parsedStructuredRepairs(tolerant) } : refused;
  }
}

/**
 * LG-A Task 7b (controller ruling): the writer's and checker's texts face the reader, so the fixer KEEPS a stray text
 * under a name the schema declares as a text (a root `text` beside `segments[].text`) and the reply stays refused,
 * instead of dropping the AI's words. Names the schema never declares (`notes`) are still dropped.
 */
const RUNNER_READER_FIX_OPTIONS = Object.freeze({ keepDeclaredTexts: true });

/**
 * LG-A (spec 2026-10-15, L31): the runner's ONE structured reading (writer and checker): decode; the schema; when the
 * schema refuses, the reply fixer (on `guide` when the step has one; `RUNNER_READER_FIX_OPTIONS`), then the schema
 * again. The classifier and the parser both call it, so a call accepts exactly the replies its step then reads.
 */
function readStructuredValue<T>(content: string, schema: z.ZodType<T>, ending?: ModelReplyFacts, guide?: z.ZodType):
  | { readonly ok: true; readonly value: T; readonly repairs: readonly ModelJsonRepair[] }
  | { readonly ok: false; readonly parseStatus: "PARSE_FAILED"; readonly message: string }
  | { readonly ok: false; readonly parseStatus: "SCHEMA_FAILED"; readonly message: string; readonly failureClass: ReplyFailureClass } {
  const reply = decodeStructuredReply(content, ending);
  if (!reply.decoded) return { ok: false, parseStatus: "PARSE_FAILED", message: reply.message };
  const parsed = schema.safeParse(reply.value);
  if (parsed.success) return { ok: true, value: parsed.data, repairs: reply.repairs };
  const fixed = fixReplyStructure(reply.value, guide ?? schema, RUNNER_READER_FIX_OPTIONS);
  const refixed = fixed === null ? null : schema.safeParse(fixed.value);
  if (refixed !== null && refixed.success) return { ok: true, value: refixed.data, repairs: [...reply.repairs, ...fixed!.repairs] };
  // LG-A Task 7b review, I-1: the class is decided here, where the fixer's schema is known, so an absent member with one
  // possible value (the writer's served_number_refs) counts as form; the gateway, which cannot see the schema, reads it.
  const message = parsed.error.message;
  return { ok: false, parseStatus: "SCHEMA_FAILED", message,
    failureClass: replyFailureClassOf({ rawText: content, parseStatus: "SCHEMA_FAILED", parseError: message }, ending, guide ?? schema) };
}

function parseContent<T>(content: string, schema: z.ZodType<T>, code: string, ending?: ModelReplyFacts, guide?: z.ZodType): T {
  const read = readStructuredValue(content, schema, ending, guide);
  if (!read.ok) throw new TypedDomainError(code, read.message);
  return read.value;
}

function classifyStructuredContent<T>(content: string, schema: z.ZodType<T>, ending?: ModelReplyFacts, guide?: z.ZodType): ContentClassification {
  const read = readStructuredValue(content, schema, ending, guide);
  if (read.ok) return parsedWithRepairs(read.repairs);
  return read.parseStatus === "SCHEMA_FAILED"
    ? { parseStatus: read.parseStatus, parseError: read.message, failureClass: read.failureClass }
    : { parseStatus: read.parseStatus, parseError: read.message };
}

/**
 * L4-F11 / DL4-F4: the serve-chain repair packet used to append
 * `Machine parse error: ${parseError}` — the zod message, which quotes the
 * model's own rejected output — into a fresh user turn. It now appends one
 * fenced block carrying the typed code and the schema path, and
 * `buildFramedRepairPrompt` refuses anything that is not a machine locator.
 */
// Exported (all-steps format robustness, 2026-10-12) so the preview practice's formats lanes hand the gateway the same
// repair packet the runner does (tools/preview-practice/practice-lanes.ts).
export function buildSchemaRepairPacket(framed: FramedPrompt, rejected: {
  readonly parseStatus: string;
  readonly parseError: string;
}): PromptPacket {
  return buildFramedRepairPrompt(framed, schemaFailureLocator(rejected));
}

/**
 * ENGINE MONEY RULE, TASK M4 review fix I-1 — THE WRITER'S CITATIONS, CHECKED
 * AS CONTENT. Two ways a draft can name the engine's internals, each refused by
 * the writer's content classifier so the provider's own repair re-asks the
 * SAME call (the model's words are never rewritten):
 *
 *  · `COMPOSED_TEXT_NAMES_A_NODE` — a segment's prose names a node the way the
 *    digest does (`(n12)`) or by a UUID. The person reads the prose; the
 *    engine's ids are not theirs to read (the owner's rule: no internals in
 *    the answer). The checker reads only the prose and its objections return
 *    word for word, so "cite the digest node" is exactly what invites this.
 *  · `COMPOSED_REF_NOT_IN_DIGEST` — a `node_refs` entry the digest does not
 *    carry: unknown, a real id where the digest showed short refs, or a point
 *    the spine left out. It used to end the run FAILED; now it is re-asked.
 *
 * Practice debate 2 (2026-10-12), problem 7 adds two more, read the same way
 * (`synthesisWordingRefusalsIn`, language-independent like the story's):
 *
 *  · `COMPOSED_TEXT_PRINTS_A_SCORE` — a segment's prose prints a strength the
 *    material shows ("0.96", "0,96", the exact float), unless the person's
 *    question or a debater's statement states that figure itself.
 *  · `COMPOSED_TEXT_USES_ENGINE_CODE` — it uses one of the material's code
 *    tokens (`finalStrength`, `code_label`, `REASONING`, the verdict label,
 *    `number:final-strength` ...).
 *
 * Each is reported the way the story's checks report theirs: `SCHEMA_FAILED`
 * with a JSON array of issues whose `path` is the member's machine address and
 * whose `message` is the code — never a byte the model wrote. When every repair
 * is still refused, any of the four ends the round `SYNTHESIS_NO_ARTIFACT`
 * (`callSynthesisRole`), never a FAILED run: the answer always exists.
 */
export const COMPOSED_CITATION_REJECTIONS = Object.freeze([
  "COMPOSED_TEXT_NAMES_A_NODE",
  "COMPOSED_REF_NOT_IN_DIGEST",
  ...SYNTHESIS_WORDING_REFUSALS
] as const);
type ComposedCitationRejection = typeof COMPOSED_CITATION_REJECTIONS[number];

interface ComposedCitationIssue {
  readonly path: readonly (string | number)[];
  readonly message: ComposedCitationRejection;
}

/** A node ref the writer may cite: `"primary"`, or a node the digest carries that is in the serve set. */
function composedRefResolves(ref: string, citation: ComposedCitationContext): boolean {
  if (ref === "primary") return true;
  const nodeId = resolveDigestNodeRef(citation.digest, ref);
  return nodeId !== null && citation.servedNodes.some((node) => node.nodeId === nodeId);
}

interface ComposedCitationContext {
  readonly digest: SynthesisDigest;
  readonly servedNodes: readonly Readonly<{ nodeId: string }>[];
  /**
   * Review round 2: the id-shaped tokens the person's question and the
   * debate's FULL statements already contain (`idShapedTokensIn`). They are
   * the person's and the debaters' own words, so the prose may repeat them.
   */
  readonly exemptTokens: ReadonlySet<string>;
  /**
   * Problem 7 (2026-10-12): the scores and code tokens this request's material
   * shows, less the person's own (`synthesisWordingIndex`). Absent, the prose is
   * checked for internal node names only, as before; the runner and the preview
   * practice always pass it.
   */
  readonly wording?: SynthesisWordingIndex;
  /**
   * Reply language (2026-10-12): the person's question, whose language every
   * segment's prose must be in (`replyLanguageCheck`). Without it the prose's
   * language is not checked.
   */
  readonly questionLine?: string;
  /**
   * Question language (spec 2026-10-13 L6): a shaped run's lock. With it, the prose is checked against the lock
   * (`replyLanguageCheckFor`), never a re-guess of the question; absent, today's check.
   */
  readonly questionLanguage?: QuestionLanguage;
}

/**
 * Question language (spec 2026-10-13 L6; ruling L-SHAPED-ONLY, final review I2): THE RUN'S LOCK, decided by its
 * RECEIPT. A receipt with a shape (`envelope_basis.shape`) reads the stored tag and name back as the lock
 * (`questionLanguageFromRun`: null for "und" or a stored fallback name) — also when the run is left with one maker at
 * claim, so it is told and checked in the one language the API stored for it. A receipt with no shape is never locked,
 * whatever pair it stored: today's directive, fields and reply check, byte for byte.
 */
export function runQuestionLanguageLock(
  receiptShape: unknown, run: Readonly<{ argumentLanguageTag: string; argumentLanguageName: string }>
): QuestionLanguage | null {
  return receiptShape === null || receiptShape === undefined ? null
    : questionLanguageFromRun(run.argumentLanguageTag, run.argumentLanguageName);
}

/** Reply language (2026-10-12): the answer's prose, and the checker's objection (the next round's material). */
export const COMPOSED_PROSE = Object.freeze(["segments.*.text"] as const);
export const EVALUATOR_PROSE = Object.freeze(["objection"] as const);

/**
 * The writer's content classifier: the structured read first (`readStructuredValue`: the composition schema, and
 * when it refuses, the reply fixer on `compositionFixGuide`, then the schema again; LG-A, L31), then every segment's
 * prose and every cited ref (I-1), on the value that read returned. A token the person's
 * question or a node's full statement already states is exempt from the prose
 * check (review round 2). Deterministic, and it never throws on model content.
 */
export function classifyComposedContent(content: string, citation: ComposedCitationContext, reply?: ModelReplyFacts): ContentClassification {
  const structured = classifyStructuredContent(content, compositionSchema, reply, compositionFixGuide);
  if (structured.parseStatus !== "PARSED") return structured;
  const composed = parseContent(content, compositionSchema, "COMPOSITION_CONTRACT_ERROR", reply, compositionFixGuide);
  const issues: ComposedCitationIssue[] = [];
  for (const [segmentIndex, segment] of composed.segments.entries()) {
    if (nodeIdsNamedInText(citation.digest, segment.text, citation.exemptTokens).length > 0) {
      issues.push({ path: ["segments", segmentIndex, "text"], message: "COMPOSED_TEXT_NAMES_A_NODE" });
    }
    if (citation.wording !== undefined) {
      for (const refusal of synthesisWordingRefusalsIn(segment.text, citation.wording)) {
        issues.push({ path: ["segments", segmentIndex, "text"], message: refusal });
      }
    }
    for (const [refIndex, ref] of segment.node_refs.entries()) {
      if (!composedRefResolves(ref, citation)) {
        issues.push({ path: ["segments", segmentIndex, "node_refs", refIndex], message: "COMPOSED_REF_NOT_IN_DIGEST" });
      }
    }
  }
  if (issues.length > 0) return { parseStatus: "SCHEMA_FAILED", parseError: JSON.stringify(issues) };
  // Reply language (2026-10-12): checked once the citations hold, so a refusal names one kind of fix.
  const language = citation.questionLine === undefined ? [] : replyLanguageCheckFor(citation.questionLine, citation.questionLanguage, COMPOSED_PROSE)(composed);
  return language.length === 0
    ? structured
    : { parseStatus: "SCHEMA_FAILED", parseError: JSON.stringify(language) };
}

/** The citation rejection a classifier error names first, or null for any other rejection. */
export function composedCitationRejectionOf(parseError: string): ComposedCitationRejection | null {
  try {
    const issues = JSON.parse(parseError) as unknown;
    const first = Array.isArray(issues) ? issues[0] as { readonly message?: unknown } | undefined : undefined;
    const code = first?.message;
    return typeof code === "string" && (COMPOSED_CITATION_REJECTIONS as readonly string[]).includes(code)
      ? code as ComposedCitationRejection
      : null;
  } catch {
    return null;
  }
}

/**
 * The writer's repair turn: the machine path of the rejected member, and — for
 * a citation rejection — its own code (the engine's constant, which says what
 * to fix) in place of the generic `SCHEMA_FAILED`. Anything else is the shared
 * schema repair, unchanged.
 */
// Exported for the same reason as `buildSchemaRepairPacket`.
export function buildComposedRepairPacket(framed: FramedPrompt, rejected: {
  readonly parseStatus: string;
  readonly parseError: string;
  /** LG-A (L33): set only on a routed call's rejection (RejectedProviderContent.failureClass). */
  readonly failureClass?: ReplyFailureClass;
}): PromptPacket {
  const locator = schemaFailureLocator(rejected);
  const citation = rejected.parseStatus === "SCHEMA_FAILED" ? composedCitationRejectionOf(rejected.parseError) : null;
  return buildFramedRepairPrompt(framed, citation === null ? locator
    : { code: citation, path: locator.path, ...(locator.reason === undefined ? {} : { reason: contentFollowUpSentence(citation) }) });
}

/**
 * T9 (goal 263-266): a SYNTHESIZER or EVALUATOR call whose transport dies is
 * one of the four enumerated COMPONENTS_ONLY crash classes — a death, not a
 * quality judgement. It is typed HERE, at the seam, so the serve chain can name
 * the class without catching every error it sees. Content refusals keep their
 * existing organ code: a provider that answered with unusable content is a
 * contract error, not a dead transport.
 *
 * Task M4 review fix I-1: ONE content refusal is typed differently. A writer
 * whose every repair still named an internal id in its prose, or cited a node
 * the digest does not carry, has produced no draft the engine may serve: that
 * is `SYNTHESIS_NO_ARTIFACT`, the sealed chain's own class. A later round then
 * keeps the complete round before it (M3), and a first round ends
 * components-only (which the M5 floor answers) — never a FAILED run.
 *
 * Final review I-1: a CHEAPER maker's content refusal (its organ code here) is
 * mapped to `SYNTHESIS_NO_ARTIFACT` one level up, by `fallbackContentRefusal`,
 * because only there is it known that the maker was a fallback.
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
      const citation = site.role === "SYNTHESIZER" && error.lastParseStatus === "SCHEMA_FAILED"
        ? composedCitationRejectionOf(error.lastParseError)
        : null;
      if (citation !== null) {
        throw new TypedDomainError(
          "SYNTHESIS_NO_ARTIFACT",
          `The synthesizer's last repair at ${site.callSiteKey} was still refused: ${citation}`
        );
      }
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

/**
 * ENGINE MONEY RULE (spec 2026-09-26 §14.4.2), TASK M3 — THE RUNNER'S PRICE MAP.
 *
 * providerRef → the target's price, in the shape `@debateai/budget` charges
 * with. It exists so a cheaper maker can be tried FIRST when the planned
 * answer-writing call is refused for money; it never decides whether a call
 * fits (the per-call money seam does, before sending) and it is never sealed:
 * prices live with the provider targets, and no register row may carry one.
 *
 * HOSTED only. Local mode is the relays and loopback model servers, which cost
 * nothing and have no money ceiling, so its map is empty and a fallback — which
 * a local run can never need — would follow the roster order. A target with no
 * declared price is left out rather than priced at a guess; in hosted mode
 * `assertPricedProviderTargets` has already refused one.
 *
 * The one price reader is `providerTargetPrice`. Each price is a frozen copy,
 * and the map is handed over typed read-only: nothing in the runner writes it.
 */
export type ProviderPriceMap = ReadonlyMap<string, ProviderTargetPrice>;

const EMPTY_PROVIDER_PRICES: ProviderPriceMap = Object.freeze(new Map<string, ProviderTargetPrice>());

export function buildProviderPriceMap(
  targets: readonly ProviderDiscoveryTarget[],
  mode: "hosted" | "local"
): ProviderPriceMap {
  if (mode !== "hosted") return EMPTY_PROVIDER_PRICES;
  const prices = new Map<string, ProviderTargetPrice>();
  for (const target of targets) {
    const price = providerTargetPrice(target);
    if (price !== null) prices.set(target.providerRef, Object.freeze({ ...price }));
  }
  return Object.freeze(prices);
}

/** A claim-eligible maker, as the serve chain's two roles can call it. */
export interface ServeRoleMaker {
  readonly provider: ProviderGateway;
  readonly providerRef: string;
}

/**
 * What THIS request would cost on a target, by the seam's own projection
 * (`projectedCallCeilingMicros`: bytes/2 × input price + max_tokens × output
 * price). The body measured is the one the gateway sends, less the target's
 * own `model` member — a few bytes, alike for every target — so the ORDER is
 * the seam's; whether a call FITS is always the seam's exact decision.
 *
 * A price the projection cannot use (malformed, or a charge too large to
 * represent) ranks the maker as unpriced rather than failing the search: the
 * order can never be the reason an answer is not written, and the seam still
 * refuses whatever does not fit.
 */
function projectedServeCallMicros(
  request: Pick<ProviderCallRequest, "packet" | "bound">,
  price: ProviderTargetPrice
): number | null {
  try {
    const completionTokenCeiling = lengthRetryTokenCeiling(request.bound.tokenCeiling, 0);
    return projectedCallCeilingMicros(price, {
      requestBytes: Buffer.byteLength(JSON.stringify({
        max_tokens: completionTokenCeiling,
        messages: request.packet.messages
      }), "utf8"),
      completionTokenCeiling
    });
  } catch {
    return null;
  }
}

/**
 * ENGINE MONEY RULE (spec §14.4.2), TASK M3 — WHO IS TRIED AFTER A MONEY
 * REFUSAL, AND IN WHICH ORDER.
 *
 * Every OTHER claim-eligible maker, once each, cheapest first by the projected
 * cost of this exact request; a maker the map has no price for comes after
 * every priced one; ties, and the whole list when the map is empty (local
 * mode), keep the roster order. For the checker, every maker other than the
 * one that wrote the draft under check comes first (`preferNot`); the writer
 * itself is offered last, so it checks its own draft only when nothing else
 * fits — and the disclosure row says so.
 *
 * Run resilience (spec 2026-10-12, fix (a)): with the preview's sit-out book (`sitOut`), a maker that sits out the
 * rest of the run is never offered, and when the planned maker moved because IT sits out (`avoidGate`: its gate), a
 * maker behind another gate comes before one behind the same gate — after the checker's `preferNot` rule, before
 * price. Without the book, or for a money refusal with nobody sitting out, the order is exactly today's.
 */
export function servePhaseFallbackOrder(input: Readonly<{
  planned: string;
  claimEligible: readonly ServeRoleMaker[];
  prices: ProviderPriceMap;
  request: Pick<ProviderCallRequest, "packet" | "bound">;
  preferNot: string | null;
  sitOut?: RunSitOutView;
  avoidGate?: string | null;
}>): readonly ServeRoleMaker[] {
  const seen = new Set<string>([input.planned]);
  const candidates: { readonly maker: ServeRoleMaker; readonly index: number; readonly micros: number | null }[] = [];
  const avoidGate = input.avoidGate ?? null;
  for (const maker of input.claimEligible) {
    if (seen.has(maker.providerRef)) continue;
    seen.add(maker.providerRef);
    if (input.sitOut?.sitsOut(maker.providerRef) === true) continue;
    const price = input.prices.get(maker.providerRef);
    candidates.push({
      maker,
      index: candidates.length,
      micros: price === undefined ? null : projectedServeCallMicros(input.request, price)
    });
  }
  const rank = (entry: typeof candidates[number]): readonly number[] => [
    input.preferNot !== null && entry.maker.providerRef === input.preferNot ? 1 : 0,
    // Fix (a): 0 for every maker when no gate is avoided, so the order below is today's.
    avoidGate !== null && input.sitOut?.gateOf(entry.maker.providerRef) === avoidGate ? 1 : 0,
    entry.micros === null ? 1 : 0,
    entry.micros ?? 0,
    entry.index
  ];
  return Object.freeze([...candidates].sort((left, right) => {
    const a = rank(left);
    const b = rank(right);
    for (let position = 0; position < a.length; position += 1) {
      if (a[position] !== b[position]) return a[position]! - b[position]!;
    }
    return 0;
  }).map((entry) => entry.maker));
}

export interface ServeRoleCallOutcome<T> {
  readonly result: T;
  readonly servedBy: ServeRoleMaker;
  readonly fallback: boolean;
  /**
   * Run resilience (spec 2026-10-12, fix (a)): why a fallback served — "ROLE_UNAVAILABLE" when the call moved
   * because the planned maker sits out the rest of the run, "MONEY" for the money fallback; null when the planned
   * maker served. The disclosure row records the role's reason from it (migration 0114's per-role reasons).
   */
  readonly movedFor: "MONEY" | "ROLE_UNAVAILABLE" | null;
}

/**
 * ENGINE MONEY RULE (spec §14.4.2), TASK M3 — ONE ANSWER-WRITING CALL, WITH
 * THE COST FALLBACK J24 NOW ALLOWS.
 *
 * The planned maker (the sealed role ref) is always asked first. Only a MONEY
 * refusal (`RUN_COST_ENVELOPE_MONEY_REACHED`, raised by the per-call seam BEFORE
 * an attempt is sent) moves the SAME request — the same call site, the same
 * framed prompt object, the same bound and contract — to the next maker in
 * `servePhaseFallbackOrder`. A refused try costs nothing only when the refusal
 * comes on its FIRST attempt: the seam decides before each attempt, so a later
 * repair or length retry refused for money also moves the request on, and the
 * attempts that maker already made stay charged and ledgered. The provider
 * is the only thing that changes; the prompt is never rebuilt. The seam decides
 * what fits: a maker it refuses for money is skipped, and the first that goes
 * through serves. Nothing fits → the planned call's own refusal travels, as it
 * always has.
 *
 * J24 AMENDED, not repealed: every other refusal — the attempt ceiling, a
 * vendor with no usage, a spent day, a dead transport, a vanished role
 * provider, a contract error, anything untyped — travels UNTOUCHED from the
 * planned call, and a fallback that fails for any reason but money ends the
 * search with its own failure. A sealed identity is substituted for cost only.
 *
 * TASK M7 (spec §14.4.6): the VERDICT STORY's calls take this same fallback
 * (`storyCostFallback`). Their money refusal is the story seam's own
 * (STORY_COST_ENVELOPE_REACHED), not the run's, so the caller may name which
 * refusal is money (`refusedForMoney`); the answer-writer's default is the
 * run's money stop, as before.
 *
 * FINAL REVIEW, Important 1: a FALLBACK try's own failure passes through
 * `onFallbackFailure` before it ends the search. The answer-writer and the
 * checker hand it `fallbackContentRefusal`; the story hands nothing, so its
 * failures travel as they are. The planned maker's failure is never mapped.
 *
 * RUN RESILIENCE (spec docs/superpowers/specs/2026-10-12-preview-run-resilience-design.md, fix (a); ruling R-c: the
 * preview only). With the run's sit-out book (`sitOut`), a call also moves on from a maker that SITS OUT the rest of
 * the run once its try failed — it was already sitting out (MAKER_SAT_OUT, nothing sent), its gate is unavailable
 * (PROVIDER_GATE_UNAVAILABLE), or its call ended in gate-proven unbilled refusals (busy) — whatever code its failure
 * reached this function under (a serve role's dead transport arrives as SYNTHESIS_TRANSPORT_DEATH). The book is the
 * one judge of all three, so no failure code is read twice. Such a move is ROLE_UNAVAILABLE, never MONEY; makers
 * that sit out are skipped (also one that starts sitting out while the search runs, as a gate halting mid-search
 * does), and a maker behind another gate is tried first. Nobody left: the planned refusal travels, as it always
 * has — on the answer roles a dead transport, which ends the answer components-only on the floor (Task M5), never
 * CALL_BUDGET_EXHAUSTED (fix (b) gives each maker its own allowance). Without the book: today's search, unchanged.
 */
export async function callServeRoleWithFallback<T>(input: Readonly<{
  planned: ServeRoleMaker;
  claimEligible: readonly ServeRoleMaker[];
  prices: ProviderPriceMap;
  preferNot: string | null;
  request: ProviderCallRequest;
  call: (maker: ServeRoleMaker, request: ProviderCallRequest) => Promise<T>;
  refusedForMoney?: (error: unknown) => boolean;
  onFallbackFailure?: (error: unknown, request: ProviderCallRequest) => unknown;
  sitOut?: RunSitOutView;
}>): Promise<ServeRoleCallOutcome<T>> {
  const refusedForMoney = input.refusedForMoney ?? ((error: unknown) => envelopeStopKind(error) === "MONEY");
  const satOut = (maker: ServeRoleMaker): boolean => input.sitOut?.sitsOut(maker.providerRef) === true;
  try {
    return Object.freeze({
      result: await input.call(input.planned, input.request), servedBy: input.planned, fallback: false, movedFor: null
    });
  } catch (refusal) {
    // Fix (a): the book is read AFTER the try, so a maker the try itself just made sit out moves on too.
    const unavailable = satOut(input.planned);
    if (!unavailable && !refusedForMoney(refusal)) throw refusal;
    const movedFor = unavailable ? "ROLE_UNAVAILABLE" as const : "MONEY" as const;
    for (const maker of servePhaseFallbackOrder({
      planned: input.planned.providerRef,
      claimEligible: input.claimEligible,
      prices: input.prices,
      request: input.request,
      preferNot: input.preferNot,
      ...(input.sitOut === undefined ? {} : {
        sitOut: input.sitOut,
        avoidGate: unavailable ? input.sitOut.gateOf(input.planned.providerRef) ?? null : null
      })
    })) {
      if (satOut(maker)) continue;
      const fallbackRequest = { ...input.request, providerRef: maker.providerRef };
      try {
        const result = await input.call(maker, fallbackRequest);
        return Object.freeze({ result, servedBy: maker, fallback: true, movedFor });
      } catch (error) {
        if (!refusedForMoney(error) && !satOut(maker)) {
          throw input.onFallbackFailure === undefined ? error : input.onFallbackFailure(error, fallbackRequest);
        }
      }
    }
    throw refusal;
  }
}

/**
 * FINAL REVIEW, Important 1 (spec §14.4.2, §14.4.9) — A CHEAPER MAKER THAT
 * LEAVES NOTHING TO SERVE.
 *
 * A cheaper maker is asked only because the planned one could not be paid.
 * When its draft or verdict is then refused for its CONTENT after its own
 * repairs — the writer's or the checker's contract, or a verdict whose
 * criteria disagree with it — it has produced nothing the engine may serve:
 * `SYNTHESIS_NO_ARTIFACT`, the sealed chain's own class, exactly as a writer
 * whose repairs never stop naming an id (Task M4, I-1). A later round then
 * keeps the complete round before it (M3), and round 1 ends components-only,
 * which the floor answers (M5). Money is never the reason a run FAILS, and a
 * complete round is never thrown away for it. The owner's row names the stop
 * (`serve_stop` NO_ARTIFACT).
 *
 * The PLANNED maker's own contract failure keeps today's handling: the run
 * fails (pinned in tests/integration/database.test.ts, "writes no floor, and
 * no row, for a run that FAILED on a contract error"). Whether it should also
 * count as NO_ARTIFACT is an owner question. Any other failure — a dead
 * transport, a spend stop, anything untyped — travels as itself.
 */
export const FALLBACK_CONTENT_REFUSAL_CODES: readonly string[] = Object.freeze([
  "COMPOSITION_CONTRACT_ERROR",
  "EVALUATOR_CONTRACT_ERROR",
  "EVALUATOR_VERDICT_INCOHERENT",
  "EVALUATOR_OBJECTION_MISSING"
]);

export function fallbackContentRefusal(
  error: unknown,
  request: Pick<ProviderCallRequest, "role" | "callSiteKey">
): unknown {
  if (!(error instanceof TypedDomainError) || !FALLBACK_CONTENT_REFUSAL_CODES.includes(error.code)) return error;
  const noArtifact = new TypedDomainError(
    "SYNTHESIS_NO_ARTIFACT",
    `The cost fallback's ${request.role} at ${request.callSiteKey} left nothing to serve: ${error.code}`
  );
  noArtifact.cause = error;
  return noArtifact;
}

/**
 * ENGINE MONEY RULE (spec §14.4.6), TASK M7 — THE STORY'S COST FALLBACK, over
 * one run's claim-eligible makers and the runner's price map. It IS the
 * answer-writer's fallback (`callServeRoleWithFallback`, with its order and
 * the seam's projection), handed to the story writer rather than copied into
 * it; the story names its own money refusal. Built per run at the post-settle
 * hook, beside the run's own role resolver, so a story never falls back onto a
 * maker the claim did not find healthy.
 */
export function storyCostFallback(
  claimEligible: readonly ServeRoleMaker[],
  prices: ProviderPriceMap,
  // Run resilience (spec 2026-10-12, fix (a)): the run's sit-out book, so a story role moves on from a member that
  // sits out exactly as the answer roles do. Absent off the preview.
  sitOut?: RunSitOutView
): StoryCostFallback {
  return (input) => callServeRoleWithFallback({ ...input, claimEligible, prices, ...(sitOut === undefined ? {} : { sitOut }) });
}

/**
 * B9 (budget spec §2.9) — CHEAPER MODELS WHILE ARGUING: the body's twin of
 * `servePhaseFallbackOrder` and `callServeRoleWithFallback`.
 *
 * WHICH REFUSALS MOVE A CALL. Money only: the run's own ceiling for arguing
 * (MONEY), the site's day at its finish edge (DAILY) and the run owner's
 * window at its finish edge (ALLOWANCE) — each raised by the seam before
 * anything is sent, so every refused try is free. The attempt ceiling and a
 * vendor that reports no usage never move a call: another model changes neither.
 */
export type BodyFallbackStop = Extract<EnvelopeStopKind, "MONEY" | "DAILY" | "ALLOWANCE">;

const BODY_FALLBACK_STOPS: readonly EnvelopeStopKind[] = Object.freeze(["MONEY", "DAILY", "ALLOWANCE"]);

export function bodyRefusedForMoney(error: unknown): BodyFallbackStop | null {
  const stop = envelopeStopKind(error);
  return stop !== null && BODY_FALLBACK_STOPS.includes(stop) ? stop as BodyFallbackStop : null;
}

/**
 * WHICH CALLS MAY MOVE: the authoring legs — the first position's own call
 * included — the defender, critic and cross-root legs, and the reviews. NEVER a
 * panel seat (`PANEL:`): every run model already sits on the panel, so a swap
 * would give one model two votes. Under the same setting a seat refused for
 * money is LEFT OUT, as a failed seat is today (`runJudgePanel`'s
 * `leaveOutMoneyRefusedSeats`, budget spec §2.9's Panel seats row), and the
 * panel carries on. Answer-writing calls keep their own fallback (M3).
 */
export function bodyCallMayMove(request: Pick<ProviderCallRequest, "role" | "lane" | "callSiteKey">): boolean {
  return request.role === "JUDGE"
    && request.lane === "served"
    && providerCallCostEnvelopePhase(request) === "BODY"
    && (request.callSiteKey === FIRST_POSITION_CALL_SITE_KEY
      || request.callSiteKey.startsWith(`${FIRST_POSITION_CALL_SITE_KEY}:`));
}

/** Why the planned maker could not be paid, as the owner's record names it. */
export function substitutionReason(stop: BodyFallbackStop, callSiteKey: string): RunCostSubstitutionReason {
  switch (stop) {
    case "MONEY":
      // Paid plans S1a: an assigned run's first call carries its seat marker.
      return seatBaseCallSiteKey(callSiteKey) === FIRST_POSITION_CALL_SITE_KEY ? "RUN_FIRST_CALL" : "RUN_ARGUING";
    case "DAILY":
      return "SITE_DAY";
    case "ALLOWANCE":
      return "PERSON";
    default:
      return exhaustive(stop);
  }
}

export interface BodyCallOutcome<T extends ServeRoleMaker> {
  readonly result: ProviderCallResult;
  /** The maker that actually wrote the answer to this call: the node's author, or its reviewer. */
  readonly servedBy: T;
  readonly substitution: Readonly<{ plannedProviderRef: string; reason: RunCostSubstitutionReason }> | null;
}

/**
 * ONE CALL WHILE ARGUING, WITH THE COST FALLBACK. The planned maker is always
 * asked first. Only a money refusal moves the SAME request — the same call
 * site, the same framed prompt object, the same bound and contract — to the
 * next maker in `servePhaseFallbackOrder` (cheapest first by this request's own
 * projection at each maker's price; every other eligible maker once). The
 * seam decides what fits.
 *
 * WHAT A CHEAPER MAKER'S OWN FAILURE DOES — the body's version of the serve
 * twin's FINAL REVIEW, Important 1 (`fallbackContentRefusal`). A cheaper maker
 * is asked only because the planned one could not be paid, so:
 *  · refused for money too → the next maker;
 *  · it could not serve — its transport died after its attempts
 *    (`ProviderCallFailedError`) or its content was refused after its repairs
 *    (`ProviderContentUnacceptedError`) → the next maker. While arguing,
 *    nothing it did can turn the planned money stop into a failure: never a
 *    cooldown hold (`withCooldownRetry` holds only on a transport failure it
 *    is handed), never JUDGE_SCHEMA_FAILURE or NODE_REVIEW_UNAVAILABLE;
 *  · anything else — an untyped error, a database or ledger error, the attempt
 *    ceiling, a vendor with no usage, PRODUCER_GRADING_FORBIDDEN,
 *    PROVIDER_PACKET_TOO_LARGE, any other typed code — travels unchanged and
 *    ends the search (J24: a sealed identity is substituted for cost only).
 * Nobody serves → the PLANNED refusal travels, as it always has: a clean MONEY,
 * DAILY or ALLOWANCE stop while arguing, and the answer is still written (budget
 * spec §1.1, §2.9). On the first position's own call (the bare key or either
 * seat marker), a cheaper maker whose transport died hands its
 * ProviderCallFailedError back, so the cooldown holds and retries;
 * RUN_CEILING_BELOW_FIRST_CALL is raised only when every maker
 * refused (budget spec §2.9, "The first call"). There a money stop is not clean
 * — root 0 fails it as a ceiling below one call — and a maker whose transport
 * died did not refuse: after the hold, root 0's final attempt asks the planned
 * maker first again (refused before sending, free) and then the cheaper makers
 * with the larger attempt count; a second transport death halts the position
 * (MAKER_POSITION_UNAVAILABLE), exactly as the planned maker's own would.
 *
 * Accepted gap, stated: the Judge's own checks after the gateway returned (its
 * re-parse, `resolveClaimType`, a review's bearing count) are not seen here.
 * None can fail for content the gateway's `classifyContent` accepted — the
 * same schema, `claim_type` bound to the closed vocabulary, the bearings'
 * length pinned by the review schema — so a cheaper maker that returned from the
 * gateway has served.
 */
export async function callBodyRoleWithFallback<T extends ServeRoleMaker>(input: Readonly<{
  planned: T;
  eligible: readonly T[];
  prices: ProviderPriceMap;
  request: ProviderCallRequest;
}>): Promise<BodyCallOutcome<T>> {
  try {
    return Object.freeze({
      result: await input.planned.provider.call(input.request), servedBy: input.planned, substitution: null
    });
  } catch (refusal) {
    const stop = bodyRefusedForMoney(refusal);
    if (stop === null) throw refusal;
    // The last cheaper maker whose transport died, handed back on the first
    // position's own call (see above); ignored everywhere else.
    let transportDeath: ProviderCallFailedError | null = null;
    for (const maker of servePhaseFallbackOrder({
      planned: input.planned.providerRef,
      claimEligible: input.eligible,
      prices: input.prices,
      request: input.request,
      preferNot: null
    })) {
      try {
        const result = await maker.provider.call({ ...input.request, providerRef: maker.providerRef });
        return Object.freeze({
          result,
          servedBy: maker as T,
          substitution: Object.freeze({
            plannedProviderRef: input.planned.providerRef,
            reason: substitutionReason(stop, input.request.callSiteKey)
          })
        });
      } catch (error) {
        // Refused for money too, or it could not serve: the next maker.
        if (bodyRefusedForMoney(error) !== null) continue;
        if (error instanceof ProviderCallFailedError) {
          transportDeath = error;
          continue;
        }
        if (error instanceof ProviderContentUnacceptedError) continue;
        // Anything else travels unchanged (J24).
        throw error;
      }
    }
    // Budget spec §2.9: on the first position's own call a maker whose
    // transport died did not refuse, so its failure goes to root 0's cooldown.
    // Paid plans S1a: an assigned run's first call carries its seat marker.
    if (transportDeath !== null && seatBaseCallSiteKey(input.request.callSiteKey) === FIRST_POSITION_CALL_SITE_KEY) {
      throw transportDeath;
    }
    throw refusal;
  }
}

/** One moved call, as the owner's record and the log line carry it: ids and a code, never text. */
export type BodyCostSubstitutionEvent = Readonly<{
  callSiteKey: string;
  plannedProviderRef: string;
  usedProviderRef: string;
  reason: RunCostSubstitutionReason;
}>;

/**
 * THE GATEWAY A MAKER'S JUDGE IS GIVEN FOR ONE RUN, under the new settings.
 * A call that may move goes through `callBodyRoleWithFallback` over the makers
 * `eligibleFor` names (for a review, every claim-eligible maker but the node's
 * ACTUAL author); every other call — panel seats, anything not arguing — goes
 * to the planned maker alone, exactly as before. `onServed` tells the runner
 * who actually wrote each movable call, so a node's author is the model that
 * wrote it; `onMoved` records a substitution.
 */
export function bodyCostFallbackGateway<T extends ServeRoleMaker>(input: Readonly<{
  planned: T;
  eligibleFor: (request: ProviderCallRequest) => readonly T[];
  prices: ProviderPriceMap;
  onServed: (callSiteKey: string, servedBy: T) => void;
  onMoved: (event: BodyCostSubstitutionEvent) => Promise<void>;
}>): ProviderGateway {
  return Object.freeze({
    call: async (request: ProviderCallRequest): Promise<ProviderCallResult> => {
      if (!bodyCallMayMove(request)) return input.planned.provider.call(request);
      const outcome = await callBodyRoleWithFallback({
        planned: input.planned, eligible: input.eligibleFor(request), prices: input.prices, request
      });
      input.onServed(request.callSiteKey, outcome.servedBy);
      if (outcome.substitution !== null) {
        await input.onMoved(Object.freeze({
          callSiteKey: request.callSiteKey,
          plannedProviderRef: outcome.substitution.plannedProviderRef,
          usedProviderRef: outcome.servedBy.providerRef,
          reason: outcome.substitution.reason
        }));
      }
      return outcome.result;
    }
  });
}

/** B9 (budget spec §2.12): the runner's content-free line for a moved call (`runner.body.cheaper_model`) and for a record it could not write. */
export function logBodyCostFallback(event: string, detail: Readonly<Record<string, unknown>>): void {
  console.warn(JSON.stringify({ ...detail, kind: "DEBATEAI_BODY_COST_FALLBACK", event }));
}

/**
 * ENGINE MONEY RULE (spec §14.4.2), TASK M3 — A ROUND KEPT AFTER A SPEND STOP
 * SAYS SO ON THE ANSWER.
 *
 * When an answer-writing call is stopped by a spend bound after a complete
 * round (money only after every cheaper maker was refused), the loop now keeps
 * that round (`keepsCompleteSynthesisRounds`) and the answer is SERVED instead
 * of taking the envelope terminal. The stop is not dropped: the answer carries
 * the same answer-scope `ENVELOPE_EXHAUSTED` record the envelope terminal (and,
 * since M2, a stop while arguing) carries, naming the bound that stopped it.
 * Minted after the chain, like `runBodyStopDisclosure`.
 *
 * `null` — nothing to add: no failure escaped a role call; no round was kept
 * (a round-1 refusal still takes the terminal, which has its own record); the
 * failure was a dead transport or an empty draft, which are not spend bounds;
 * the answer already carries the mark (the stop while arguing took it); or the
 * answer is DEFECT. The owner's row names the loop's stop in every one of these
 * cases (`serve_stop`, `serveLoopStopOf`).
 */
export function servePhaseStopDisclosure(input: Readonly<{
  servePhaseFailure: unknown;
  keptRounds: number;
  resultConditionMarks: readonly string[];
  runId: string;
  servedRootNodeId: string;
}>): ConditionMarkRecord | null {
  if (input.servePhaseFailure === null || input.keptRounds < 1) return null;
  const stop = envelopeStopKind(input.servePhaseFailure);
  if (stop === null) return null;
  if (input.resultConditionMarks.includes("ENVELOPE_EXHAUSTED")) return null;
  if (input.resultConditionMarks.includes("DEFECT")) return null;
  return Object.freeze({
    mark: "ENVELOPE_EXHAUSTED" as const,
    scope: "answer" as const,
    subjectRef: input.runId,
    reason: ENVELOPE_STOP_REASONS[stop],
    liftPath: null,
    servedRootRule: null,
    affectedNodeIds: Object.freeze([input.servedRootNodeId])
  } satisfies ConditionMarkRecord);
}

/** The kinds of stop that can end the answer-writing loop early (`serve.serve_disclosure.serve_stop`). */
export type ServeLoopStop = EnvelopeStopKind | "TRANSPORT_DEATH" | "NO_ARTIFACT";

/**
 * ENGINE MONEY RULE (spec §14.4.5), TASK M3 review polish — WHAT ENDED THE
 * ANSWER-WRITING LOOP EARLY, for the owner's record (`serve_stop`).
 *
 * The runner's view of the loop's `endedEarlyBy`: the sealed chain does not
 * hand the loop's outcome back, so the runner keeps the failure that left a
 * role call (`whileServing`) — money only after every cheaper maker was
 * refused — or the empty draft it handed the chain. Every failure named here
 * ends the loop: kept on a complete round, or, before one, a components-only
 * terminal. It is recorded either way, and it is the only durable trace of a
 * transport death after a kept round and of a serve-leg stop whose envelope
 * record the stop while arguing already took. `null` for anything else.
 *
 * Every code the loop keeps a round for (the kernel's spend stops and serve's
 * `ROUND_KEEPING_TECHNICAL_FAILURES`) names a stop here; a unit row pins that,
 * so a new code cannot silently record NULL (M3 review carry, Task M4).
 */
export function serveLoopStopOf(failure: unknown): ServeLoopStop | null {
  const stop = envelopeStopKind(failure);
  if (stop !== null) return stop;
  if (!(failure instanceof TypedDomainError)) return null;
  if (failure.code === "SYNTHESIS_TRANSPORT_DEATH") return "TRANSPORT_DEATH";
  if (failure.code === "SYNTHESIS_NO_ARTIFACT") return "NO_ARTIFACT";
  return null;
}

/**
 * ENGINE MONEY RULE (spec §14.4.3), TASK M4 — THE ONE POINT WHERE A CITATION
 * BECOMES A NODE ID.
 *
 * The answer-writer cites the nodes a segment rests on (`node_refs`) by the
 * refs the digest showed it: node ids at rungs 0-5, short refs (`n1`, …) at the
 * compact and spine rungs. Each is mapped back HERE, in the writer's adapter,
 * before the segment reaches the sealed chain — whose own checks (the serve
 * set, the load-bearing flag, SERVED_STATEMENT_CITES_NO_VERIFIED_NODE, the
 * cited set the answer's form and band are read from) therefore only ever see
 * real node ids.
 *
 *  · `"primary"` stays the served root's alias (fixtures and prompts written
 *    against the one-node serve set);
 *  · a ref the digest does not carry — an unknown ref, a real id where the
 *    digest showed short refs, or a point the spine left out, which is not in
 *    the digest and so cannot be cited — is refused before it gets here: the
 *    writer's classifier (`classifyComposedContent`, review fix I-1) re-asks
 *    the call, and a writer that never stops ends as SYNTHESIS_NO_ARTIFACT.
 *    This refusal (COMPOSITION_CONTRACT_ERROR, "Unknown composition node
 *    ref") stays as the backstop behind that check.
 */
export function composedNodeIdOf(input: Readonly<{
  ref: string;
  digest: SynthesisDigest;
  servedRootNodeId: string;
  servedNodes: readonly Readonly<{ nodeId: string }>[];
}>): string {
  if (input.ref === "primary") return input.servedRootNodeId;
  const nodeId = resolveDigestNodeRef(input.digest, input.ref);
  if (nodeId === null || !input.servedNodes.some((node) => node.nodeId === nodeId)) {
    throw new TypedDomainError("COMPOSITION_CONTRACT_ERROR", `Unknown composition node ref ${input.ref}`);
  }
  return nodeId;
}

/**
 * ENGINE MONEY RULE (spec §14.4.5), TASK M4 — the digest built for the
 * answer-writer, SERVED OR NOT, for the owner's record: its ladder rung (0-7)
 * and how many points it left out (0 below the spine rung). Set whenever the
 * writer was handed a digest, including when its call was then refused and the
 * answer ended components-only; null when no digest was handed over — the
 * digest could not exist, or the run took a terminal before the chain.
 */
export function serveDisclosureDigestFacts(
  digest: SynthesisDigest | null
): Readonly<{ rung: number; pointsOmitted: number }> | null {
  if (digest === null) return null;
  return Object.freeze({ rung: digest.compressionLevel, pointsOmitted: digestPointsOmitted(digest) });
}

/**
 * ENGINE MONEY RULE (spec §14.4.5), TASK M3 — WHAT THE ARGUING LEFT FOR THE
 * OWNER'S RECORD, taken where the body ends (the serve decision), never later.
 *
 *  · `bodyStop` — the stop that ended the arguing early, if any. The answer
 *    carries it as its envelope record, except on a DEFECT answer, where
 *    nothing did (M2 review): the row keeps it for every answer.
 *  · `pointsWithoutReview` — how many points the stop left without a
 *    cross-review, each seeded from its own panel with UNKNOWN edges (R-A). Only
 *    the spend-stopped footing has such points; a mono-maker run never
 *    cross-reviews and a run never stopped reviewed what it could, so both are
 *    null rather than a zero that would claim a count was taken.
 */
export function serveDisclosureBodyFacts(input: Readonly<{
  runBodyBudgetStop: EnvelopeStopKind | null;
  decision: Readonly<{ footing: MakerPositionServeFooting; seededWithoutReview: readonly string[] }>;
}>): Readonly<{ bodyStop: EnvelopeStopKind | null; pointsWithoutReview: number | null }> {
  return Object.freeze({
    bodyStop: input.runBodyBudgetStop,
    // Run resilience (fix (d)): the arguing that ended for want of members leaves its unreviewed points too.
    pointsWithoutReview: input.decision.footing === "SPEND_STOPPED" || input.decision.footing === "MEMBERS_SAT_OUT"
      ? input.decision.seededWithoutReview.length
      : null
  });
}

/**
 * ENGINE MONEY RULE (spec §14.4.4), TASK M5 — THE FLOOR: an answer even when no
 * answer could be written.
 *
 * The runner derives the arithmetic label BEFORE the answer-writing step (T11),
 * from the propagated numbers alone. When the sealed result still ends
 * COMPONENTS_ONLY — whatever the cause: money after every cheaper maker, a
 * digest that cannot exist, a dead transport, a draft with nothing to serve, a
 * round-1 checker that could not be paid, an attempt overspend — that label
 * still exists, and the owner's row keeps it:
 *
 *  · `verdictState`: the label, exactly as derived;
 *  · `leadingNodeId`: the position the label rests on, the same node the
 *    label's `servedNodeId` names;
 *  · `reason`: the sealed components-only cause (the result's crash class), a
 *    code. Every sealed components-only constructor names one, so a result
 *    without one is a typed stop (`SERVE_FLOOR_REASON_UNRESOLVED`), never an
 *    unnamed floor (M5 review, M5).
 *
 * The sealed answer stays COMPONENTS_ONLY: nothing here reaches it, so no
 * artifact and no checker verdict are invented (money map R1, route (a)). A
 * SERVED or DOWNGRADED answer carries its own label and has no floor; a FAILED
 * run persists no answer, so it has no row and no floor.
 */
export type ServeFloor = Readonly<{
  /** The owner's floor list's own type: it carries SPLIT (R2b, ruling E8), as the stored floor does. */
  verdictState: ServeDisclosureFloorState;
  leadingNodeId: string;
  reason: string;
}>;

export function serveFloorOf(input: Readonly<{
  terminal: ServeGateResult["terminal"];
  crashClass: ServeGateResult["crashClass"];
  label: ServeDisclosureFloorState;
  leadingNodeId: string;
}>): ServeFloor | null {
  if (input.terminal !== "COMPONENTS_ONLY") return null;
  if (input.crashClass === null) {
    throw new TypedDomainError(
      "SERVE_FLOOR_REASON_UNRESOLVED",
      "A components-only result names its sealed crash class; a floor is never written without its cause"
    );
  }
  return Object.freeze({
    verdictState: input.label,
    leadingNodeId: input.leadingNodeId,
    reason: input.crashClass
  });
}

/**
 * ENGINE MONEY RULE (spec §14.4.5), TASK M3 — THE OWNER-SIDE DISCLOSURE ROW.
 *
 * Content-free: provider refs, codes and counts. The served refs are the
 * makers that wrote and checked the round the answer serves (null when the
 * answer has no checked round). On a run that is not rotated, a served maker
 * other than the planned one can only be the money fallback — every other
 * substitution is refused — so the fallback flags and the reason are derived
 * from the refs, and migration 0076 refuses a row where they disagree. On a
 * rotated run (Task 11, migration 0114) the planned refs are the pin's, and a
 * sealed register ref that stood in for an unavailable pinned member is the one
 * other substitution: its role's reason is ROLE_UNAVAILABLE, named per role. `checkerSameAsWriter` is R9's disclosure:
 * DEGRADED-DIVERSITY reads the SEALED refs, so a fallback that put both roles
 * on one maker is recorded here instead. The digest fields (Task M4) are the
 * rung and the points left out of the digest the answer-writer was handed
 * (`serveDisclosureDigestFacts`); the floor fields (Task M5) are the floor of a
 * components-only answer (`serveFloorOf`), all three or none.
 */
export function buildServeDisclosureRecord(input: Readonly<{
  answerId: string;
  answerVersion: number;
  runId: string;
  planned: Readonly<{ writerRef: string; checkerRef: string }>;
  served: Readonly<{ writerRef: string; checkerRef: string }> | null;
  body: Readonly<{ bodyStop: EnvelopeStopKind | null; pointsWithoutReview: number | null }>;
  /** What ended the answer-writing loop early (`serveLoopStopOf`), or null. */
  serveStop: ServeLoopStop | null;
  /** The digest built for the answer-writer, served or not (`serveDisclosureDigestFacts`), or null. */
  digest: Readonly<{ rung: number; pointsOmitted: number }> | null;
  /** The floor of a components-only answer (`serveFloorOf`), or null. */
  floor: ServeFloor | null;
  /**
   * Role rotation, Task 11 (orchestrator ruling 2026-10-11): a rotated run's stand-ins — per answer role, the sealed
   * register ref that took the role because the pinned member was not claim-eligible, or null when the pin held it.
   * Present only on a rotated run; the record then names each fallback's reason per role. Absent on every other run,
   * whose record is today's to the byte.
   */
  standIns?: Readonly<{ writerRef: string | null; checkerRef: string | null }>;
}>): ServeDisclosureRecord {
  const writerFallback = input.served !== null && input.served.writerRef !== input.planned.writerRef;
  const checkerFallback = input.served !== null && input.served.checkerRef !== input.planned.checkerRef;
  // A role the stand-in served fell back because its pinned model was unavailable; any other served model than the
  // planned one was chosen for money (a stand-in a cheaper model then replaced included: what served was chosen for money).
  const reasonOf = (fallback: boolean, servedRef: string | undefined, standIn: string | null | undefined) =>
    !fallback ? null : standIn !== null && standIn !== undefined && servedRef === standIn ? "ROLE_UNAVAILABLE" as const : "MONEY" as const;
  const writerReason = reasonOf(writerFallback, input.served?.writerRef, input.standIns?.writerRef);
  const checkerReason = reasonOf(checkerFallback, input.served?.checkerRef, input.standIns?.checkerRef);
  return Object.freeze({
    answerId: input.answerId,
    answerVersion: input.answerVersion,
    runId: input.runId,
    writerPlannedRef: input.planned.writerRef,
    checkerPlannedRef: input.planned.checkerRef,
    writerServedRef: input.served?.writerRef ?? null,
    checkerServedRef: input.served?.checkerRef ?? null,
    writerFallback,
    checkerFallback,
    fallbackReason: writerReason === "MONEY" || checkerReason === "MONEY" ? "MONEY" as const : null,
    ...(input.standIns === undefined || writerReason === null ? {} : { writerFallbackReason: writerReason }),
    ...(input.standIns === undefined || checkerReason === null ? {} : { checkerFallbackReason: checkerReason }),
    checkerSameAsWriter: input.served !== null && input.served.checkerRef === input.served.writerRef,
    bodyStop: input.body.bodyStop,
    pointsWithoutReview: input.body.pointsWithoutReview,
    serveStop: input.serveStop,
    digestRung: input.digest?.rung ?? null,
    digestPointsOmitted: input.digest?.pointsOmitted ?? null,
    floorVerdictState: input.floor?.verdictState ?? null,
    floorLeadingNodeId: input.floor?.leadingNodeId ?? null,
    floorReason: input.floor?.reason ?? null
  });
}

/** The member a served round's seat planned (or handed the round to after a backup switch), or the typed defect of a round no seat planned. */
function plannedRoleRef(providerRef: string | undefined, role: "writer" | "checker"): string {
  if (providerRef === undefined) {
    throw new TypedDomainError(
      "SERVE_DRAFT_UNRESOLVED",
      `The served round names a ${role} round this run's ${role} seat never planned`
    );
  }
  return providerRef;
}

/** The maker a served round's role call recorded, or the typed defect of a round no call recorded. */
function servedRoleRef(providerRef: string | undefined, role: "writer" | "checker"): string {
  if (providerRef === undefined) {
    throw new TypedDomainError(
      "SERVE_DRAFT_UNRESOLVED",
      `The served round names a ${role} artifact this run's ${role} call did not record`
    );
  }
  return providerRef;
}

function databaseStateOf(error: unknown): string | null {
  const code = typeof error === "object" && error !== null ? (error as { readonly code?: unknown }).code : undefined;
  return typeof code === "string" && /^[0-9A-Z]{5}$/u.test(code) ? code : null;
}

/**
 * The ONE disclosure log line (M3 review polish: `main.ts` composes this same
 * function rather than a copy). Codes and ids only: it never carries debate or
 * model text. The detail goes FIRST, so no detail key can overwrite the line's
 * kind or event.
 */
export function logServeDisclosure(event: string, detail: Readonly<Record<string, unknown>>): void {
  console.warn(JSON.stringify({ ...detail, kind: "DEBATEAI_SERVE_DISCLOSURE", event }));
}

/** `reply`: how the accepted reply ended (`rememberingAcceptedReply`), so it is read exactly as its classifier read it. */
export function parseComposerOutput(content: string, reply?: ModelReplyFacts): z.infer<typeof compositionSchema> {
  return parseContent(content, compositionSchema, "COMPOSITION_CONTRACT_ERROR", reply, compositionFixGuide);
}

/** The evaluator's verdict as the engine reads it (the parser of the EVALUATOR call); `reply` as for `parseComposerOutput`. */
export function parseEvaluatorOutput(content: string, reply?: ModelReplyFacts): z.infer<typeof evaluatorVerdictSchema> {
  return parseContent(content, evaluatorVerdictSchema, "EVALUATOR_CONTRACT_ERROR", reply);
}

/**
 * The EVALUATOR call's content classifier: the same reading as `parseEvaluatorOutput`. Reply language (2026-10-12):
 * with the person's question, an objection must be in its language (`EVALUATOR_PROSE`); with a shaped run's lock
 * (question-language spec 2026-10-13 L6), in the locked language.
 */
export function classifyEvaluatorContent(
  content: string, reply?: ModelReplyFacts, questionLine?: string, questionLanguage: QuestionLanguage | null = null
): ContentClassification {
  const structured = classifyStructuredContent(content, evaluatorVerdictSchema, reply);
  if (structured.parseStatus !== "PARSED" || questionLine === undefined) return structured;
  const language = replyLanguageCheckFor(questionLine, questionLanguage, EVALUATOR_PROSE)(parseEvaluatorOutput(content, reply));
  return language.length === 0 ? structured : { parseStatus: "SCHEMA_FAILED", parseError: JSON.stringify(language) };
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

/**
 * The served-root decision as the propagation receipt records it. Under the comparing judges' rule (engine 2) the votes
 * chose `root`; `runnerUp`, `margin` and `tiebreak` describe the honest final strengths (the strongest other servable
 * root, the served root's strength minus its, which may be negative, and whether the two were equal), never the vote.
 */
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

/**
 * Engine 2 (spec 2026-10-15 §4.4; INTERFACE §9.5; R2b) — THE COMPARING JUDGES CHOOSE THE SERVED ROOT. Their verdict's
 * winner (`deriveJudgesVerdict`: counted votes, ties by the honest final strength, then the lexicographic node id) is
 * served, at its own honest final strength. The runner-up and the margin are the strongest OTHER servable root's, kept
 * for the record only: the votes decided, so the margin may be negative. Engine 1 never calls it.
 */
export function selectServedRootByJudges<T extends { readonly nodeId: string }>(
  servableRoots: readonly T[],
  verdict: JudgesVerdict,
  strengths: readonly { readonly nodeId: string; readonly strength: number }[]
): ServedRootSelection<T> {
  const root = servableRoots.find((candidate) => candidate.nodeId === verdict.winnerRootNodeId);
  if (root === undefined) throw new TypedDomainError("SERVED_ROOT_JUDGES_WINNER_UNSERVABLE", verdict.winnerRootNodeId);
  const byNodeId = new Map(strengths.map((row) => [row.nodeId, row.strength] as const));
  const strengthOf = (nodeId: string): number => {
    const strength = byNodeId.get(nodeId);
    if (strength === undefined || !Number.isFinite(strength)) throw new TypedDomainError("SERVED_ROOT_STRENGTH_UNRESOLVED", nodeId);
    return strength;
  };
  const servedStrength = strengthOf(root.nodeId);
  const runnerUp = servableRoots
    .filter((candidate) => candidate.nodeId !== root.nodeId)
    .map((candidate) => ({ nodeId: candidate.nodeId, strength: strengthOf(candidate.nodeId) }))
    .sort((left, right) => right.strength - left.strength
      || (left.nodeId < right.nodeId ? -1 : left.nodeId > right.nodeId ? 1 : 0))[0];
  return Object.freeze({
    rule: SERVED_ROOT_SELECTION_RULE_JUDGES,
    root,
    servedStrength,
    runnerUp: runnerUp === undefined ? null : Object.freeze({ nodeId: runnerUp.nodeId, strength: runnerUp.strength }),
    margin: runnerUp === undefined
      ? Object.freeze({ kind: "ABSENT" as const, reason: "SINGLE_SERVABLE_ROOT" as const })
      : Object.freeze({ kind: "MEASURED" as const, value: servedStrength - runnerUp.strength }),
    tiebreak: runnerUp !== undefined && runnerUp.strength === servedStrength ? "LEXICOGRAPHIC_NODE_ID" : "NOT_APPLIED"
  });
}

/**
 * Engine redesign R2 (INTERFACE §15.4, the practice report only): what today's ladder would say over the SAME honest
 * final strengths: the strength leader among the servable roots (`selectServedRootByStrength`), its margin, its own
 * recorded panel dispersion and the run's label controls, through the sealed `deriveVerdictLabel`. An engine-2 run
 * records it on its propagation receipt as `servedRootSelection.engine1Ladder`; it is never served, never stored on
 * the answer, and never read by the judges, the writers or the story.
 */
export function engine1LadderOf<T extends { readonly nodeId: string; readonly panelDispersion: number | null }>(
  servableRoots: readonly T[],
  strengths: readonly { readonly nodeId: string; readonly strength: number }[],
  controls: VerdictLabelBasis["controls"]
): Readonly<Pick<VerdictLabelDerivation, "label" | "rung" | "trigger">> {
  const leader = selectServedRootByStrength(servableRoots, strengths);
  const derivation = deriveVerdictLabel(Object.freeze({
    winner: leader.servedStrength,
    margin: leader.margin,
    disagreement: leader.root.panelDispersion === null
      ? Object.freeze({ kind: "ABSENT" as const, reason: "FEWER_THAN_TWO_PARSEABLE_JUDGEMENTS" })
      : Object.freeze({ kind: "MEASURED" as const, value: leader.root.panelDispersion }),
    controls
  }));
  return Object.freeze({ label: derivation.label, rung: derivation.rung, trigger: derivation.trigger });
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
 *    `RUN_COST_ENVELOPE_EXHAUSTED` since Task M2, `PROVIDER_USAGE_UNREPORTED`,
 *    `DAILY_COST_ENVELOPE_REACHED`) — never
 *    `MONO_MAKER_RUN`, which means one maker was CONFIGURED, a different fact
 *    with a different lift. The only way the run body reaches one authored root
 *    at M > 1 is a spend stop (a halted root 1 throws `MAKER_POSITION_UNAVAILABLE`
 *    first), so that state with NO stop is refused loudly rather than given a
 *    mark with no reason.
 *
 * `monoMakerRecords` is REQUIRED (round 4, R-C): the marks and the records are
 * the two halves of one statement, and an optional half is how they diverge.
 *
 * Run resilience (spec 2026-10-12, fix (d); ruling R-b): on the preview a run can
 * also reach one authored root because its other members SAT OUT (busy, or behind
 * an unavailable gate) and too few were left to argue (`membersSatOut`, the
 * answer's RUN_PANEL_REVISED reason). That is not money, so the same SINGLE-LINEAGE
 * record names the members instead, with the lift the claim-time revision already
 * uses; no new reader text. Absent, the rule above is unchanged.
 */
export function buildMakerPositionDisclosure(input: Readonly<{
  effectiveMakerCount: number;
  runBodyBudgetStop: EnvelopeStopKind | null;
  authoredMakerPositions: readonly MakerPositionDisclosureRoot[];
  servedRoot: MakerPositionDisclosureRoot;
  /** The rule that chose `servedRoot` (engine 2: the judges'); absent: today's rule. */
  servedRootRule?: ServedRootRule;
  /** Engine 2: false when no judge's vote counted (the honest strengths chose); absent: true. (pre-flight PF-R2b2.1) */
  judgesChose?: boolean;
  monoMakerConditionMarks: readonly ConditionMarkRecord["mark"][];
  monoMakerRecords: readonly ConditionMarkRecord[];
  membersSatOut?: string | null;
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
    if (input.runBodyBudgetStop === null && input.membersSatOut !== undefined && input.membersSatOut !== null) {
      return Object.freeze({
        conditionMarks: Object.freeze(["SINGLE-LINEAGE" as const]),
        records: Object.freeze([Object.freeze({
          mark: "SINGLE-LINEAGE" as const,
          scope: "answer" as const,
          subjectRef: input.servedRoot.nodeId,
          reason: input.membersSatOut,
          liftPath: "RESTORE_PINNED_PROVIDER_AND_RUN_AGAIN",
          servedRootRule: null,
          affectedNodeIds: Object.freeze([input.servedRoot.nodeId])
        } satisfies ConditionMarkRecord)])
      });
    }
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
      buildUnservedMakerPositionRecord(input.authoredMakerPositions, input.servedRoot,
        input.servedRootRule ?? SERVED_ROOT_SELECTION_RULE, input.judgesChose ?? true)
    ])
  });
}

/**
 * The footing on which judged standing is projected for the served answer. MEMBERS_SAT_OUT (run resilience, spec
 * 2026-10-12, fix (d)): the preview's arguing ended because too few members were left, so, as on SPEND_STOPPED, no
 * review can be bought for what exists, and each node a review never reached stands on its own panel (R-A's rule).
 */
export type MakerPositionServeFooting = "MONO_MAKER" | "CROSS_REVIEWED" | "SPEND_STOPPED" | "MEMBERS_SAT_OUT";

export interface MakerPositionServeDecision<T extends MakerPositionDisclosureRoot> {
  readonly footing: MakerPositionServeFooting;
  /** The node ids that seeded `projectJudgedStanding` — what "reviewed" meant on this footing. */
  readonly judgedStandingSeed: readonly string[];
  /**
   * Engine money rule, Task M3 (spec §14.4.5; M2 review Minor 1): the seeds the
   * stop DENIED a cross-review — each stands on its own panel, with UNKNOWN
   * edges. Empty on every footing but SPEND_STOPPED.
   */
  readonly seededWithoutReview: readonly string[];
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
  /**
   * Run resilience (spec 2026-10-12, fix (d)): the answer's RUN_PANEL_REVISED reason when the preview's arguing
   * ended because too few members were left to argue; absent or null on every other run (today's decision).
   */
  membersSatOut?: string | null;
  /**
   * Engine 2 (spec 2026-10-15 §4.4; R2b): the comparing judges' verdict, taken on this same decision's propagation; the
   * served root and its disclosure then follow the judges (`selectServedRootByJudges`). Absent or null: today's
   * selection by strength, byte for byte.
   */
  judgesVerdict?: JudgesVerdict | null;
}>): MakerPositionServeDecision<T> {
  const membersSatOut = input.membersSatOut ?? null;
  const footing: MakerPositionServeFooting = input.effectiveMakerCount <= 1
    ? "MONO_MAKER"
    : input.runBodyBudgetStop !== null ? "SPEND_STOPPED" : membersSatOut === null ? "CROSS_REVIEWED" : "MEMBERS_SAT_OUT";
  const seededWithoutReview: readonly string[] = (() => {
    if (footing !== "SPEND_STOPPED" && footing !== "MEMBERS_SAT_OUT") return Object.freeze([]);
    const reviewed = new Set(input.reviewedNodeIds);
    const unjudged = new Set(input.unjudgedReviewNodeIds);
    return Object.freeze(input.materialisedNodeIds.filter((nodeId) => !reviewed.has(nodeId) && !unjudged.has(nodeId)));
  })();
  const judgedStandingSeed: readonly string[] = (() => {
    switch (footing) {
      case "MONO_MAKER":
        return input.materialisedNodeIds;
      case "CROSS_REVIEWED":
        return input.reviewedNodeIds;
      case "SPEND_STOPPED":
      case "MEMBERS_SAT_OUT":
        return Object.freeze([...input.reviewedNodeIds, ...seededWithoutReview]);
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
  // T10: propagation picks the served root, configuration order does not. Engine 2 (R2b): the comparing judges do.
  const judgesVerdict = input.judgesVerdict ?? null;
  const servedRootSelection = judgesVerdict === null
    ? selectServedRootByStrength(servableMakerPositions, propagation.strengths)
    : selectServedRootByJudges(servableMakerPositions, judgesVerdict, propagation.strengths);
  const servedRoot = servedRootSelection.root;
  const disclosure = buildMakerPositionDisclosure({
    effectiveMakerCount: input.effectiveMakerCount,
    runBodyBudgetStop: input.runBodyBudgetStop,
    authoredMakerPositions: input.authoredMakerPositions,
    servedRoot,
    servedRootRule: servedRootSelection.rule,
    // pre-flight PF-R2b2.1: false when no judge's vote counted (the honest strengths chose under the judges' rule).
    ...(judgesVerdict === null ? {} : { judgesChose: judgesVerdict.winnerVotes > 0 }),
    monoMakerConditionMarks: input.monoMakerConditionMarks,
    monoMakerRecords: input.monoMakerRecords(servedRoot),
    ...(membersSatOut === null ? {} : { membersSatOut })
  });
  return Object.freeze({
    footing,
    judgedStandingSeed: Object.freeze([...judgedStandingSeed]),
    seededWithoutReview,
    standing,
    propagation,
    servableMakerPositions,
    servedRootSelection,
    servedRoot,
    disclosure
  });
}

// OWNER WORDING — approve before switch-on: the two judges' reasons below (engine 2) are option-1 drafts (O1 sheet).
export function buildUnservedMakerPositionRecord(
  authoredMakerPositions: readonly MakerPositionDisclosureRoot[],
  servedRoot: MakerPositionDisclosureRoot,
  rule: ServedRootRule = SERVED_ROOT_SELECTION_RULE,
  judgesChose = true
): ConditionMarkRecord {
  const unserved = authoredMakerPositions.filter((root) => root.nodeId !== servedRoot.nodeId);
  if (unserved.length === 0) {
    throw new TypedDomainError("UNSERVED_MAKER_POSITION_UNRESOLVED", "No unserved maker position exists");
  }
  const unservedDescription = unserved.map((root) => `${root.maker} position ${root.nodeId}`).join(", ");
  const served = `${servedRoot.maker} position ${servedRoot.nodeId}; ${unservedDescription} ${unserved.length === 1 ? "remains" : "remain"} graph-visible but unserved`;
  return Object.freeze({
    mark: "UNSERVED-MAKER-POSITION",
    scope: "answer",
    subjectRef: servedRoot.nodeId,
    // pre-flight PF-R2b2.1: the third sentence when no judge's vote counted.
    reason: rule !== SERVED_ROOT_SELECTION_RULE_JUDGES
      ? `The strongest post-exclusion maker root was served: ${served}`
      : judgesChose
        ? `The answer the judges chose was served: ${served}`
        : `No judge's choice could be counted, so the answer whose case held up best was served: ${served}`,
    liftPath: unserved.length === 1
      ? "Serve the other maker root in a separately ruled answer"
      : "Serve another maker root in a separately ruled answer",
    servedRootRule: rule,
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
  /** Side-by-side spec §3: this runner's ONE release key, fixed at construction (absent = legacy); fence and check share it. */
  readonly #releaseKey: string;
  readonly #graph: GraphRepository;
  readonly #judge: Judge;
  readonly #judgements: JudgementRepository;
  readonly #ledger: LedgerRepository;
  readonly #budget: BudgetRepository;
  readonly #serve: ServeRepository;
  readonly #valuation: ValuationRepository;
  readonly #memory: MemoryRepository;
  readonly #providerProbes: ProviderProbeRepository;
  readonly #serveDisclosure: Pick<ServeDisclosureRepository, "insert">;
  readonly #costSubstitutions: Pick<RunCostSubstitutionRepository, "record">;
  readonly #mapChoices: Pick<MapChoiceRepository, "writeMapRun" | "writeMapPosition" | "readMapResultForRun">;
  readonly #pointInvestigations: Pick<PointInvestigationRepository, "recordPointInvestigation" | "readPointInvestigationsForRun">;
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
    // Side-by-side spec §3 (plan B D2): the runner claims and fails only its own release's work items, and its own
    // failure writes land under its own live claim, so its repository knows both its release and its worker id.
    this.#releaseKey = settings.releaseKey ?? LEGACY_RELEASE_KEY;
    this.#work = new WorkItemRepository(pool, {
      releaseKey: this.#releaseKey,
      workerId: settings.workerId
    });
    this.#graph = new GraphRepository(pool);
    // L4-F9 repair: every model call the runner makes goes through the keep-alive
    // of the debate making it, refused once that debate must stop.
    const primary = keepAliveProviderGateway(provider);
    this.#judge = new Judge(primary);
    this.#judgements = new JudgementRepository(pool);
    this.#ledger = new LedgerRepository(pool);
    this.#budget = new BudgetRepository(pool);
    this.#serve = new ServeRepository(pool);
    this.#valuation = new ValuationRepository(pool);
    this.#memory = new MemoryRepository(pool);
    this.#providerProbes = new ProviderProbeRepository(pool);
    this.#serveDisclosure = settings.serveDisclosure?.store ?? new ServeDisclosureRepository(pool);
    this.#costSubstitutions = settings.costSubstitutions?.store ?? new RunCostSubstitutionRepository(pool);
    this.#mapChoices = settings.mapChoices?.store ?? new MapChoiceRepository(pool);
    this.#pointInvestigations = new PointInvestigationRepository(pool);
    const critique = settings.critique === undefined ? undefined
      : { ...settings.critique, provider: keepAliveProviderGateway(settings.critique.provider) };
    this.#configuredMakers = Object.freeze([
      Object.freeze({ judge: this.#judge, provider: primary, providerRef: settings.providerRef, maker: settings.maker }),
      ...(critique === undefined ? [] : [Object.freeze({
        judge: new Judge(critique.provider),
        provider: critique.provider,
        providerRef: critique.providerRef,
        maker: critique.maker
      })]),
      ...(settings.additionalMakers ?? []).map((maker) => {
        const kept = keepAliveProviderGateway(maker.provider);
        return Object.freeze({ judge: new Judge(kept), provider: kept, providerRef: maker.providerRef, maker: maker.maker });
      })
    ]);
  }

  async executeNext(): Promise<RunnerExecutionResult> {
    return this.execute();
  }

  /**
   * ENGINE MONEY RULE (spec §14.4.5), TASK M3 — THE DISCLOSURE ROW'S WRITER.
   * It never throws: building the row, storing it and logging a failure each
   * sit behind the one catch, like the story hook, so the row can never change
   * the answer, the label, the run's outcome or the work item. A failure is
   * logged with its typed code (UNTYPED otherwise) and the ids, never text.
   *
   * Final review, Minor 2: it answers whether the answer version HAS its row
   * now (written here, or already there), because a floor exists for the
   * reader only through that row, and the floor's story waits for it.
   */
  async #recordServeDisclosure(
    ids: Readonly<{ runId: string; answerId: string }>,
    build: () => ServeDisclosureRecord
  ): Promise<boolean> {
    try {
      await this.#serveDisclosure.insert(build());
      return true;
    } catch (error) {
      try {
        (this.settings.serveDisclosure?.log ?? logServeDisclosure)("SERVE_DISCLOSURE_WRITE_FAILED", {
          code: error instanceof TypedDomainError ? error.code : "UNTYPED",
          // A database refusal's SQLSTATE (five characters, never a message).
          sqlState: databaseStateOf(error),
          runId: ids.runId,
          answerId: ids.answerId
        });
      } catch {
        // A log line can never cost the answer either.
      }
      return false;
    }
  }

  /**
   * B9 — ONE MOVED CALL'S OWNER RECORD AND ITS LOG LINE. Never throws, like the
   * serve disclosure row: the record can never change the debate. A failed
   * write is logged with its code (or UNTYPED) and the ids, never text.
   */
  async #recordCostSubstitution(runId: string, moved: BodyCostSubstitutionEvent): Promise<void> {
    const log = this.settings.costSubstitutions?.log ?? logBodyCostFallback;
    try {
      log("runner.body.cheaper_model", { runId, ...moved });
    } catch {
      // A log line can never cost the debate.
    }
    try {
      await this.#costSubstitutions.record({ runId, ...moved, recordedAt: new Date() });
    } catch (error) {
      try {
        log("RUN_COST_SUBSTITUTION_WRITE_FAILED", {
          code: error instanceof TypedDomainError ? error.code
            : error instanceof TypeError && /^[A-Z][A-Z0-9_]{2,95}$/u.test(error.message) ? error.message : "UNTYPED",
          sqlState: databaseStateOf(error),
          runId,
          callSiteKey: moved.callSiteKey
        });
      } catch {
        // Nor can its failure line.
      }
    }
  }

  async executeWorkItem(workItemId: string, task?: RunnerTaskControl): Promise<RunnerExecutionResult> {
    return this.execute(workItemId, task);
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

  private async execute(workItemId?: string, task?: RunnerTaskControl): Promise<RunnerExecutionResult> {
    // Side-by-side spec §4 (D1): a retiring release stops claiming. The very first check, so nothing of this release
    // touches the item: no release read, no claim, no probe, no call. It is left as is for this release's backstop,
    // which sets it aside FAILED with the waiver (spec §4 step 3); the §3 fence keeps every other release off it.
    if (this.settings.retirement?.claimsStopped() === true) {
      console.warn(JSON.stringify({ kind: "DEBATEAI_RUNNER_CLAIM", event: "RUNNER_RETIRING", workItemId }));
      return { kind: "NO_WORK" };
    }
    // Side-by-side spec §3: another release's debate is that release's alone. Asked for one (a job sent to the wrong
    // task, an old retry, a hand dispatch), this runner answers NO_WORK with one content-free line BEFORE every gate
    // below, so a foreign item meets no claim check, no probe and no call, and is left READY for its own runner.
    if (workItemId !== undefined) {
      const releaseKey = this.#releaseKey;
      const runReleaseKey = await this.#work.releaseKeyOf(workItemId);
      if (runReleaseKey !== null && runReleaseKey !== releaseKey) {
        console.warn(JSON.stringify({
          kind: "DEBATEAI_RUNNER_CLAIM", event: "RUNNER_RELEASE_MISMATCH", workItemId, runReleaseKey, releaseKey
        }));
        return { kind: "NO_WORK" };
      }
    }
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
    /**
     * L4-F9 repair (owner ruling 2026-10-11): the claim covers ONE model call and
     * the debate makes many, so it is renewed while the debate runs, fenced on the
     * deadline last seen; a second dispatch then finds the item taken. The debate
     * stops at its next model call once the claim is another copy's, or once
     * Hatchet gives up on the task (run-keep-alive.ts).
     */
    const keepAlive = startRunKeepAlive({
      claimDeadline: claimed.claimDeadline,
      renewEveryMs: this.settings.claimMs / 3,
      renew: (heldUntil) => (this.settings.renewals ?? this.#work).renewClaim({ ...claimInput, workItemId: claimed.workItemId, heldUntil }),
      ...(task === undefined ? {} : { task }),
      // Side-by-side spec §4: once this release retires, the debate's next model call is refused (RUNNER_RETIRING).
      stopCalls: () => this.settings.retirement?.callsStopped() === true
    });
    /**
     * Parallel AI calls (spec 2026-10-12 §3.2): this debate's lane of the runner's call scheduler, opened once the
     * debate is claimed and closed in the `finally` below, after the story: a call still waiting then is refused
     * (CALL_LANE_STOPPED) and never sent. Without a scheduler there is no lane and nothing is wrapped.
     */
    const callScheduler = this.settings.callScheduler;
    const callLane = callScheduler === undefined ? undefined : callScheduler.openLane(claimedRunId);
    /**
     * WHETHER THIS DEBATE'S CALLS RUN TOGETHER: only when its lane admits more than one call at a time (the register's
     * `callConcurrencyPolicy` row, set above one per debate). With the row absent — or no scheduler at all — the debate
     * runs today's engine call for call: the opening positions one after another, then today's review pass, and every judge panel asks its members one at a time (ruling R32). So hosted
     * and local behave byte for byte as today (global constraints), the same calls meet the same ceilings, and a stop
     * lands exactly where it lands today (ruling R2: the serial run's saved content is the reference).
     */
    const callsRunTogether = callLane !== undefined && callLane.callsAtOnce > 1;
    const callSubjects = this.settings.callSubjects;
    /**
     * Spec §2.3 (Task 12): told of every failed call of this debate's lane BEFORE its slot frees (`laneGateway`'s
     * `onFailed`); set only while the arguing runs together (`argueTogether`), never on today's serial engine.
     */
    let laneCallFailed: ((error: unknown) => void) | null = null;
    /** A maker's gateway through this debate's lane; the gateway itself without a scheduler. */
    const throughCallLane = (providerRef: string, provider: ProviderGateway): ProviderGateway =>
      callScheduler === undefined || callLane === undefined ? provider : laneGateway({
        lane: callLane,
        scheduler: callScheduler,
        subject: callSubjects === undefined
          ? Object.freeze({ model: providerRef, vendor: "default", gate: null })
          : callSubjects.subjectOf(providerRef),
        provider,
        onFailed: (error) => { laneCallFailed?.(error); },
        ...(this.settings.callBeforeSlot === undefined ? {} : { beforeSlot: this.settings.callBeforeSlot })
      });
    try {
    return await runKeepAliveScope.run(keepAlive, async () => {
    /**
     * VERDICT STORY (spec §3, amended): what the settled debate hands its story.
     * The snapshot is built INSIDE the lease below, where the in-memory material
     * lives, and the story runs AFTER the lease is released, so an erasure is
     * never held up for the length of a story.
     */
    const afterSettle: {
      story:
        | { readonly kind: "SNAPSHOT"; readonly input: StoryWriteInput }
        | ({ readonly kind: "SNAPSHOT_FAILED" } & StorySnapshotFailure)
        | null;
    } = { story: null };
    /** Reclaim resume: the replay book read inside the lease, closed when the lease ends (nothing replays after it). */
    let replayBookInLease: ReplayBook = EMPTY_REPLAY_BOOK;
    let executed: RunnerExecutionResult;
    try {
    executed = await this.#memory.withDisclosureContentLease([claimedRunId],async () => {
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
    // Parallel AI calls (spec 2026-10-12 §2.3): one reservation book per run,
    // so sites failing together cannot pass the run's hold cap.
    const runHoldRecorder = this.settings.holdRecorder === undefined
      ? undefined
      : reservingHoldRecorder(this.settings.holdRecorder);
    const cooldownAttempt = async <T>(input: {
      readonly callSiteKey: string;
      /** Parallel AI calls (§2.1): a reply's parent may be saved later (`LaterParentNode`); its records wait for it. */
      readonly parentNodeId: string | null | LaterParentNode;
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
      const hold = runHoldRecorder;
      if (hold === undefined) {
        throw new TypedDomainError("RUN_HOLD_RECORDER_UNRESOLVED", "runDeathPolicy requires a production hold recorder");
      }
      // A parent saved later is named once it is saved: by every hold record (`laterParentHold`) and by the halt.
      const laterParent = typeof input.parentNodeId === "object" && input.parentNodeId !== null ? input.parentNodeId : null;
      const knownParentNodeId = laterParent === null ? input.parentNodeId as string | null : null;
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
        const preflightParentNodeId = laterParent === null ? knownParentNodeId : await laterParent.saved;
        const record = Object.freeze({
          callSiteKey: siteKey,
          parentNodeId: preflightParentNodeId,
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
          parentNodeId: preflightParentNodeId,
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
      const retried = withCooldownRetry({
        runId: run.runId,
        callSiteKey: siteKey,
        parentNodeId: knownParentNodeId,
        plannedLegCount: input.plannedLegCount,
        baseMaxAttempts: this.settings.judgeBound.maxAttempts,
        failureScope: input.failureScope,
        policy,
        hold: laterParent === null ? hold : laterParentHold(hold, laterParent),
        attempt: input.attempt,
        ...(siteAttemptsSpent === undefined ? {} : { siteAttemptsSpent }),
        // Run resilience (spec 2026-10-12, ruling R-a): on the preview a busy member, an unavailable gate or a member
        // that already sits out halts the site at once — no ten-minute hold for a model that will not be asked again.
        // Finding 4 (review, 2026-10-12): the book judges it — a failure of the kind AND of a member that sat out through
        // its own gateway — so a busy failure the book never saw keeps the hold. `sitOut` is built at claim, below,
        // before any site is attempted; R-d: the gate's own unbilled refusals never sit a member out, so they hold.
        ...(sitOut === null ? {} : { haltsAtOnce: sitOut.haltsAtOnce }),
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
      if (laterParent === null) return retried;
      const outcome = await retried;
      return outcome.kind === "HALTED"
        ? { kind: "HALTED", record: Object.freeze({ ...outcome.record, parentNodeId: await laterParent.saved }) }
        : outcome;
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
    /**
     * Debate shape (spec 2026-10-12 §3): the sizes this run was admitted with (P2a: its receipt's `shape`), or null —
     * today's run, byte for byte. A shaped run needs the runner's shape settings (the sealed map hash) and a call
     * scheduler (its chains run through the lane; with no concurrency row the lane holds one call at a time).
     */
    const shapeShape = envelopeBasis.shape ?? null;
    /**
     * Length guidance (spec 2026-10-15 §3.1): the numbers this run was admitted with (its receipt's `length`), or null —
     * today's prompts and bounds, byte for byte. The runner never reads the register row: a register change never
     * reaches a running or re-claimed debate.
     */
    const lengthGuidance = envelopeBasis.length ?? null;
    /**
     * Ruling "PF-C5 root-0 bound" (a): root 0's map material bound, the runaway limits with the receipt's `length` (L19,
     * no trims), today's limits without. Root 0's kept room and every root's framing read this one value (Task 14 review 6).
     */
    const rootMaterialChars = rootZeroMapMaterialCharsFor(mapLimitsFor(lengthGuidance !== null));
    if (shapeShape !== null && (this.settings.debateShape == null || callScheduler === undefined)) {
      throw new TypedDomainError("DEBATE_SHAPE_RUNNER_UNCONFIGURED",
        "This run was admitted with the debate shape, and this runner has no sealed map contracts or no call scheduler");
    }
    /**
     * Engine redesign (R1d; INTERFACE §1.5, §3.3): the engine this run was admitted with, read ONLY from its receipt
     * (`envelope_basis.engine`), never from the register row: ENGINE_ONE for a receipt without the member, so today's run is
     * today's, byte for byte. An engine-2 run needs the runner's engine settings (the seal its engine-2 calls carry), else it
     * is refused before any call.
     */
    const engine = engineOfRun(envelopeBasis);
    if (engine.engine === 2 && this.settings.engine == null) {
      throw new TypedDomainError("ENGINE_RUNNER_UNCONFIGURED",
        "This run was admitted with engine 2, and this runner has no sealed engine contracts");
    }
    /**
     * Engine redesign R3 (Ruling PF-R35.4 (a), pre-flight PF-R35.5): engine 2's root-0 material bound, computed ONCE, as
     * LG-C's `rootMaterialChars` is: root 0's kept room and the engine branch of `rootLegOf` read this one value. Null on
     * engine 1 or without the shape (LG-C's value stands).
     */
    const rootEngineMaterialChars = engine.engine === 2 && shapeShape !== null
      ? rootZeroEngineMaterialCharsFor(mapLimitsFor(lengthGuidance !== null)) : null;
    const shapeSettings = shapeShape === null ? null : debateShapeSettingsOf(run.depthParams);
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
    /**
     * Role rotation (spec 2026-10-11 Part 6): the four roles admission picked, pinned beside the run.
     * A rotated run swaps the two sealed answer-role refs for the pinned ones for THIS run only (the
     * per-run `synthesisRolePolicy` below) and hands its story the pinned pair; the legacy seat book and
     * every other path stay as they are. Admission picks only among the debate's own frozen panel, and a
     * run never carries both pins (admission pins a rotation only where no scorecard assignment is
     * pinned), so a pin that breaks either rule, or that does not read, is a TERMINAL refusal before any
     * probe or call, like RUN_ROLE_ASSIGNMENT_INVALID. A database failure is not a TypeError and keeps
     * today's (non-terminal) path.
     */
    let rotationPin: RunRoleRotationRecord | null;
    try {
      rotationPin = await readRunRoleRotation(this.pool, run.runId);
      if (rotationPin !== null && roleAssignment !== null) throw new TypeError("BOTH_PINS");
      if (rotationPin !== null) {
        const panelRefs = new Set(run.discoveredPanel.map((member) => member.provider_ref));
        const pinned = [rotationPin.answerWriter, rotationPin.answerChecker, rotationPin.storyteller, rotationPin.storyChecker];
        if (!pinned.every((role) => panelRefs.has(role.providerRef))) throw new TypeError("PIN_OFF_PANEL");
      }
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
      await this.#work.recordTerminalFailure({ runId: run.runId, workItemId: claimed.workItemId, reason: "RUN_ROLE_ROTATION_INVALID" });
      throw new TypedDomainError("RUN_ROLE_ROTATION_INVALID", "The run's pinned role rotation cannot seat a debate");
    }
    /**
     * Reclaim resume (spec 2026-10-14-reclaim-resume-design.md; owner ruling 2026-10-14) — what earlier copies of this
     * run left: every model call they got answered for this work item, REPLAYED from the record by each member's
     * gateway (`replayingGateway`, under every other wrapper) instead of bought again, and every node they saved, set
     * aside (stale) before anything is argued, so this copy argues and reads back its own work only, as a first claim
     * does. Empty on a first claim: nothing is wrapped and nothing is set aside.
     */
    const replayBook = await readReplayBook(this.pool, run.runId, claimed.workItemId);
    replayBookInLease = replayBook;
    // Refused-repair salvage (2026-10-16): A1 and B exist only on a run whose structure-repair route is wired (main.ts sets
    // `structureRepairCeiling` only then), so only such a run replays the calls they answered (`replayingGateway`).
    const structureReplay = (this.settings.structureRepairCeiling ?? null) !== null;
    /** Setting nodes aside changes rows another copy saved, so it is fenced on THIS copy's claim (RUNNER_CLAIM_LOST). */
    const retireClaim = () => Object.freeze({
      workItemId: claimed.workItemId, workerId: this.settings.workerId,
      heldUntil: keepAlive.heldUntil(), claimMs: this.settings.claimMs
    });
    const replayedMaker = <T extends ConfiguredSeatMaker>(maker: T): T => {
      if (replayBook.pending === 0) return maker;
      const provider = replayingGateway(replayBook, maker.provider, () => keepAlive.assertMayCall(), structureReplay);
      return Object.freeze({ ...maker, provider, judge: new Judge(provider) });
    };
    const configuredByProviderRef = new Map(this.#configuredMakers.map((maker) => [maker.providerRef, replayedMaker(maker)] as const));
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
     * Run resilience (spec docs/superpowers/specs/2026-10-12-preview-run-resilience-design.md, fix (d); rulings R-a,
     * R-b) — THIS RUN'S SIT-OUT BOOK, on the preview only. Every claim-eligible maker's gateway (its judge's too) is
     * wrapped here, before any per-run copy is taken (`bodyMakers`, the seat book, `synthesisMakers` and the story's
     * makers all read these entries), so a member that sits out is refused before anything is sent wherever it was
     * planned. Without `runResilience` (hosted and local) nothing is wrapped and every path below is today's.
     */
    const sitOut: RunSitOutBook | null = this.settings.runResilience === undefined
      ? null
      : createRunSitOutBook(this.settings.runResilience);
    /**
     * Parallel AI calls (spec 2026-10-12 §3.2): the same loop puts every maker's gateway through this debate's call
     * lane, OUTSIDE the sit-out book: a call that waited for a slot meets the sit-out check only when it may start. So
     * every per-run copy below (body makers, the legacy seat book, the synthesis and story makers) uses the lane.
     * Without either, the maker is returned as it is: today's run.
     */
    /**
     * Ruling R26b: told after every failed call of a member gateway (with the book only); it places the moment too few
     * members are left to argue in today's order (`tooFewRank`). Set once the root seats exist.
     */
    let afterFailedCall: (() => void) | null = null;
    const observedFailures = (provider: ProviderGateway): ProviderGateway => Object.freeze({
      call: async (request: ProviderCallRequest): Promise<ProviderCallResult> => {
        try {
          return await provider.call(request);
        } catch (error) {
          // A call the lane held back was never sent: it cannot have made a member sit out (Task 12).
          if (!callHeldBack(error)) afterFailedCall?.();
          throw error;
        }
      }
    });
    const sitOutMaker = <T extends ConfiguredSeatMaker>(maker: T): T => {
      const sittingOut = sitOut === null ? maker.provider : sitOut.gateway(maker.providerRef, maker.provider);
      const laned = throughCallLane(maker.providerRef, sittingOut);
      const provider = sitOut === null ? laned : observedFailures(laned);
      if (provider === maker.provider) return maker;
      return Object.freeze({ ...maker, provider, judge: new Judge(provider) });
    };
    configuredMakers.forEach((maker, index) => { configuredMakers[index] = sitOutMaker(maker); });
    /** Fix (d): a seat sits out when every member it could call does; never without the book. */
    const seatSitsOut = (seat: RunSeat): boolean => sitOut !== null
      && membersOf(seat).every((member) => sitOut.sitsOut(member.providerRef));
    /**
     * B9 (budget spec §2.9) — CHEAPER MODELS WHILE ARGUING, under the new
     * settings. Each claim-eligible maker's judge is given a gateway for this
     * run (`bodyCostFallbackGateway`): a call while arguing refused for money
     * moves to the cheapest other claim-eligible maker that fits, at the same
     * call site with the same framed prompt. Two records make the rules hold:
     *
     *  · `bodyServedBy` — who actually wrote each movable call, so a node's
     *    author (its `maker`, its panel's producer) is the model that wrote it;
     *  · `reviewAuthorMakers` — the node a review call is about, so a review
     *    never moves onto the node's ACTUAL author.
     *
     * Without the setting the judges are untouched, byte-for-byte today's run.
     *
     * Paid plans S1a: placed directly after the claim-eligible loop, so
     * `bodyMakers` copies the complete `configuredMakers` and both books use the
     * one factory: a legacy book's seats spread the wrapped judges, and an
     * assigned book builds each member's judge over its STAMPED provider
     * (`judgeGatewayFor`). Every key recorded or looked up is the key without
     * its seat marker (`seatBaseCallSiteKey`).
     */
    const bodyServedBy = new Map<string, string>();
    const reviewAuthorMakers = new Map<string, string>();
    /**
     * Debate shape (Task 13 fix round 1): a shaped leg's maker bar (`shapeMakerBar`), by call site, so a call moved to
     * a cheaper maker never lands on the maker the leg must avoid. Empty on today's run.
     */
    const movedCallBars = new Map<string, (member: Readonly<{ maker: string }>) => boolean>();
    const bodyMakers = Object.freeze([...configuredMakers]);
    const bodyPrices = this.settings.providerPrices ?? EMPTY_PROVIDER_PRICES;
    const bodyGatewayFor = (planned: ConfiguredSeatMaker, provider: ProviderGateway): ProviderGateway =>
      bodyCostFallbackGateway({
        planned: Object.freeze({ ...planned, provider }),
        prices: bodyPrices,
        eligibleFor: (request) => {
          const author = reviewAuthorMakers.get(seatBaseCallSiteKey(request.callSiteKey));
          const bar = movedCallBars.get(seatBaseCallSiteKey(request.callSiteKey));
          return author === undefined && bar === undefined ? bodyMakers
            : bodyMakers.filter((candidate) => candidate.maker !== author && (bar === undefined || bar(candidate)));
        },
        onServed: (callSiteKey, servedBy) => { bodyServedBy.set(seatBaseCallSiteKey(callSiteKey), servedBy.providerRef); },
        onMoved: (moved) => this.#recordCostSubstitution(run.runId, moved)
      });
    if (this.settings.bodyCostFallback === true) {
      bodyMakers.forEach((planned, index) => {
        configuredMakers[index] = Object.freeze({ ...planned, judge: new Judge(bodyGatewayFor(planned, planned.provider)) });
      });
    }
    /** B9: the model that actually answered a movable call — the planned member unless the call moved. */
    const actualAuthor = <T extends Readonly<{ providerRef: string; maker: string }>>(
      callSiteKey: string,
      planned: T
    ): T | typeof configuredMakers[number] => {
      const servedRef = bodyServedBy.get(seatBaseCallSiteKey(callSiteKey));
      if (servedRef === undefined || servedRef === planned.providerRef) return planned;
      return configuredMakers.find((candidate) => candidate.providerRef === servedRef) ?? planned;
    };
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
      // Parallel AI calls (spec 2026-10-12 §3.2): an assigned seat's member calls through this debate's lane too. The
      // assigned book reads the configured makers, not the sit-out copies, as before; without a scheduler, as they are.
      const assignedConfigured: ReadonlyMap<string, ConfiguredSeatMaker> = callLane === undefined
        ? configuredByProviderRef
        : new Map([...configuredByProviderRef].map(([ref, maker]) => {
          const provider = throughCallLane(ref, maker.provider);
          return [ref, Object.freeze({ ...maker, provider, judge: new Judge(provider) })] as const;
        }));
      assignedSeats = buildAssignedRunSeatBook({
        assignment: roleAssignment, configured: assignedConfigured, routeHealth,
        // B9c x S1a: an assigned seat's judge goes through the cheaper-model gateway too.
        ...(this.settings.bodyCostFallback === true ? { judgeGatewayFor: bodyGatewayFor } : {})
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
    // Role rotation, Task 11 (orchestrator ruling 2026-10-11 under the owner's delegation, "always an answer"): a
    // pinned answer member that is not claim-eligible hands its role back to the SEALED register ref for that role —
    // today's unpinned role, with today's off-panel probe and today's J24 below — when the debate's estimate already
    // covers that ref's model (`answerRoleFallbackCovered`). Task 12: the sealed ref must itself be one of the debate's
    // panel REFS (not merely a panel model), so a stand-in was priced, switched on and health-checked with the panel and
    // never needs an off-panel probe the estimate did not count. Not a panel ref, not covered, or the sealed ref is the
    // pinned one: no stand-in, and the pinned role refuses with today's J24. The pin stays the disclosure's planned ref,
    // so the stand-in is recorded as that role's fallback for ROLE_UNAVAILABLE (`rotationStandIns`).
    const standInFor = (pinnedRef: string, sealedRef: string): string | null =>
      configuredMakers.some((maker) => maker.providerRef === pinnedRef) || sealedRef === pinnedRef
        || !run.discoveredPanel.some((member) => member.provider_ref === sealedRef)
        || !(this.settings.answerRoleFallbackCovered?.({ roleRef: sealedRef, panel: run.discoveredPanel }) ?? true)
        ? null
        : sealedRef;
    const rotationStandIns = this.settings.synthesisRolePolicy === undefined || rotationPin === null ? null : Object.freeze({
      writerRef: standInFor(rotationPin.answerWriter.providerRef, this.settings.synthesisRolePolicy.synthesizerRoleRef),
      checkerRef: standInFor(rotationPin.answerChecker.providerRef, this.settings.synthesisRolePolicy.evaluatorRoleRef)
    });
    // Role rotation: a rotated run's per-claim policy is the boot policy with the two answer-role refs
    // replaced by the pin's, or by a role's stand-in (bounds and loop bound unchanged). Every per-run use below
    // reads this one value; the pre-claim J24 (2) check above keeps the sealed refs, the fallback a one-maker
    // debate needs.
    const synthesisRolePolicy = this.settings.synthesisRolePolicy === undefined || rotationPin === null || rotationStandIns === null
      ? this.settings.synthesisRolePolicy
      : Object.freeze({
        ...this.settings.synthesisRolePolicy,
        synthesizerRoleRef: rotationStandIns.writerRef ?? rotationPin.answerWriter.providerRef,
        evaluatorRoleRef: rotationStandIns.checkerRef ?? rotationPin.answerChecker.providerRef
      });
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
      // Run resilience (fix (d)): an out-of-panel role maker sits out on the same book as the panel.
      const unwrapped = configuredByProviderRef.get(roleRef);
      const configured = unwrapped === undefined ? undefined : sitOutMaker(unwrapped);
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
      // Task 12: on a rotated run the role's ref is the debate's PIN (unless a sealed stand-in replaced it), so the
      // message says which: a pinned ref is never called sealed.
      const refKind = rotationPin !== null && roleRef === (role === "SYNTHESIZER" ? rotationPin.answerWriter : rotationPin.answerChecker).providerRef
        ? "pinned" : "sealed";
      throw new TypedDomainError(
        "SYNTHESIS_ROLE_PROVIDER_ABSENT_AT_CLAIM",
        `J24: the ${refKind} ${role} role ref ${roleRef} was ${absent === undefined ? "not claim-eligible" : `absent at claim (${absent.failureCode})`}; the run refuses rather than serving from a provider ${refKind === "pinned" ? "the debate's pin" : "the sealed row"} did not name`
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
    /**
     * Opener rotation (spec 2026-10-11 Part 2, option B; owner rulings R2, R5, R7): a rotated run (a pin, and
     * so no scorecard assignment) seats its legacy book in the pin's position order, opener first, so root
     * position 0 (the bare `JUDGE` key) and position 1 rotate. Only the seat book is turned: `configuredMakers`
     * keeps panel order for the cost fallback and the synthesis makers. The pin is fixed, so every pass of the
     * work item gets the same order; a pin written in panel order (before the opener rotated) changes nothing.
     */
    const panelModelIds = new Map(run.discoveredPanel.map((member) => [member.provider_ref, member.model_id] as const));
    const seatBook: RunSeatBook = assignedSeats?.book ?? buildLegacyRunSeatBook(rotationPin === null
      ? configuredMakers
      : pinnedPositionOrder(configuredMakers, (maker) => panelModelIds.get(maker.providerRef), rotationPin.eligibleModelIds));
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
     * Debate shape (spec §3.3 step 1): the run's shape context — its frozen sizes, its settings and the sealed map
     * hash — or null. A shaped run left with one maker at claim keeps today's single-position path (null).
     */
    const shapeRun = shapeShape !== null && shapeSettings !== null && this.settings.debateShape != null && effectiveMakerCount >= 2
      ? Object.freeze({ shape: shapeShape, settings: shapeSettings, mapContractHash: this.settings.debateShape.mapContractHash })
      : null;
    /**
     * Engine redesign R3 (spec 2026-10-15 §5): engine 2's map answer step — new shape only. The receipt's engine (never
     * the row) decides; the receipt counted ONE answer check (R1d `sites.answerCheck`). A receipt that did not count it
     * never sends it: the run stops before the map (deviation 10).
     */
    const engineMap = engine.engine === 2 && shapeRun !== null;
    if (engineMapCheckUnbudgeted(engine, shapeRun !== null)) {
      throw new TypedDomainError("ENGINE_MAP_CHECK_UNBUDGETED", "The run's receipt does not count the map's answer check");
    }
    /**
     * The answer writer's target (spec 2026-10-15 §3.2 notes): the length row's words for every debate with it (they win
     * over the shape's), else a shaped run's answer length (today's "about N words"), else none (today's v4 packet; pre-flight PF-C3.2).
     */
    const synthesisLength: RoleLength | null = lengthGuidance !== null
      ? Object.freeze({ answerWords: lengthGuidance.steps.answer_writer, ownWords: null, languageCode: run.argumentLanguageTag,
        charactersPerWord: lengthGuidance.charactersPerWord })
      : shapeRun === null ? null
        : Object.freeze({ answerWords: shapeRun.shape.answerWords, ownWords: null, languageCode: null,
          charactersPerWord: LENGTH_GUIDANCE_START.charactersPerWord });
    /** The answer checker's targets (spec 2026-10-15 §3.2): the writer's words and its own, only with the receipt's `length`. */
    const checkerLength: RoleLength | null = lengthGuidance === null ? null
      : Object.freeze({ answerWords: lengthGuidance.steps.answer_writer, ownWords: lengthGuidance.steps.answer_checker,
        languageCode: run.argumentLanguageTag, charactersPerWord: lengthGuidance.charactersPerWord });
    /**
     * Length guidance (spec 2026-10-15 §3.2): one step's target for a judge, panel or review call of this run, spread into
     * the call's input; nothing without the receipt's `length` (today's request, byte for byte).
     */
    const lengthGuideOf = (step: LengthGuidanceStep): Readonly<{ length?: LengthGuide }> =>
      lengthGuideFrom(lengthGuidance, step, run.argumentLanguageTag);
    /**
     * Question language (spec 2026-10-13 L6; P2L Task 17) — THE RUN'S LOCK, decided by its SHAPE RECEIPT
     * (`runQuestionLanguageLock`): a shaped receipt reads its stored tag and name back as a lock; a receipt without a
     * shape is never locked, whatever tag it stored, so every one of its calls keeps today's directive, fields and
     * reply check byte for byte. Ruling L-SHAPED-ONLY (final review I2): the RECEIPT decides, not `shapeRun`, so a
     * shaped run left with one maker at claim (today's single-position path) keeps the lock the API stored for it.
     * Computed before the map stage, whose root-0 room frames it (PF-L38). Every call of a locked run carries it: the
     * judge legs, root 0's room, the review, the panel, the writer and its reading, the checker and its reading, the
     * map (which reads the same stored pair itself) and the story.
     */
    const shapeLanguage: QuestionLanguage | null = runQuestionLanguageLock(shapeShape, run);
    const shapeLanguageInput = shapeLanguage === null ? {} : { questionLanguage: shapeLanguage };
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
    /** Final review M-1: a shaped root's maker bar narrows its POSITION rule (main and backup); none is today's rule. */
    const positionSeatRule = (seat: RunSeat, bar?: (member: Readonly<{ maker: string }>) => boolean) => bar === undefined
      ? positionRule(seat) : (member: SeatIdentity): boolean => positionRule(seat)(member) && bar(member);
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
    // Debate shape (spec §3.3 step 6): one entry per node whose panel the close-call extension widened, bound to the
    // node it extended (root 0's included: `saveAuthored` saves it too). Task 14 turns them into
    // PANEL-CLOSE-CALL-EXTENDED records; always empty on today's run.
    const closeCallExtensions: { readonly nodeId: string; readonly added: number }[] = [];

    /**
     * S2-2 / T3 — the judge panel for ONE authored node.
     *
     * Every OTHER healthy maker assesses the node; the author's own assessment
     * is one member. The author is handed to `runJudgePanel` as a member too,
     * so the FX-HR-H6 producer bulkhead is exercised by the code that owns it
     * and leaves a recorded note, rather than being pre-filtered away here.
     *
     * Ruling R32: the members are asked one at a time — today's panel, byte
     * for byte — unless this debate's calls run together (`callsRunTogether`:
     * its lane admits more than one call), when every member is asked at once
     * and the answers are read in member order.
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
      /**
       * Task M2 (spec §14.4.1): what a run-level spend stop raised by a panel
       * member does — see `panelSpendStop`. "AUTHOR_ONLY" on the first root's
       * panel only; "TRAVEL" on every other node's panel.
       */
      readonly onSpendStop: PanelSpendStopRule;
    }): Promise<{
      readonly selectedJudgementRef: string;
      readonly tau: number;
      readonly selectionScore: number;
      readonly rule: JudgementSelectionRule | HonestSelectionRule;
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
      /**
       * Task M2: the stop that cut this panel short, for the caller to record;
       * `null` on every panel that ran to its end. Only an "AUTHOR_ONLY" panel
       * can return one.
       */
      readonly spendStop: EnvelopeStopKind | null;
      /** Debate shape (spec §3.3 step 6): the members the close-call extension called and heard (0: none; always 0 today). */
      readonly closeCallAdded: number;
    }> => {
      const judgeContractHash = this.settings.judgeContractHash;
      // Engine redesign R2 (INTERFACE §6.2): engine 2's selection rule names the engine row, on the register version and
      // source today's rule was read from (the receipt carries no register version). Null on engine 1. Built in
      // engine-reduce.ts so this file never names the engine row (runner-engine-wiring.test.ts, R1d).
      const honestRule = engine.engine === 2 ? engineHonestSelectionRule(judgementPolicy.selectionRule) : null;
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
        // Engine redesign R2 (spec §4.2 item 5): a one-maker debate rests on its author's honest grade, the last resort,
        // disclosed as today's one-maker debate is (the single-lineage band cap), never as a degraded panel: there is no
        // panel here, and no panel rows to step a band down with.
        if (honestRule !== null && engine.engine === 2) {
          const author = honestAuthorOnly({
            authorJudgementRef: input.authorJudgementRef, authorMaker: input.authorMaker,
            authorAssessment: input.authorAssessment, engine, rule: honestRule
          });
          return Object.freeze({
            selectedJudgementRef: author.selectedJudgementRef,
            tau: author.tau,
            selectionScore: author.selectionScore,
            rule: author.rule,
            dispersion: null,
            panelContractHashes: Object.freeze([judgeContractHash]),
            disagreement: Object.freeze({ ...createUnmeasuredDisagreement(), honest: author.honest }),
            marks: Object.freeze([]),
            panelFailureReason: null,
            spendStop: null,
            closeCallAdded: 0
          });
        }
        return Object.freeze({
          ...authorOnlySelection(),
          dispersion: null,
          panelContractHashes: Object.freeze([judgeContractHash]),
          disagreement: createUnmeasuredDisagreement(),
          marks: Object.freeze([]),
          panelFailureReason: null,
          spendStop: null,
          closeCallAdded: 0
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
      // Debate shape (spec §3.3 step 6): a shaped run asks J graders per node (never more than the makers who are not
      // the author); today's run keeps today's cap.
      const panelCallCap = shapeRun === null
        ? Math.max(effectiveMakerCount, envelopeBasis.panelSize) - 1
        : Math.min(shapeRun.shape.graders, effectiveMakerCount - 1);
      const panelKeyFor = (member: SeatMember): string => `${input.callSiteKey}:${member.providerRef}`;
      // Run resilience (spec 2026-10-12, fix (d)): a member that sits out the rest of the run has no panel seat; it
      // is disclosed once, on the answer (RUN_PANEL_REVISED), not as a failed seat on every node.
      const plannedSeats = seatBook.judge.filter((seat) => !seatSitsOut(seat)).map((seat) => {
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
        return { seat, panelOptions, planned: seatCaller.plan(seat, input.callSiteKey, panelOptions) };
      });
      // Final review I2: the `panelCallCap` seats this node calls, going round the
      // judge seats from a SITE-PURE offset (`seatRotationOffset`: run, role, base
      // key), never always the first ones — so across nodes every seat the drawer
      // lists judges, and a resumed pass calls the same seats at every node. The
      // per-node count is unchanged (DR-184-v5), and on the legacy book the cap
      // never binds, so every eligible seat is called there exactly as before.
      const calledSeats = rotatedSeatSelection(
        plannedSeats.map((entry) => entry.planned !== null),
        panelCallCap,
        seatRotationOffset({ runId: run.runId, role: "JUDGE", callSiteKey: input.callSiteKey })
      );
      type PlannedPanelSeat = (typeof plannedSeats)[number];
      // One called seat's panel member — the base panel's and, on a shaped run, the close-call extension's.
      const memberFor = (
        seat: PlannedPanelSeat["seat"],
        panelOptions: PlannedPanelSeat["panelOptions"],
        planned: NonNullable<PlannedPanelSeat["planned"]>
      ) => ({
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
              argumentLanguageName: run.argumentLanguageName,
              ...shapeLanguageInput,
              ...lengthGuideOf("judge_panel"),
              statement: input.statement,
              authorMaker: input.authorMaker,
              providerRef: member.providerRef,
              contractHash: judgeContractHash,
              bound: guidedCallBound(this.settings.judgeBound, "judge_panel", lengthGuidance)
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
      });
      // Task 11 fix round 1 (controller ruling T11-M): on a shaped run, the makers seated on this node's called seats —
      // a seat's backup never repeats one of them, nor the author's (`shapeDistinctMakerOptions`). Unused today.
      const calledMakers = plannedSeats.flatMap((entry, index) =>
        calledSeats[index] === true && entry.planned !== null ? [entry.planned.maker] : []);
      const panelMembers = plannedSeats.flatMap(({ seat, panelOptions, planned }, seatPosition) => {
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
        if (calledSeats[seatPosition] !== true) return [];
        return [memberFor(seat, shapeDistinctMakerOptions(panelOptions, shapeRun === null
          ? null
          : { ownMaker: planned.maker, taken: new Set([input.authorMaker, ...calledMakers]) }), planned)];
      });
      const panel = await runJudgePanel({
        artifactProducerRef: input.authorProviderRef,
        primary: {
          judgementRef: input.authorJudgementRef,
          assessment: input.authorAssessment,
          memberRole: input.authorMaker
        },
        members: panelMembers,
        // Ruling R32: one member at a time on today's serial path; all at once
        // only when this debate's lane admits more than one call.
        askTogether: callsRunTogether,
        // Task M2: only the first root's panel keeps the voices it heard when a
        // spend stop cuts it short; every other panel lets the stop travel.
        onRunLevelSpendStop: input.onSpendStop === "AUTHOR_ONLY" ? "RETURN_HEARD" : "RETHROW",
        // B9 (budget spec §2.9, the Panel seats row): with cheaper models on, a
        // seat refused for money is left out as a failed seat is, on EVERY panel
        // (root 0's included), and the panel carries on; the attempt ceiling and
        // a vendor with no usage keep the rule above. It never sets
        // runBodyBudgetStop: the next authoring call gets its own (free) fallback
        // try, and the arguing stops only when a movable call fits no maker.
        leaveOutMoneyRefusedSeats: this.settings.bodyCostFallback === true
      });
      /**
       * Task M2 — THE FIRST ROOT'S PANEL, CUT SHORT BY A SPEND STOP.
       *
       * The panel returned what it had gathered: the author, every member
       * voice already heard (and paid for), and every note — asked one at a
       * time, it ended where the stop stood; asked together (ruling R32), every
       * voice that came back around the stop is kept. They go through the SAME reduction as any panel whose remaining
       * members could not speak, so the disclosure is the existing one:
       *
       *  · one or more member voices heard -> selection over the author and
       *    those voices, PANEL-PARTIAL, exactly as a member failure degrades
       *    the panel (no single-voice step-down);
       *  · none heard -> the author alone; with one candidate the selection is
       *    exactly `authorOnlySelection()` (same judgement, tau and earned
       *    weight), with the single-voice disclosure and its step-down.
       *
       * Either way the stop is handed back for the caller to record.
       */
      const spendStop = Object.hasOwn(panel, "stoppedBy")
        ? panelSpendStop(panel.stoppedBy, input.onSpendStop)
        : null;
      if (Object.hasOwn(panel, "stoppedBy") && spendStop === null) throw panel.stoppedBy;

      // Task 11: today's reduction, statement for statement, as one local function — the close-call extension
      // re-reduces every voice heard through it.
      const reduceHeard = (voices: typeof panel.judgements) => {
        // Engine redesign R2 (spec §4.2, INTERFACE §6.2): engine 2 reduces the same voices by the honest median
        // (engine-reduce.ts); the close-call extension below re-reduces through here, so its extras enter the median too.
        if (honestRule !== null && engine.engine === 2) {
          return reduceHonest({
            voices, authorJudgementRef: input.authorJudgementRef, engine, panel: panelPolicy,
            earnedWeight: judgementPolicy.earnedWeight, rule: honestRule
          });
        }
        // Each member's assessment is reduced through the SAME ratified
        // composition as the author's, so the taus are commensurable.
        const reducedMembers = voices.flatMap((entry) => {
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
        return { reducedMembers, dispersion, weighted, selection };
      };
      let reduced = reduceHeard(panel.judgements);
      /** The base panel's own reduction (J graders), before any close-call extra: what its degradation marks read. */
      const baseReduced = reduced;

      // Debate shape (spec §3.3 step 6; §6: the highest-voice rule is unchanged) — THE CLOSE-CALL EXTENSION. A
      // measured spread at or above the disagreement threshold calls up to E more graders, of makers neither the
      // author's nor already called at this node; their voices come AFTER every voice heard and the node is reduced
      // again. Never on today's run (`shapeRun === null`).
      let heard = panel.judgements;
      let notes = panel.notes;
      let closeCallAdded = 0;
      let closeCallStop: EnvelopeStopKind | null = null;
      const firstDispersion = reduced.dispersion.kind === "MEASURED" ? reduced.dispersion.value : null;
      if (shapeRun !== null && spendStop === null
        && shapeCloseCallFires(firstDispersion, panelPolicy.disagreementThreshold, shapeRun.shape.closeCallExtraGraders)) {
        // Pre-flight PF-B34: every maker already CALLED at this node — the ones heard and the ones that failed — so no
        // panel key (`PANEL:<node>:<providerRef>`, `panelKeyFor`) is ever asked twice.
        const onPanelMakers = [...heard.map((entry) => entry.memberRole), ...calledMakers];
        const extraSeats = shapeCloseCallExtraSeats({
          seatMakers: plannedSeats.map((entry) => entry.planned?.maker ?? null),
          called: calledSeats,
          authorMaker: input.authorMaker,
          onPanelMakers,
          extra: shapeRun.shape.closeCallExtraGraders,
          offset: seatRotationOffset({ runId: run.runId, role: "JUDGE", callSiteKey: `${input.callSiteKey}:close-call` })
        });
        if (extraSeats.length > 0) {
          const extension = await runJudgePanel({
            artifactProducerRef: input.authorProviderRef,
            primary: { judgementRef: input.authorJudgementRef, assessment: input.authorAssessment, memberRole: input.authorMaker },
            // Fix round 1 (owner ruling: graders from other makers): an extra seat's backup never repeats a maker already
            // on this node — the author's, one heard or called, or another extra seat's.
            members: extraSeats.map((index) => {
              const extra = plannedSeats[index]!;
              const taken = new Set([input.authorMaker, ...onPanelMakers, ...extraSeats.map((other) => plannedSeats[other]!.planned!.maker)]);
              return memberFor(extra.seat, shapeDistinctMakerOptions(extra.panelOptions, { ownMaker: extra.planned!.maker, taken }), extra.planned!);
            }),
            askTogether: callsRunTogether,
            // Pre-flight PF-B32 (law: always an answer): the SAME rule as the base panel — root 0's panel (AUTHOR_ONLY)
            // keeps what its extension heard and gets the stop back; every other panel lets it travel. Written "TRAVEL"
            // first on purpose: tests/architecture/v28-serve-decision-wiring.test.ts pins the base panel's own mapping
            // text exactly ONCE in this file (PANEL_STOP_MAPPING).
            onRunLevelSpendStop: input.onSpendStop === "TRAVEL" ? "RETHROW" : "RETURN_HEARD",
            leaveOutMoneyRefusedSeats: this.settings.bodyCostFallback === true
          });
          // The author is judgements[0] of both runs: kept once. The extras come AFTER every voice already heard. A stop
          // the extension handed back is classified by the base panel's own rule, or rethrown (shapeCloseCallFold).
          const folded = shapeCloseCallFold({ heard, notes, extension, stopOf: (error) => panelSpendStop(error, input.onSpendStop) });
          heard = folded.heard;
          notes = folded.notes;
          const heardExtras = folded.added;
          closeCallStop = folded.spendStop;
          if (heardExtras > 0) reduced = reduceHeard(heard);
          // Controller ruling T14-P: the extension's count is the extras that REDUCED (a heard extra the reduction
          // could not use is not a voice on this node), never the extras merely heard.
          closeCallAdded = reduced.reducedMembers.length - baseReduced.reducedMembers.length;
        }
      }
      // Pre-flight PF-B32: the stop that cut this panel short — the base panel's, else its extension's.
      const panelStop = spendStop ?? closeCallStop;
      const { reducedMembers, dispersion, weighted, selection } = reduced;
      /** Engine 2's honest grades, median and source (INTERFACE §6.2); null on engine 1. */
      const honestRecord = "honest" in reduced ? reduced.honest : null;

      // confirm-item 5. The author is always judgement[0]; every other entry is
      // a non-author voice that actually parsed.
      const nonAuthorVoices = reducedMembers.length - 1;
      // A15d (controller carry 10): a paid voice the panel refused after the
      // call is lost exactly as a failed member is, and is disclosed with it.
      // Controller ruling T14-P (debate shape): the degradation is the BASE panel's — an optional close-call extra that
      // failed, or a stop its extension met, never marks a complete J panel PANEL-PARTIAL (the extension is an extra;
      // what it added shows on its PANEL-CLOSE-CALL-EXTENDED record's count). Without an extension (every unshaped
      // run) the base panel IS the panel: today's marks, byte for byte.
      const { marks, panelFailureReason } = panelDegradationOf(baseReduced.reducedMembers.length - 1, panel.notes, spendStop);

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
            notes: panelNoteRecords(notes),
            // Task M2: present only on a panel a spend stop cut short.
            ...(panelStop === null ? {} : { spendStop: ENVELOPE_STOP_REASONS[panelStop] })
          }),
          // Engine redesign R2 (INTERFACE §6.2): present only on engine 2, after `panel`; engine 1's record keeps its bytes.
          ...(honestRecord === null ? {} : { honest: honestRecord })
        }),
        spendStop: panelStop,
        closeCallAdded
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
        ...callSite,
        // Run resilience (spec 2026-10-12, fix (b)): on the preview each maker's attempts are its own, as the
        // counting gateway counts them (`attemptScope`), so the serve fallback's hops never end the work item here.
        ...(this.settings.runResilience === undefined ? {} : { byActor: true })
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
    // Pre-flight PF-B42: hoisted, so a shaped run can restore its roots' answerers in its own root order (below). It
    // stays empty without an assigned seat book, so nothing is restored, as today.
    const answeredSlotBySite = new Map<string, SeatSlot>();
    if (seatBook.assigned) {
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
      // Task 13 fix round 1: a shaped run's root i is the i-th seat in the shape's root order (`shapeSeatOrder`, as
      // `rootSeats` below), so its roots 0 and 1 are read there; today's run reads the seat book's own order.
      const claimRootSeats: readonly RunSeat[] = shapeRun === null ? seatBook.position : shapeSeatOrder(seatBook.position);
      for (const [rootIndex, siteKey] of [[0, "JUDGE"], [1, "JUDGE:root:secondary"]] as const) {
        const seat = claimRootSeats[rootIndex];
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

    /**
     * C1 (review round 2) — WHICH SPEND BOUND, IF ANY, STOPPED THIS RUN BODY.
     *
     * Set by the first root's panel and by the authoring, expansion and review
     * phases when the gateway refuses on money, on the attempt ceiling or on an
     * unbillable vendor. It is NOT an error path: the phase stops where it is,
     * and the run keeps everything it has produced. `null` all the way through
     * is a run that was never stopped by a spend bound.
     *
     * ENGINE MONEY RULE (spec §14.4.1), TASK M2 — IT STOPS THE ARGUING, NOT THE
     * ANSWER. It used to be read at the serve gate to FORCE the components-only
     * envelope terminal, so a stopped run never reached the answer-writer. Now
     * nothing more is argued, the run goes on to serve with the tree as it
     * stands, and the stop rides the answer as its envelope record
     * (`runBodyStopDisclosure`), so a reader is still told the debate was cut
     * short.
     *
     * RE-REVIEW: declared before the secondary and additional ROOT loops, so a
     * refusal while authoring root 1 or 2 keeps the root 0 already minted and
     * panelled. Task M2 declares it before root 0 itself, because a stop on
     * root 0's own panel is recorded here too instead of failing the run.
     */
    let runBodyBudgetStop: EnvelopeStopKind | null = null;
    // Reclaim resume: an earlier copy's nodes are set aside before anything is argued — after every claim-time refusal
    // above (a run refused here keeps its tree as it was), and after an answer that copy already served was settled.
    if (replayBook.earlierNodes > 0) await this.#graph.retireNodes(run.runId, [], retireClaim());
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
    /**
     * Run resilience (spec 2026-10-12, fix (d)) — WHICH SEAT WRITES EACH ROOT. Root i is position seat i, as always,
     * unless root 0's own member sat out: then the next member that does not sit out opens, and the two seats trade
     * roots, so the member that sat out holds the later root, which is dropped like any other root of a member that
     * sits out (`rootSitsOut`). Without the sit-out book nothing ever trades and this is the seat book's own order.
     */
    const rootSeats: RunSeat[] = [...seatBook.position];
    // Debate shape (spec §3.3 step 2): positions go to different makers first, the opener (seat 0) staying first.
    if (shapeRun !== null) rootSeats.splice(0, rootSeats.length, ...shapeSeatOrder(rootSeats));
    if (shapeRun !== null) {
      // Pre-flight PF-B42: a shaped run's root i is rootSeats[i] (shapeSeatOrder), not position seat i, so who answered
      // each root is restored in root order, from the same ledger read as today's restore above.
      positionAnswerers.clear();
      rootSeats.forEach((seat, rootIndex) => {
        const siteKey = rootIndex === 0 ? "JUDGE" : rootIndex === 1 ? "JUDGE:root:secondary" : `JUDGE:root:${String(rootIndex)}`;
        const slot = answeredSlotBySite.get(siteKey);
        const restored = [seat.main, seat.runnerUp].find((member): member is SeatMember => member !== null
          && member.pinnedAs === slot && spentSeatSlots.get(siteKey) !== slot);
        if (restored !== undefined) positionAnswerers.set(rootIndex, restored);
      });
    }
    /**
     * Debate shape, Stage 1 (spec §1, §3.3 step 1, §3.5): the map, before root 0. A re-claimed run finds its stored map
     * and asks nothing again; a spend stop that map met is restored (`resolveShapeMap`). A copy of the run that loses the
     * race to store its map argues the stored one. A stop during the map (money, attempts, lane) ends it with the code's
     * fallbacks; the arguing then stops after root 0 and the answer is written (O6). Controller ruling T12-R0: every map
     * call keeps room for root 0's first attempt + one retry (`rootZeroKeepRoomMicros`, ruling T12-R3), so a started
     * debate can always pay its first position. A keep-alive refusal abandons the run, as today. Never on today's run
     * (`shapeRun === null`): no map, no call, no storage.
     */
    let debateShapeMap: MapResult | null = null;
    let shapeMapResult: MapResult | null = null;
    let mapSpendStop: EnvelopeStopKind | null = null;
    if (shapeRun !== null) {
      const runMap = async (): Promise<Readonly<{ result: MapResult; spendStop: EnvelopeStopKind | null }>> => {
        /** PF-B40: map seats outside the claim-eligible list, wrapped once each. */
        const mapOnlyMembers = new Map<string, ConfiguredSeatMaker>();
        // T12-R0 / T12-R2 / T12-R3: root 0's room, at the dearest member of root 0's OWN seat (and the seat it is handed
        // to when its member sits out); hosted prices only. It covers root 0's first attempt + one retry, the larger of a
        // length retry and a format repair (`rootZeroRoomAttempts`, `rootZeroKeepRoomMicros`), plus, on a routed run, the
        // structure-repair call (the sum: refused-repair salvage B is root 0's own second POST after it).
        const providerPrices = this.settings.providerPrices ?? EMPTY_PROVIDER_PRICES;
        const rootZeroPrices = rootZeroRoomRefs({ seats: rootSeats, membersOf, canHandOver: sitOut !== null, sitsOut: seatSitsOut })
          .flatMap((providerRef) => { const price = providerPrices.get(providerRef); return price === undefined ? [] : [price]; });
        // LG-A (Task 14 carry): on a routed run root 0 may also send the structure-repair call, at the repair target's price.
        const repairCeiling = this.settings.structureRepairCeiling ?? null;
        const repairPrice = repairCeiling === null ? undefined : providerPrices.get(repairCeiling.providerRef);
        const keepRoomMicros = rootZeroKeepRoomMicros({ prices: rootZeroPrices, ...rootZeroRoomAttempts({
          questionLine: run.questionLine, argumentLanguageName: run.argumentLanguageName, questionLanguage: shapeLanguage,
          tokenCeiling: guidedCallBound(this.settings.judgeBound, "opening", lengthGuidance).tokenCeiling,
          lengthed: lengthGuidance !== null,
          // Ruling "PF-C5 root-0 bound" (a): with the row, root 0's map material is bounded by the runaway limits (L19).
          materialChars: rootEngineMaterialChars ?? rootMaterialChars }),
          structureRepair: repairCeiling === null || repairPrice === undefined ? null : { price: repairPrice,
            attempt: { requestBytes: repairCeiling.requestBytes, completionTokenCeiling: repairCeiling.completionTokenCeiling } } });
        const mapCaller = createRunnerMapCaller({
          runId: run.runId, subjectItemId: claimed.workItemId, mapContractHash: shapeRun.mapContractHash,
          judgeBound: this.settings.judgeBound,
          longBounds: { merge: shapeRun.shape.mapMergeBound, choose: shapeRun.shape.mapChooseBound },
          // Pre-flight PF-B40: an assigned (scorecard) seat book is built from `configuredByProviderRef` and can name a
          // route outside the claim-eligible `configuredMakers`; such a map seat calls through the same wrappers
          // (`sitOutMaker`: the sit-out book, `throughCallLane`, the failure observer), never as BUSY for good.
          memberOf: (aiRef) => {
            const eligible = configuredMakers.find((maker) => maker.providerRef === aiRef);
            if (eligible !== undefined) return eligible;
            const configured = configuredByProviderRef.get(aiRef);
            if (configured === undefined) return null;
            const wrapped = mapOnlyMembers.get(aiRef) ?? sitOutMaker(configured);
            mapOnlyMembers.set(aiRef, wrapped);
            return wrapped;
          },
          sitsOut: (aiRef) => sitOut !== null && sitOut.sitsOut(aiRef),
          satOutBy: (error) => sitOut !== null && sitOut.haltsAtOnce(error),
          spendStopOf: expansionPhaseStop,
          laneStopped: (error) => callHeldBack(error) || (error instanceof TypedDomainError && error.code === CALL_LANE_STOPPED),
          abandon: keepAliveStop,
          serial: !callsRunTogether,
          keepRoomMicros,
          // T12-R1: a refusal only because of root 0's room stops the map, never the arguing.
          roomKept: (error) => error instanceof TypedDomainError && error.code === RUN_COST_ENVELOPE_ROOM_KEPT,
          // Length guidance (spec 2026-10-15 §3.3): the receipt's numbers size each map call's allowance.
          lengthGuidance,
          // Engine redesign R3: an engine-2 map call records the engine seal (R1d's per-run refusal above guarantees the
          // engine settings for an engine receipt).
          ...(engineMap ? { engineContractHash: this.settings.engine!.engineContractHash } : {})
        });
        // Spec §2.3 (O6), the map's own guard: once the map has stopped, no queued map call starts.
        callLane?.guardStarts(() => !mapCaller.stopped());
        try {
          const result = await runMapStage({ opening: shapeRun.shape.opening, map: {
            questionLine: run.questionLine, languageName: run.argumentLanguageName, languageTag: run.argumentLanguageTag,
            seats: mapStageSeats(rootSeats, shapeRun.shape.mapAIs), caller: mapCaller, abandon: keepAliveStop, seed: run.runId,
            gapRoundsMax: shapeRun.shape.gapRounds, maxAnswers: shapeRun.shape.answers, pointsPerAnswer: shapeRun.shape.pointsPerAnswer,
            // Length guidance (spec 2026-10-15 §3.2): the receipt's map targets; absent = today's map.
            ...(lengthGuidance === null ? {} : { length: Object.freeze({ targets: lengthGuidance.map,
              charactersPerWord: lengthGuidance.charactersPerWord }) }),
            // Engine redesign R3 (spec §5): the v2 contracts, no code-sided points, and ONE answer check after choose.
            ...(engineMap && engine.engine === 2 ? { engine: { answerCheckCandidates: engine.answerCheck.candidates } } : {})
          } });
          return Object.freeze({ result, spendStop: mapCaller.spendStop() });
        } catch (error) {
          callLane?.stop();
          // Controller ruling T12-W: wait for the map calls already sent before the refusal leaves, so their MODEL_CALL
          // and spend rows land inside this run's execution and nothing of the map runs on after it is abandoned. The
          // wait is bounded: each of those calls ends by its own deadline (the gateway's per-attempt timeout), and the
          // caller sends nothing more once it has seen the refusal.
          await mapCaller.settled();
          throw error;
        } finally {
          callLane?.guardStarts(null);
        }
      };
      const resolved = await resolveShapeMap({
        store: this.#mapChoices, runId: run.runId, runMap,
        // Pre-flight PF-B31: never fewer than two positions (buildShapePlan refuses fewer; the receipt's answers is ≥ 2).
        // Ruling T-P5: never more than the map stores either (`shapePositionCount` holds MAP_LIMITS.chooseAnswersMax).
        answerCount: () => shapePositionCount(shapeRun.shape.answers, shapeDistinctMakers(rootSeats, seatSitsOut)),
        spendStopOfCode: (code) => expansionPhaseStop(new TypedDomainError(code, code)),
        // Engine redesign R3 (spec §5.2 item 8): the stored also-raised list lists unchosen answers under engine 2.
        unchosenAnswers: engineMap
      });
      shapeMapResult = resolved.result;
      mapSpendStop = resolved.spendStop;
      if (shapeMapResult.kind === "MAP" && shapeMapResult.choice !== null) debateShapeMap = shapeMapResult;
    }
    /** True when every member of root `rootIndex`'s seat sits out the rest of the run (never without the book). */
    const rootSitsOut = (rootIndex: number): boolean => rootSeats[rootIndex] !== undefined && seatSitsOut(rootSeats[rootIndex]!);
    /**
     * Fix (d): the roots dropped because their member sat out (`satOutDuringRun`), instead of
     * MAKER_POSITION_UNAVAILABLE: their subtrees and cross-exchanges are never planned, and the answer discloses the
     * members through RUN_PANEL_REVISED. A root HALTED by a billed failure keeps today's refusal.
     */
    const satOutDuringRun = new Set<number>();
    /**
     * Fix (d): fewer than two members left to argue ends the arguing — a stop that is not money, so it never rides
     * the answer as an envelope record — and the run goes on to its answer with what it has. Set once, never unset.
     */
    let membersSatOutStop = false;
    /**
     * The members left to argue. Debate shape (Task 15, binding note 3): a SHARE hand-over puts one seat in two
     * positions, so a shaped run counts the distinct MAKERS of the seats that do not sit out (`shapeDistinctMakers`,
     * what P is sized with) — a seat counted twice is still one maker. Row absent: today's count of seats.
     */
    const membersLeftToArgue = (): number => shapeRun !== null ? shapeDistinctMakers(rootSeats, seatSitsOut)
      : rootSeats.filter((_seat, rootIndex) => !rootSitsOut(rootIndex)).length;
    const tooFewLeftToArgue = (): boolean => {
      if (sitOut !== null && effectiveMakerCount > 1 && !membersSatOutStop) {
        membersSatOutStop = membersLeftToArgue() < 2;
      }
      return membersSatOutStop;
    };
    /**
     * Ruling R26b — WHERE IN TODAY'S ORDER TOO FEW MEMBERS WERE FIRST LEFT: the rank of the chain step whose failed call
     * made the deciding member sit out (or whose reviewer choice found every reviewer sitting out); `[]` — before
     * everything — for a call made outside the chains. Read only by a round boundary's decision (`argueTogether`).
     */
    let tooFewRank: readonly number[] | null = null;
    const noteTooFew = (rank: readonly number[]): void => { tooFewRank ??= rank; };
    afterFailedCall = () => {
      if (tooFewRank !== null || effectiveMakerCount <= 1) return;
      if (membersLeftToArgue() < 2) noteTooFew(chainStageScope.getStore()?.rank ?? []);
    };
    /**
     * Parallel AI calls (spec 2026-10-12 §2.1) — THE PLAN, KNOWN BEFORE ROOT 0. Both plans are pure functions of the
     * depth and the maker count, so every node's PLAN POSITION is fixed before any call: root i → i, expansion leg
     * j → M + j (its `childIndex`), cross-exchange k → M + E + k. Nodes are saved, and reviews recorded, in that
     * order — today's serial order — whatever order the calls finish in.
     *
     * PRO-01 × PANEL-01: each independently authored root owns its own B3-B breadth-first pro/con tree, with real
     * per-node maker lineage.
     */
    /**
     * Debate shape (spec §3.3 steps 2–5; plan Task 13) — THE SHAPE'S PLAN, in place of today's: P roots, each arguing a
     * DISTINCT chosen answer (assigned-root; without a map, today's opening for the first P seats), K chosen points
     * each and ONE cross-reply each in round 1, then one exchange per kept chain per deeper round, breadth-first, then
     * the reserved scrutiny slots. P is the receipt's answers, lowered to the distinct makers left, never below two
     * (`shapePositionCount`, pre-flight PF-B31); a map that hands back fewer than two answers argues today's opening.
     * Null on today's run: today's plan, value for value.
     */
    const shapeAnswerCount = shapeRun === null ? 0
      : shapePositionCount(shapeRun.shape.answers, shapeDistinctMakers(rootSeats, seatSitsOut));
    const shapeMapPositions = shapeRun === null || debateShapeMap === null || debateShapeMap.choice === null ? null
      : shapePositionsFromMap({ choice: debateShapeMap.choice, keyPoints: debateShapeMap.keyPoints,
        answers: shapeAnswerCount, pointsPerAnswer: shapeRun.shape.pointsPerAnswer, ring: engine.engine === 2, engineMap });
    /** Ruling C-TWO: the map's own answers are argued (two or more); the story and the debate page share this rule. */
    const shapeMapArgued = shapeMapPositions !== null && mapAnswersArgued(shapeMapPositions.length);
    const shapePositions: readonly ShapePositionPlan[] | null = shapeRun === null ? null
      : shapeMapArgued ? shapeMapPositions
        : shapePositionsForTodaysOpening({ answers: shapeAnswerCount, pointsPerAnswer: shapeRun.shape.pointsPerAnswer, ring: engine.engine === 2 });
    const shapePlan: ShapePlan | null = shapeRun === null || shapePositions === null ? null : buildShapePlan({
      positions: shapePositions, depth: expansionDepth,
      scrutiny: { roundsPerPoint: shapeRun.shape.scrutinyRoundsPerPoint, pointsPerDebate: shapeRun.shape.scrutinyPointsPerDebate }
    });
    /** THE NUMBER OF ROOTS: the shape's P, or today's one root per maker. */
    const rootCount = shapePlan?.rootCount ?? effectiveMakerCount;
    const expansionPlan: readonly MultiMakerExpansionLeg[] = shapePlan !== null ? shapePlan.legs
      : effectiveMakerCount > 1 ? buildMultiMakerExpansionPlan(expansionDepth, effectiveMakerCount) : [];
    const crossExchangePlan = shapePlan !== null ? [] : buildCrossRootExchangePlan(effectiveMakerCount);
    const totalPlannedNodes = shapePlan?.totalPlannedNodes ?? effectiveMakerCount + expansionPlan.length + crossExchangePlan.length;
    /** The scrutiny legs, once scrutiny has chosen its nodes (Task 14); empty until then. */
    const scrutinyLegs = new Map<number, ShapeLeg>();
    /** A plan position's shape leg (a root has none), or null on today's run. */
    const shapeLegAt = (position: number): ShapeLeg | null => shapePlan === null ? null
      : (shapePlan.legs[position - shapePlan.rootCount] ?? scrutinyLegs.get(position) ?? null);
    /** Adaptive (spec §3.3 step 5): the deeper legs of the chains NOT kept at the round-1 boundary — never sent. */
    const deselectedIndices = new Set<number>();
    /** A shaped run always argues through the chains; with no concurrency row its lane holds one call at a time. */
    const chainsRun = callsRunTogether || shapePlan !== null;
    // T7 / S3-2 + S5-1 · ruling J15(a) — adaptive stopping, evaluated at the
    // DERIVED global round boundary. `leg.round` resets at every root in this
    // root-major plan, so a change in it is not a boundary; round k completes at
    // the LAST leg carrying round k, when every root has finished round k.
    const globalRoundCompletions = deriveGlobalRoundCompletions(expansionPlan);
    /** A promise and the function that settles it, for a result another chain waits on (first settle wins). */
    const settable = <T>() => {
      let resolve!: (value: T) => void;
      const promise = new Promise<T>((settle) => { resolve = settle; });
      return Object.freeze({ promise, resolve });
    };
    /**
     * Debate shape (spec §3.3 step 7) — THE NODES SCRUTINY CHOSE, each with the plan position it holds: set once by the
     * scrutiny chain in `argueTogether`, and read after the arguing for their SCRUTINY-EXTENDED records. Nothing (`[]`)
     * when no scrutiny slot is planned (today's run; a zero scrutiny budget), when scrutiny never ran (a stop, too few
     * members, a failure), or once the arguing is over without it (first settle wins).
     */
    const scrutinyChosen = settable<readonly { readonly position: number; readonly nodeId: string }[]>();
    if (shapePlan === null || shapePlan.scrutiny.count === 0) scrutinyChosen.resolve([]);
    /**
     * An ordered recorder (ordered-recorder.ts) whose positions are each claimed once: committed, or given up by a
     * chain that has nothing (more) to write there (`skip`, harmless for a position already claimed), so no later
     * position ever waits on a chain that stopped, was dropped or failed. `skipBelow` gives up every unclaimed
     * earlier position — for the serial phases, where none of them can be claimed any more.
     */
    const positionRecorder = (size: number) => {
      const recorder: OrderedRecorder = createOrderedRecorder(size);
      const claimed = new Set<number>();
      /** Each position's turn, over: its write has settled, or it was given up. */
      const settled = Array.from({ length: size }, () => settable<void>());
      const skip = (position: number): void => {
        if (claimed.has(position)) return;
        claimed.add(position);
        recorder.skip(position);
        settled[position]!.resolve();
      };
      return Object.freeze({
        /** Ordered-recorder rule: the write may START inside this call; everything it reads is set up before. */
        commit: <T>(position: number, write: () => Promise<T>): Promise<T> => {
          claimed.add(position);
          const written = recorder.commit(position, write);
          written.then(() => settled[position]!.resolve(), () => settled[position]!.resolve());
          return written;
        },
        skip,
        skipBelow: (end: number): void => {
          for (let position = 0; position < end; position += 1) skip(position);
        },
        /** Resolves once every position below `end` has been written or given up. */
        through: async (end: number): Promise<void> => {
          await Promise.all(settled.slice(0, end).map((turn) => turn.promise));
        },
        /** Resolves once every position has been written or given up. */
        done: (): Promise<void> => recorder.done()
      });
    };
    type PositionRecorder = ReturnType<typeof positionRecorder>;
    /** Nodes, in plan order. */
    const nodeRecorder = positionRecorder(totalPlannedNodes);
    /** Each node's reviewer choice, in review order (spec §2.2: the reviewer turn never depends on who finished first). */
    const reviewChoices = positionRecorder(totalPlannedNodes);
    /** Each node's review, recorded in review order. */
    const reviewRecorder = positionRecorder(totalPlannedNodes);
    /**
     * Spec §2.3 — A FAILURE THAT ENDS THE DEBATE, WITH CALLS IN FLIGHT. The chain that meets it records it with its
     * place in today's serial order (`rank`) and stops the lane: no new call starts, and a call still waiting for a
     * slot is refused unsent (CALL_LANE_STOPPED). Every other chain is awaited, so the calls already sent land their
     * receipts; then the first failure in today's order is thrown, as today.
     */
    let bodyFailed = false;
    /**
     * A chain's RANK is its place in today's serial order, compared item by item: `[batch, phase, …]` — the review
     * batch whose stretch of plan positions holds it (`reviewBatchOf`), then 0 for an author call and its panel and
     * save, 1 for a review, 2 for a re-offered review (then the pass and the place in it), 3 for the batch's round
     * boundary decision; then the plan position.
     */
    type ChainRank = readonly number[];
    const compareRanks = (left: ChainRank, right: ChainRank): number => {
      for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
        const difference = (left[index] ?? -1) - (right[index] ?? -1);
        if (difference !== 0) return difference;
      }
      return 0;
    };
    const bodyFailures: { readonly rank: ChainRank; readonly error: unknown }[] = [];
    /**
     * Ruling R26 — WHERE IN TODAY'S ORDER EACH SPEND STOP WAS RAISED: the rank of the chain step that set
     * `runBodyBudgetStop`. A round boundary's decision (no model call) runs exactly where today's loop still reaches it:
     * when no stop was raised before that boundary's own review pass (`spendStoppedFrom`).
     */
    const spendStopRanks: ChainRank[] = [];
    const noteSpendStop = (rank: ChainRank): void => { spendStopRanks.push(rank); };
    // Debate shape (spec §3.3 / O6): a stop during the map is a stop before everything in today's order.
    if (mapSpendStop !== null) { runBodyBudgetStop ??= mapSpendStop; noteSpendStop([]); }
    /** Spec §2.3 (O6): no chain starts an AUTHOR or a REVIEW call once this is true. */
    const arguingStopped = (): boolean => bodyFailed || runBodyBudgetStop !== null || tooFewLeftToArgue();
    /**
     * Spec §2.3 — THE KEEP-ALIVE STOP (claim lost, time limit) met by a chain: settled with that refusal, once. The
     * arguing (`argueTogether`) then ends at once, without awaiting the calls in flight.
     */
    const keepAliveStopped = settable<unknown>();
    /**
     * Runs one chain to its end. The returned promise never rejects: a failure is kept (above), and `release` then
     * gives up whatever recorder positions the chain did not commit. `stage.rank` moves on as the chain does.
     * Task 12: a call the lane HELD BACK (the arguing had stopped while it waited) ends the chain as a stop does — its
     * positions given up, never a failure; a keep-alive refusal is a failure, and is also told to `keepAliveStopped`.
     */
    const runChain = (body: (stage: { rank: ChainRank }) => Promise<void>, rank: ChainRank, release: () => void): Promise<void> => {
      const stage = { rank };
      return chainStageScope.run(stage, () => body(stage)).catch((error: unknown) => {
        if (callHeldBack(error)) return;
        bodyFailed = true;
        bodyFailures.push(Object.freeze({ rank: stage.rank, error }));
        callLane?.stop();
        if (keepAliveStop(error)) keepAliveStopped.resolve(error);
      }).finally(release);
    };
    /** Once every chain has settled: the first failure in today's order. A call the stopped lane refused is never the cause. */
    const throwBodyFailure = (): void => {
      const causes = bodyFailures.filter(({ error }) => !(error instanceof TypedDomainError && error.code === CALL_LANE_STOPPED));
      const first = [...(causes.length > 0 ? causes : bodyFailures)].sort((left, right) => compareRanks(left.rank, right.rank))[0];
      if (first !== undefined) throw first.error;
    };
    /**
     * Spec §3.3 step 2: root i argues answer i (assigned-root); without a map, today's legs. Binding note 2 (Task 13):
     * the material is held within root 0's limits (`shapeRootMaterial`), so the room the map kept for root 0 is a
     * ceiling; every root is framed by the same rule.
     */
    const rootLegOf = (rootIndex: number): JudgeLeg => {
      const position = shapePositions?.[rootIndex];
      if (position === undefined || position.statement === null || position.mapPoints === null) {
        return rootIndex === 0 ? { kind: "primary-root" } : { kind: "independent-root" };
      }
      if (engineMap) {
        // P2.6 (spec §5.2 item 6): the map's chosen words, whole; the writer writes only the case (judge.assigned-root.*.v2).
        // The ONE engine-2 bound computed above (pre-flight PF-R35.5); non-null whenever engineMap.
        const material = shapeEngineRootMaterial({ assignedAnswer: position.statement, mapPoints: position.mapPoints,
          pointsRaised: JSON.stringify((position.pointsRaised ?? []).map((point) => ({ text: point.text, rests_on: point.restsOn }))),
          assumptions: JSON.stringify(position.assumptions ?? []) }, rootEngineMaterialChars!);
        return { kind: "assigned-root", assignedAnswer: material.assignedAnswer, mapPoints: material.mapPoints,
          engine: { pointsRaised: material.pointsRaised, assumptions: material.assumptions } };
      }
      const material = shapeRootMaterial({ assignedAnswer: position.statement, mapPoints: position.mapPoints }, rootMaterialChars);
      return { kind: "assigned-root", assignedAnswer: material.assignedAnswer, mapPoints: material.mapPoints };
    };
    const openFirstPosition = async (primarySeat: RunSeat, leg: JudgeLeg = { kind: "primary-root" }) => {
      const primaryPlan = seatCallPlan(primarySeat, "JUDGE", positionRule(primarySeat));
      const primaryAttempt = await cooldownAttempt({
        callSiteKey: FIRST_POSITION_CALL_SITE_KEY,
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
            argumentLanguageName: run.argumentLanguageName,
            ...shapeLanguageInput,
            ...lengthGuideOf(judgeLegLengthStep(leg)),
            leg,
            providerRef: member.providerRef,
            contractHash: this.settings.judgeContractHash,
            bound: { ...guidedCallBound(this.settings.judgeBound, judgeLegLengthStep(leg), lengthGuidance), maxAttempts }
          })
        })
      }).catch((error: unknown) => {
        // Task M2 (spec §14.4.1): the author's own first call is the one stop that
        // leaves nothing to answer from. A ceiling that refuses it is below one
        // call — a configuration fault, failed typed under its own code. Anything
        // else, a vendor that reports no usage included, travels as it is.
        throw firstCallCeilingFailure(error) ?? error;
      });
      return primaryAttempt;
    };
    let primaryAttempt = await openFirstPosition(rootSeats[0]!, rootLegOf(0));
    // Fix (d): root 0 cannot be dropped — nothing would exist to answer from — so when its member sat out, the next
    // member that does not sit out opens instead (the two seats trade roots, above).
    for (let next = 1; primaryAttempt.kind === "HALTED" && rootSitsOut(0) && next < rootSeats.length; next += 1) {
      if (rootSitsOut(next)) continue;
      [rootSeats[0], rootSeats[next]] = [rootSeats[next]!, rootSeats[0]!];
      primaryAttempt = await openFirstPosition(rootSeats[0]!, rootLegOf(0));
    }
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
    // B9: the node's author is the model that actually wrote it — the member
    // that answered root 0, or the cheaper maker its refused first call moved to.
    const rootAuthor = actualAuthor(FIRST_POSITION_CALL_SITE_KEY, primaryMaker);
    /**
     * Pre-flight PF-B45: per plan position, the maker that REALLY wrote it (the runner-up, or a cheaper maker a refused
     * call moved to), recorded before its statement is told — the shape's writer rule reads it, never the planned maker.
     */
    const answeredMakers: (string | undefined)[] = [];
    answeredMakers[0] = rootAuthor.maker;
    const reduced = reduceAssessment({
      claimType: judged.normalizedClaim.claimType,
      assessment: judged.assessment,
      compositionRow,
      reducerVersion: judgementPolicy.reducerVersion
    });
    if (reduced.kind !== "REDUCED") {
      throw new TypedDomainError("COMPOSITION_UNRESOLVED", `No ratified composition for ${reduced.claimType}`);
    }

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
       * Debate shape (spec §3.3 step 7): the node's panel-selected base score (its reduced judgement's tau), read by
       * scrutiny's "weak" need. Carried on every run; only a shaped run reads it.
       */
      readonly baseTau: number;
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
    /**
     * Every node saved so far, keyed by its PLAN POSITION (root i → i, expansion leg j → M + j, cross-exchange k →
     * M + E + k). Nodes are saved through the node recorder, in plan order, so this map's insertion order — the order
     * reviews are taken in — is today's serial order whatever order the calls finished in.
     */
    const authoredNodes = new Map<number, AuthoredDebateNode>();
    /**
     * Engine redesign R3 (spec §5.2 items 2, 6; cross-plan ruling PF-R41.7): the map's words, assumptions and bases for
     * every reader (investigations, judges, the writer's verdict material, the story), from the nodes saved so far
     * (`authoredNodes`, synchronous: never a chain's pending slot, pre-flight PF-R35.10). Read after the arguing, when every
     * position and point is saved. Null on engine 1, today's opening or a map fallback.
     */
    const engineMapFactsNow = (): EngineMapFacts | null => engineMap && shapeMapArgued && shapePositions !== null && shapePlan !== null
      && debateShapeMap !== null
      ? engineMapFactsOf({ positions: shapePositions, legs: shapePlan.legs, keyPoints: debateShapeMap.keyPoints,
        nodeIdAt: (position) => authoredNodes.get(position)?.nodeId ?? null })
      : null;
    const haltedExpansionRecords: HaltedExpansionRecord[] = [];
    // S2-3 / J5: way-of-knowing downgrades are bound to the node the graph
    // minted, never to the work item the judge was called with (codex T4-r1 B2).
    const wayOfKnowingDowngrades: WayOfKnowingDowngradeRecord[] = [];
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
    /**
     * Engine 2 (spec §4.2a rule 2; INTERFACE §7.2): each cross-reply's support link to its own answer, recorded where
     * the cross-reply is saved (`argueShapeCross`, `crossChain`, the serial cross-exchange). It stays in the graph and
     * on record; the link rules give it no weight. Empty on engine 1.
     */
    const ownReplyEdgeIds = new Map<string, readonly string[]>();
    /**
     * A14's investigation calls fill this (a cannot-assess point's investigation outcome as a review status) before
     * `engineServeLinked` is read; A14 writes its investigation rows only after the serve decision, on the served graph.
     */
    const engineInvestigated = new Map<string, EngineReviewStatus>();
    const noteOwnReplyEdges = (saved: AuthoredDebateNode): void => {
      if (engine.engine !== 2) return;
      ownReplyEdgeIds.set(saved.nodeId, Object.freeze(
        saved.sourcedEdges.filter((edge) => edge.polarity === "support").map((edge) => edge.edgeId)));
    };
    /**
     * Engine 2: the link rules on a materialised graph, read from the reviews recorded so far (a disputed point counts
     * for less, an own reply is not support, a cannot-assess point keeps its links at the reduced weight and its
     * standing). Null on engine 1: the caller keeps today's graph and seed.
     */
    const engineLinkedGraphNow = async (graph: EvaluationSnapshot, reviewedNodeIds: readonly string[]):
      Promise<EngineLinkedGraph | null> => {
      if (engine.engine !== 2) return null;
      const [disputedNodeIds, cannotAssessNodeIds] = effectiveMakerCount <= 1
        ? [[], []] as const
        : await Promise.all([this.#judgements.readDisputedNodeIds(run.runId), this.#judgements.readCannotAssessNodeIds(run.runId)]);
      return engineLinkedGraph({ engine, snapshot: graph, reviewedNodeIds, disputedNodeIds, cannotAssessNodeIds,
        ownReplyEdgeIds, investigated: engineInvestigated });
    };

    /** One authoring leg: the seat that writes it, what it is asked, and where its node goes. */
    interface AuthorPositionInput {
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
      /**
       * Debate shape (Task 13 fix round 1): the makers this leg must not be written by, as a rule on every member of
       * its seat (main and backup) and on a call moved to a cheaper maker. Absent on today's legs.
       */
      readonly makerBar?: (member: Readonly<{ maker: string }>) => boolean;
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
    }
    /**
     * What one leg's author call is given (spec §2.1): a reply or a cross-exchange is asked before its parent is saved,
     * so its parent may be a `LaterParentNode` — named in its hold and halt records once saved.
     */
    type AuthorCallInput = Omit<AuthorPositionInput, "parentNodeId"> & {
      readonly parentNodeId: string | null | LaterParentNode;
    };
    /** What a node's save needs from its leg: where the node goes in the graph. */
    type SaveInput = Pick<AuthorPositionInput,
      "authorIndex" | "parentNodeId" | "childKind" | "siblingOrdinal" | "explorationDecision" | "edges">;
    /** What one leg's author call and panel produced, before anything of it is saved. */
    interface AuthoredPosition {
      readonly judged: typeof judged;
      readonly reduced: Extract<ReturnType<typeof reduceAssessment>, { readonly kind: "REDUCED" }>;
      readonly selection: Awaited<ReturnType<typeof runNodePanel>>;
      /** B9: the model that actually wrote the node (a moved call's cheaper maker). */
      readonly author: Readonly<{ maker: string; providerRef: string }>;
      /** A15: the member that ANSWERED — main or runner-up. */
      readonly member: SeatMember;
    }

    /**
     * Parallel AI calls (spec 2026-10-12 §2.1) — ONE LEG'S AUTHOR CALL AND ITS PANEL, NOTHING SAVED: the first half of
     * what `authorPosition` used to do in one go. Legs run together this way while their nodes are saved in plan order
     * (`saveAuthored`, through the node recorder). Its one database write is the leg's JUDGEMENT_SCHEDULED receipt,
     * started BESIDE the author call rather than awaited before it, so chains started together reach the call lane in
     * the order they were started; a receipt's place in the ledger follows the clock (O7). A receipt that cannot be
     * written still fails the leg, once its call has settled.
     */
    const authorAndPanel = async (
      input: AuthorCallInput,
      /**
       * Spec §2.1: told the node's statement once its author call returned, before its panel — replies start from it —
       * with the maker that actually wrote it (pre-flight PF-B45).
       */
      authoredStatement?: (statement: string, maker: string) => void
    ): Promise<
      | { readonly kind: "AUTHORED"; readonly value: AuthoredPosition }
      | { readonly kind: "HALTED"; readonly record: HaltedExpansionRecord }
    > => {
      const scheduled = this.#ledger.append({
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
      // Read once the call has settled (below); never left without a handler meanwhile.
      scheduled.catch(() => undefined);
      // One call at a time (today's engine): the receipt is written before the call, as it always was.
      if (!callsRunTogether) await scheduled;
      const childPlan = seatCallPlan(
        input.seat,
        input.callSiteKey,
        input.seat.role === "POSITION" ? positionSeatRule(input.seat, input.makerBar) : input.makerBar
      );
      if (input.makerBar !== undefined) movedCallBars.set(seatBaseCallSiteKey(input.callSiteKey), input.makerBar);
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
            argumentLanguageName: run.argumentLanguageName,
            ...shapeLanguageInput,
            ...lengthGuideOf(judgeLegLengthStep(input.leg)),
            leg: input.leg,
            providerRef: member.providerRef,
            contractHash: this.settings.judgeContractHash,
            bound: { ...guidedCallBound(this.settings.judgeBound, judgeLegLengthStep(input.leg), lengthGuidance), maxAttempts }
          })
        })
      }).catch(async (error: unknown) => {
        // The receipt was written first today; its own failure is the earlier one.
        await scheduled;
        throw error;
      });
      await scheduled;
      if (childAttempt.kind === "HALTED") return childAttempt;
      const childJudged = childAttempt.value.value;
      // A15: the member that ANSWERED — main or runner-up — is the node's maker
      // lineage, the panel's author (controller carry 8) and the reviewer rule's
      // author. Cross-exchange chains read `positionAnswerers` for their writer.
      const selectedMaker = childAttempt.value.member;
      // Pre-flight PF-B42: keyed by ROOT index on a shaped run (a root's `authorIndex`; its seat index is not its root
      // index there); by seat index, as today, otherwise.
      if (input.seat.role === "POSITION") positionAnswerers.set(shapePlan === null ? input.seat.seatIndex : input.authorIndex, selectedMaker);
      // B9: the author is the model that actually wrote this node (a moved call's cheaper maker).
      const author = actualAuthor(input.callSiteKey, selectedMaker);
      const childReduced = reduceAssessment({
        claimType: childJudged.normalizedClaim.claimType,
        assessment: childJudged.assessment,
        compositionRow,
        reducerVersion: judgementPolicy.reducerVersion
      });
      if (childReduced.kind !== "REDUCED") {
        throw new TypedDomainError("COMPOSITION_UNRESOLVED", `No ratified composition for ${childReduced.claimType}`);
      }
      authoredStatement?.(childJudged.statement, author.maker);
      // Spec §2.3: once the author call was sent, its panel always runs — it finishes a paid step.
      const childSelection = await runNodePanel({
        authorMaker: author.maker,
        authorProviderRef: author.providerRef,
        authorJudgementRef: childJudged.provenanceRef,
        authorAssessment: childJudged.assessment,
        authorTau: childReduced.tau,
        claimType: childJudged.normalizedClaim.claimType,
        statement: childJudged.statement,
        callSiteKey: `PANEL:${input.callSiteKey}`,
        // The PANEL assesses a node against THE DEBATE'S QUESTION. It used to
        // receive the leg's concatenated instruction string, so a parent's
        // statement rode into the panel prompt as well (DL4-F4).
        questionLine: run.questionLine,
        // A stop here travels to the phase catch that authored this node.
        onSpendStop: "TRAVEL"
      });
      return { kind: "AUTHORED", value: Object.freeze({
        judged: childJudged, reduced: childReduced, selection: childSelection, author, member: selectedMaker
      }) };
    };

    /**
     * Parallel AI calls (spec 2026-10-12 §2.1) — SAVING ONE NODE IN ITS PLAN POSITION, the second half of what
     * `authorPosition` used to do: the node, its restatement and its edges (one graph write), its way-of-knowing and
     * panel-degradation records, its reduced judgement, and its place in `authoredNodes`. Only the node recorder
     * calls it, so nodes are saved in today's serial order whatever order their calls finished in.
     */
    const saveAuthored = async (position: number, input: SaveInput, authored: AuthoredPosition): Promise<AuthoredDebateNode> => {
      const { judged: childJudged, reduced: childReduced, selection: childSelection, author } = authored;
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
      // Reclaim resume: an earlier copy's node with this author reply is this node; its recorded review is this one's.
      replayBook.adopt(childNodeId, childJudged.provenanceRef);
      if (childJudged.wayOfKnowingDowngrade !== null) {
        wayOfKnowingDowngrades.push(bindWayOfKnowingDowngrade(childJudged.wayOfKnowingDowngrade, childNodeId));
      }
      // S2-2 / J13(b): one record per node whose panel degraded, bound to the node the graph minted.
      for (const mark of childSelection.marks) {
        panelDegradations.push(Object.freeze({
          subjectRef: childNodeId,
          mark,
          reason: childSelection.panelFailureReason ?? "Every non-author panel member failed"
        }));
      }
      if (childSelection.closeCallAdded > 0) {
        closeCallExtensions.push(Object.freeze({ nodeId: childNodeId, added: childSelection.closeCallAdded }));
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
        reducerVersion: engine.engine === 2 ? ENGINE2_REDUCER_VERSION : childReduced.reducerVersion,
        judgeWeightVersion: judgementPolicy.judgeWeightVersion,
        selectedJudgementRef: childSelection.selectedJudgementRef,
        dispersion: childSelection.dispersion,
        panelContractHashes: childSelection.panelContractHashes,
        disagreement: childSelection.disagreement
      });
      const node: AuthoredDebateNode = Object.freeze({
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
        baseTau: childSelection.tau,
        authorIndex: input.authorIndex,
        maker: author.maker,
        member: authored.member
      });
      authoredNodes.set(position, node);
      return node;
    };

    /**
     * The serial phases (expansion legs and cross-exchanges; Task 11 makes them chains too): a leg, then its node
     * saved in its plan position. Serially, every earlier position is already saved or never will be, so they are
     * given up first and the save never waits.
     */
    const authorPosition = async (input: AuthorPositionInput, position: number): Promise<
      | { readonly kind: "AUTHORED"; readonly value: AuthoredDebateNode }
      | { readonly kind: "HALTED"; readonly record: HaltedExpansionRecord }
    > => {
      const authored = await authorAndPanel(input);
      if (authored.kind === "HALTED") return authored;
      nodeRecorder.skipBelow(position);
      return { kind: "AUTHORED", value: await nodeRecorder.commit(position, () => saveAuthored(position, input, authored.value)) };
    };

    /**
     * Fix (d): root `rootIndex` is dropped (`satOutDuringRun`) when its member sits out; false otherwise. Debate shape
     * (spec §3.3 step 2, INTERFACE §7; pre-flight PF-B41): before the root's first call (`beforeCall`), a shaped run
     * hands the root over to a working seat instead (SWAP with a seat no root uses, or SHARE one), and it is not
     * dropped. After a call was made under the old seat it is never handed over: the root is dropped as today.
     */
    const dropSatOutRoot = (rootIndex: number, beforeCall: boolean): boolean => {
      if (!rootSitsOut(rootIndex)) return false;
      if (shapePlan !== null && beforeCall) {
        const handOver = shapeHandOverRoot({ makers: rootSeats.map((seat) => seat.main.maker), rootCount, rootIndex, sitsOut: rootSitsOut });
        if (handOver.kind === "SWAP") {
          [rootSeats[rootIndex], rootSeats[handOver.withIndex]] = [rootSeats[handOver.withIndex]!, rootSeats[rootIndex]!];
          return false;
        }
        if (handOver.kind === "SHARE") {
          rootSeats[rootIndex] = rootSeats[handOver.withIndex]!;
          return false;
        }
      }
      satOutDuringRun.add(rootIndex);
      return true;
    };

    // DR-184/C-10: reviews are interleaved at round boundaries. Coverage is
    // invariant; reviewer assignment may change because rotation observes the
    // latest landed review, and that behaviour change is deliberately declared.
    const reviewScheduledNodeIds = new Set<string>();
    /** The reviewer seat chosen for one node, with the member it calls first. */
    interface ReviewerChoice {
      readonly seat: RunSeat;
      readonly maker: string;
      readonly plan: ReturnType<typeof seatCallPlan>;
    }
    /**
     * Today's reviewer choice for ONE node, given the latest reviewer of its author's maker. "MEMBERS_SAT_OUT" ends
     * the arguing (`membersSatOutStop`); a node no maker but its author's could review throws, as always.
     */
    const chooseReviewer = (authoredNode: AuthoredDebateNode, latestReviewerMaker: string | null):
      | { readonly kind: "MEMBERS_SAT_OUT" }
      | { readonly kind: "REVIEW"; readonly reviewer: ReviewerChoice } => {
      // Reclaim resume: a node an earlier copy saved from the same reply keeps that copy's review site (`siteNodeId`).
      const reviewCallSiteKey = `JUDGE:review:${replayBook.siteNodeId(authoredNode.nodeId)}`;
      // A15 (R5): reviewers come from the REVIEWER seats, and a seat may review
      // only through a member of a different maker than the author — checked
      // per member, so whichever member answers is held to the same rule.
      const differentMaker = (member: SeatIdentity): boolean => member.maker !== authoredNode.maker;
      // Final review I2 (REVIEWER): on an assigned run the maker rotation below
      // starts at a SITE-PURE offset (`seatRotationOffset`), so no listed reviewer
      // seat can sit idle for a whole run — two seats of one maker, or a third
      // behind two that alternate. The legacy (unassigned) book keeps today's order.
      const reviewerSeats = seatBook.assigned
        ? rotateSeats(seatBook.reviewer, seatRotationOffset({ runId: run.runId, role: "REVIEWER", callSiteKey: reviewCallSiteKey }))
        : seatBook.reviewer;
      // Fix (d): a seat whose members all sit out is never chosen to review.
      const reviewerCandidates = reviewerSeats.flatMap((seat) => {
        if (seatSitsOut(seat)) return [];
        const planned = seatCallPlan(seat, reviewCallSiteKey, differentMaker);
        const first = seatCaller.plan(seat, reviewCallSiteKey, planned.options);
        return first === null ? [] : [{ seat, maker: first.maker, plan: planned }];
      });
      // Fix (d): every reviewer that could judge this node sits out — the same state as too few members left, so
      // the arguing ends here and the node keeps its own panel's footing (`membersSatOutStop`), never a dead run.
      // Finding 3 (review, 2026-10-12): only when a reviewer seat's member actually sat out; a node that never had a
      // reviewer of another maker keeps today's DIFFERENT_MAKER_REVIEWER_UNAVAILABLE (selectDifferentMakerReviewer).
      if (reviewEndsForMembersSatOut({
        book: sitOut,
        reviewerRefs: reviewerSeats.flatMap((seat) => membersOf(seat).map((member) => member.providerRef)),
        candidateMakers: reviewerCandidates.map((candidate) => candidate.maker),
        authorMaker: authoredNode.maker
      })) {
        membersSatOutStop = true;
        return { kind: "MEMBERS_SAT_OUT" };
      }
      return {
        kind: "REVIEW",
        reviewer: selectDifferentMakerReviewer(run.runId, authoredNode.maker, reviewerCandidates, latestReviewerMaker)
      };
    };
    /** How one node's review call ended (nothing recorded yet): `recordReviewOutcome` records it in review order. */
    type ReviewCallOutcome =
      | { readonly kind: "REVIEWED"; readonly review: Awaited<ReturnType<Judge["review"]>>; readonly callSiteKey: string }
      | { readonly kind: "HIDDEN"; readonly record: HaltedExpansionRecord }
      /** Fix (d): the reviewer itself sat out during the call; the node is offered to another reviewer after this pass. */
      | { readonly kind: "GIVEN_BACK" }
      /** C1: a spend refusal stopped the reviewing (`runBodyBudgetStop`). */
      | { readonly kind: "STOPPED" };
    /** One node's review call, through the reviewer chosen for it. Nothing is written here but the call's own receipts. */
    const callReview = async (authoredNode: AuthoredDebateNode, reviewer: ReviewerChoice): Promise<ReviewCallOutcome> => {
      const callSiteKey = `JUDGE:review:${replayBook.siteNodeId(authoredNode.nodeId)}`;
      try {
        // B9: a review that has to move never moves onto the node's ACTUAL author.
        reviewAuthorMakers.set(callSiteKey, authoredNode.maker);
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
              argumentLanguageName: run.argumentLanguageName,
              ...shapeLanguageInput,
              ...lengthGuideOf("reviewer"),
              statement: authoredNode.statement,
              authorMaker: authoredNode.maker,
              providerRef: member.providerRef,
              contractHash: this.settings.judgeContractHash,
              bound: { ...guidedCallBound(this.settings.judgeBound, "reviewer", lengthGuidance), maxAttempts },
              // S3-1: this ONE call measures every edge the node sources.
              edges: authoredNode.sourcedEdges
            })
          })
        });
        if (reviewAttempt.kind === "HALTED") {
          // Fix (d): the reviewer itself now sits out (busy, or its gate unavailable): the node is not unjudgeable,
          // its reviewer was; it is offered to another reviewer once this pass ends (the one that sat out is left
          // out of the choice), unless too few members are left to argue.
          if (seatSitsOut(reviewer.seat) && !tooFewLeftToArgue()) return { kind: "GIVEN_BACK" };
          return { kind: "HIDDEN", record: reviewAttempt.record };
        }
        // A15: the key the ledger holds for this review, seat marker included.
        return { kind: "REVIEWED", review: reviewAttempt.value.value, callSiteKey: reviewAttempt.value.callSiteKey };
      } catch (error) {
        const outcome = reviewFailureOutcome(error);
        if (outcome.kind === "RETHROW") throw error;
        // C1: a spend refusal stops REVIEWING, it does not fail the run. The
        // nodes already reviewed keep their reviews; the rest stay unreviewed
        // and are disclosed as such, exactly as they are when a reviewer's
        // transport dies.
        if (outcome.kind === "BUDGET_STOP") {
          runBodyBudgetStop = outcome.stop;
          return { kind: "STOPPED" };
        }
        throw new TypedDomainError(
          "NODE_REVIEW_UNAVAILABLE",
          `No valid cross-maker review was recorded for node ${authoredNode.nodeId}`
        );
      }
    };
    /** Records one node's landed review (or its hidden one); called in review order. */
    const recordReviewOutcome = async (
      authoredNode: AuthoredDebateNode,
      outcome: Extract<ReviewCallOutcome, { readonly kind: "REVIEWED" | "HIDDEN" }>
    ): Promise<void> => {
      if (outcome.kind === "HIDDEN") {
        hiddenReviewRecords.push({ nodeId: authoredNode.nodeId, record: outcome.record });
        return;
      }
      const review = outcome.review;
      try {
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
      } catch (error) {
        // As the review call's own catch: our refusals leave as they arrived; anything else is this node's review lost.
        if (reviewFailureOutcome(error).kind === "RETHROW") throw error;
        throw new TypedDomainError(
          "NODE_REVIEW_UNAVAILABLE",
          `No valid cross-maker review was recorded for node ${authoredNode.nodeId}`
        );
      }
      // T6/J14: recorded only AFTER the review commits, so the disclosure
      // can never name an outcome the ledger does not hold.
      if (review.outcome === "cannot-assess") {
        unassessedReviewRecords.push({
          nodeId: authoredNode.nodeId, callSiteKey: outcome.callSiteKey, outcome: review.outcome
        });
      }
    };
    /**
     * The serial review pass (the expansion and cross-exchange phases; Task 11 makes them chains): every saved node
     * not yet reviewed, in review order, the reviewer turn read off the ledger per node, exactly as before.
     */
    const reviewPendingAuthoredNodes = async (): Promise<void> => {
      if (effectiveMakerCount <= 1) return;
      // RE-REVIEW I5: three call sites are unconditional, and each review is a
      // billed call. The guard lives HERE rather than at each of them, so a
      // fourth call site added tomorrow inherits it.
      if (runBodyBudgetStop !== null) return;
      // Run resilience (spec 2026-10-12, fix (d)): too few members left to argue ends the reviews with the arguing.
      if (tooFewLeftToArgue()) return;
      // Fix (d): nodes whose reviewer sat out during their review, to be given another reviewer below.
      let reviewerSatOut = false;
      for (const authoredNode of authoredNodes.values()) {
        if (reviewScheduledNodeIds.has(authoredNode.nodeId)) continue;
        if (tooFewLeftToArgue()) return;
        reviewScheduledNodeIds.add(authoredNode.nodeId);
        const latestReviewerMaker = await this.#judgements.readLatestReviewerMaker(run.runId, authoredNode.maker);
        const chosen = chooseReviewer(authoredNode, latestReviewerMaker);
        if (chosen.kind === "MEMBERS_SAT_OUT") {
          reviewScheduledNodeIds.delete(authoredNode.nodeId);
          return;
        }
        const outcome = await callReview(authoredNode, chosen.reviewer);
        if (outcome.kind === "STOPPED") return;
        if (outcome.kind === "GIVEN_BACK") {
          reviewScheduledNodeIds.delete(authoredNode.nodeId);
          reviewerSatOut = true;
          continue;
        }
        await recordReviewOutcome(authoredNode, outcome);
      }
      // Fix (d): each pass that gives a node back marks one more member as sitting out, so this ends.
      if (reviewerSatOut) await reviewPendingAuthoredNodes();
    };

    /**
     * Parallel AI calls (spec 2026-10-12 §2.2) — THE REVIEWER TURN IN CHAINS, BATCH BY BATCH. Today's engine reviews in
     * BATCHES (`reviewPendingAuthoredNodes`): the roots; in the expansion, at each change of round and at each global
     * round boundary; after the expansion; after the cross-exchanges. Nodes are saved in plan order, so each batch is
     * one stretch of plan positions, and `reviewBatchEnds` are their ends (exclusive). A chain's reviewer is chosen in
     * REVIEW ORDER (the choice recorder), with today's rule, from the latest reviewer of the author's maker: read off
     * the ledger the first time the batch meets that maker — once every earlier batch's reviews, re-offers included,
     * are recorded: the ledger today's batch reads — then advanced here at each choice. So it never depends on which
     * review landed first, it is today's turn whenever the batch's reviews land as chosen, and each batch starts again
     * from the ledger.
     */
    const reviewBatchEnds: readonly number[] = (() => {
      const ends = [rootCount];
      let round = expansionPlan[0]?.round ?? null;
      expansionPlan.forEach((leg, legIndex) => {
        if (round !== null && leg.round !== round) {
          ends.push(rootCount + legIndex);
          round = leg.round;
        }
        if (globalRoundCompletions.has(legIndex)) ends.push(rootCount + legIndex + 1);
      });
      // 1. the end of the planned legs;
      ends.push(rootCount + expansionPlan.length);
      // 2. Debate shape, spec §3.3 step 7 (pre-flight PF-B44): one batch per scrutiny round (each 2·Q reserved slots),
      // in slot order, so the ends never decrease and no planned position lands in a scrutiny batch;
      if (shapePlan !== null) {
        for (let scrutinyRound = 1; scrutinyRound <= shapePlan.scrutiny.roundsPerNode; scrutinyRound += 1) {
          ends.push(shapePlan.scrutiny.start + scrutinyRound * 2 * shapePlan.scrutiny.nodesPerDebate);
        }
      }
      // 3. the end of the plan.
      ends.push(totalPlannedNodes);
      // Never decreasing, so the distinct ends are in order (an empty batch has no positions to place).
      return Object.freeze([...new Set(ends)]);
    })();
    /** The review batch a plan position belongs to. */
    const reviewBatchOf = (position: number): number => reviewBatchEnds.findIndex((end) => position < end);
    /** A chain's rank (`ChainRank`) while it authors, panels and saves the node at `position`, and while it reviews it. */
    const authorRank = (position: number): ChainRank => [reviewBatchOf(position), 0, position];
    const reviewRank = (position: number): ChainRank => [reviewBatchOf(position), 1, position];
    /** One review batch: its turn book, and what it waits for. */
    interface ReviewBatch {
      /** The latest reviewer per author maker: read off the ledger the first time the batch meets a maker, then advanced. */
      readonly latest: Map<string, string | null>;
      /** Every earlier batch is over: its reviews recorded and its given-back nodes offered again. */
      readonly ready: Promise<void>;
      /** Fix (d): the nodes whose reviewer sat out during the call, in review order, offered again after the batch. */
      readonly givenBack: AuthoredDebateNode[];
    }
    /** Where one node's review chain stands: its position, its pass's two recorders, its batch. */
    interface ReviewSlot {
      readonly position: number;
      readonly choices: PositionRecorder;
      readonly reviews: PositionRecorder;
      readonly batch: ReviewBatch;
      /** The review's place in today's order (`ChainRank`). */
      readonly rank: ChainRank;
    }
    /** One node's review chain: the ordered choice, the call (spec §2.3: never started once the arguing stopped), the ordered record. */
    const reviewInChain = async (slot: ReviewSlot, authoredNode: AuthoredDebateNode): Promise<void> => {
      if (effectiveMakerCount <= 1) return;
      const reviewer = await slot.choices.commit(slot.position, async (): Promise<ReviewerChoice | null> => {
        await slot.batch.ready;
        if (arguingStopped()) return null;
        const latest = slot.batch.latest;
        if (!latest.has(authoredNode.maker)) {
          latest.set(authoredNode.maker, await this.#judgements.readLatestReviewerMaker(run.runId, authoredNode.maker));
        }
        const chosen = chooseReviewer(authoredNode, latest.get(authoredNode.maker) ?? null);
        if (chosen.kind === "MEMBERS_SAT_OUT") {
          noteTooFew(slot.rank);
          return null;
        }
        latest.set(authoredNode.maker, chosen.reviewer.maker);
        reviewScheduledNodeIds.add(authoredNode.nodeId);
        return chosen.reviewer;
      });
      if (reviewer === null) return;
      if (arguingStopped()) {
        reviewScheduledNodeIds.delete(authoredNode.nodeId);
        return;
      }
      const outcome = await callReview(authoredNode, reviewer);
      if (outcome.kind === "STOPPED") noteSpendStop(slot.rank);
      await slot.reviews.commit(slot.position, async () => {
        // Spec §2.3: once a failure ends the debate, nothing more is recorded.
        if (outcome.kind === "STOPPED" || bodyFailed) return;
        if (outcome.kind === "GIVEN_BACK") {
          reviewScheduledNodeIds.delete(authoredNode.nodeId);
          slot.batch.givenBack.push(authoredNode);
          return;
        }
        await recordReviewOutcome(authoredNode, outcome);
      });
    };
    /**
     * Fix (d), kept: the nodes a batch gave back are offered again — together, each to a reviewer chosen in review
     * order — once that batch is over; each pass that gives one back marks one more member as sitting out, so this
     * ends. Each pass is a batch of its own, read off the ledger again, as today's recursion reads it. `rank` places a
     * failure here after everything the batch itself did; it is thrown once every chain has settled.
     */
    const reviewGivenBack = async (givenBack: readonly AuthoredDebateNode[], rank: ChainRank): Promise<void> => {
      let pending = givenBack;
      for (let pass = 1; pending.length > 0 && !arguingStopped(); pass += 1) {
        const choices = positionRecorder(pending.length);
        const reviews = positionRecorder(pending.length);
        const batch: ReviewBatch = Object.freeze({
          latest: new Map<string, string | null>(), ready: Promise.resolve(), givenBack: [] as AuthoredDebateNode[]
        });
        await Promise.allSettled(pending.map((authoredNode, position) => runChain(
          () => reviewInChain({ position, choices, reviews, batch, rank: [...rank, pass, position] }, authoredNode),
          [...rank, pass, position],
          () => { choices.skip(position); reviews.skip(position); }
        )));
        pending = batch.givenBack;
      }
    };

    /**
     * Parallel AI calls (spec 2026-10-12 §2.1) — WHAT A CHAIN WAITS FOR FROM ANOTHER. Per plan position: its statement
     * once its author call returned (a reply starts from its parent's, a cross-exchange from both roots'), and its
     * node once saved (a reply's hold and halt records name it). Null: it never will be — the position was dropped,
     * halted, stopped or never asked. A chain's `release` settles both, so nothing waits on a chain that ended.
     */
    const statements = Array.from({ length: totalPlannedNodes }, () => settable<string | null>());
    const savedNodes = Array.from({ length: totalPlannedNodes }, () => settable<AuthoredDebateNode | null>());
    /** A reply's parent at `position`, saved later: its node id once saved, or null if it never is. */
    const laterParentAt = (position: number): LaterParentNode =>
      Object.freeze({ saved: savedNodes[position]!.promise.then((node) => node?.nodeId ?? null) });
    /** The review batches, set up when the arguing runs together (`argueTogether`); a node's review slot is in one. */
    let reviewBatches: readonly { readonly batch: ReviewBatch; readonly done: Promise<void> }[] = [];
    const reviewSlot = (position: number): ReviewSlot => Object.freeze({
      position, choices: reviewChoices, reviews: reviewRecorder, batch: reviewBatches[reviewBatchOf(position)]!.batch,
      rank: reviewRank(position)
    });
    /** A chain gives up whatever it did not commit at its position, so no later position waits on it. */
    const releaseAt = (position: number) => (): void => {
      nodeRecorder.skip(position);
      reviewChoices.skip(position);
      reviewRecorder.skip(position);
      statements[position]!.resolve(null);
      savedNodes[position]!.resolve(null);
    };

    /**
     * Parallel AI calls (spec 2026-10-12 §2.1, part 1 of 3) — THE OPENING POSITIONS RUN TOGETHER.
     *
     * Root 0's author call ran alone and first, above (with today's seat swap). Now — when the debate's calls run
     * together (`callsRunTogether`, in `argueTogether` below; otherwise the same chains run one after another, as
     * today) — all at once, each as its own chain: root 0's panel; and for every other root its author call, then its
     * panel. Each chain then saves its node in its plan position (the node recorder: root i is saved after roots
     * 0..i−1 are saved or skipped), and from there reviews it (the reviewer chosen in review order, recorded in review
     * order). Today's per-root rules hold on each root's OWN result: a root whose member sits out is dropped without a
     * call (fix (d)); a spend refusal stops the arguing and keeps what exists (C1); a root halted by a billed failure
     * ends the debate (MAKER_POSITION_UNAVAILABLE) — the lane is stopped, every other chain is awaited, then the error
     * is thrown.
     *
     * Spec §2.3 (O6): a chain starts no author call and no review call once the arguing has stopped (a spend stop,
     * too few members left, or a failure that ends the debate) and gives up its positions; the panel of a node whose
     * author call was already sent always runs, as the serial leg that was underway always finished its panel.
     */
    const ROOT_SAVE: Omit<SaveInput, "authorIndex"> = Object.freeze({
      parentNodeId: null, childKind: null, siblingOrdinal: 0, explorationDecision: "continue", edges: Object.freeze([])
    });
    const rootCallSiteKey = (rootIndex: number): string =>
      rootIndex === 1 ? "JUDGE:root:secondary" : `JUDGE:root:${String(rootIndex)}`;
    /** Root 0's panel result: its selection rule is recorded on the propagation receipt (below). */
    const rootZeroPanel: { selection: Awaited<ReturnType<typeof runNodePanel>> | null } = { selection: null };
    /**
     * Debate shape (spec §3.3 step 2): which root argued each chosen answer, written once the root is saved (inside its
     * node's turn). Binding note 4 (Task 13): an erased run stops the run as the graph's own write does
     * (PRIVATE_CONTENT_ERASED, the content lease's `assertLive`); the root's own write already refuses it first, so this
     * is the same stop. Nothing on today's run, or on a root that argues no map answer.
     */
    const writeMapPosition = async (rootIndex: number, node: AuthoredDebateNode): Promise<void> => {
      const answerId = shapePositions?.[rootIndex]?.answerId;
      if (typeof answerId !== "string") return;
      const written = await this.#mapChoices.writeMapPosition({ runId: run.runId, answerId, rootIndex, rootNodeId: node.nodeId, maker: node.maker });
      if (written === "RUN_ERASED") throw new TypedDomainError("PRIVATE_CONTENT_ERASED", "Private content is no longer available");
    };
    const rootZeroChain = async (stage: { rank: ChainRank }): Promise<void> => {
      const selection = await runNodePanel({
        authorMaker: rootAuthor.maker,
        authorProviderRef: rootAuthor.providerRef,
        authorJudgementRef: judged.provenanceRef,
        authorAssessment: judged.assessment,
        authorTau: reduced.tau,
        claimType: judged.normalizedClaim.claimType,
        statement: judged.statement,
        callSiteKey: "PANEL:root",
        questionLine: run.questionLine,
        onSpendStop: "AUTHOR_ONLY"
      });
      // Task M2 (spec §14.4.1): a stop on the first root's panel no longer escapes
      // the work item. Root 0 rests on the voices its panel heard before the stop
      // (PANEL-PARTIAL), or on its author's own judgement when none was heard
      // (single voice), and the stop ends the arguing: no chain starts another
      // author or review call, and the run goes on to its answer.
      if (selection.spendStop !== null) runBodyBudgetStop = selection.spendStop;
      if (selection.spendStop !== null) noteSpendStop(stage.rank);
      rootZeroPanel.selection = selection;
      // Spec §2.3: once a failure ends the debate, nothing more is saved (its turn still passes, so no later save waits).
      const authoredRoot = await nodeRecorder.commit(0, async () => {
        if (bodyFailed) return null;
        const saved = await saveAuthored(0, { ...ROOT_SAVE, authorIndex: 0 }, {
          judged, reduced, selection, author: rootAuthor, member: primaryMaker
        });
        await writeMapPosition(0, saved);
        return saved;
      });
      savedNodes[0]!.resolve(authoredRoot);
      if (authoredRoot === null || !chainsRun) return;
      stage.rank = reviewRank(0);
      await reviewInChain(reviewSlot(0), authoredRoot);
    };
    const rootChain = async (rootIndex: number, stage: { rank: ChainRank }): Promise<void> => {
      // Spec §2.3 (O6): right before the author call. Fix (d): too few members left ends the arguing, and a root
      // whose member sits out is dropped without a call.
      if (arguingStopped()) return;
      if (dropSatOutRoot(rootIndex, true)) return;
      const input: AuthorPositionInput = {
        authorIndex: rootIndex,
        seat: rootSeats[rootIndex]!,
        leg: rootLegOf(rootIndex),
        callSiteKey: rootCallSiteKey(rootIndex),
        role: rootIndex === 1 ? "secondary root author" : "additional maker root author",
        // Final review M-1 (shaped only): this root's backup or moved call never lands on a maker arguing another root.
        ...(shapePlan === null ? {} : { makerBar: shapeRootMakerBar(rootSeats[rootIndex]!.main.maker,
          () => answeredMakers.slice(0, rootCount).filter((_maker, index) => index !== rootIndex)) }),
        ...ROOT_SAVE,
        plannedLegCount: 1
      };
      let authoredRoot: Awaited<ReturnType<typeof authorAndPanel>>;
      try {
        // Spec §2.1: the root's statement is told as soon as its author call returned — its replies start from it.
        authoredRoot = await authorAndPanel(input, (statement, maker) => {
          answeredMakers[rootIndex] = maker;
          statements[rootIndex]!.resolve(statement);
        });
      } catch (error) {
        const stop = expansionPhaseStop(error);
        if (stop === null) throw error;
        // Root 0 is authored, so the run HAS something to serve. Stopping here
        // keeps it; throwing would discard it.
        runBodyBudgetStop = stop;
        noteSpendStop(stage.rank);
        return;
      }
      if (authoredRoot.kind === "HALTED") {
        // Fix (d): halted because its member now sits out (busy, or its gate unavailable): dropped, not fatal. A call
        // was made under this seat, so a shaped root is never handed over here (pre-flight PF-B41).
        if (dropSatOutRoot(rootIndex, false)) return;
        throw new TypedDomainError(
          "MAKER_POSITION_UNAVAILABLE",
          rootIndex === 1
            ? "The secondary maker position failed after the full cooldown and final-retry courtesy"
            : `Maker position ${String(rootIndex)} failed after the full cooldown and final-retry courtesy`
        );
      }
      const authoredValue = authoredRoot.value;
      const saved = await nodeRecorder.commit(rootIndex, async () => {
        if (bodyFailed) return null;
        const node = await saveAuthored(rootIndex, input, authoredValue);
        await writeMapPosition(rootIndex, node);
        return node;
      });
      savedNodes[rootIndex]!.resolve(saved);
      if (saved === null || !chainsRun) return;
      stage.rank = reviewRank(rootIndex);
      await reviewInChain(reviewSlot(rootIndex), saved);
    };
    if (!chainsRun) {
      // Today's engine, call for call: root 0's panel and save, each further root in order (the same chain, run
      // alone), then today's review pass over the roots.
      for (let rootIndex = 0; rootIndex < rootCount; rootIndex += 1) {
        await runChain(rootIndex === 0 ? rootZeroChain : (stage) => rootChain(rootIndex, stage), [0, 0, rootIndex], releaseAt(rootIndex));
        throwBodyFailure();
      }
      await reviewPendingAuthoredNodes();
    }

    const haltedIndices = new Set<number>();
    // Task 15 (Task 14 minor): the walk reaches the scrutiny legs too, once scrutiny has planned them (`scrutinyLegs`,
    // parents before children, after every leg of the plan), so a halted scrutiny reply counts the legs beneath it.
    // Empty on today's run and before scrutiny chose: today's walk.
    const subtreeIndices = (rootIndex: number): readonly number[] => {
      const indices = new Set([rootIndex]);
      for (const candidate of [...expansionPlan, ...scrutinyLegs.values()]) {
        if (indices.has(candidate.parentIndex)) indices.add(candidate.childIndex);
      }
      return Object.freeze([...indices]);
    };
    // Run resilience (spec 2026-10-12, fix (d)): a dropped root has no node, so nothing beneath it is ever planned.
    // (Today's engine; when the arguing runs together, a reply reads its dropped parent's missing statement instead.)
    const droppedSubtreeIndices = new Set([...satOutDuringRun].flatMap((rootIndex) => subtreeIndices(rootIndex)));
    const frozenIndices = new Set<number>();
    const branchFrozenRecords: ConditionMarkRecord[] = [];
    let previousRoundStrengths: readonly NodeStrengthRecord[] | null = null;
    /**
     * One GLOBAL round boundary: propagate (PURE CODE — no provider is reachable
     * from here), then apply the ε branch freeze and the global δ stop. Returns
     * true when the debate should stop expanding.
     */
    /**
     * The last round boundary's propagation, read by scrutiny (spec §3.3 step 7: a node's root leverage); null until a
     * boundary is decided (and on a run with no stopping policy, which decides none).
     */
    let lastBoundary: { completedRounds: number; propagation: PropagationOutcome; rootNodeIds: readonly string[];
      scoredNodeIds: ReadonlySet<string> } | null = null;
    /** Adaptive (spec §3.3 step 5): set once the round-1 boundary chose the chains to keep. */
    let adaptiveChosen = false;
    /**
     * True on a shaped run whose deeper rounds are adaptive: a deeper leg runs only under a chain the choice kept. Final
     * review M-2: read from the RECEIPT (`shape.depthMode`, what the price was made from), never from the run's settings.
     */
    const adaptiveShape = shapePlan !== null && shapeRun !== null && shapeRun.shape.depthMode === "adaptive";
    /**
     * Spec §3.3 step 5 (adaptive; contract deviation 6) — THE CHAINS PER POSITION KEPT AT THE ROUND-1 BOUNDARY: the
     * receipt's `deeperTopPoints` per position with the highest root leverage (`shapeSelectChains`; a frozen or unscored
     * point never). Binding note 1 (the money law): the plan builds all K chains, the price covers only these, so the
     * deeper legs of every other chain are never sent (`deselectedIndices`).
     */
    const keepAdaptiveChains = (leverageOf: (position: number) => number | null): void => {
      if (adaptiveChosen || shapePlan === null || shapeRun === null) return;
      adaptiveChosen = true;
      const chainsByRoot = new Map<number, number[]>();
      for (const leg of shapePlan.legs) {
        if (leg.kind === "POINT") chainsByRoot.set(leg.rootIndex, [...(chainsByRoot.get(leg.rootIndex) ?? []), leg.childIndex]);
      }
      const kept = shapeSelectChains({ chainsByRoot, leverageOf, frozen: frozenIndices, perRoot: shapeRun.shape.deeperTopPoints });
      for (const leg of shapePlan.legs) {
        if (leg.kind !== "REPLY" && leg.kind !== "DEFENCE") continue;
        if (leg.chain !== null && !kept.has(leg.chain)) deselectedIndices.add(leg.childIndex);
      }
    };
    /** Task 13 fix round 1: whether plan position `index` can still be asked (`shapeLegCanRun`); always on today's run. */
    const legCanRun = (index: number): boolean => shapeLegCanRun(shapeLegAt(index), {
      deselected: deselectedIndices.has(index), adaptive: adaptiveShape, chosen: adaptiveChosen, depth: expansionDepth
    });
    /** At round 1 of an adaptive shaped run, a boundary that cannot be measured keeps no chain (never more than priced). */
    const keepNoChainAtRoundOne = (completedRounds: number): void => {
      if (adaptiveShape && completedRounds === 1) keepAdaptiveChains(() => null);
    };
    const closeGlobalRound = async (completedRounds: number, boundaryLegIndex: number): Promise<boolean> => {
      const stoppingPolicy = this.settings.stoppingPolicy;
      if (stoppingPolicy === undefined) {
        keepNoChainAtRoundOne(completedRounds);
        return false;
      }
      const { snapshot: roundSnapshot } = await this.#resolveOperatorResolvedSnapshot(run.runId);
      const roundReviewedNodeIds = await this.#judgements.readReviewedNodeIds(run.runId);
      // Engine 2: the round's stopping reads the same link-weighted graph the answer is served from (null on engine 1).
      const roundLinked = await engineLinkedGraphNow(roundSnapshot, roundReviewedNodeIds);
      const roundStanding = projectJudgedStanding(
        roundLinked === null ? roundSnapshot : roundLinked.snapshot,
        roundLinked === null ? roundReviewedNodeIds : roundLinked.reviewedNodeIds
      );
      const scoredNodeIds = new Set(roundStanding.snapshot.nodes.map((node) => node.nodeId));
      // codex B1 / J15 ADDENDUM-2: the AUTHORITATIVE maker-root scope, NEVER
      // narrowed to the roots that happen to have standing. A root whose review
      // exhausted is uncomparable, and `decideRoundBoundary` refuses convergence
      // because of it — dropping it here is what let r2 claim "no root moved"
      // about a root it had never looked at.
      const rootScope = selectAuthoritativeRootScope({
        effectiveMakerCount: rootCount,
        authoredRootNodeIdByMakerIndex: new Map(
          Array.from({ length: rootCount }, (_, index) => [index, authoredNodes.get(index)] as const)
            .flatMap(([index, root]) => root === undefined ? [] : [[index, root.nodeId] as const])
        )
      });
      if (rootScope.rootNodeIds.length === 0) {
        keepNoChainAtRoundOne(completedRounds);
        return false;
      }
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
      lastBoundary = { completedRounds, propagation: boundary.propagation, rootNodeIds: rootScope.rootNodeIds, scoredNodeIds };
      if (adaptiveShape && completedRounds === 1 && expansionDepth > 1) {
        const recorded = new Set(boundary.propagation.sensitivityRecords.map((record) => record.removedNodeId));
        keepAdaptiveChains((position) => {
          const node = authoredNodes.get(position);
          // A point with no score, or no sensitivity record (nothing to measure its leverage on), is never kept.
          if (node === undefined || !scoredNodeIds.has(node.nodeId) || !recorded.has(node.nodeId)) return null;
          return resolveLeverage({ completedRounds, carryingNodeId: node.nodeId, sensitivityRecords: boundary.propagation.sensitivityRecords,
            rootNodeIds: rootScope.rootNodeIds }).leverage;
        });
      }
      return boundary.continuation.kind === "STOP";
    };
    let stoppedByAdaptiveRule = false;
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
    /**
     * Parallel AI calls (spec 2026-10-12 §2.1, parts 1 and 2 of 3) — THE ARGUING RUNS TOGETHER, when the debate's calls
     * do (`callsRunTogether`). Root 0's author call ran alone and first, above. Now, all at once, each as its own chain:
     *  - root 0's panel, and every other root's author call, then its panel (part 1, above);
     *  - every support/attack reply: its author call starts once its PARENT's author call returned (it needs only the
     *    parent's text), then its panel;
     *  - every cross-exchange: its author call starts once both roots' author calls returned, then its panel.
     * Depth >= 2: a reply AFTER a global round boundary in the plan first waits for that boundary's freeze/stop decision
     * (`closeGlobalRound`), which waits for every node up to the boundary to be saved or given up and for their reviews
     * (re-offers included), and then reads what the decision froze or stopped. Replies before the boundary run freely,
     * as today they ran before the decision; so it sees, and prevents, exactly what it does in the serial run.
     * Every node is saved in its plan position (the node recorder) and reviewed from there (the review batches); a
     * cross-exchange, after the last boundary's decision, which in today's order it follows.
     *
     * Today's rules hold on each chain's own result: a reply under a halted, frozen or dropped branch, or after the
     * adaptive stop, is never asked; a halted reply halts its branch (recorded in plan order); a spend refusal stops the
     * arguing and keeps what exists; a reply whose parent was never minted (that parent's panel stop travelled) is paid
     * and dropped, as today's rule drops a stopped leg. Spec §2.3 (O6): no chain starts an author or a review call once
     * the arguing has stopped; once every chain has settled, the first failure in today's order is thrown.
     */
    const argueTogether = async (): Promise<void> => {
      // The review batches: each is over once every earlier one is, its own reviews are recorded, and the nodes it
      // gave back were offered again.
      let earlierBatches: Promise<void> = Promise.resolve();
      reviewBatches = Object.freeze(reviewBatchEnds.map((end, batchIndex) => {
        const batch: ReviewBatch = Object.freeze({
          latest: new Map<string, string | null>(), ready: earlierBatches, givenBack: [] as AuthoredDebateNode[]
        });
        earlierBatches = runChain(async () => {
          await batch.ready;
          await reviewRecorder.through(end);
          await reviewGivenBack(batch.givenBack, [batchIndex, 2]);
        }, [batchIndex, 2], () => undefined);
        return Object.freeze({ batch, done: earlierBatches });
      }));
      /** Ruling R26: every spend stop raised so far comes at or after `rank` in today's order. */
      const spendStoppedFrom = (rank: ChainRank): boolean =>
        spendStopRanks.length > 0 && spendStopRanks.every((stopRank) => compareRanks(stopRank, rank) >= 0);
      // The global round boundaries, one decision after another.
      const boundaryDecisions: (readonly [number, Promise<void>])[] = [];
      let earlierDecisions: Promise<void> = Promise.resolve();
      for (const [boundaryLegIndex, completedRound] of globalRoundCompletions) {
        const boundaryEnd = rootCount + boundaryLegIndex + 1;
        const batchIndex = reviewBatchOf(boundaryEnd - 1);
        const after = earlierDecisions;
        earlierDecisions = runChain(async () => {
          await after;
          // Every node up to the boundary saved or given up, and reviewed: its review batch ends at the boundary.
          await nodeRecorder.through(boundaryEnd);
          await reviewBatches[batchIndex]!.done;
          // Today's loop never reached this boundary: a failure, the adaptive rule's stop at an earlier boundary, or a
          // stop it saw BEFORE the boundary. Ruling R26: a spend stop raised by this boundary's own review pass (or by
          // a step today's order puts after the boundary, a cross-exchange) still lets today's loop decide the round —
          // pure code and one PROPAGATION row — so the chains decide it too. R26b: today's loop asks "too few members
          // left?" last before the boundary's last reply, so too few left by that reply or anything after it in
          // today's order lets the round be decided too.
          if (stoppedByAdaptiveRule || bodyFailed) return;
          if (tooFewLeftToArgue() && !(tooFewRank !== null && compareRanks(tooFewRank, [batchIndex, 0, boundaryEnd - 1]) >= 0)) return;
          if (runBodyBudgetStop !== null && !spendStoppedFrom([batchIndex, 1])) return;
          stoppedByAdaptiveRule = await closeGlobalRound(completedRound, boundaryLegIndex);
        }, [batchIndex, 3], () => undefined);
        boundaryDecisions.push([boundaryLegIndex, earlierDecisions] as const);
      }
      const everyBoundaryDecided = earlierDecisions;
      /** The decision a reply waits for: the last boundary before it in the plan (which waits for the ones before). */
      const decisionBefore = (legIndex: number): Promise<void> | undefined =>
        boundaryDecisions.filter(([boundaryLegIndex]) => boundaryLegIndex < legIndex).pop()?.[1];

      /**
       * One leg of the plan, from its parent's statement to its review. `decision` is the round boundary it waits for
       * (none for a leg before the first boundary). Debate shape (spec §3.3 steps 3–5): a shape leg's writer is a maker
       * other than the one it answers (`shapeWriterSeat` over the makers that ANSWERED, pre-flight PF-B45), it carries
       * its chosen point (`consideration`) and its own key, a cross-reply goes to `argueShapeCross`, and a deeper leg of
       * a chain the adaptive choice did not keep is never sent (binding note 1). Row absent: `shapeLegAt` is null and
       * every shape line is skipped — today's leg, byte for byte.
       */
      const argueLeg = async (leg: MultiMakerExpansionLeg, decision: Promise<void> | undefined, stage: { rank: ChainRank }): Promise<void> => {
        const position = leg.childIndex;
        if (decision !== undefined) await decision;
        // Its parent's text: null when the parent never got one (dropped, halted, stopped, or itself never asked).
        const parentStatement = await statements[leg.parentIndex]!.promise;
        // Pre-flight PF-B48: the adaptive (δ) stop ends the PLANNED rounds only; a scrutiny leg (round > depth) still
        // runs. A leg of today's plan always has round <= depth, so this is today's check.
        if (parentStatement === null || (stoppedByAdaptiveRule && leg.round <= expansionDepth)) return;
        if (haltedIndices.has(leg.parentIndex) || haltedIndices.has(leg.childIndex)
          || frozenIndices.has(leg.parentIndex) || frozenIndices.has(leg.childIndex)) return;
        // Spec §2.3 (O6): right before the reply's author call.
        if (arguingStopped()) return;
        const shapeLeg = shapeLegAt(leg.childIndex);
        // Binding note 1 (the money law): an adaptive run's planned deeper leg runs only under a chain the round-1
        // choice KEPT — never when that choice was not made (its boundary was never decided), never under another chain.
        if (deselectedIndices.has(leg.childIndex)) return;
        if (shapeLeg !== null && adaptiveShape && shapeLeg.round > 1 && shapeLeg.round <= expansionDepth && !adaptiveChosen) return;
        if (shapeLeg?.kind === "CROSS") return argueShapeCross(shapeLeg, stage);
        const writerIndex = shapeLeg === null ? null : shapeWriterSeat({
          seatMakers: seatBook.supportAttack.map((seat) => seat.main.maker),
          // A point answers its position; a reply answers the node it attacks; a defence prefers the point's own maker.
          // Pre-flight PF-B45: the makers that ANSWERED (`answeredMakers`), never the planned ones.
          avoidMakers: [answeredMakers[leg.parentIndex] ?? ""],
          preferMaker: shapeLeg.kind === "DEFENCE" && shapeLeg.chain !== null ? answeredMakers[shapeLeg.chain] ?? null : null,
          offset: leg.rootIndex + leg.round + shapeLeg.siblingOrdinal,
          sitsOut: (index) => seatSitsOut(seatBook.supportAttack[index]!)
        });
        if (shapeLeg !== null && writerIndex === null) return;
        // A15 (R5): the legs come from the SUPPORT_ATTACK seats, rotating as today (a shape leg: the writer rule's seat).
        const seat = shapeLeg === null
          ? seatBook.supportAttack[(leg.rootIndex + leg.round) % seatBook.supportAttack.length]!
          : seatBook.supportAttack[writerIndex!]!;
        const role = leg.polarity === "support" ? "defender" : "critic";
        const plannedSubtreeIndices = subtreeIndices(leg.childIndex);
        // Task 13 fix round 1: the planned count holds only the legs that can still be asked (never a dropped chain's).
        const plannedLegCount = plannedSubtreeIndices.filter(legCanRun).length;
        // Task 13 fix round 1 (spec §3.3 step 3): the maker this leg answers never writes it — not the seat's backup,
        // not a call moved to a cheaper maker.
        const makerBar = shapeLeg === null ? undefined : shapeMakerBar([answeredMakers[leg.parentIndex]]);
        const call = {
          authorIndex: shapeLeg === null ? leg.authorIndex : seat.seatIndex,
          seat,
          // DL4-F4: the parent's statement is material, in its own fenced field; a shape point's chosen point too.
          leg: shapeLeg?.consideration != null
            ? { kind: leg.polarity === "support" ? "support" as const : "attack" as const, positionUnderDebate: parentStatement,
              consideration: shapeLeg.consideration }
            : { kind: leg.polarity === "support" ? "support" as const : "attack" as const, positionUnderDebate: parentStatement },
          callSiteKey: shapeLeg?.callSiteKey ?? `JUDGE:${role}:root${leg.rootIndex}:r${leg.round}:p${leg.parentIndex}`,
          ...(makerBar === undefined ? {} : { makerBar }),
          role,
          childKind: leg.polarity === "support" ? "support" as const : "defeater" as const,
          siblingOrdinal: shapeLeg?.siblingOrdinal ?? (leg.polarity === "support" ? 1 : 2),
          plannedLegCount,
          explorationDecision: leg.polarity === "support" ? "deepen" as const : "challenge" as const
        };
        let authored: Awaited<ReturnType<typeof authorAndPanel>>;
        try {
          authored = await authorAndPanel({ ...call, parentNodeId: laterParentAt(leg.parentIndex), edges: [] },
            (statement, maker) => {
              answeredMakers[position] = maker;
              statements[position]!.resolve(statement);
            });
        } catch (error) {
          // C1, as today: a spend refusal on the author call or its panel stops the arguing; no node is minted.
          const stop = expansionPhaseStop(error);
          if (stop === null) throw error;
          runBodyBudgetStop = stop;
          noteSpendStop(stage.rank);
          return;
        }
        if (authored.kind === "HALTED") {
          // As today: nothing beneath a halted reply is asked, and its halt is recorded in plan order.
          plannedSubtreeIndices.forEach((index) => haltedIndices.add(index));
          statements[position]!.resolve(null);
          const halted = { ...authored.record, plannedLegCount };
          await nodeRecorder.commit(position, async () => {
            if (!bodyFailed) haltedExpansionRecords.push(halted);
          });
          return;
        }
        const authoredValue = authored.value;
        const saved = await nodeRecorder.commit(position, async () => {
          // Saved after its parent (plan order). Spec §2.3: nothing is saved after a failure, and a reply whose parent
          // was never minted has nothing to attach to: paid, and dropped.
          const parent = authoredNodes.get(leg.parentIndex);
          if (bodyFailed || parent === undefined) return null;
          return saveAuthored(position, {
            ...call,
            parentNodeId: parent.nodeId,
            edges: [{ targetNodeId: parent.nodeId, targetStatement: parent.statement, polarity: leg.polarity }]
          }, authoredValue);
        });
        savedNodes[position]!.resolve(saved);
        if (saved === null) return;
        stage.rank = reviewRank(position);
        await reviewInChain(reviewSlot(position), saved);
      };
      const legChain = (legIndex: number, stage: { rank: ChainRank }): Promise<void> =>
        argueLeg(expansionPlan[legIndex]!, decisionBefore(legIndex), stage);

      /**
       * Spec §3.3 step 4: ONE cross-reply per position, to its strongest rival, by the member that wrote the position.
       * It sits in round 1, before the round-1 boundary, so it does not await the boundary decisions as today's
       * cross-exchanges do; it is a child of its own root, so the recorders and `subtreeIndices` treat it as any leg.
       */
      const argueShapeCross = async (shapeLeg: ShapeLeg, stage: { rank: ChainRank }): Promise<void> => {
        const position = shapeLeg.childIndex;
        const target = shapeLeg.targetRootIndex;
        if (target === null) return;
        const [ownPosition, otherMakersPosition] = await Promise.all([statements[shapeLeg.rootIndex]!.promise, statements[target]!.promise]);
        // As today: a dropped root neither defends nor is attacked, and a root never written has no cross-reply.
        if (ownPosition === null || otherMakersPosition === null || arguingStopped()) return;
        // Controller ruling T15-S (owner principle: positions argued by different AIs): after a SHARE hand-over two
        // positions can have one maker, and a maker never replies to itself — that cross-reply is skipped, never sent
        // (so it stays within the price). Read from who REALLY wrote each root (`answeredMakers`).
        if (answeredMakers[shapeLeg.rootIndex] !== undefined && answeredMakers[shapeLeg.rootIndex] === answeredMakers[target]) return;
        // Pre-flight PF-B42: keyed by root index in a shaped run.
        const writer = positionAnswerers.get(shapeLeg.rootIndex);
        if (writer === undefined) {
          // As `crossExchangeSeatFor`: a written root always has its answerer recorded; none is a defect, never a skip.
          throw new TypedDomainError("DEBATE_ROOT_MISSING", `Cross-reply ${shapeLeg.callSiteKey} has no written root ${String(shapeLeg.rootIndex)}`);
        }
        // Pre-flight PF-B43, as `crossExchangeSeatFor`: a site an earlier pass already recorded keeps its slot (the
        // attempt ceiling is exact only under that precondition, packages/register/src/index.ts).
        const recorded = recordedSlotBySite.get(shapeLeg.callSiteKey);
        // Final review M-1: a backup or a moved call never answers as the maker of the position it replies to.
        const crossBar = shapeMakerBar([answeredMakers[target]]);
        const call = {
          authorIndex: shapeLeg.rootIndex,
          seat: Object.freeze({
            role: "CROSS_EXCHANGE" as const,
            seatIndex: shapeLeg.rootIndex,
            pinnedSeatIndex: rootSeats[shapeLeg.rootIndex]!.pinnedSeatIndex,
            main: recorded === undefined || recorded === writer.pinnedAs ? writer : Object.freeze({ ...writer, pinnedAs: recorded }),
            runnerUp: null,
            diversityShare: 0,
            pinned: null
          }),
          leg: { kind: "cross-root" as const, ownPosition, otherMakersPosition },
          ...(crossBar === undefined ? {} : { makerBar: crossBar }),
          callSiteKey: shapeLeg.callSiteKey,
          role: "cross-root response",
          childKind: "support" as const,
          siblingOrdinal: shapeLeg.siblingOrdinal,
          plannedLegCount: 1,
          explorationDecision: "challenge" as const
        };
        let authored: Awaited<ReturnType<typeof authorAndPanel>>;
        try {
          authored = await authorAndPanel({ ...call, parentNodeId: laterParentAt(shapeLeg.rootIndex), edges: [] },
            (statement, maker) => {
              answeredMakers[position] = maker;
              statements[position]!.resolve(statement);
            });
        } catch (error) {
          const stop = expansionPhaseStop(error);
          if (stop === null) throw error;
          runBodyBudgetStop = stop;
          noteSpendStop(stage.rank);
          return;
        }
        if (authored.kind === "HALTED") {
          const halted = authored.record;
          await nodeRecorder.commit(position, async () => {
            if (!bodyFailed) haltedExpansionRecords.push(halted);
          });
          return;
        }
        const authoredValue = authored.value;
        const saved = await nodeRecorder.commit(position, async () => {
          const authorRoot = authoredNodes.get(shapeLeg.rootIndex);
          const targetRoot = authoredNodes.get(target);
          if (bodyFailed || authorRoot === undefined || targetRoot === undefined) return null;
          return saveAuthored(position, {
            ...call,
            parentNodeId: authorRoot.nodeId,
            edges: [
              { targetNodeId: authorRoot.nodeId, targetStatement: authorRoot.statement, polarity: "support" },
              { targetNodeId: targetRoot.nodeId, targetStatement: targetRoot.statement, polarity: "attack" }
            ]
          }, authoredValue);
        });
        savedNodes[position]!.resolve(saved);
        if (saved === null) return;
        noteOwnReplyEdges(saved);
        stage.rank = reviewRank(position);
        await reviewInChain(reviewSlot(position), saved);
      };

      const crossChain = async (exchangeIndex: number, stage: { rank: ChainRank }): Promise<void> => {
        const exchange = crossExchangePlan[exchangeIndex]!;
        const position = effectiveMakerCount + expansionPlan.length + exchangeIndex;
        const [ownPosition, otherMakersPosition] = await Promise.all([
          statements[exchange.authorRootIndex]!.promise, statements[exchange.targetRootIndex]!.promise
        ]);
        // As today: a dropped root neither defends nor is attacked (fix (d)), and a root never written has no exchange.
        if (ownPosition === null || otherMakersPosition === null) return;
        // Spec §2.3 (O6): right before the exchange's author call.
        if (arguingStopped()) return;
        const call = {
          authorIndex: exchange.authorIndex,
          seat: crossExchangeSeatFor(exchange),
          leg: { kind: "cross-root" as const, ownPosition, otherMakersPosition },
          callSiteKey: `JUDGE:cross-root:${exchange.authorRootIndex}->${exchange.targetRootIndex}`,
          role: "cross-root response",
          childKind: "support" as const,
          siblingOrdinal: 3 + (exchange.targetRootIndex < exchange.authorRootIndex
            ? exchange.targetRootIndex
            : exchange.targetRootIndex - 1),
          plannedLegCount: 1,
          explorationDecision: "challenge" as const
        };
        let authored: Awaited<ReturnType<typeof authorAndPanel>>;
        try {
          authored = await authorAndPanel({ ...call, parentNodeId: laterParentAt(exchange.authorRootIndex), edges: [] });
        } catch (error) {
          const stop = expansionPhaseStop(error);
          if (stop === null) throw error;
          runBodyBudgetStop = stop;
          noteSpendStop(stage.rank);
          return;
        }
        // In today's order every cross-exchange comes after the expansion and its last round decision.
        await everyBoundaryDecided;
        if (authored.kind === "HALTED") {
          const halted = authored.record;
          await nodeRecorder.commit(position, async () => {
            if (!bodyFailed) haltedExpansionRecords.push(halted);
          });
          return;
        }
        const authoredValue = authored.value;
        const saved = await nodeRecorder.commit(position, async () => {
          const authorRoot = authoredNodes.get(exchange.authorRootIndex);
          const targetRoot = authoredNodes.get(exchange.targetRootIndex);
          if (bodyFailed || authorRoot === undefined || targetRoot === undefined) return null;
          return saveAuthored(position, {
            ...call,
            parentNodeId: authorRoot.nodeId,
            edges: [
              { targetNodeId: authorRoot.nodeId, targetStatement: authorRoot.statement, polarity: "support" },
              { targetNodeId: targetRoot.nodeId, targetStatement: targetRoot.statement, polarity: "attack" }
            ]
          }, authoredValue);
        });
        savedNodes[position]!.resolve(saved);
        if (saved === null) return;
        noteOwnReplyEdges(saved);
        stage.rank = reviewRank(position);
        await reviewInChain(reviewSlot(position), saved);
      };

      // Root 0's author call has returned: its replies and exchanges may start from its statement now.
      statements[0]!.resolve(judged.statement);
      const chains = [runChain(rootZeroChain, authorRank(0), releaseAt(0))];
      for (let rootIndex = 1; rootIndex < rootCount; rootIndex += 1) {
        chains.push(runChain((stage) => rootChain(rootIndex, stage), authorRank(rootIndex), releaseAt(rootIndex)));
      }
      expansionPlan.forEach((leg, legIndex) => {
        chains.push(runChain((stage) => legChain(legIndex, stage), authorRank(leg.childIndex), releaseAt(leg.childIndex)));
      });
      crossExchangePlan.forEach((_exchange, exchangeIndex) => {
        const position = effectiveMakerCount + expansionPlan.length + exchangeIndex;
        chains.push(runChain((stage) => crossChain(exchangeIndex, stage), authorRank(position), releaseAt(position)));
      });
      /**
       * Spec §3.3 step 7 — SCRUTINY (Premium only: a zero budget plans no slot). Once every planned round is decided and
       * reviewed, the needy nodes are chosen ONCE (`shapeRankScrutiny`) and get `roundsPerPoint` exchanges each, in the
       * reserved slots, breadth-first (`buildScrutinyLegs`: at most `nodesPerDebate` nodes, 2·R·Q slots — never more
       * than P2a priced); a slot no chosen node uses is given up. Never after a spend stop, too few members or a
       * failure (`arguingStopped`); the adaptive (δ) stop judges the PLANNED rounds converged, not the needy nodes, so
       * scrutiny still runs after it (pre-flight PF-B48, in `argueLeg`).
       */
      if (shapePlan !== null && shapeRun !== null && shapePlan.scrutiny.count > 0) {
        const plannedEnd = shapePlan.scrutiny.start;
        chains.push(runChain(async () => {
          await everyBoundaryDecided;
          await reviewRecorder.through(plannedEnd);
          await Promise.all(reviewBatches.filter((_batch, index) => reviewBatchEnds[index]! <= plannedEnd).map((batch) => batch.done));
          if (arguingStopped()) {
            scrutinyChosen.resolve([]);
            return;
          }
          const disputed = new Set(await this.#judgements.readDisputedNodeIds(run.runId));
          const boundary = lastBoundary;
          const recorded = new Set(boundary?.propagation.sensitivityRecords.map((record) => record.removedNodeId) ?? []);
          const candidates = [...authoredNodes.entries()].flatMap(([position, node]): ScrutinyCandidate[] => {
            // Pre-flight PF-B48: a node the stopping rule froze is never scrutinised (its legs would be skipped
            // silently); a cross-reply answers another position and is not a point of its own.
            if (position >= plannedEnd || shapeLegAt(position)?.kind === "CROSS" || frozenIndices.has(position)) return [];
            // Root leverage: only for a node the last boundary scored AND measured (`resolveLeverage` refuses a node
            // with no sensitivity record); none otherwise — the node can still be needy by spread or dispute.
            const leverage = boundary === null || !boundary.scoredNodeIds.has(node.nodeId) || !recorded.has(node.nodeId) ? null
              : resolveLeverage({ completedRounds: boundary.completedRounds, carryingNodeId: node.nodeId,
                sensitivityRecords: boundary.propagation.sensitivityRecords, rootNodeIds: boundary.rootNodeIds }).leverage;
            return [{ position, rootIndex: position < rootCount ? position : shapeLegAt(position)!.rootIndex,
              dispersion: node.panelDispersion, disputed: disputed.has(node.nodeId), rootLeverage: leverage, baseTau: node.baseTau }];
          });
          const chosen = shapeRankScrutiny({
            candidates,
            // No sealed panel policy: a spread never makes a node needy (the panel itself refuses such a run first).
            disagreementThreshold: panelPolicy?.disagreementThreshold ?? Number.POSITIVE_INFINITY,
            leverageMin: shapeRun.shape.scrutinyLeverageMin,
            weakBelow: shapeRun.shape.scrutinyWeakBelow,
            pointsPerDebate: shapePlan.scrutiny.nodesPerDebate
          });
          for (const leg of buildScrutinyLegs({ plan: shapePlan, depth: expansionDepth, selected: chosen })) scrutinyLegs.set(leg.childIndex, leg);
          scrutinyChosen.resolve(chosen.map((entry) => Object.freeze({ position: entry.position, nodeId: authoredNodes.get(entry.position)!.nodeId })));
        }, [reviewBatchOf(plannedEnd - 1), 3, 1], () => scrutinyChosen.resolve([])));
        for (let slot = shapePlan.scrutiny.start; slot < totalPlannedNodes; slot += 1) {
          chains.push(runChain(async (stage) => {
            await scrutinyChosen.promise;
            const leg = scrutinyLegs.get(slot);
            // A slot no chosen node uses is given up (the chain's release).
            if (leg === undefined) return;
            await argueLeg(leg, undefined, stage);
          }, authorRank(slot), releaseAt(slot)));
        }
      }
      const allSettled = (async () => {
        await Promise.allSettled(chains);
        await Promise.allSettled([everyBoundaryDecided, earlierBatches]);
        await nodeRecorder.done();
        await reviewChoices.done();
        await reviewRecorder.done();
      })();
      // Spec §2.3 — the keep-alive stop: the debate ends NOW, with today's code, and the calls in flight are never
      // awaited (their receipts still land; the lane was stopped, so nothing new is sent, and nothing more is saved:
      // the body has failed). Every promise left behind is handled, so none can reject unhandled. Any other way, every
      // chain is awaited and the first failure in today's order is thrown, as before.
      const keepAliveRefusal = await Promise.race([allSettled.then(() => null), keepAliveStopped.promise]);
      if (keepAliveRefusal !== null) {
        for (const abandoned of [allSettled, ...chains, everyBoundaryDecided, earlierBatches]) abandoned.catch(() => undefined);
        throw keepAliveRefusal;
      }
      throwBodyFailure();
    };
    if (chainsRun) {
      /**
       * Spec §2.3 (O6; Task 10 review carry, ruled) — NO AUTHOR OR REVIEW CALL STARTS ONCE THE ARGUING HAS STOPPED, not
       * even one already waiting in the lane: the lane asks this guard at the moment it would start a call, and holds a
       * refused one back (CALL_LANE_HELD_BACK: never sent; its chain ends as a stopped chain ends). Panel calls always
       * start — the panel of a node whose author call was sent finishes that paid step. A spend refusal is known to the
       * guard from the moment it leaves the lane, before its slot frees (`laneCallFailed`): with the cheaper-model
       * setting off (B9) every such refusal stops the arguing once its chain hears it, so nothing waiting behind it
       * slips out first; with the setting on, a refusal may instead move to a cheaper maker, so only the recorded stop
       * counts. Only here: today's serial engine (one call at a time) never has a guard.
       *
       * Ruling R30 (Task 12 fix round 1) — A KEEP-ALIVE REFUSAL ENDS THE ARGUING WHICHEVER CALL MET IT. The keep-alive
       * sits below the lane, so every refusal it makes passes this hook — a panel member's too, which the panel would
       * otherwise take as one failed member while other nodes' author calls land, run their panels and save, with
       * another copy maybe running the same debate (L4-F9). So, whatever the cheaper-model setting: the body is failed
       * (nothing more is saved), the lane stopped (nothing more is sent) and the arguing ends at once (`keepAliveStopped`).
       */
      let spendRefusalSeen = false;
      const spendRefusalsCount = this.settings.bodyCostFallback !== true;
      laneCallFailed = (error) => {
        if (keepAliveStop(error)) {
          bodyFailed = true;
          callLane?.stop();
          keepAliveStopped.resolve(error);
          return;
        }
        if (spendRefusalsCount && expansionPhaseStop(error) !== null) spendRefusalSeen = true;
      };
      callLane?.guardStarts((ticket: CallTicket) =>
        (ticket.priority !== "AUTHOR" && ticket.priority !== "REVIEW") || !(spendRefusalSeen || arguingStopped()));
      try {
        await argueTogether();
      } finally {
        // The answer's own calls follow: they are never held back.
        callLane?.guardStarts(null);
        laneCallFailed = null;
      }
    } else {
      let activeExpansionRound = expansionPlan[0]?.round ?? null;
      for (const [legIndex, leg] of expansionPlan.entries()) {
        // C1: an earlier leg, or a review between rounds, reached a spend bound.
        // Expansion stops here and, since Task M2, the run carries what it has
        // on to its answer; the stop rides that answer as its envelope record.
        if (runBodyBudgetStop !== null) break;
        // Fix (d): too few members left to argue ends the expansion as it ends the roots.
        if (tooFewLeftToArgue()) break;
        if (activeExpansionRound !== null && leg.round !== activeExpansionRound) {
          await reviewPendingAuthoredNodes();
          activeExpansionRound = leg.round;
          // RE-REVIEW I5: the review above can itself reach the bound, and the
          // loop-top check has already run for this iteration. Without this the
          // leg below would be authored — one more billed call — after the run
          // was told it cannot pay.
          if (runBodyBudgetStop !== null) break;
          if (tooFewLeftToArgue()) break;
        }
        const skipped = haltedIndices.has(leg.parentIndex) || haltedIndices.has(leg.childIndex)
          || frozenIndices.has(leg.parentIndex) || frozenIndices.has(leg.childIndex)
          || droppedSubtreeIndices.has(leg.parentIndex) || droppedSubtreeIndices.has(leg.childIndex);
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
        }, leg.childIndex);
        } catch (error) {
          // C1: a spend refusal is not an expansion failure, and nothing is
          // recorded as halted: no transport failed. The refusal may have come on
          // the leg's own author call (money and the attempt ceiling refuse before
          // sending) or on its panel, after the author call was made and billed
          // (a usage stop always comes after its call). Either way no node is
          // minted for the leg, and the branch simply stops being expanded.
          const stop = expansionPhaseStop(error);
          if (stop === null) throw error;
          runBodyBudgetStop = stop;
          break;
        }
        // A saved leg is already in `authoredNodes`, at its plan position (`leg.childIndex`).
        if (authored.kind === "HALTED") {
          const indices = plannedSubtreeIndices;
          indices.forEach((index) => haltedIndices.add(index));
          haltedExpansionRecords.push({ ...authored.record, plannedLegCount: indices.length });
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
      for (const [exchangeIndex, exchange] of crossExchangePlan.entries()) {
        // C1: same rule as the expansion loop above.
        if (runBodyBudgetStop !== null) break;
        // Fix (d): too few members left ends the exchanges; a dropped root neither defends nor is attacked.
        if (tooFewLeftToArgue()) break;
        if (satOutDuringRun.has(exchange.authorRootIndex) || satOutDuringRun.has(exchange.targetRootIndex)) continue;
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
        }, effectiveMakerCount + expansionPlan.length + exchangeIndex);
        } catch (error) {
          const stop = expansionPhaseStop(error);
          if (stop === null) throw error;
          runBodyBudgetStop = stop;
          break;
        }
        // A saved exchange is already in `authoredNodes`, at its plan position (after every expansion leg's).
        if (authored.kind === "HALTED") haltedExpansionRecords.push(authored.record);
        else noteOwnReplyEdges(authored.value);
      }
      await reviewPendingAuthoredNodes();
    }
    // Debate shape: the arguing is over — a scrutiny it never reached chose nothing (first settle wins).
    scrutinyChosen.resolve([]);
    // Root 0's chain ran its panel or failed, and a failure was thrown just above.
    const selection = rootZeroPanel.selection;
    if (selection === null) {
      throw new TypedDomainError("MAKER_POSITION_UNAVAILABLE", "The primary maker position's panel did not finish");
    }

    const authoredNodeList = [...authoredNodes.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, authored]) => authored);
    const authoredMakerPositions = Array.from({ length: rootCount }, (_, index) => authoredNodes.get(index))
      .filter((candidate): candidate is AuthoredDebateNode => candidate !== undefined);
    // Reclaim resume: a node of this run that THIS copy did not save (a copy that lost the run, still writing) is set
    // aside before the graph is scored, so the answer is built on this copy's tree alone; a map position such a copy
    // pointed at its own root is moved to this copy's root.
    if (await this.#graph.retireNodes(run.runId, authoredNodeList.map((node) => node.nodeId), retireClaim()) > 0) {
      for (let rootIndex = 0; rootIndex < rootCount; rootIndex += 1) {
        const root = authoredNodes.get(rootIndex);
        if (root !== undefined) await writeMapPosition(rootIndex, root);
      }
    }
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
    /**
     * Run resilience (spec 2026-10-12, fix (d); ruling R-b): the claim-eligible members that sat out during the
     * arguing, as the answer discloses them (`RUN_PANEL_REVISED:<ref>=PROVIDER_BUSY|PROVIDER_GATE_UNAVAILABLE`,
     * merged into the CRITIQUE-UNAVAILABLE record below); null on every other run.
     */
    const panelRevisedDuringRun = runPanelRevisedReason(sitOut, configuredMakers.map((maker) => maker.providerRef));
    /**
     * A10's PointInvestigationRecord is nested (`investigator`, `standings`); this is the one mapping. A row that never
     * reached a reply (UNAVAILABLE, a money stop included) names the planned member's model id, as B5 does for a failed
     * judge (`panelModelIds`, the run's discovered panel, apps/runner/src/index.ts:5824 (at 1bc8f549b)). The repository
     * answers INSERTED / ALREADY_PRESENT / RUN_ERASED. A RUN_ERASED is deliberately ignored here (pre-flight PF-R2a8.7).
     * An ALREADY_PRESENT (another write stored this point first; open question 8) hands back the STORED row, read back,
     * which stands in for this copy's own in every later reading (A10's write-once rule, as the map's stored result
     * does in `resolveShapeMap`); never this copy's fresh outcome.
     */
    const recordPointInvestigationRow = async (row: PointInvestigationRow): Promise<PointInvestigationRow | undefined> => {
      const outcome = await this.#pointInvestigations.recordPointInvestigation({
        runId: run.runId, nodeId: row.nodeId, investigationOrder: row.investigationOrder, result: row.result,
        basis: row.basis,
        investigator: row.maker === null || row.providerRef === null ? null : Object.freeze({
          maker: row.maker, providerRef: row.providerRef,
          modelId: row.modelId ?? panelModelIds.get(row.providerRef) ?? row.providerRef
        }),
        rawArtifactRef: row.rawArtifactRef,
        standings: row.standingsMoved === null || row.leaderWithoutRootNodeId === null || row.leaderWithRootNodeId === null
          ? null
          : Object.freeze({ leaderWithoutRootNodeId: row.leaderWithoutRootNodeId,
            leaderWithRootNodeId: row.leaderWithRootNodeId, moved: row.standingsMoved }),
        content: row.content
      });
      if (outcome !== "ALREADY_PRESENT") return undefined;
      const stored = (await this.#pointInvestigations.readPointInvestigationsForRun(run.runId))
        .find((entry) => entry.nodeId.toLowerCase() === row.nodeId.toLowerCase());
      // The stored row, under this copy's spelling of the node id (the ledger hands ids back lower-case).
      // Unreachable today: a reclaim sets earlier copies' nodes aside, so a second record for one (run, node) cannot arise.
      return stored === undefined ? undefined : Object.freeze({ ...pointInvestigationRowOfStored(stored), nodeId: row.nodeId });
    };
    /**
     * Engine 2 (spec §4.2b, E13; INTERFACE §8): the investigations of "cannot assess" points, after every review and
     * before the final propagation. Each qualifying point gets one row; its outcome is read as the review it lacked.
     * It returns the statuses for `engineInvestigated` and keeps the facts and rows for the record, which is written
     * after the serve decision (Ruling PF-R2a8.10). Engine 1 never reaches this.
     */
    const investigateCannotAssessPoints = async (
      settings: EngineSettings,
      facts: ReadonlyMap<string, EngineNodeFacts>,
      materialisedSnapshot: EvaluationSnapshot
    ): Promise<Readonly<{
      statuses: ReadonlyMap<string, EngineReviewStatus>;
      facts: ReadonlyMap<string, EngineNodeFacts>;
      rows: readonly PointInvestigationRow[];
    }>> => {
      const rootIds = new Set(authoredMakerPositions.map((root) => root.nodeId));
      const ownNodeIds = new Set(authoredNodeList.map((node) => node.nodeId));
      const cannotAssess = [...facts.values()]
        .filter((entry) => entry.status === "CANNOT_ASSESS" && ownNodeIds.has(entry.nodeId) && !rootIds.has(entry.nodeId))
        .map((entry) => entry.nodeId);
      if (cannotAssess.length === 0) return Object.freeze({ statuses: new Map(), facts, rows: Object.freeze([]) });
      if (lengthGuidance === null) {
        throw new TypedDomainError("ENGINE_REQUIRES_LENGTH_POLICY", "Engine 2 runs only with the length row frozen on its receipt");
      }
      const engineSeal = this.settings.engine?.engineContractHash;
      if (engineSeal === undefined) {
        throw new TypedDomainError("ENGINE_RUNNER_UNCONFIGURED", "Engine 2's calls carry the engine seal this runner was not given");
      }
      // Before the final propagation the points' honest scores (their base strengths) stand in for final strengths:
      // they order the candidates; the investigator's material carries no number.
      const honestScores = new Map(materialisedSnapshot.nodes.map((node) => [node.nodeId, node.baseStrength ?? 0] as const));
      const reviews = await readEngineReviews(this.pool, run.runId, cannotAssess);
      const source = engineSourceWithMap(engineMaterialSourceOf(engineMaterialGraphOf({
        question: run.questionLine,
        rootCount,
        authored: authoredNodes,
        mapWords: Array.from({ length: rootCount }, (_unused, rootIndex) => shapePositions?.[rootIndex]?.statement ?? null),
        snapshot: materialisedSnapshot,
        facts,
        honestFinalStrength: honestScores
      }), reviews, new Map()), engineMapFactsNow());
      const lengthGuide = Object.freeze({ words: lengthGuidance.steps.investigator, languageCode: run.argumentLanguageTag,
        charactersPerWord: lengthGuidance.charactersPerWord });
      /** The seat each offered investigator came from (the identity object `pickPointInvestigator` hands back). */
      const investigatorSeat = new Map<PointInvestigationSeat, RunSeat>();
      const fairFor = (authorMaker: string, reviewerMaker: string) => (member: Readonly<{ maker: string }>): boolean =>
        member.maker !== authorMaker && member.maker !== reviewerMaker;
      const investigated = await runPointInvestigations({
        engine: settings,
        facts,
        candidates: engineInvestigationCandidates({ source, cannotAssess, reviews, honestScores }),
        spendStopped: runBodyBudgetStop !== null,
        arguingMakers: new Set(authoredMakerPositions.map((root) => root.maker)),
        seatsFor: (candidate, callSiteKey) => {
          const fair = fairFor(candidate.authorMaker, candidate.reviewerMaker);
          return seatBook.reviewer.flatMap((seat) => {
            if (seatSitsOut(seat)) return [];
            const first = seatCaller.plan(seat, callSiteKey, { eligible: fair });
            if (first === null) return [];
            const identity: PointInvestigationSeat = Object.freeze({ maker: first.maker, providerRef: first.providerRef });
            investigatorSeat.set(identity, seat);
            return [identity];
          });
        },
        rotationOffsetOf: (callSiteKey) => seatRotationOffset({ runId: run.runId, role: "REVIEWER", callSiteKey }),
        materialOf: (nodeId) => pointInvestigationMaterialOf(source, nodeId),
        call: async ({ callSiteKey, investigator, candidate, material }) => {
          const seat = investigatorSeat.get(investigator);
          if (seat === undefined) {
            logPointInvestigation("INVESTIGATION_UNAVAILABLE", { runId: run.runId, callSiteKey, code: "INVESTIGATOR_SEAT_UNPLANNED" });
            return Object.freeze({ kind: "UNAVAILABLE" as const });
          }
          const fair = fairFor(candidate.authorMaker, candidate.reviewerMaker);
          // B9: a call moved to a cheaper maker never lands on the point's author or its reviewer either.
          movedCallBars.set(callSiteKey, fair);
          try {
            const answered = await seatCaller.callSeat({
              seat,
              callSiteKey,
              eligible: fair,
              fair,
              call: (member, memberCallSiteKey) => member.judge.investigatePoint({
                runId: run.runId,
                subjectItemId: claimed.workItemId,
                callSiteKey: memberCallSiteKey,
                providerRef: member.providerRef,
                contractHash: engineSeal,
                bound: guidedCallBound(this.settings.judgeBound, "investigator", lengthGuidance),
                material,
                length: lengthGuide,
                argumentLanguageName: run.argumentLanguageName,
                ...shapeLanguageInput,
              })
            });
            // R2a W3: the maker that answered is neither the author's nor the reviewer's (a breach is a code defect).
            assertFairInvestigator(answered.value.maker, candidate);
            return Object.freeze({ kind: "ANSWERED" as const, answer: Object.freeze({
              reply: answered.value.reply,
              rawArtifactRef: answered.value.provenanceRef,
              maker: answered.value.maker,
              providerRef: actualAuthor(callSiteKey, answered.member).providerRef,
              modelId: answered.value.model
            }) });
          } catch (error) {
            if (pointInvestigationFailureOutcome(error) === "RETHROW") throw error;
            logPointInvestigation("INVESTIGATION_UNAVAILABLE", { runId: run.runId, callSiteKey, code: pointInvestigationFailureCode(error) });
            return Object.freeze({ kind: "UNAVAILABLE" as const });
          }
        }
      });
      // A HOLDS or FAILS outcome is the review the point lacked (AGREE / DISPUTE); a dead end stays cannot-assess. A
      // FAILS point keeps `cannotAssessReview`, so A6 keeps its links at the cannot-assess weight and puts the dispute
      // weight on its score (pre-flight PF-R2a8.11).
      return Object.freeze({
        statuses: engineInvestigatedStatuses(investigated.rows),
        facts: investigated.facts,
        rows: investigated.rows
      });
    };
    /** A14: the investigations' facts and rows, kept for the record after the serve decision (null: none ran). */
    let engineInvestigation: Readonly<{
      statuses: ReadonlyMap<string, EngineReviewStatus>;
      facts: ReadonlyMap<string, EngineNodeFacts>;
      rows: readonly PointInvestigationRow[];
    }> | null = null;
    if (engine.engine === 2 && effectiveMakerCount > 1) {
      const investigationFacts = engineNodeFactsOf({
        reviewedNodeIds: await this.#judgements.readReviewedNodeIds(run.runId),
        disputedNodeIds: await this.#judgements.readDisputedNodeIds(run.runId),
        cannotAssessNodeIds: await this.#judgements.readCannotAssessNodeIds(run.runId),
        ownReplyEdgeIds
      });
      engineInvestigation = await investigateCannotAssessPoints(engine, investigationFacts, snapshot);
      for (const [nodeId, status] of engineInvestigation.statuses) engineInvestigated.set(nodeId, status);
    }
    /**
     * Engine 2 (spec §4.2a; INTERFACE §7.2): the link rules on the graph the answer is served from. Null on engine 1:
     * the decision below reads today's graph and seed, value for value. R2a interim (practice registers only): the
     * served root is `selectServedRootByStrength` over these honest final strengths and the label today's ladder; B5
     * replaces both with the comparing judges.
     */
    const engineServeLinked = engine.engine === 2
      ? await engineLinkedGraphNow(snapshot, effectiveMakerCount <= 1 ? [] : await this.#judgements.readReviewedNodeIds(run.runId))
      : null;
    const serveDecisionInput = Object.freeze({
      // It counts the servable roots: the shape's P (always at least two, never the mono-maker footing) or today's M.
      effectiveMakerCount: rootCount,
      runBodyBudgetStop,
      authoredMakerPositions,
      snapshot: engineServeLinked === null ? snapshot : engineServeLinked.snapshot,
      materialisedNodeIds: materialised.nodes.map((node) => node.nodeId),
      reviewedNodeIds: engineServeLinked !== null ? engineServeLinked.reviewedNodeIds : effectiveMakerCount <= 1
        ? []
        : await this.#judgements.readReviewedNodeIds(run.runId),
      unjudgedReviewNodeIds: [
        ...hiddenReviewRecords.map(({ nodeId }) => nodeId),
        ...unassessedReviewRecords.map(({ nodeId }) => nodeId)
      ],
      monoMakerConditionMarks,
      monoMakerRecords,
      // Fix (d): the arguing that ended because too few members were left is not money, and says why.
      ...(tooFewLeftToArgue() ? { membersSatOut: panelRevisedDuringRun } : {})
    });
    /**
     * Engine 2 (spec 2026-10-15 §4.3-§4.4, §4.7; R2b) — THE COMPARING JUDGES, after the arguing, the reviews, the
     * investigations and the final propagation, before the label and the answer writer. They read the honest final
     * strengths of this same decision (taken once by strength: pure, no call); the decision below is then taken again
     * with their verdict, from the same inputs, so the projection and the propagation are identical and only the served
     * root and its disclosure follow the judges. Nothing here fails the debate but a code defect or a stop that ends this
     * copy (`runComparingJudges`). Engine 1: null, and the decision is today's, taken once.
     */
    const engineTwo = engine.engine === 2 ? engine : null;
    const comparingJudges = engineTwo === null ? null : await (async () => {
      const strengthDecision = decideMakerPositionServe(serveDecisionInput);
      const strengthOf = new Map(strengthDecision.propagation.strengths.map((row) => [row.nodeId, row.strength] as const));
      const servable = new Set(strengthDecision.servableMakerPositions.map((root) => root.nodeId));
      // Engine 2 always links its serve graph (A8: `engineLinkedGraphNow` is null on engine 1 only). With an empty facts
      // map a cross-reply could be filed as a support of its own answer (pre-flight PF-R2a7.6, PF-R2b3.7).
      if (engineServeLinked === null) {
        throw new TypedDomainError("ENGINE_FACTS_INVALID", "Engine 2's judges read the link-weighted serve graph and its facts");
      }
      // The texts: the graph this decision served from is in memory (A12's `engineMaterialGraphOf`, over A8's
      // link-weighted snapshot and facts). Only the review reasons are read (A12's `readEngineReviews`, inside the
      // disclosure content lease this run body holds, plan deviation 18). The investigations are THIS copy's own
      // outcomes, from memory: A14 writes their rows only after the serve decision below (Ruling PF-R2a8.10), and these
      // are the outcomes this propagation used (pre-flight PF-R2b3.6).
      const graph = engineMaterialGraphOf({
        question: run.questionLine,
        rootCount,
        authored: authoredNodes,
        mapWords: Array.from({ length: rootCount }, (_unused, rootIndex) => shapePositions?.[rootIndex]?.statement ?? null),
        snapshot: engineServeLinked.snapshot,
        facts: engineServeLinked.facts,
        honestFinalStrength: strengthOf
      });
      const source = engineSourceWithMap(engineMaterialSourceOf(graph,
        await readEngineReviews(this.pool, run.runId, graph.points.map((point) => point.nodeId)),
        engineMaterialInvestigationsOf(engineInvestigation?.rows ?? [])), engineMapFactsNow());
      // Only servable answers are compared (letters stay fixed); every point is ordered by THIS pass's honest final
      // strength (the propagation receipt is recorded after the label); a point that did not propagate (hidden, no base,
      // or abstained) goes last, and only a point that should have propagated and has no strength is a code defect
      // (controller carry 7, B5 fix 1; pre-flight PF-R2b3.19). R4 (R4
      // pre-flight consistency; Ruling PF-R43.1): the servable source keeps its name, so R4's final writers' bundle reads
      // the very source the judges read (returned below as `materialSource`).
      const servableSource = comparingJudgesSourceOf({
        source,
        servableRootIds: servable,
        honestFinalStrength: strengthOf,
        propagatableNodeIds: new Set(strengthDecision.standing.snapshot.nodes
          .filter((node) => node.baseStrength !== null && node.abstained !== true).map((node) => node.nodeId)),
        standingNodeIds: new Set(strengthDecision.standing.snapshot.nodes.map((node) => node.nodeId)),
        hiddenNodeIds: new Set(strengthDecision.standing.hiddenNodeIds)
      });
      const material = engineMaterialOf(servableSource);
      const judgeLength = lengthGuideOf("comparing_judge").length;
      if (judgeLength === undefined) {
        // Unreachable: a receipt with `engine` and no `length` is refused when it is parsed (INTERFACE §1.5).
        throw new TypedDomainError("ENGINE_REQUIRES_LENGTH_POLICY", "Engine 2's judges read their words from the length row");
      }
      // The one engine seal of the run body (A14's source; pre-flight PF-R2b3.15): R1d's boot refuses a runner whose
      // register seal differs from `engineContractHash()`, and its per-run guard refuses an engine-2 run without it.
      const engineSeal = this.settings.engine?.engineContractHash;
      if (engineSeal === undefined) {
        throw new TypedDomainError("ENGINE_RUNNER_UNCONFIGURED", "Engine 2's calls carry the engine seal this runner was not given");
      }
      const judgeBound = guidedCallBound(this.settings.judgeBound, "comparing_judge", lengthGuidance);
      const planKey = comparingJudgeCallSiteKey(1);
      const judgeSeats = seatBook.judge.filter((seat) => !seatSitsOut(seat)).flatMap((seat) => {
        const member = seatCaller.plan(seat, planKey);
        return member === null ? [] : [Object.freeze({ seat, member })];
      });
      const runSeatOf = new Map(judgeSeats.map(({ seat, member }) => [member.providerRef, seat] as const));
      const modelIdOf = (member: Readonly<{ providerRef: string; candidate: SeatCandidate | null }>): string =>
        member.candidate?.modelId ?? panelModelIds.get(member.providerRef) ?? member.providerRef;
      const verdictVotes = new VerdictVoteRepository(this.pool);
      // A10's StoredVerdictVote is nested (`judge`, `choice`); this mapping is the one place that reads it.
      const recordedVoteOf = (row: StoredVerdictVote): RecordedComparingJudgeVote => Object.freeze({
        judgeSeat: row.judgeSeat, maker: row.judge.maker, providerRef: row.judge.providerRef, modelId: row.judge.modelId,
        rawArtifactRef: row.rawArtifactRef, chosenLetter: row.choice?.letter ?? null,
        conditional: row.choice?.conditional ?? null, sameAs: row.choice?.sameAs ?? [],
        questionKind: row.choice?.questionKind ?? null, reasons: row.choice?.reasons ?? null
      });
      const readRecordedVotes = async (): Promise<readonly RecordedComparingJudgeVote[]> =>
        (await verdictVotes.readVerdictVotesForRun(run.runId)).map(recordedVoteOf);
      const judged = await runComparingJudges({
        engine: engineTwo,
        material,
        arguedByMaker: new Map(authoredMakerPositions.map((root) => [root.nodeId, root.maker] as const)),
        honestFinalStrength: new Map([...strengthOf].filter(([nodeId]) => servable.has(nodeId))),
        candidates: judgeSeats.map(({ member }) => Object.freeze({
          maker: member.maker, providerRef: member.providerRef, modelId: modelIdOf(member)
        })),
        rotationOffset: seatRotationOffset({ runId: run.runId, role: "JUDGE", callSiteKey: planKey }),
        moneyStopped: runBodyBudgetStop !== null,
        recorded: await readRecordedVotes(),
        // Controller ruling R2b-B5.1: read again after the judges answered, so every fresh row's counted is the final tally's.
        readRecorded: readRecordedVotes,
        ask: async (judge) => {
          const judgeKey = comparingJudgeCallSiteKey(judge.seat);
          try {
            const runSeat = runSeatOf.get(judge.providerRef);
            if (runSeat === undefined) throw new TypedDomainError("COMPARING_JUDGE_SEAT_UNRESOLVED", judge.providerRef);
            // A stand-in member answers only for the same maker, so the maker rules (never two judges of one maker; a
            // vote for its own maker's answer ignored) hold for whoever answers.
            const sameMaker = (member: SeatIdentity): boolean => member.maker === judge.maker;
            const answered = await seatCaller.callSeat({
              seat: runSeat,
              callSiteKey: comparingJudgeCallSiteKey(judge.seat),
              eligible: sameMaker,
              fair: sameMaker,
              // The member's own gateway (lane-wrapped, sit-out aware), never the member's arguing judge: the judges'
              // calls never move to a cheaper maker the way an arguing call may (ruling PF-R2b1.1: B1 admits
              // comparing-judges.ts in s10-carrier-erasure-red's provider-call list for exactly this call shape). A
              // JUDGE call on the served lane: the arguing's (BODY) money and attempt ceiling, as the investigator's.
              call: (member, callSiteKey) => askComparingJudge(member.provider, {
                runId: run.runId,
                subjectItemId: claimed.workItemId,
                callSiteKey,
                argumentLanguageName: run.argumentLanguageName,
                ...shapeLanguageInput,
                material,
                seat: judge.seat,
                length: judgeLength,
                providerRef: member.providerRef,
                contractHash: engineSeal,
                bound: judgeBound
              })
            });
            return Object.freeze({
              reply: answered.value.reply, rawArtifactRef: answered.value.rawArtifactRef,
              maker: answered.member.maker, providerRef: answered.member.providerRef, modelId: answered.value.model
            });
          } catch (error) {
            // A failed judge is recorded as JUDGE_FAILED by the step; this line names it by code only, never its text.
            if (!endsThisCopy(error) && !comparingJudgeCodeDefect(error)) {
              logComparingJudge("JUDGE_FAILED", { runId: run.runId, callSiteKey: judgeKey, code: pointInvestigationFailureCode(error) });
            }
            throw error;
          }
        },
        // A10's VerdictVoteRecord is nested: a failed judge (no letter) records `choice: null` and JUDGE_FAILED. A seat
        // another write stored first (ALREADY_PRESENT; open question 8) hands back its STORED row, read back, which the
        // step then counts in place of this copy's vote (controller carry 6); one that cannot be read back is a code
        // defect. A RUN_ERASED is ignored, as A14's is. The counted column is a hint; readers recount through
        // deriveJudgesVerdict from the stored letters, groups and makers (controller ruling R2b-B5.1).
        record: async (vote) => {
          const choice = vote.chosenLetter === null || vote.chosenRootNodeId === null || vote.conditional === null
            || vote.questionKind === null || vote.reasons === null
            ? null
            : Object.freeze({ letter: vote.chosenLetter, rootNodeId: vote.chosenRootNodeId, conditional: vote.conditional,
              questionKind: vote.questionKind, sameAs: vote.sameAs, reasons: vote.reasons });
          const outcome = await verdictVotes.recordVerdictVote({
            runId: run.runId, judgeSeat: vote.judgeSeat,
            judge: Object.freeze({ maker: vote.maker, providerRef: vote.providerRef, modelId: vote.modelId }),
            rawArtifactRef: vote.rawArtifactRef, choice, counted: vote.counted, notCountedReason: vote.notCountedReason
          });
          return storedVoteOnConflict(outcome, vote.judgeSeat, readRecordedVotes);
        }
      });
      // R4 (R4 pre-flight consistency; Ruling PF-R43.1): R4's final writers read the judges' own servable source and this
      // pass's honest strengths (every node's, by node id; R4 Task 8 picks the servable roots' out of it). R2's readers of
      // `comparingJudges` (`.verdict`, `.records`, `.ballots`, `.verdictMaterial`) are unchanged.
      return Object.freeze({ ...judged, materialSource: servableSource, honestFinalStrength: strengthOf });
    })();
    const makerPositionServe = decideMakerPositionServe({
      ...serveDecisionInput,
      // Engine 2 (R2b): the comparing judges' verdict picks the served root; engine 1: today's decision.
      ...(comparingJudges === null ? {} : { judgesVerdict: comparingJudges.verdict })
    });
    /**
     * Engine 2 (spec §4.2b "Measured"; INTERFACE §8.6): the investigation rows, written now that the serve decision has
     * named the served graph. "Standings moved" is read on that graph (the operator-resolved snapshot projected on the
     * decision's own seed, BEFORE the link weights: projection and the link weights commute, A6's test) with every
     * outcome applied, over the servable roots only, so the record names the leader the served propagation names. The
     * rows as recorded (a row another write stored first stands in for this copy's own) then decide every later reading:
     * the investigation's facts, its statuses and `engineInvestigated`.
     */
    if (engine.engine === 2 && engineInvestigation !== null && engineInvestigation.rows.length > 0) {
      const investigation = engineInvestigation;
      const servedGraph = projectJudgedStanding(operatorResolvedSnapshot, makerPositionServe.judgedStandingSeed).snapshot;
      const servableRootIds = makerPositionServe.servableMakerPositions.map((root) => root.nodeId);
      const recordedRows = await recordPointInvestigationRows({
        rows: investigation.rows,
        facts: investigation.facts,
        standingsOf: (nodeId, finalFacts) => pointInvestigationStandings({
          snapshot: servedGraph, facts: finalFacts, engine, nodeId, servableRootIds
        }),
        record: recordPointInvestigationRow
      });
      const recordedFacts = engineFactsWithInvestigations(investigation.facts, recordedRows);
      const recordedStatuses = engineInvestigatedStatuses(recordedRows);
      engineInvestigation = Object.freeze({ statuses: recordedStatuses, facts: recordedFacts, rows: recordedRows });
      engineInvestigated.clear();
      for (const [nodeId, status] of recordedStatuses) engineInvestigated.set(nodeId, status);
    }
    // Task M3 (spec §14.4.5): what the arguing left for the owner's disclosure
    // row, taken HERE, where the body ends and the serve decision reads the same
    // stop. Nothing from the serve gate on reads the stop itself
    // (`tests/architecture/v28-serve-decision-wiring.test.ts`, pins 5 and 7).
    const serveDisclosureBody = serveDisclosureBodyFacts({ runBodyBudgetStop, decision: makerPositionServe });
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
    /**
     * Debate shape (spec §3.3 steps 1, 6, 7) — THE SHAPE'S RECORDS ON THE ANSWER, each with its mark. Pre-flight PF-B47:
     * `ServeRepository.persist` refuses a record that names no node, so every one names a node: a map record the served
     * root (answer scope, `mapConditionRecords`), a close-call or scrutiny record the node it extended (node scope).
     * Reasons are codes only (`<MARK>:<STEP>`, `<CODE>:<count>`), never text a person reads. Nothing on today's run.
     */
    const scrutinyRecords: ConditionMarkRecord[] = [];
    for (const { position, nodeId } of await scrutinyChosen.promise) {
      // Spec §3.3 step 7: one SCRUTINY-EXTENDED record per scrutinised node, naming the exchanges it got (saved ones).
      const added = [...scrutinyLegs.values()].filter((leg) => leg.chain === position)
        .flatMap((leg) => authoredNodes.get(leg.childIndex)?.nodeId ?? []);
      if (added.length === 0) continue;
      scrutinyRecords.push(Object.freeze({
        mark: "SCRUTINY-EXTENDED" as const, scope: "node" as const, subjectRef: nodeId,
        reason: `SCRUTINY_EXTENDED:${String(added.length)}`, liftPath: null, servedRootRule: null,
        affectedNodeIds: Object.freeze([nodeId, ...added])
      }));
    }
    // Controller ruling T14-P: the count is the extras that reduced (`runNodePanel`'s `closeCallAdded`).
    const closeCallRecords: readonly ConditionMarkRecord[] = closeCallExtensions.map((entry) => Object.freeze({
      mark: "PANEL-CLOSE-CALL-EXTENDED" as const, scope: "node" as const, subjectRef: entry.nodeId,
      reason: `PANEL_CLOSE_CALL_EXTENDED:${String(entry.added)}`, liftPath: null, servedRootRule: null,
      affectedNodeIds: Object.freeze([entry.nodeId])
    }));
    const mapRecords = shapeMapResult === null ? [] : mapConditionRecords(shapeMapResult, run.runId, servedRoot.nodeId);
    const shapeRecords: readonly ConditionMarkRecord[] = Object.freeze([...mapRecords, ...closeCallRecords, ...scrutinyRecords]);
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
    // T11 / engine 1: the sealed ladder. Engine 2 (spec 2026-10-15 §4.4; R2b): the comparing judges' label, rung 5; the
    // ladder is still derived from the same numbers but never served.
    const ladderLabel = deriveVerdictLabel(verdictLabelBasis);
    const verdictLabel = comparingJudges === null ? ladderLabel : verdictDerivationOfJudges(comparingJudges.verdict);
    // R2 B11 (record only): today's ladder over the same honest final strengths, for the practice report's comparison.
    const engine1Ladder = engineTwo === null ? null
      : engine1LadderOf(servableMakerPositions, propagation.strengths, Object.freeze({
        gamma: verdictLabelControls.gamma, highCut: verdictLabelControls.highCut,
        lowCut: verdictLabelControls.lowCut, disagreementThreshold: verdictLabelControls.disagreementThreshold
      }));
    // J23: the citable set follows the DIGEST — same source, same membership,
    // so "every load-bearing claim traces to a digest node" is satisfiable by
    // construction rather than by the synthesizer guessing. Exactly one node is
    // load-bearing (DR-159 B2-A clause 1); the rest are citable evidence. At
    // the digest's spine rung (Task M4) a left-out point stays in this set but
    // is not in the digest, and the writer's one mapping point
    // (`composedNodeIdOf`) refuses a citation of it.
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
        },
        // R2 B11: engine 2 only, record only: today's ladder (`labels.engine1LadderLabel`) and the groups the judges'
        // count used; never served, never read by a writer, the judges or the story.
        ...(engine1Ladder === null ? {} : { engine1Ladder }),
        ...(comparingJudges === null ? {} : { judgesGroups: comparingJudges.verdict.groups })
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
    /** Engine 2: every cannot-assess point no investigation settled, disclosed at its reduced weight (never hidden). */
    const engineLinkRecords: readonly ConditionMarkRecord[] = engineServeLinked === null ? [] : engineUnassessedRecords(engineServeLinked);
    const hiddenConditionMarks = Object.freeze([
      ...(absentAtClaim.length > 0 || panelRevisedDuringRun !== null ? ["CRITIQUE-UNAVAILABLE" as const] : []),
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
      ...new Set(panelDegradations.map((record) => record.mark)),
      // Debate shape: the map's fallbacks and fills, and the two extensions — each mark with its record (below).
      ...new Set(shapeRecords.map((record) => record.mark)),
      // Engine 2: the reduced-weight mark with its records (below); none on engine 1.
      ...new Set(engineLinkRecords.map((record) => record.mark)),
      // Engine 2 (R2b): a missing, unavailable or ignored judge is disclosed on the answer, each mark with its record.
      ...new Set((comparingJudges?.records ?? []).map((record) => record.mark))
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
    /**
     * ENGINE MONEY RULE (spec §14.4.2), TASK M3 — what each answer-writing call
     * left, keyed by the artifact it recorded: the draft a KEPT round is
     * persisted from (after a kept round, the last draft written is not the one
     * served), the maker that actually wrote each draft and checked each one,
     * and the last failure that escaped a role call and can end the loop on a
     * complete round. Read after the chain; never by the prompt.
     */
    const servedDrafts = new Map<string, Readonly<{
      segments: readonly ComposedSegment[];
      round: number;
      providerRef: string;
    }>>();
    const servedChecks = new Map<string, string>();
    const draftWriterByRound = new Map<number, string>();
    /**
     * Paid plans S1a (silent conflict 4): the member each round's seat asked FIRST
     * (written before the call; after a backup switch, overwritten by the member that
     * answered), so that only a money fallback leaves planned ≠ served (0076's CHECKs).
     */
    const writerPlannedByRound = new Map<number, string>();
    const checkerPlannedByRound = new Map<number, string>();
    /**
     * Run resilience (spec 2026-10-12, fix (a)): per round, the member a role moved to because its planned member sat
     * out the rest of the run. The disclosure row names that role's fallback ROLE_UNAVAILABLE, never MONEY.
     */
    const writerUnavailableByRound = new Map<number, string>();
    const checkerUnavailableByRound = new Map<number, string>();
    /** The member the checker's seat will ask first at `round` — the writer's `preferNot` (M3 review polish). */
    const plannedCheckerRef = (round: number): string => {
      if (seatBook.answerChecker === null) return synthesisRoles.evaluatorRoleRef;
      const siteKey = synthesisCallSiteKey({ role: "EVALUATOR", round });
      return (seatCaller.plan(seatBook.answerChecker, siteKey, synthesisSeatOptions("EVALUATOR", seatBook.answerChecker, siteKey))
        ?? seatBook.answerChecker.main).providerRef;
    };
    let servePhaseFailure: unknown = null;
    /** Task M4: the digest the answer-writer was handed (every round's is the same), for the owner's row. */
    let writerDigest: SynthesisDigest | null = null;
    const servePrices = this.settings.providerPrices ?? EMPTY_PROVIDER_PRICES;
    const whileServing = async <T>(call: () => Promise<T>): Promise<T> => {
      try {
        return await call();
      } catch (error) {
        if (keepsCompleteSynthesisRounds(error)) servePhaseFailure = error;
        throw error;
      }
    };
    let conditionMarkRecords: readonly ConditionMarkRecord[] = makerPositionServe.disclosure.records;
    conditionMarkRecords = Object.freeze([
      ...conditionMarkRecords,
      // T7 / S3-2: one typed record per frozen branch, minted at the round
      // boundary that froze it and carried whole to the answer.
      ...branchFrozenRecords,
      // Debate shape: one record per shape mark (map, close call, scrutiny); none on today's run.
      ...shapeRecords,
      // Engine 2: one UNASSESSED-AT-REDUCED-WEIGHT record per unsettled cannot-assess point; none on engine 1.
      ...engineLinkRecords,
      // Engine 2 (R2b): the comparing judges' records (none on engine 1).
      ...(comparingJudges?.records ?? []),
      // Run resilience (fix (d), R-b): the members that sat out during the arguing join the claim-time revision in
      // the ONE record; with none, the reason is today's to the byte.
      ...((absentAtClaim.length === 0 && panelRevisedDuringRun === null) || effectiveMakerCount === 1 ? [] : [Object.freeze({
        mark: "CRITIQUE-UNAVAILABLE" as const,
        scope: "answer" as const,
        subjectRef: servedRoot.nodeId,
        reason: [
          ...(absentAtClaim.length === 0 ? [] : [
            `CLAIM_PANEL_REVISED:${absentAtClaim.map(({ member, failureCode }) => `${member.provider_ref}=${failureCode}`).join(",")}`
          ]),
          ...(panelRevisedDuringRun === null ? [] : [panelRevisedDuringRun])
        ].join("|"),
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
    // Role rotation: the per-claim policy (the pin's two answer refs on a rotated run, else the sealed one).
    const synthesisRoles = synthesisRolePolicy;
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
     *
     * Task M4 (spec §14.4.3): each node also carries its LEVERAGE, from the
     * same sensitivity records the story reads, so the digest's spine rung
     * ranks "most decisive" by the story's own number. It is never sent.
     */
    const digestLeverage = digestLeverageByNodeId(propagation.sensitivityRecords);
    /**
     * Task M4 review round 2: what the answer's prose may repeat although it
     * looks like an internal id — every such token in the person's question
     * and in each node's full statement (not the digest's clipped summaries).
     */
    const personTexts = Object.freeze([run.questionLine, ...authoredNodeList.map((node) => node.statement)]);
    const personIdTokens = idShapedTokensIn(personTexts);
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
        && materialised.arrows.some((arrow) => arrow.sourceNodeId === node.nodeId && arrow.polarity === "attack"),
      leverage: digestLeverage.get(node.nodeId) ?? null
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
     * ENGINE MONEY RULE (spec §14.4.1), TASK M2 — A STOP WHILE ARGUING NEVER
     * SKIPS THE ANSWER.
     *
     * C1 (review round 2) asked the run body's own spend stop HERE and forced
     * the envelope decision to a hard stop with it, so a run stopped while
     * arguing took the components-only terminal and the answer-writer was never
     * called. V-28 is amended: the stop ends the arguing only. This question is
     * asked on the attempt count alone — J28's comparison, WITHIN at equality —
     * exactly as for a run that was never stopped, and a stopped run goes on to
     * the answer with the tree as it stands. The stop is not lost: it rides the
     * answer as its envelope record, appended after the chain.
     *
     * The only terminal taken here is the attempt-overspend one, for a run that
     * somehow spent MORE attempts than its receipt allows.
     */
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
      // its way of knowing and its marks. This list is the digest's membership.
      // The byte budget shortens the summaries, then each entry's shape; T9's
      // law as amended by Task M4 (spec §14.4.3) lets it drop membership at the
      // LAST rung only, only when every earlier rung is over budget, and the
      // drop is disclosed (the compressed mark, the owner's row).
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
        writerDigest ??= request.digest;
        const writerSiteKey = synthesisCallSiteKey({ role: "SYNTHESIZER", stage: request.stage, round: request.round });
        // A15: an assigned run's ANSWER_WRITER seat. The sealed ref is resolved ONLY without
        // one, against the claim-eligible set exactly as before (J8/J24): an assigned seat's
        // routes are never in `synthesisMakers` (`sealedRefRoles` leaves them out).
        const writerSeat = seatBook.answerWriter
          ?? legacySynthesisSeat("ANSWER_WRITER", resolveSynthesisRoleMaker(request.roleRef, "SYNTHESIZER"));
        const writerOptions = synthesisSeatOptions("SYNTHESIZER", writerSeat, writerSiteKey);
        // The member the seat asks first (the 80-20 ordinal, or the slot a resumed pass's
        // ledger prefers). A money refusal can only come from it (A16a: money never
        // switches), so it is the fallback's planned maker and this round's planned writer.
        const planned: ServeRoleMaker = seatCaller.plan(writerSeat, writerSiteKey, writerOptions) ?? writerSeat.main;
        writerPlannedByRound.set(request.round, planned.providerRef);
        // DL4-F4 / L4-F11: the packet used to be a bare instruction plus one
        // `JSON.stringify` of the whole request — the model-authored digest
        // summaries and the prior objection sat in the same compartment as the
        // engine's own `instructions`, with nothing saying which was which.
        // D2 + A17: ONE builder for the live call and moment:replay, in the question's language. Debate shape (spec §3.3
        // step 8; Task 5 binding note): a shaped run's writer is asked for about the row's answer length — every writer
        // call, first try and retries (each is a request through here); the checker's packet is never lengthed.
        const framed = buildSynthesisRolePrompt(request, run.argumentLanguageName, undefined, synthesisLength,
          shapeLanguage);
        const packet = framed.packet;
        /**
         * The draft as the engine reads it. Final review I-1: it is read INSIDE
         * the call each maker makes, so a cheaper maker's draft that this
         * reading refuses is that maker's content failure (`fallbackContentRefusal`).
         * For the planned maker nothing changes: the same codes end the run.
         */
        // All-steps format robustness (2026-10-12): the writer's classifier, remembered, so its accepted draft is read
        // again exactly as the classifier read it (the last tolerant repair depends on how the reply ended).
        // Problem 7 (2026-10-12): no score and no code token from this request's material in the prose.
        const writerWording = synthesisWordingIndex({ request, personTexts });
        const writerReading = rememberingAcceptedReply((content, reply) => classifyComposedContent(content, {
          digest: request.digest,
          servedNodes,
          exemptTokens: personIdTokens,
          wording: writerWording,
          // P2L Task 17: the question AND the lock — the reading drops the lock when the question is absent.
          questionLine: run.questionLine,
          ...shapeLanguageInput
        }, reply));
        const composedSegmentsOf = (content: string): readonly ComposedSegment[] => {
          const parsed = parseComposerOutput(content, writerReading.acceptedAs(content).reply);
          const segments = parsed.segments.map((segment) => {
            if (segment.segment_id === "memory:disclosure") {
              throw new TypedDomainError("COMPOSITION_CONTRACT_ERROR", "The memory disclosure segment id is reserved for the typed renderer");
            }
            return Object.freeze({
              segmentId: segment.segment_id,
              text: segment.text,
              loadBearing: false,
              // J23: a citation may name ANY node the digest carries, by the ref the
              // digest showed it under — its real id at rungs 0-5, its short ref at
              // the compact and spine rungs (Task M4) — and is mapped back to the
              // real id HERE, the one mapping point, before the sealed checks.
              // `"primary"` stays admissible as the served root's alias so sealed
              // prompts and fixtures written against the one-node set keep working;
              // an unknown ref is still a loud contract error.
              assertedNodeRefs: Object.freeze(segment.node_refs.map((ref) => composedNodeIdOf({
                ref,
                digest: request.digest,
                servedRootNodeId: servedRoot.nodeId,
                servedNodes
              }))),
              servedNumberRefs: Object.freeze([...segment.served_number_refs])
            });
          });
          // The sealed chain refuses repeated segment ids with this same code;
          // read here first, so a fallback's draft that repeats one is its content
          // failure too. The planned maker's run ends exactly as it did.
          if (new Set(segments.map((segment) => segment.segmentId)).size !== segments.length) {
            throw new TypedDomainError("COMPOSITION_CONTRACT_ERROR", "Composed segment ids must be stable and unique");
          }
          return segments;
        };
        // Task M3 (spec §14.4.2): refused for MONEY, this SAME request — call
        // site, framed prompt, bound — is offered to the cheaper claim-eligible
        // makers; only the provider changes, and the seam decides what fits.
        // M3 review polish: the planned CHECKER's maker is offered last, so the
        // cheapest fallback writer is not the maker that will check its draft
        // whenever another maker fits. Paid plans S1a: the planned call is the
        // SEAT (main or runner-up, the backup on a cap now or an outage after
        // retries, R4), and the fallback wraps it, so a money refusal — which the
        // seat caller never switches on (A16a) — still reaches the cheaper makers.
        const served = await whileServing(() => callServeRoleWithFallback({
          planned,
          claimEligible: synthesisMakers,
          prices: servePrices,
          // Run resilience (spec 2026-10-12, fix (a)): a writer that sits out hands the round on (ROLE_UNAVAILABLE).
          ...(sitOut === null ? {} : { sitOut }),
          preferNot: plannedCheckerRef(request.round),
          call: async (maker, call) => {
            if (maker === planned) {
              const answered = await callSynthesisRole(() => seatCaller.callSeat({
                seat: writerSeat,
                callSiteKey: writerSiteKey,
                ...writerOptions,
                call: (member, callSiteKey) => member.provider.call({ ...call, callSiteKey, providerRef: member.providerRef })
              }), { role: "SYNTHESIZER", callSiteKey: writerSiteKey }, "COMPOSITION_CONTRACT_ERROR");
              // A backup switch is not a fallback: the member that answered is this round's planned writer.
              writerPlannedByRound.set(request.round, answered.member.providerRef);
              return Object.freeze({
                response: answered.value,
                recordedKey: answered.callSiteKey,
                servedRef: answered.member.providerRef,
                composedSegments: composedSegmentsOf(answered.value.content)
              });
            }
            const response = await callSynthesisRole(() => maker.provider.call(call),
              { role: "SYNTHESIZER", callSiteKey: call.callSiteKey }, "COMPOSITION_CONTRACT_ERROR");
            return Object.freeze({
              response, recordedKey: call.callSiteKey, servedRef: maker.providerRef, composedSegments: composedSegmentsOf(response.content)
            });
          },
          onFallbackFailure: fallbackContentRefusal,
          request: {
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
            // A15: a seat call appends the seat marker; the prefix stays.
            callSiteKey: writerSiteKey,
            role: "SYNTHESIZER",
            lane: "served",
            modelRole: "ANSWER_WRITER",
            // W10/3: the SYNTHESIZER's own sealed bound. It used to be
            // `composerBound` — an organ T9 retired — which is how the longest
            // generation in the system ended up with a 60-second clock while the
            // judge, answering about ONE node, had 180.
            // Debate shape (spec §3.3 step 8): max(the sealed bound, the row's writer bound) — never under the sealed one;
            // the sealed bound itself, the same object, on today's run (`shapeWriterBound`).
            bound: guidedCallBound(shapeWriterBound(this.settings.synthesisRolePolicy.synthesizerBound,
              shapeRun === null ? null : shapeRun.shape.writerBound), "answer_writer", lengthGuidance),
            contractHash: this.settings.composerContractHash,
            // Length guidance: the writer is told its target, so its words are recorded beside what it wrote.
            ...(lengthGuidance === null ? {} : { guidedWords: lengthGuidance.steps.answer_writer }),
            providerRef: planned.providerRef,
            packet,
            // Task M4 review fix I-1: the schema, then the prose and the cited refs.
            classifyContent: writerReading.classifyContent,
            buildRepairPacket: (rejected) => buildComposedRepairPacket(framed, rejected)
          }
        }));
        const { response, recordedKey: synthesizerCallSiteKey, servedRef: writerServedRef, composedSegments } = served.result;
        if (served.movedFor === "ROLE_UNAVAILABLE") writerUnavailableByRound.set(request.round, writerServedRef);
        const renderedMemory = renderMemorySentence(factBundle.memoryDisclosure);
        validateMemorySentence(factBundle.memoryDisclosure, renderedMemory);
        const partitioned = partitionServedSegments(composedSegments, renderedMemory);
        finalSegments = partitioned.persistedSegments;
        compositionRawArtifactRef = response.rawArtifactRef;
        // `serve_state` reads this: round 1 COMPOSED, a later round
        // RECOMPOSED_ONCE. The loop round IS the composition attempt now.
        compositionAttempt = request.round;
        servedDrafts.set(response.rawArtifactRef, Object.freeze({
          segments: partitioned.persistedSegments,
          round: request.round,
          providerRef: writerServedRef
        }));
        // The checker's `preferNot` reads the REAL writer, after a backup switch too.
        draftWriterByRound.set(request.round, writerServedRef);
        // M3 review polish: an empty draft is what the sealed chain answers with
        // SYNTHESIS_NO_ARTIFACT, its first check on every draft; it ends the loop
        // (kept on a complete round), so the owner's record names it. The
        // composition schema requires a segment, so today nothing reaches this.
        if (partitioned.conformanceSegments.length === 0) {
          servePhaseFailure = new TypedDomainError(
            "SYNTHESIS_NO_ARTIFACT",
            `The synthesizer returned no segment to serve at ${synthesizerCallSiteKey}`
          );
        }
        return {
          candidate: partitioned.conformanceSegments,
          // codex r1 B2: the RECORDED artifact for THIS round. `compositionRawArtifactRef`
          // is overwritten by the next round, so the retry's back-reference has to be
          // the per-round value taken here, never that field read later.
          candidateRef: response.rawArtifactRef,
          // codex r3 B2: the producer identity travels with the reference, and
          // `persist` checks the pair against the ledger before committing. It is
          // the key the call was RECORDED under (a seat marker on a seat call, bare
          // on a fallback).
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
        const checkerSiteKey = synthesisCallSiteKey({ role: "EVALUATOR", round: request.round });
        const checkerSeat = seatBook.answerChecker
          ?? legacySynthesisSeat("ANSWER_CHECKER", resolveSynthesisRoleMaker(request.roleRef, "EVALUATOR"));
        const checkerOptions = synthesisSeatOptions("EVALUATOR", checkerSeat, checkerSiteKey);
        const planned: ServeRoleMaker = seatCaller.plan(checkerSeat, checkerSiteKey, checkerOptions) ?? checkerSeat.main;
        checkerPlannedByRound.set(request.round, planned.providerRef);
        const framed = buildSynthesisRolePrompt(request, run.argumentLanguageName, undefined, checkerLength, shapeLanguage);
        const packet = framed.packet;
        /**
         * The verdict as the engine reads it, its coherence included (the loop
         * checks it again, unchanged). Final review I-1: read INSIDE the call
         * each maker makes, like the writer's draft, so a cheaper checker whose
         * verdict this reading refuses has left nothing to serve.
         */
        // All-steps format robustness (2026-10-12): remembered as the writer's is.
        const checkerReading = rememberingAcceptedReply((content, reply) => classifyEvaluatorContent(content, reply, run.questionLine, shapeLanguage));
        const evaluatorVerdictOf = (content: string): EvaluatorVerdict => {
          const parsed = parseEvaluatorOutput(content, checkerReading.acceptedAs(content).reply);
          return assertEvaluatorVerdict(Object.freeze({
            satisfied: parsed.satisfied,
            objection: parsed.objection,
            criteria: Object.freeze({
              fairnessToLosers: parsed.criteria.fairness_to_losers,
              statementLabelAgreement: parsed.criteria.statement_label_agreement,
              noOverstatement: parsed.criteria.no_overstatement,
              restatement: parsed.criteria.restatement,
              citationTracing: parsed.criteria.citation_tracing
            })
          }));
        };
        // Task M3 (spec §14.4.2): the checker's cost fallback prefers a maker
        // other than the one that wrote the draft it checks — the member that
        // REALLY wrote it — and takes that one only when nothing else fits (the
        // disclosure row records it, R9). The planned call is the SEAT (S1a).
        const served = await whileServing(() => callServeRoleWithFallback({
          planned,
          claimEligible: synthesisMakers,
          prices: servePrices,
          // Run resilience (fix (a)): a checker that sits out hands the round on (ROLE_UNAVAILABLE).
          ...(sitOut === null ? {} : { sitOut }),
          preferNot: draftWriterByRound.get(request.round) ?? null,
          call: async (maker, call) => {
            if (maker === planned) {
              const answered = await callSynthesisRole(() => seatCaller.callSeat({
                seat: checkerSeat,
                callSiteKey: checkerSiteKey,
                ...checkerOptions,
                call: (member, callSiteKey) => member.provider.call({ ...call, callSiteKey, providerRef: member.providerRef })
              }), { role: "EVALUATOR", callSiteKey: checkerSiteKey }, "EVALUATOR_CONTRACT_ERROR");
              checkerPlannedByRound.set(request.round, answered.member.providerRef);
              return Object.freeze({
                response: answered.value,
                recordedKey: answered.callSiteKey,
                servedRef: answered.member.providerRef,
                verdict: evaluatorVerdictOf(answered.value.content)
              });
            }
            const response = await callSynthesisRole(() => maker.provider.call(call),
              { role: "EVALUATOR", callSiteKey: call.callSiteKey }, "EVALUATOR_CONTRACT_ERROR");
            return Object.freeze({ response, recordedKey: call.callSiteKey, servedRef: maker.providerRef, verdict: evaluatorVerdictOf(response.content) });
          },
          onFallbackFailure: fallbackContentRefusal,
          request: {
            runId: run.runId,
            subjectItemId: claimed.workItemId,
            // Same contract as the synthesizer's key above: `POST_COMPOSE_R9:%`
            // feeds `r9_calls`, which the R9 battery row prints in its executed
            // check ref. The evaluator IS the restatement check now, so the slot
            // is still occupied and the ref still names something that happened.
            callSiteKey: checkerSiteKey,
            role: "EVALUATOR",
            lane: "served",
            modelRole: "ANSWER_CHECKER",
            // W10/3: the EVALUATOR's own sealed bound, formerly CONFORMANCE's.
            bound: guidedCallBound(this.settings.synthesisRolePolicy.evaluatorBound, "answer_checker", lengthGuidance),
            contractHash: this.settings.conformanceContractHash,
            // Length guidance: the checker is told its own target, so its words are recorded beside what it wrote.
            ...(lengthGuidance === null ? {} : { guidedWords: lengthGuidance.steps.answer_checker }),
            providerRef: planned.providerRef,
            packet,
            classifyContent: checkerReading.classifyContent,
            buildRepairPacket: (rejected) => buildSchemaRepairPacket(framed, rejected)
          }
        }));
        const { response, recordedKey: evaluatorCallSiteKey, servedRef: checkerServedRef, verdict } = served.result;
        if (served.movedFor === "ROLE_UNAVAILABLE") checkerUnavailableByRound.set(request.round, checkerServedRef);
        conformanceRawArtifactRefs.push(response.rawArtifactRef);
        servedChecks.set(response.rawArtifactRef, checkerServedRef);
        return Object.freeze({
          verdict,
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
      // Task M3 (spec §14.4.2): the answer serves the chain's LAST round, and
      // after a kept round that is not the last draft written. The persist takes
      // that round's own draft, artifact and attempt, never a later draft its
      // checker did not read — and, for a result that serves NO round (a crash
      // class the chain returned after a draft was written, e.g. round 1's
      // checker transport dying), no draft at all. With a stale draft attached
      // the sealed persist wrote the composed text and then a conformance record
      // with the crash result's coverage mode `NOT_RUN`, which the database's
      // CHECK refuses (`serve.conformance_record.coverage_mode IN
      // ('EXHAUSTIVE','SAMPLED')`, 23514): ANSWER_PERSIST_FAILED, and the whole
      // run failed instead of ending components-only / DEFECT.
      const servedRound = result.loopRounds.at(-1);
      if (servedRound === undefined) {
        finalSegments = [];
        compositionRawArtifactRef = null;
        compositionAttempt = 0;
        conformanceRawArtifactRefs.length = 0;
      } else {
        const draft = servedDrafts.get(servedRound.candidateRef);
        if (draft === undefined || draft.round !== servedRound.round) {
          throw new TypedDomainError(
            "SERVE_DRAFT_UNRESOLVED",
            `The served round ${String(servedRound.round)} names a draft this run's writer did not record`
          );
        }
        finalSegments = draft.segments;
        compositionRawArtifactRef = servedRound.candidateRef;
        compositionAttempt = draft.round;
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
    // Task M2 (spec §14.4.1): a stop while arguing no longer decides the
    // terminal, but it stays on the record of the answer, so the honesty drawer
    // still says the debate was cut short and which bound cut it.
    const runBodyStopRecord = runBodyStopDisclosure({
      runBodyBudgetStop,
      resultConditionMarks: result.conditionMarks,
      runId: run.runId,
      servedRootNodeId: servedRoot.nodeId
    });
    if (runBodyStopRecord !== null) {
      conditionMarkRecords = Object.freeze([...conditionMarkRecords, runBodyStopRecord]);
      result = { ...result, conditionMarks: Object.freeze([...result.conditionMarks, runBodyStopRecord.mark]) };
    }
    // Task M3 (spec §14.4.2): a round kept after a spend stop on an
    // answer-writing call is served, and the stop rides it the same way. When
    // the arguing was stopped too, the record above already names a bound.
    const servePhaseStopRecord = servePhaseStopDisclosure({
      servePhaseFailure,
      keptRounds: result.loopRounds.length,
      resultConditionMarks: result.conditionMarks,
      runId: run.runId,
      servedRootNodeId: servedRoot.nodeId
    });
    if (servePhaseStopRecord !== null) {
      conditionMarkRecords = Object.freeze([...conditionMarkRecords, servePhaseStopRecord]);
      result = { ...result, conditionMarks: Object.freeze([...result.conditionMarks, servePhaseStopRecord.mark]) };
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
    // Task M5 (spec §14.4.4): an answer that still ends COMPONENTS_ONLY keeps the
    // label derived above as its FLOOR, on the owner's row, with the position
    // the label rests on and the sealed cause. The sealed persist below is
    // handed no basis for it: the answer stays components-only.
    const floor = serveFloorOf({
      terminal: result.terminal,
      crashClass: result.crashClass,
      label: verdictLabel.label,
      leadingNodeId: servedRoot.nodeId
    });
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
      verdictLabelBasis: answerCarriesLabel && comparingJudges === null ? verdictLabelBasis : null,
      // Engine 2 (R2b): the judges' label record instead of a ladder basis (serve takes at most one of the two; an answer
      // that carries no label passes neither).
      ...(answerCarriesLabel && comparingJudges !== null ? { judgesDerivation: verdictLabel } : {})
    }));
    // Task M3 (spec §14.4.5): the owner-side disclosure row, once, after the
    // sealed persist, for every answer. It can never change the answer: the
    // writer logs a failure by code and carries on.
    const answeredRound = result.loopRounds.at(-1);
    const disclosureRecorded = await this.#recordServeDisclosure({ runId: run.runId, answerId: persisted.answerId }, () => buildServeDisclosureRecord({
      answerId: persisted.answerId,
      answerVersion: persisted.answerVersion,
      runId: run.runId,
      // Paid plans S1a: a backup switch is disclosed by BACKUP-MODEL-USED and the
      // ledger's switch records; only a money fallback leaves planned ≠ served (0076).
      planned: seatBook.assigned && answeredRound !== undefined
        ? {
            writerRef: plannedRoleRef(writerPlannedByRound.get(answeredRound.round), "writer"),
            checkerRef: plannedRoleRef(checkerPlannedByRound.get(answeredRound.round), "checker")
          }
        // Role rotation, Task 11: a rotated run plans its pin's refs, so a stand-in is disclosed as a fallback.
        : rotationPin === null
          ? { writerRef: synthesisRoles.synthesizerRoleRef, checkerRef: synthesisRoles.evaluatorRoleRef }
          : { writerRef: rotationPin.answerWriter.providerRef, checkerRef: rotationPin.answerChecker.providerRef },
      served: answeredRound === undefined ? null : {
        writerRef: servedRoleRef(servedDrafts.get(answeredRound.candidateRef)?.providerRef, "writer"),
        checkerRef: servedRoleRef(servedChecks.get(answeredRound.verdictRef), "checker")
      },
      body: serveDisclosureBody,
      serveStop: serveLoopStopOf(servePhaseFailure),
      digest: serveDisclosureDigestFacts(writerDigest),
      floor,
      ...(rotationStandIns === null ? {} : { standIns: rotationStandIns }),
      // Run resilience (fix (a)): a role moved off a member that sat out stands in for it, as a sealed stand-in does
      // (0114's per-role ROLE_UNAVAILABLE). Only when such a move served the answered round; otherwise the line above.
      ...(answeredRound === undefined
        || (!writerUnavailableByRound.has(answeredRound.round) && !checkerUnavailableByRound.has(answeredRound.round))
        ? {}
        : { standIns: {
            writerRef: writerUnavailableByRound.get(answeredRound.round) ?? rotationStandIns?.writerRef ?? null,
            checkerRef: checkerUnavailableByRound.get(answeredRound.round) ?? rotationStandIns?.checkerRef ?? null
          } })
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
    if (wonSettlement) {
      /**
       * VERDICT STORY (spec §3, amended): the work item is DONE and nothing can
       * re-claim it. Only an answer that carries a label gets a story: its own
       * served label, or — Task M5, spec §14.4.4 — its FLOOR, whose story takes
       * the SAME label basis and has the leading position's own statement as
       * its answer. The story's checks are unchanged: the label stays fixed.
       * The snapshot is built HERE, inside the run's content lease, where the
       * in-memory material is; the story itself runs after the lease (below
       * `executeWorkItem`'s catch), each step under its own short disclosure
       * lease on this runner's pool. Building the snapshot cannot fail the
       * settled run: a failure is kept and logged by code after the lease.
       *
       * Final review, Minor 2: a floor answer's story waits for the floor's
       * ROW. The owner's page and the public page learn the floor from that row
       * alone, so a story told from the in-memory floor after the row's write
       * failed would state an answer beside a page that says the verdict is
       * unavailable. The failed write is already logged by its code
       * (SERVE_DISCLOSURE_WRITE_FAILED); there is then no floor story.
       */
      const storyWriter = this.settings.story;
      const floorRecorded = floor !== null && disclosureRecorded;
      if (storyWriter !== undefined && (answerCarriesLabel || floorRecorded)) {
        try {
          afterSettle.story = {
            kind: "SNAPSHOT",
            input: buildStoryRunSnapshot({
              runId: run.runId,
              workItemId: claimed.workItemId,
              answerId: persisted.answerId,
              answerVersion: persisted.answerVersion,
              questionLine: run.questionLine,
              // The same language the debate's own prompts were told to write in
              // (argumentLanguageDirective), and the tag the story is stored with.
              argumentLanguage: { tag: run.argumentLanguageTag, name: run.argumentLanguageName },
              // P2L Task 17: the story writes in the lock only when the run's shape receipt locked it.
              languageLocked: shapeLanguage !== null,
              ...(lengthGuidance === null ? {} : { lengthGuidance }),
              // Engine redesign R1d (spec 2026-10-15 §7; INTERFACE §5.1): the receipt's engine, never the row, so an
              // engine-2 debate's story is told v4 (with the length table above); engine 1: null, today's story. The
              // backup storytellers are this run's claim-eligible members in the stored panel's order (spec §7.2 item 11),
              // without those the preview's sit-out book has benched: a backup never goes to an AI that sits out the rest
              // of the run (G7 + the sit-out rule; its call would be refused before sending and the cost fallback could
              // move it to the first storyteller's or the checker's maker). Off the preview `sitOut` is null: no filter.
              // Ruling W1 (whole-branch review Minor 1): the maker rule reads every claim-eligible member's maker
              // BEFORE that filter (`backupMakers`, out-of-panel register refs included), so a benched first storyteller
              // or an out-of-panel checker still excludes its maker: the maker exclusion first, the sit-out filter after.
              engine: engine.engine === 2 ? engine : null,
              // R2 (spec §7.2 item 2): the comparing judges' question kinds pick the story's one shape (engine 2 only).
              ...(engine.engine === 2 && comparingJudges !== null ? { questionKinds: comparingJudges.verdict.questionKinds } : {}),
              ...(engine.engine === 2
                ? {
                  backupCandidates: storyBackupCandidatesFrom({
                    panelRefs: run.discoveredPanel.map((member) => member.provider_ref),
                    claimEligible: synthesisMakers.filter((member) => sitOut?.sitsOut(member.providerRef) !== true)
                  }),
                  backupMakers: storyBackupMakersFrom(synthesisMakers)
                }
                : {}),
              compositionBudgetTier: run.compositionBudgetTier,
              verdict: { label: verdictLabel.label, rung: verdictLabel.rung, trigger: verdictLabel.trigger },
              servedRootNodeId: servedRoot.nodeId,
              servedStrength: servedRootSelection.servedStrength,
              runnerUp: servedRootSelection.runnerUp,
              margin: servedRootSelection.margin,
              // The SAME quantity the label's disagreement rung read: the winning
              // root's recorded panel dispersion, or ABSENT with s04's reason.
              disagreement: verdictLabelBasis.disagreement,
              thresholds: {
                gamma: verdictLabelControls.gamma,
                highCut: verdictLabelControls.highCut,
                lowCut: verdictLabelControls.lowCut,
                disagreementThreshold: verdictLabelControls.disagreementThreshold
              },
              confidenceBand: result.confidenceBand,
              answerMarks: result.conditionMarks,
              // A floor answer has no prose: its answer is the leading position's
              // own statement (the node the label's servedNodeId names).
              servedSegments: floor === null ? finalSegments : [{ text: servedRootJudgement.statement }],
              authored: authoredNodeList,
              positionNodeIds: makerPositionNodeIds,
              ...(engineMap ? enginePositionWordsOf(engineMapFactsNow()) : {}),
              // Debate shape P2c (spec 2026-10-12 §3.3 step 8): the map's unchosen points, for the story's "also
              // raised, not debated" paragraph, only when the map's own answers were argued; undefined otherwise.
              // Ruling W-CUT: a chosen answer past the positions argued is listed too (the page's stored list agrees).
              alsoRaised: storyAlsoRaisedFrom(shapeMapArgued ? debateShapeMap : null, shapeMapPositions?.length ?? 0,
                engineMap ? { checkFailed: mapCheckFailedStatements(debateShapeMap?.answerCheck),
                  checkFailedMergedAnswerIds: mapCheckFailedMergedAnswerIds(debateShapeMap?.answerCheck) } : undefined),
              // Owner ruling C-STORY: one plain sentence when the answers came from a map fallback, read from the map's
              // whole result (debateShapeMap is null on a fallback); undefined on today's run.
              answersNote: storyAnswersNoteFrom(shapeMapResult,
                shapeRun !== null && !shapeMapArgued),
              baseStrengths: materialised.nodes,
              finalStrengths: propagation.strengths,
              // The WHOLE graph's arrows, in the engine's fixed order, so every
              // argued point keeps its arrow and the points number the same way.
              arrows: materialised.arrows,
              arrowOrder: materialised.arrowOrder,
              sensitivity: propagation.sensitivityRecords,
              conditionMarkRecords,
              // The run's OWN claim-eligible providers: a role provider that the
              // claim-time probe found absent is never called for the story.
              resolveProvider: (roleRef) => {
                // Role rotation, Task 12: on a rotated run the register's story ref serves only when it is a panel ref.
                if (rotationPin !== null && !panelRefs.has(roleRef)) return null;
                const maker = synthesisMakers.find((candidate) => candidate.providerRef === roleRef);
                return maker === undefined ? null : { provider: maker.provider, providerRef: maker.providerRef };
              },
              // Task M7 (spec §14.4.6): a story call refused for money is offered
              // to the SAME claim-eligible makers, cheapest first by this runner's
              // price map — the answer-writer's own fallback (Task M3).
              // Run resilience (fix (a)): and from a member that sits out, as the answer roles do (the third argument).
              costFallback: storyCostFallback(synthesisMakers, servePrices, sitOut ?? undefined),
              // Part 4, P4-D (P3-N1; controller C3, 3 October 2026): on a pinned
              // assignment whose answer job has a SCORECARD seat, the story is
              // written and checked by this debate's OWN answer writer and checker
              // — the seat member that answered the served round, main or
              // runner-up (the seat's main when no round answered) — so a Free
              // story stays on the Free roster. A FALLBACK seat (null) keeps the
              // register's ref, already in `synthesisMakers`; legacy runs set none.
              // The cost fallback above is unchanged: the planned maker first,
              // then the run's own debaters.
              roleMakers: seatBook.assigned && (seatBook.answerWriter !== null || seatBook.answerChecker !== null)
                ? {
                    storyteller: storySeatRoleMaker(seatBook.answerWriter,
                      answeredRound === undefined ? undefined : writerPlannedByRound.get(answeredRound.round)),
                    checker: storySeatRoleMaker(seatBook.answerChecker,
                      answeredRound === undefined ? undefined : checkerPlannedByRound.get(answeredRound.round))
                  }
                // Role rotation (spec 2026-10-11 Part 6): a rotated run (never an assigned one; the claim
                // refuses both pins) hands the story its pinned pair, looked up among this run's
                // claim-eligible members. Task 12 ("always an answer"): a pinned member not claim-eligible
                // hands its role to another claim-eligible member of the stored panel, in panel order, the
                // story checker always of another maker than the storyteller serving
                // (`storyRotationRoleMakers`). None: null, and the story uses the register's ref, as for a
                // FALLBACK seat (packages/story writer.ts), only when that ref is a panel ref (above).
                : rotationPin === null
                  ? undefined
                  : storyRotationRoleMakers({
                      panelRefs: run.discoveredPanel.map((member) => member.provider_ref),
                      claimEligible: synthesisMakers,
                      storytellerRef: rotationPin.storyteller.providerRef,
                      storyCheckerRef: rotationPin.storyChecker.providerRef
                    }),
              // Each story step re-takes the SAME disclosure lease the debate held
              // (this run and its memory-linked prior run), briefly, on this
              // runner's pool: every store and gateway inside it borrows it, and
              // an erasure between steps ends the story at the next one.
              stepLease: (use) => this.#memory.withDisclosureContentLease([run.runId], use)
            })
          };
        } catch (error) {
          afterSettle.story = {
            kind: "SNAPSHOT_FAILED", answerId: persisted.answerId, answerVersion: persisted.answerVersion, error
          };
        }
      }
      return { kind: "COMPLETED", answerId: persisted.answerId };
    }
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
    } finally {
      replayBookInLease.close();
    }
    /**
     * VERDICT STORY (spec §3, amended): the run's lease is released, the work
     * item is DONE and the answer is served. The story runs now, and nothing it
     * does can change that: the writer never rejects, and this catch exists so
     * that no defect in the writer can reach the failure path of a DONE item.
     */
    const storyWriter = this.settings.story;
    const settled = afterSettle.story;
    if (storyWriter !== undefined && settled !== null) {
      try {
        if (settled.kind === "SNAPSHOT") {
          await storyWriter.writeAfterSettle(settled.input);
        } else {
          storyWriter.reportSnapshotFailure(settled);
        }
      } catch {
        // See above: the story can never cost the verdict.
      }
    }
    return executed;
    });
    } finally {
      callLane?.close();
      keepAlive.stop();
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
  "ASK_ALREADY_WAITING",
  "ASK_COARSE_FIT_INPUT_INVALID",
  "ASK_MODEL_ASSIGNMENT_INVALID",
  "ASK_MODEL_CANDIDATE_UNAVAILABLE",
  "ASK_MODEL_STRENGTH_BUDGET_TOO_SMALL",
  "ASK_ROOM_DAY_UNSETTLED",
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
  "BILLING_ENTITLEMENT_ROW_INVALID",
  "BILLING_OWNER_REF_INVALID",
  "BILLING_OWNER_UNKNOWN",
  "BILLING_PLAN_GAUGES_MISSING",
  "BILLING_PLAN_UNKNOWN",
  "BLANK_QUERY_REFUSED",
  "BLOCKED_TERMINAL_RETIRED",
  "BRANCH_FREEZE_EPSILON_PROVENANCE_MISSING",
  "BUDGET_SKIP_AFFECTED_NODES_REQUIRED",
  "CALIBRATION_STRATEGY_INVALID",
  "CALL_BUDGET_EXHAUSTED",
  "CALL_LANE_HELD_BACK",
  "CALL_LANE_STOPPED",
  "CALL_SITE_SEAT_ALREADY_MARKED",
  "CALL_SITE_SEAT_MARKER_REQUIRED",
  "CATCH_UP_ANSWER_NOT_FOUND",
  "CATCH_UP_DISCLOSURE_MISMATCH",
  "CATCH_UP_SOURCE_VERSION_CHANGED",
  "CATEGORICAL_SPAWN_CHILD_MISSING",
  "CLAIM_TYPE_COMPOSITION_MAP_INVALID",
  "CLAIM_TYPE_COMPOSITION_MAP_PROVENANCE_MISSING",
  "CLAIM_TYPE_COMPOSITION_MAP_UNRESOLVED",
  "COMPARING_JUDGE_SEATS_INVALID",
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
  "COST_ENVELOPE_KEEP_ROOM_INVALID",
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
  "DEBATE_SHAPE_RUNNER_UNCONFIGURED",
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
  "ENGINE_CATCH_UP_RULE_MISSING",
  "ENGINE_MAP_CHECK_UNBUDGETED",
  "ENGINE_RECORD_INVALID",
  "ENGINE_ROW_INVALID",
  "ENGINE_RUNNER_UNCONFIGURED",
  "ENGINE_SCORING_COMBINE_UNSUPPORTED",
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
  "HONEST_MEDIAN_EMPTY",
  "INCONSISTENT_PRE_COMPOSITION_EVIDENCE",
  "INDEPENDENT_BUDGET_MARKS_CONFLATED",
  "INSTRUMENT_REF_REQUIRED",
  "INVALID_COMPOSITION_ATTEMPT",
  "JUDGEMENT_POLICY_UNRESOLVED",
  "JUDGES_VERDICT_INPUT_INVALID",
  "JUDGE_ASSIGNED_ROOT_V2_UNLENGTHED",
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
  "MAP_CHECK_ENGINE_ONLY",
  "MAP_CHECK_IDS_INVALID",
  "MAP_ENGINE_REQUIRES_LENGTH",
  "MAP_GAP_ITEM_UNKNOWN",
  "MAP_RECORD_INVALID",
  "MAP_REPLY_UNREADABLE",
  "MAP_ROW_INVALID",
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
  "PERSON_ALLOWANCE_REACHED",
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
  "PROMPT_PATCH_NOT_APPLICABLE",
  "PROMPT_REPAIR_NOT_A_LOCATOR",
  "PROMPT_REVISION_NOT_APPLICABLE",
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
  "RUNNER_CLAIM_LOST",
  "RUNNER_DISCLOSURE_PIPELINE_FAILED",
  "RUNNER_FAILURE_STATE_NOT_RECORDED",
  "RUNNER_TIME_LIMIT_REACHED",
  "RUN_CEILING_BELOW_FIRST_CALL",
  "RUN_CEILING_BELOW_ONE_CALL",
  "RUN_CONTENT_ENCRYPTION_REQUIRED",
  "RUN_CONTENT_ROLLBACK_INCOMPLETE",
  "RUN_COST_ENVELOPE_EXHAUSTED",
  "RUN_COST_ENVELOPE_MONEY_REACHED",
  "RUN_COST_ENVELOPE_ROOM_KEPT",
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
  "RUN_ROLE_ROTATION_INVALID",
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
  "SERVED_ROOT_JUDGES_WINNER_UNSERVABLE",
  "SERVED_ROOT_STRENGTH_UNRESOLVED",
  "SERVED_ROOT_UNRESOLVED",
  "SERVED_STATEMENT_CITES_NO_VERIFIED_NODE",
  "SERVE_DISCLOSURE_RECORD_INVALID",
  "SERVE_DISCLOSURE_ROW_INVALID",
  "SERVE_DRAFT_UNRESOLVED",
  "SERVE_FLOOR_REASON_UNRESOLVED",
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
  "STORY_PROVIDER_SCOPE_UNAUTHORIZED",
  "STORY_ROW_INVALID",
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
  "VERDICT_LABEL_BASIS_AMBIGUOUS",
  "VERDICT_LABEL_BASIS_UNRESOLVED",
  "VERDICT_LABEL_CONTROLS_INVALID",
  "VERDICT_LABEL_CONTROLS_PROVENANCE_MISSING",
  "VERDICT_LABEL_CONTROLS_UNRESOLVED",
  "VERDICT_LABEL_INPUT_INVALID",
  "WAITING_LINE_REQUIRES_BAND",
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
  "DATA_EXPORT_DATABASE_ROLE_MUST_BE_ISOLATED",
  "DATA_EXPORT_DATABASE_URL_MUST_BE_SEPARATE",
  "DATA_EXPORT_DATABASE_URL_REQUIRED",
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

/**
 * How long a debate may wait for a free place on a runner before Hatchet gives
 * it up. The runner takes 8 at once (RUNNER_CAPACITY.concurrentRuns); Hatchet's own
 * default is 5 minutes, shorter than one debate. Owner ruling 2026-10-10.
 */
export const RUNNER_QUEUE_WAIT_LIMIT = "30m" as const;

/**
 * How long one debate may run before Hatchet gives it up. One task is one whole
 * debate; a task declared without a limit is registered by the SDK with '60s'.
 * Owner ruling 2026-10-10: 60 minutes in every deployment, the preview's value
 * since 2026-10-06.
 */
export const RUNNER_EXECUTION_LIMIT = "3600s" as const;

/**
 * The stops after which the task's catch records nothing: the work item is another runner's to settle. A claim
 * another copy took (L4-F9), and a debate of another release (side-by-side spec §3; `execute` answers NO_WORK for one
 * before anything runs, so this is the defence for a mismatch raised anywhere later). Neither becomes a
 * `terminal_reason`. Side-by-side spec §4: nor a debate stopped because its release is retiring (RUNNER_RETIRING): the
 * item is left as is for this release's backstop, which sets it aside FAILED with the waiver (spec §4 step 3); the §3
 * fence keeps every other release off it.
 */
const LEAVES_WORK_ITEM_ALONE: ReadonlySet<string> = new Set(["RUNNER_CLAIM_LOST", "RUNNER_RELEASE_MISMATCH", "RUNNER_RETIRING"]);

export function declareHatchetWalkingSkeletonTask(input: {
  readonly client: Pick<Hatchet, "task">;
  readonly runner: WalkingSkeletonRunner;
  readonly failures: RunnerFailureRecorder;
  readonly workflowName: string;
  readonly engineRetries: number;
  readonly previewExecutionTimeout?: "3600s";
  /**
   * Side-by-side spec §4 (D1): counts this task while its handler runs, the verdict story included (it runs inside the
   * task after the work item is DONE), so a retiring release knows when none of its tasks is left.
   */
  readonly executions?: Pick<TaskExecutionCounter, "enter">;
}): TaskWorkflowDeclaration<{ runId: string; workItemId: string }, { kind: string; answerId?: string }> {
  if(input.previewExecutionTimeout!==undefined&&input.previewExecutionTimeout!=="3600s")throw new TypeError("PREVIEW_EXECUTION_TIMEOUT_INVALID");
  if (!Number.isInteger(input.engineRetries) || input.engineRetries < 0) {
    throw new TypeError("Hatchet retry count must be a non-negative register value");
  }
  const executionTimeout = input.previewExecutionTimeout ?? RUNNER_EXECUTION_LIMIT;
  // The debate keeps its own copy of the limit it was registered with (L4-F9 repair).
  const executionLimitMs = Number(executionTimeout.slice(0, -1)) * 1_000;
  return input.client.task({
    name: input.workflowName,
    retries: input.engineRetries,
    scheduleTimeout: RUNNER_QUEUE_WAIT_LIMIT,
    executionTimeout,
    // S06 capture binding. It was written in e8d99d33 and destroyed by the
    // conflict resolution in merge 1c9578a2, which took the mainline side of
    // this file whole; the test that specifies it survived the same merge.
    // Restored here. Observability never changes product semantics: every
    // capture is optional (`capture?.`), the emitter is total, and the error
    // that escapes is the one that would have escaped without any of this.
    fn: async (
      rawDispatch: { runId: string; workItemId: string },
      hatchetContext?: {
        retryCount?(): number;
        readonly abortController?: { readonly signal: AbortSignal };
        refreshTimeout?(incrementBy: `${number}s`): Promise<void>;
      }
    ) => {
      // Side-by-side spec §4 (D1): the task is counted for its whole handler, the story included, failure or not.
      const leave = input.executions?.enter();
      try {
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
        // L4-F9 repair: the debate hears Hatchet — its stop signal, its "still
        // working" call and its limit. Read inside a guard like retryCount: a
        // throwing accessor never stops the debate from starting; without the
        // signal the debate still stops at the limit on its own clock.
        let signal: AbortSignal | undefined;
        try {
          signal = hatchetContext?.abortController?.signal;
        } catch {
          signal = undefined;
        }
        const refreshTimeout = typeof hatchetContext?.refreshTimeout === "function"
          ? (incrementBy: `${number}s`) => hatchetContext.refreshTimeout!(incrementBy)
          : undefined;
        const task: RunnerTaskControl = Object.freeze({
          executionLimitMs,
          ...(signal === undefined ? {} : { signal }),
          ...(refreshTimeout === undefined ? {} : { refreshTimeout })
        });
        const execute = async () => {
          try {
            const result = await input.runner.executeWorkItem(dispatch.workItemId, task);
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
            // L4-F9 repair: a copy whose claim another copy took leaves the work
            // item to that copy. Recording FAILED here would end a debate that is
            // still running, under the asker's eyes. Side-by-side spec §3: the same
            // for another release's debate — that release finishes or fails it.
            if (error instanceof TypedDomainError && LEAVES_WORK_ITEM_ALONE.has(error.code)) {
              throw scrubbedTaskFailure(error);
            }
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
        // Awaited, so the `finally` below counts the task out only once it has ended.
        if (capture === undefined) return await execute();
        return await capture.runWithObsContext(Object.freeze({
          run_ref: Object.freeze({ kind: "run", value: dispatch.runId }),
          work_item_ref: Object.freeze({ kind: "work_item", value: dispatch.workItemId })
        }), execute);
      } finally {
        leave?.();
      }
    }
  });
}

/**
 * Verdict story: the call-site namespace the story allowance accepts and the
 * run allowance refuses (spec 2026-09-26 §8). `packages/story` mints the keys
 * (`storyCallSiteKey`). A story call site is EXACTLY `STORY:STORYTELLER:{round}`
 * or `STORY:CHECKER:{round}`, the round 1 to 8 (the `storyLoopMaxRounds` schema
 * cap, packages/register/src/story-policy.ts), and each carries its own role:
 * the storyteller is a SYNTHESIZER call and the checker an EVALUATOR call.
 * Anything else under the prefix is not a story call at all.
 */
const STORY_CALL_SITE_PREFIX = "STORY:";
const STORY_CALL_SITE = /^STORY:(STORYTELLER|CHECKER):[1-8]$/u;

/** The role a well-formed story call site must carry, or null for any other key. */
function storyCallSiteRole(callSiteKey: string): ProviderCallRequest["role"] | null {
  const site = STORY_CALL_SITE.exec(callSiteKey);
  if (site === null) return null;
  return site[1] === "STORYTELLER" ? "SYNTHESIZER" : "EVALUATOR";
}

/**
 * Verdict story — the story scope (spec 2026-09-26 §8), as `createPostgresProviderGateway` decides it: a story-lane call
 * names one of the story's own call sites with that site's role, and no other lane uses the STORY: namespace. LG-A: a
 * structure-repair call (`REPAIR:STRUCTURE:<key>`) is judged by the key it repairs, so a story repair keeps the story's
 * lane, allowance and money (L32).
 */
export function storyCallScopeAgrees(request: Pick<ProviderCallRequest, "lane" | "callSiteKey" | "role">): boolean {
  const key = structureRepairOriginalKey(request.callSiteKey);
  const storyScope = request.lane === "story";
  return !((storyScope || key.startsWith(STORY_CALL_SITE_PREFIX)) && (!storyScope || storyCallSiteRole(key) !== request.role));
}

/**
 * Engine money rule, Task M1 (spec 2026-09-26 §14.4.1) — WHICH CEILING A CALL
 * SEES. An answer-writing call is the synthesizer or the evaluator on the
 * served lane, and only that pair: the judges use the served lane too, so the
 * lane alone would put every judge call on the answer's money, and the role
 * alone would put the story's storyteller and checker there. Every other call
 * a run makes is BODY. The phase picks the ceiling (the money seam's and the
 * attempt ceiling's) and is recorded on the charge; it never changes a
 * refusal's code.
 */
export function providerCallCostEnvelopePhase(
  request: Pick<ProviderCallRequest, "role" | "lane">
): CostEnvelopePhase {
  return (request.role === "SYNTHESIZER" || request.role === "EVALUATOR") && request.lane === "served"
    ? "SERVE"
    : "BODY";
}

/**
 * B9 (budget spec §2.9) — THE FIRST POSITION'S OWN CALL SITE. The primary
 * root author's judgement is asked at exactly this key; every other authoring
 * leg is `JUDGE:<leg>…`, every panel seat `PANEL:…`.
 */
export const FIRST_POSITION_CALL_SITE_KEY = "JUDGE" as const;

/**
 * B9 (budget spec §2.9) — WHICH CALLS THE SHARED WALL MEASURES. A debate call
 * made while arguing (BODY, on the served lane) is walled. Exempt: the first
 * position's own call — a started debate always gets its first position — and
 * every answer-writing call (the seam never walls SERVE either), the story's
 * calls and the evaluator add-on's, none of which is the debate's arguing.
 */
export function providerCallSharedWall(
  request: Pick<ProviderCallRequest, "role" | "lane" | "callSiteKey">
): SharedWallApplication {
  if (request.lane !== "served" || providerCallCostEnvelopePhase(request) !== "BODY") return "EXEMPT";
  // Paid plans S1a: an assigned run's first call carries its seat marker. LG-A: a structure-repair call is its original's.
  return seatBaseCallSiteKey(structureRepairOriginalKey(request.callSiteKey)) === FIRST_POSITION_CALL_SITE_KEY ? "EXEMPT" : "APPLY";
}

/**
 * B9 (budget spec §2.9, ruling R-19) — THE PERSON WALL WHEN THE RUNNER'S
 * REGISTER VERSION SEALED NO billingPlans. B6 writes a run's charge scope only
 * when hosted billing is on, so a run that HAS one was admitted, and is charged,
 * against a person's windows this runner cannot read (the API and the runner
 * are on different register versions: a mismatched REGISTER_VERSION, or a
 * staggered restart). It fails CLOSED: every walled call of such a run is
 * refused as the person's month (PERSON_ALLOWANCE_REACHED), so the arguing
 * stops and the answer is still written. A run with no charge scope never
 * reaches it: the wall asks for windows only for a pinned owner.
 */
export function plansUnresolvedPersonAllowance(): PersonAllowanceSource {
  return Object.freeze({
    read: async () => {
      throw sharedWallReached("PERSON_MONTH");
    }
  });
}

/**
 * Parallel AI calls (spec 2026-10-12 §3.5): a money seam that may count its
 * call's projection in flight (`CostEnvelopeGuard.providerSeam`), and releases
 * it when the gateway's call has settled.
 */
type InFlightReleasingSeam = ProviderCostEnvelopeSeam & { readonly releaseInFlight?: () => void };

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
       *
       * Task M1: and from the call's PHASE (`providerCallCostEnvelopePhase`),
       * because an answer-writing call and a call made while the debate is
       * argued are held to different ceilings over the same run total.
       * B9: and whether the call is measured against the shared wall
       * (`providerCallSharedWall`).
       */
      readonly buildCostEnvelopeSeam?: (
        runId: string,
        phase: CostEnvelopePhase,
        sharedWall: SharedWallApplication
      ) => InFlightReleasingSeam;
      /**
       * Verdict story (spec §8): the STORY's own money bound, built per call
       * from the leased run exactly as the run's is. A story call on a metered
       * gateway (one with `buildCostEnvelopeSeam`) that has no story seam is
       * refused, so a story can never spend unbounded where the debate cannot.
       */
      readonly buildStoryCostEnvelopeSeam?: (runId: string) => InFlightReleasingSeam;
      /**
       * Parallel AI calls (spec 2026-10-12 §3.5): this process's calls in
       * flight, for the run-wide attempt ceiling. A call bounded by that ceiling
       * counts itself before the ceiling is first asked and is released once it
       * settles, so its ledger rows are written by then; both ceiling checks add
       * the run's OTHER calls in flight. Absent = today's checks, byte for byte.
       * Never the money seam's counter (run-in-flight.ts).
       */
      readonly inFlight?: RunInFlight;
    }
): ProviderGateway {
  const { buildCostEnvelopeSeam, ...gatewayOptions } = options;
  const { buildStoryCostEnvelopeSeam, inFlight, ...httpOptions } = gatewayOptions;
  const ledger = new LedgerRepository(pool);
  const budget = new BudgetRepository(pool);
  const http = new OpenAICompatibleProviderGateway({
    ...httpOptions,
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
      /**
       * Verdict story — THE STORY SCOPE, decided before anything is read. The
       * lane and the call-site namespace must agree: a story lane on a debate
       * call site would hide a debate call in the story's allowance, and a
       * STORY: call site on a debate lane would bill a story to the run. A
       * story call must also name one of the story's own call sites, with the
       * role that site carries (`storyCallSiteRole`), so the story lane cannot
       * be used for a free-form or out-of-range call.
       */
      const storyScope = request.lane === "story";
      if (!storyCallScopeAgrees(request)) {
        throw new TypedDomainError(
          "STORY_PROVIDER_SCOPE_UNAUTHORIZED",
          "A story call and the STORY: call-site namespace must agree"
        );
      }
      if (storyScope && buildStoryCostEnvelopeSeam === undefined && buildCostEnvelopeSeam !== undefined) {
        throw new TypedDomainError(
          "STORY_ENVELOPE_MISSING",
          "A metered deployment makes no story call without the story's own money bound"
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
      /**
       * Task M1: decided once, from the request, and used for both run-wide
       * ceilings below — the attempt ceiling and the money seam — so the two
       * can never disagree about which part of the run a call belongs to.
       */
      const costEnvelopePhase = providerCallCostEnvelopePhase(request);
      return withRunContentLease(pool,[leasedRunId],async () => {
      // Verdict story: the story's attempts are its own. Each STORY: call site
      // is bounded by its sealed call bound (the per-site count below), and the
      // rounds by `storyLoopMaxRounds`; the RUN's ceiling is never consulted,
      // so a debate that used every attempt still gets its story.
      const runCeilingBinds = !authenticatedEvaluatorScope && !storyScope;
      // Parallel AI calls (spec 2026-10-12 §3.5): a call the run's ceiling binds
      // counts itself in flight FIRST, synchronously, and every ceiling check
      // then adds the run's OTHER calls in flight, counted before the ledger is
      // read. Released in the finally below, once every row of the call is written.
      const releaseCall = runCeilingBinds && inFlight !== undefined ? inFlight.begin(leasedRunId, 0n) : undefined;
      const otherAttemptsInFlight = (): Readonly<{ inFlightAttempts: number }> => ({
        inFlightAttempts: releaseCall === undefined ? 0 : inFlight!.attempts(leasedRunId) - 1
      });
      let costEnvelope: InFlightReleasingSeam | undefined;
      try {
      if (runCeilingBinds) {
        await budget.assertModelAttemptAllowed(leasedRunId, costEnvelopePhase, otherAttemptsInFlight());
      }
      const consumed = await ledger.countModelAttempts({
        runId: request.runId,
        workItemId: request.subjectItemId,
        contractHash: request.contractHash,
        callSiteKey: request.callSiteKey,
        // Run resilience (spec 2026-10-12, fix (b)): the preview's call policy asks for the step's allowance per
        // maker; the incident's fourth fallback hop was refused here on rows three OTHER makers had written.
        ...(request.attemptScope === "actor" ? { actorRef: request.providerRef } : {})
      });
      const remaining = remainingProviderAttempts(request.bound.maxAttempts, consumed);
      if (remaining <= 0) {
        throw new TypedDomainError("CALL_BUDGET_EXHAUSTED", request.subjectItemId);
      }
      try {
        /**
         * V-28: the money envelope binds EVERY call, the authenticated evaluator
         * scope included. That scope is exempt from the ATTEMPT ceiling because
         * its attempts are billed to the evaluator rather than to the run
         * (`ledger_entry_is_authenticated_scope`), but its calls are made against
         * the same paid vendor with the same money, so exempting them from the
         * money ceiling would leave a hole the size of the evaluator leg. The run
         * id is the leased one, for the same reason as the attempt hook below.
         *
         * Verdict story: a story call is bound by the STORY's seam instead —
         * its own ceiling, summed over STORY charges only.
         *
         * Task M1: the run's seam is built for the call's phase, so an
         * answer-writing call is compared with the answer's ceiling.
         *
         * Parallel AI calls: built here, so the finally below can release what
         * it still counts in flight once the call has settled.
         */
        costEnvelope = storyScope
          ? buildStoryCostEnvelopeSeam?.(leasedRunId)
          : buildCostEnvelopeSeam?.(leasedRunId, costEnvelopePhase, providerCallSharedWall(request));
        return await http.call({
          // Preview retry fix, option B (spec 2026-10-11 §1.1): the spread forwards the preview's
          // `maxAttemptsThisCall` (one POST per call), and `remaining` stays the step's billed allowance,
          // which `countModelAttempts` reads without REFUSED rows. Hosted and local never set the field.
          ...request,
          bound: { ...request.bound, maxAttempts: remaining },
          // DL4-F3: the pinned run ceiling is consulted before EVERY attempt of the gateway's
          // retry loop (B26c's hook, wired here), not only once per call; the refusal is the
          // run's own RUN_COST_ENVELOPE_EXHAUSTED and no ledger row is written for it. The
          // run id is the leased one the S06 seam bound above, not a re-read of the request.
          ...(runCeilingBinds ? {
            assertAttemptAllowed: () => budget.assertModelAttemptAllowed(leasedRunId, costEnvelopePhase, otherAttemptsInFlight())
          } : {}),
          ...(costEnvelope === undefined ? {} : { costEnvelope })
        });
      } catch (error) {
        // Final review M-2: a routed call that ends for the structure repair (ProviderStructureUnrepairedError) is not
        // exhausted: withStructureRepair, around this gateway, sends the repair call next, and a repair that does not do
        // ends there as a content refusal. Only a call that really ended here is captured as a provider failure.
        if (!(error instanceof ProviderStructureUnrepairedError)) {
          capture?.emit(captureFailureEnvelope({
            error,
            taxonomyClass: "PROVIDER_EXHAUSTED",
            capturePoint: "provider",
            disposition: "THROWN",
            source: "first_party"
          }));
        }
        throw error;
      }
      } finally {
        costEnvelope?.releaseInFlight?.();
        releaseCall?.();
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
