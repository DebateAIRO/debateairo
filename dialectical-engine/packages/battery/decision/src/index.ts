import {
  TypedDomainError,
  type AbstentionKind,
  type ExplorationDecision
} from "@debateai/kernel";

export type SignalAvailability = "PRESENT" | "ABSENT" | "IN_PROGRESS" | "TERMINALLY_UNVERIFIABLE";
export type SignalFreshness = "FRESH" | "STALE" | "UNKNOWN";
export type DecisionGrounding = "categorical" | "scalar" | "unclassified";

export interface DecisionReason {
  readonly code: string;
  readonly action: ExplorationDecision;
  readonly grounding: DecisionGrounding;
}

export interface DecisionBlocker {
  readonly code: string;
  readonly grounding: DecisionGrounding;
}

interface SignalBase {
  readonly availability: SignalAvailability;
  readonly freshness: SignalFreshness;
  readonly reasonCodes: readonly string[];
  readonly firingReasons: readonly DecisionReason[];
  readonly blockers: readonly DecisionBlocker[];
}

export interface ScoreSignalBundle extends SignalBase {
  readonly kind: "score";
  readonly scoreInputHash: string | null;
  readonly scoringContractHash: string | null;
  readonly scoreRecordId: string | null;
  readonly scoreRunId: string | null;
  readonly scoreRunSequence: number | null;
}

export interface EvidenceSignalBundle extends SignalBase {
  readonly kind: "evidence";
  readonly evidenceSnapshotId: string | null;
}

export type SignalBundle = ScoreSignalBundle | EvidenceSignalBundle;

export interface PathState {
  readonly status: "ACTIVE" | "ABANDONED";
  readonly priorAction: ExplorationDecision;
  readonly stoppingStatus: "active" | "stop" | "abandon";
}

export interface DecisionInput {
  readonly signals: readonly [ScoreSignalBundle, EvidenceSignalBundle];
  readonly pathState: PathState;
}

export interface DecisionOutcome {
  readonly grounded: boolean;
  readonly classification: "categorical" | "scalar";
  readonly action: ExplorationDecision;
  readonly firingReasons: readonly string[];
  readonly blockers: readonly string[];
  readonly spawnCount: number;
  readonly nextPathState: {
    readonly status: "ACTIVE" | "ABANDONED";
    readonly stoppingStatus: "active" | "stop" | "abandon";
  };
}

const actionPrecedence: readonly ExplorationDecision[] = [
  "reopen", "challenge", "seek_evidence", "deepen", "abandon", "continue"
];

function normalizeCode(value: string): string {
  const normalized = value.trim().toUpperCase().replaceAll(/[^A-Z0-9]+/g, "_").replaceAll(/^_+|_+$/g, "");
  if (normalized.length === 0) throw new TypedDomainError("EMPTY_DECISION_REASON", "Decision reason codes cannot be blank");
  return normalized;
}

function normalizedUnique(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.map(normalizeCode))]);
}

function assertAvailabilityFreshness(signal: SignalBundle): void {
  if (signal.availability === "PRESENT" && signal.freshness === "UNKNOWN") {
    throw new TypedDomainError("PRESENT_SIGNAL_FRESHNESS_UNKNOWN", `${signal.kind} is present but has unknown freshness`);
  }
  if (signal.availability !== "PRESENT" && signal.freshness !== "UNKNOWN") {
    throw new TypedDomainError("ABSENT_SIGNAL_HAS_FRESHNESS", `${signal.kind} is not present but claims freshness`);
  }
}

function isGrounded([score, evidence]: DecisionInput["signals"]): boolean {
  assertAvailabilityFreshness(score);
  assertAvailabilityFreshness(evidence);
  const runIdentityPaired = (score.scoreRunId === null) === (score.scoreRunSequence === null);
  if (!runIdentityPaired) {
    throw new TypedDomainError("PARTIAL_SCORE_RUN_IDENTITY", "Score run id and sequence must be present or absent together");
  }
  return score.availability === "PRESENT"
    && evidence.availability === "PRESENT"
    && score.freshness === "FRESH"
    && evidence.freshness === "FRESH"
    && score.reasonCodes.length === 0
    && evidence.reasonCodes.length === 0
    && [
      score.scoreInputHash,
      score.scoringContractHash,
      score.scoreRecordId,
      score.scoreRunId,
      score.scoreRunSequence,
      evidence.evidenceSnapshotId
    ].every((value) => value !== null);
}

export function decideSplitClassification(input: DecisionInput): DecisionOutcome {
  const grounded = isGrounded(input.signals);
  const reasons = input.signals.flatMap((signal) => signal.firingReasons);
  const firingReasons = normalizedUnique(reasons.map((reason) => reason.code));
  const blockers = normalizedUnique(input.signals.flatMap((signal) => signal.blockers.map((blocker) => blocker.code)));

  if (!grounded) {
    return Object.freeze({
      grounded: false,
      classification: "scalar",
      action: input.pathState.priorAction,
      firingReasons,
      blockers,
      spawnCount: 0,
      nextPathState: Object.freeze({
        status: input.pathState.status,
        stoppingStatus: input.pathState.stoppingStatus
      })
    });
  }

  const firedActions = new Set(reasons.map((reason) => reason.action));
  const action = actionPrecedence.find((candidate) => (
    (candidate !== "reopen" || input.pathState.status === "ABANDONED")
    && (candidate !== "abandon" || blockers.length === 0)
  ) && firedActions.has(candidate)) ?? "continue";
  const classification = reasons.some((reason) => reason.grounding === "categorical")
    ? "categorical"
    : "scalar";
  const spawnCount = classification === "categorical" && (action === "challenge" || action === "seek_evidence") ? 1 : 0;
  const nextPathState = action === "abandon"
    ? Object.freeze({ status: "ABANDONED" as const, stoppingStatus: "abandon" as const })
    : Object.freeze({ status: "ACTIVE" as const, stoppingStatus: "active" as const });

  return Object.freeze({ grounded, classification, action, firingReasons, blockers, spawnCount, nextPathState });
}

export type DefeaterCertification =
  | { readonly kind: "INCOMPLETE"; readonly serves: false; readonly mark: null }
  | { readonly kind: "SKEPTIC_REJECTED"; readonly serves: false; readonly mark: null }
  | {
      readonly kind: "CERTIFIED";
      readonly serves: true;
      readonly mark: "UNFALSIFIED-AFTER-ROTATION" | null;
    };

export function certifyDefeaterCompleteness(input: {
  readonly defeaterRefs: readonly string[];
  readonly rotationExhausted: boolean;
  readonly unaddressedAttackRefs: readonly string[];
}): DefeaterCertification {
  if (input.defeaterRefs.length === 0 && !input.rotationExhausted) {
    return Object.freeze({ kind: "INCOMPLETE", serves: false, mark: null });
  }
  if (input.unaddressedAttackRefs.length > 0) {
    return Object.freeze({ kind: "SKEPTIC_REJECTED", serves: false, mark: null });
  }
  return Object.freeze({
    kind: "CERTIFIED",
    serves: true,
    mark: input.defeaterRefs.length === 0 ? "UNFALSIFIED-AFTER-ROTATION" : null
  });
}

export type RegenerationResolution =
  | { readonly kind: "ROTATE"; readonly nextAttempt: number }
  | {
      readonly kind: "ABSTAIN";
      readonly abstention: {
        readonly kind: AbstentionKind;
        readonly registerRef: string;
        readonly rejectionEvidence: readonly string[];
      };
    };

export function resolveRegeneration(input: {
  readonly roundsCompleted: number;
  readonly attemptsCompleted: number;
  readonly policy: { readonly maxRounds: number; readonly maxAttempts: number; readonly registerRef: string };
  readonly rejectionEvidence: readonly string[];
}): RegenerationResolution {
  if (input.policy.registerRef.trim().length === 0) {
    throw new TypedDomainError("REGENERATION_POLICY_UNRECORDED", "The regeneration cap requires its register reference");
  }
  if (input.policy.maxRounds !== 2 || input.policy.maxAttempts !== 3) {
    throw new TypedDomainError(
      "REGENERATION_POLICY_MISMATCH",
      "DR-020 requires exactly two regeneration rounds and three attempts"
    );
  }
  if (input.roundsCompleted >= input.policy.maxRounds || input.attemptsCompleted >= input.policy.maxAttempts) {
    if (input.rejectionEvidence.length === 0) {
      throw new TypedDomainError("REGENERATION_REJECTION_EVIDENCE_MISSING", "Cap exhaustion requires rejection evidence");
    }
    return Object.freeze({
      kind: "ABSTAIN",
      abstention: Object.freeze({
        kind: "not runnable",
        registerRef: input.policy.registerRef,
        rejectionEvidence: Object.freeze([...input.rejectionEvidence])
      })
    });
  }
  return Object.freeze({ kind: "ROTATE", nextAttempt: input.attemptsCompleted + 1 });
}

export function selectRivalCarver(input: {
  readonly currentMaker: string;
  readonly candidates: readonly { readonly ref: string; readonly maker: string }[];
}): {
  readonly selectedRef: string;
  readonly diversity: "DIFFERENT_MAKER" | "DEGRADED_DIVERSITY";
  readonly measuredBehaviouralDifference: { readonly status: "UNAVAILABLE" };
} {
  const selected = input.candidates.find((candidate) => candidate.maker !== input.currentMaker)
    ?? input.candidates[0];
  if (selected === undefined) throw new TypedDomainError("RIVAL_CARVER_UNAVAILABLE", "No rival carver candidate exists");
  return Object.freeze({
    selectedRef: selected.ref,
    diversity: selected.maker === input.currentMaker ? "DEGRADED_DIVERSITY" : "DIFFERENT_MAKER",
    measuredBehaviouralDifference: Object.freeze({ status: "UNAVAILABLE" })
  });
}
