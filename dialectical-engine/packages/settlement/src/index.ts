import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import {
  allocateSequence,
  prepareLeasedContentEncryptionForRun,
  type PreparedRunContentCipher,
  withWriteTransaction
} from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";

export const SCORECARD_BASES = [
  "MEASURED_OUTCOME",
  "MEASURED_PROCESS",
  "EXTERNAL_BENCHMARK",
  "NONE"
] as const;
export type ScorecardBasis = typeof SCORECARD_BASES[number];

export interface ProperScore {
  readonly total: number;
  readonly reliability: number;
  readonly resolution: number;
  readonly uncertainty: number;
}

export interface RegisteredProperScore {
  readonly rowKey: string;
  readonly registerVersion: number;
  readonly sourceRef: string;
  score(input: { readonly prior: number; readonly posterior: number; readonly resolvedOutcome: boolean }): ProperScore;
}

export interface RecordedProperScore extends ProperScore {
  readonly outcomeRef: string;
  readonly modelId: string;
  readonly modelVersion: string;
  readonly provider: string;
  readonly taskClass: string;
  readonly prior: number;
  readonly posterior: number;
  readonly resolvedOutcome: boolean;
  readonly ledgerSequence: number;
  readonly definition: {
    readonly rowKey: string;
    readonly registerVersion: number;
    readonly sourceRef: string;
  };
}

function assertNonBlank(value: string, name: string): void {
  if (value.trim() === "") throw new TypedDomainError("SETTLEMENT_FIELD_REQUIRED", `${name} must be nonblank`);
}

function assertUnitInterval(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new TypedDomainError("SETTLEMENT_NUMBER_INVALID", `${name} must be a finite unit-interval value`);
  }
}

function freezeScore(score: ProperScore): ProperScore {
  for (const [name, value] of Object.entries(score)) {
    if (!Number.isFinite(value)) throw new TypedDomainError("PROPER_SCORE_INVALID", `${name} must be finite`);
  }
  return Object.freeze({ ...score });
}

export function recordProperScore(input: {
  readonly outcomeRef: string;
  readonly modelId: string;
  readonly modelVersion: string;
  readonly provider: string;
  readonly taskClass: string;
  readonly prior: number;
  readonly posterior: number;
  readonly resolvedOutcome: boolean;
  readonly ledgerSequence: number;
  readonly definition: RegisteredProperScore;
}): RecordedProperScore {
  for (const [name, value] of Object.entries({
    outcomeRef: input.outcomeRef,
    modelId: input.modelId,
    modelVersion: input.modelVersion,
    provider: input.provider,
    taskClass: input.taskClass,
    rowKey: input.definition.rowKey,
    sourceRef: input.definition.sourceRef
  })) assertNonBlank(value, name);
  assertUnitInterval(input.prior, "prior");
  assertUnitInterval(input.posterior, "posterior");
  if (!Number.isInteger(input.ledgerSequence) || input.ledgerSequence < 1 || !Number.isInteger(input.definition.registerVersion) || input.definition.registerVersion < 1) {
    throw new TypedDomainError("SETTLEMENT_PROVENANCE_INVALID", "Ledger and register versions must be positive integers");
  }
  const score = freezeScore(input.definition.score({
    prior: input.prior,
    posterior: input.posterior,
    resolvedOutcome: input.resolvedOutcome
  }));
  return Object.freeze({
    ...input,
    ...score,
    definition: Object.freeze({
      rowKey: input.definition.rowKey,
      registerVersion: input.definition.registerVersion,
      sourceRef: input.definition.sourceRef
    })
  });
}

export interface CalibrationStrategy {
  readonly rowKey: string;
  readonly registerVersion: number;
  readonly sourceRef: string;
  deriveValue(scores: readonly RecordedProperScore[]): number;
  deriveInterval(scores: readonly RecordedProperScore[]): { readonly lower: number; readonly upper: number };
}

export interface ScorecardKey {
  readonly modelId: string;
  readonly modelVersion: string;
  readonly provider: string;
  readonly taskClass: string;
  readonly metric: string;
  readonly asOf: string;
}

export interface DerivedScorecardCell extends ScorecardKey {
  readonly value: number | null;
  readonly n: number;
  readonly interval: { readonly lower: number; readonly upper: number } | null;
  readonly population: {
    readonly settled: number;
    readonly unsettled: number;
    readonly permanentlyUnscoreable: number;
    readonly abstained: number;
  };
  readonly basis: "MEASURED_OUTCOME" | "NONE";
  readonly decomposition: ProperScore | null;
  readonly derivationInput: readonly string[];
  readonly derivationHash: string;
  readonly strategy: {
    readonly rowKey: string;
    readonly registerVersion: number;
    readonly sourceRef: string;
  };
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function hashDerivation(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function deriveScorecardCell(
  events: readonly RecordedProperScore[],
  key: ScorecardKey,
  strategy: CalibrationStrategy
): DerivedScorecardCell {
  for (const [name, value] of Object.entries({ ...key, rowKey: strategy.rowKey, sourceRef: strategy.sourceRef })) {
    assertNonBlank(value, name);
  }
  if (!Number.isInteger(strategy.registerVersion) || strategy.registerVersion < 1) {
    throw new TypedDomainError("CALIBRATION_STRATEGY_INVALID", "A positive register version is required");
  }
  const matching = [...events]
    .filter((event) => event.modelId === key.modelId
      && event.modelVersion === key.modelVersion
      && event.provider === key.provider
      && event.taskClass === key.taskClass)
    .sort((left, right) => left.ledgerSequence - right.ledgerSequence);
  const derivationInput = Object.freeze(matching.map((event) => `${event.outcomeRef}@${event.ledgerSequence}`));
  const strategyReceipt = Object.freeze({ rowKey: strategy.rowKey, registerVersion: strategy.registerVersion, sourceRef: strategy.sourceRef });
  if (matching.length === 0) {
    const absent = {
      ...key,
      value: null,
      n: 0,
      interval: null,
      population: Object.freeze({ settled: 0, unsettled: 0, permanentlyUnscoreable: 0, abstained: 0 }),
      basis: "NONE" as const,
      decomposition: null,
      derivationInput,
      strategy: strategyReceipt
    };
    return Object.freeze({ ...absent, derivationHash: hashDerivation(absent) });
  }
  const value = strategy.deriveValue(matching);
  const interval = strategy.deriveInterval(matching);
  assertUnitInterval(value, "calibrated value");
  assertUnitInterval(interval.lower, "interval lower");
  assertUnitInterval(interval.upper, "interval upper");
  if (interval.lower > interval.upper) throw new TypedDomainError("SCORECARD_INTERVAL_INVALID", "Interval lower bound exceeds upper bound");
  const decomposition = Object.freeze({
    total: mean(matching.map((score) => score.total)),
    reliability: mean(matching.map((score) => score.reliability)),
    resolution: mean(matching.map((score) => score.resolution)),
    uncertainty: mean(matching.map((score) => score.uncertainty))
  });
  const measured = {
    ...key,
    value,
    n: matching.length,
    interval: Object.freeze({ ...interval }),
    population: Object.freeze({ settled: matching.length, unsettled: 0, permanentlyUnscoreable: 0, abstained: 0 }),
    basis: "MEASURED_OUTCOME" as const,
    decomposition,
    derivationInput,
    strategy: strategyReceipt
  };
  return Object.freeze({ ...measured, derivationHash: hashDerivation(measured) });
}

export const ROUTING_GUARDS = ["G1", "G2", "G3", "G4", "G5", "G6", "G7", "G8"] as const;
export type RoutingGuard = typeof ROUTING_GUARDS[number];

export interface RoutingPolicy {
  readonly rowKey: string;
  readonly registerVersion: number;
  readonly sourceRef: string;
  readonly explorationShare: number;
  readonly departNeutralMinimumN: number;
  readonly hardRoutingMinimumN: number;
  readonly multiplicityControl: "INTERVAL_OVERLAP_FALLBACK";
}

export interface RoutingCandidate {
  readonly modelId: string;
  readonly modelVersion: string;
  readonly provider: string;
  readonly n: number;
  readonly value: number;
  readonly interval: { readonly lower: number; readonly upper: number };
}

export interface ScorecardTaskClassMapReceipt {
  readonly rowKey: string;
  readonly registerVersion: number;
  readonly sourceRef: string;
  readonly entries: readonly {
    readonly settlementAct: string;
    readonly questionType: string;
    readonly taskClass: string;
  }[];
}

// DR-080's values remain V-supplied. This resolver supplies the complete,
// provenance-carrying mechanism and refuses an absent or ambiguous pair.
export function resolveScorecardTaskClass(
  settlementAct: string,
  questionType: string,
  receipt: ScorecardTaskClassMapReceipt
): string {
  for (const [name, value] of Object.entries({
    settlementAct, questionType, rowKey: receipt.rowKey, sourceRef: receipt.sourceRef
  })) assertNonBlank(value, name);
  if (!Number.isInteger(receipt.registerVersion) || receipt.registerVersion < 1) {
    throw new TypedDomainError("SCORECARD_TASK_CLASS_MAP_INVALID", "A positive register version is required");
  }
  const matches = receipt.entries.filter((entry) => {
    assertNonBlank(entry.settlementAct, "entry.settlementAct");
    assertNonBlank(entry.questionType, "entry.questionType");
    assertNonBlank(entry.taskClass, "entry.taskClass");
    return entry.settlementAct === settlementAct && entry.questionType === questionType;
  });
  if (matches.length !== 1) {
    const code = matches.length === 0 ? "SCORECARD_TASK_CLASS_UNRESOLVED" : "SCORECARD_TASK_CLASS_AMBIGUOUS";
    throw new TypedDomainError(
      code,
      `${code}: expected exactly one DR-080 mapping for (${settlementAct}, ${questionType}); received ${matches.length}`
    );
  }
  return matches[0]!.taskClass;
}

export interface DisagreementRateMonitor {
  readonly observedRate: number | null;
  readonly declaredPrice: number;
  readonly absoluteDifference: number | null;
  readonly n: number;
  readonly basis: "MEASURED_PROCESS" | "NONE";
}

// VR-1 is a monitor, not an unruled kill threshold. It records the observed
// consistency signal and leaves any later gate to a registered policy.
export function deriveDisagreementRateMonitor(
  disagreementFlags: readonly boolean[],
  declaredPrice: number
): DisagreementRateMonitor {
  assertUnitInterval(declaredPrice, "declared disagreement price");
  if (disagreementFlags.length === 0) {
    return Object.freeze({ observedRate: null, declaredPrice, absoluteDifference: null, n: 0, basis: "NONE" });
  }
  const observedRate = disagreementFlags.filter(Boolean).length / disagreementFlags.length;
  return Object.freeze({
    observedRate,
    declaredPrice,
    absoluteDifference: Math.abs(observedRate - declaredPrice),
    n: disagreementFlags.length,
    basis: "MEASURED_PROCESS"
  });
}

export interface RoutingDecision {
  readonly kind: "FALLBACK" | "LEARNED" | "EXPLORATION" | "UNIFORM_PANEL" | "CRITIC_EXEMPT";
  readonly selectedModelId: string;
  readonly propensity: number;
  readonly taskClass: string;
  readonly guardTrail: readonly { readonly guard: RoutingGuard; readonly outcome: "PASS" | "BYPASS" | "FALLBACK" }[];
  readonly policy: { readonly rowKey: string; readonly registerVersion: number; readonly sourceRef: string };
}

function intervalsOverlap(left: RoutingCandidate["interval"], right: RoutingCandidate["interval"]): boolean {
  return left.lower <= right.upper && right.lower <= left.upper;
}

export function routeServedLane(input: {
  readonly taskClass: string;
  readonly lane: "SERVED" | "PANEL" | "CRITIC";
  readonly candidates: readonly RoutingCandidate[];
  readonly fallbackModelId: string;
  readonly explorationDraw: number;
  readonly policy: RoutingPolicy;
  readonly scorerModelId?: string;
}): RoutingDecision {
  for (const [name, value] of Object.entries({
    taskClass: input.taskClass,
    fallbackModelId: input.fallbackModelId,
    rowKey: input.policy.rowKey,
    sourceRef: input.policy.sourceRef
  })) assertNonBlank(value, name);
  assertUnitInterval(input.explorationDraw, "exploration draw");
  if (input.policy.explorationShare <= 0 || input.policy.explorationShare >= 1) {
    throw new TypedDomainError("EXPLORATION_FLOOR_INVALID", "The register-supplied exploration share must be non-zero and below one");
  }
  if (input.scorerModelId !== undefined && input.candidates.some((candidate) => candidate.modelId === input.scorerModelId)) {
    throw new TypedDomainError("SELF_ROUTING_FORBIDDEN", "SELF_ROUTING_FORBIDDEN: a model may not supply the inputs that route itself");
  }
  const policy = Object.freeze({ rowKey: input.policy.rowKey, registerVersion: input.policy.registerVersion, sourceRef: input.policy.sourceRef });
  const trail: RoutingDecision["guardTrail"] = ROUTING_GUARDS.map((guard) => ({ guard, outcome: "PASS" as const }));
  const decision = (
    kind: RoutingDecision["kind"],
    selectedModelId: string,
    propensity: number,
    outcomes: RoutingDecision["guardTrail"] = trail
  ): RoutingDecision => Object.freeze({
    kind,
    selectedModelId,
    propensity,
    taskClass: input.taskClass,
    guardTrail: Object.freeze(outcomes.map((entry) => Object.freeze(entry))),
    policy
  });
  if (input.lane === "PANEL") return decision("UNIFORM_PANEL", input.fallbackModelId, 1, trail.map((entry) => ({ ...entry, outcome: entry.guard === "G1" ? "BYPASS" : entry.outcome })));
  if (input.lane === "CRITIC") return decision("CRITIC_EXEMPT", input.fallbackModelId, 1, trail.map((entry) => ({ ...entry, outcome: entry.guard === "G6" ? "BYPASS" : entry.outcome })));
  const eligible = input.candidates
    .filter((candidate) => candidate.n >= input.policy.departNeutralMinimumN)
    .sort((left, right) => right.value - left.value || left.modelId.localeCompare(right.modelId));
  if (eligible.length < 2 || eligible.some((candidate) => candidate.n < input.policy.hardRoutingMinimumN)) {
    return decision("FALLBACK", input.fallbackModelId, 1, trail.map((entry) => ({ ...entry, outcome: entry.guard === "G4" ? "FALLBACK" : entry.outcome })));
  }
  const [best, next] = eligible;
  if (best === undefined || next === undefined || intervalsOverlap(best.interval, next.interval)) {
    return decision("FALLBACK", input.fallbackModelId, 1, trail.map((entry) => ({ ...entry, outcome: entry.guard === "G4" || entry.guard === "G5" ? "FALLBACK" : entry.outcome })));
  }
  return input.explorationDraw < input.policy.explorationShare
    ? decision("EXPLORATION", next.modelId, input.policy.explorationShare)
    : decision("LEARNED", best.modelId, 1 - input.policy.explorationShare);
}

export type Scoreability = "SCOREABLE" | "PERMANENTLY_UNSCOREABLE" | "DISPUTED";

export interface SettlementOutcomeInput {
  readonly outcomeAttemptId: string;
  readonly answerId: string;
  readonly answerVersion: number;
  readonly asOf: Date;
  readonly runId: string;
  readonly modelId: string;
  readonly modelVersion: string;
  readonly provider: string;
  readonly taskClass: string;
  readonly prior: number;
  readonly posterior: number;
  readonly basis: string;
  readonly resolverRef: string;
  readonly resolverIsExternal: boolean;
  readonly resolvedOutcome: boolean;
  readonly resolvedAt: Date;
  readonly provenanceRef: string;
  readonly scoreability: Scoreability;
  readonly actorRef: string;
}

export interface SettlementPolicy {
  readonly properScore: RegisteredProperScore;
  readonly calibration: CalibrationStrategy;
  readonly metric: string;
}

export type SettlementResult =
  | { readonly kind: "INCOMPLETE_RUN_SKIPPED"; readonly runId: string }
  | { readonly kind: "SETTLED"; readonly answerOutcomeId: string; readonly readBackLedgerEntryId: string; readonly scorecardCellId: string | null }
  | { readonly kind: "SUPERSEDED_ATTEMPT"; readonly answerOutcomeId: string; readonly supersededByAnswerOutcomeId: string; readonly readBackLedgerEntryId: string };

function settlementHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function appendSettlementLedger(client: PoolClient, prepared: PreparedRunContentCipher | null, input: {
  readonly runId: string;
  readonly actionKind: string;
  readonly subjectItemId: string;
  readonly actorRef: string;
  readonly inputHash: string;
  readonly contractHash: string;
  readonly at: Date;
}): Promise<{ readonly id: string; readonly sequence: number }> {
  const ledgerEntryId = randomUUID();
  const sequence = await allocateSequence(client);
  const inserted = await client.query<{ ledger_entry_id: string }>(
    `INSERT INTO ledger.ledger_entry (
       ledger_entry_id,sequence,run_id,action_kind,call_site_key,subject_item_id,stance_at_action,
       outcome,actor_ref,input_hash,input_hash_version,contract_hash,started_at,finished_at
     ) VALUES ($1,$2,$3,$4,'settlement.watch',$5,'UNASSIGNED','OK',$6,$7,$8,$9,$10,$10)
     RETURNING ledger_entry_id`,
    [ledgerEntryId,sequence,input.runId,input.actionKind,input.subjectItemId,input.actorRef,
      input.inputHash,1,input.contractHash,input.at]
  );
  return Object.freeze({ id: inserted.rows[0]!.ledger_entry_id, sequence });
}

function validateSettlement(input: SettlementOutcomeInput, policy: SettlementPolicy): void {
  for (const [name, value] of Object.entries({
    outcomeAttemptId: input.outcomeAttemptId,
    answerId: input.answerId,
    runId: input.runId,
    modelId: input.modelId,
    modelVersion: input.modelVersion,
    provider: input.provider,
    taskClass: input.taskClass,
    basis: input.basis,
    resolverRef: input.resolverRef,
    provenanceRef: input.provenanceRef,
    actorRef: input.actorRef,
    metric: policy.metric
  })) assertNonBlank(value, name);
  assertUnitInterval(input.prior, "prior");
  assertUnitInterval(input.posterior, "posterior");
  if (!input.resolverIsExternal) throw new TypedDomainError("EXTERNAL_RESOLVER_REQUIRED", "Q59 refuses self-resolution");
  if (input.scoreability === "DISPUTED") {
    throw new TypedDomainError("DISPUTED_RESOLUTION_REQUIRES_HUMAN", "A disputed resolution routes to a human and is never self-graded");
  }
  if (!Number.isInteger(input.answerVersion) || input.answerVersion < 1
    || !Number.isFinite(input.asOf.getTime()) || !Number.isFinite(input.resolvedAt.getTime())) {
    throw new TypedDomainError("SETTLEMENT_IDENTITY_INVALID", "Answer version and settlement instants must be valid");
  }
}

function databaseScore(row: {
  readonly answer_outcome_id: string;
  readonly model_id: string;
  readonly model_version: string;
  readonly provider: string;
  readonly task_class: string;
  readonly prior: number;
  readonly posterior: number;
  readonly resolved_outcome: boolean;
  readonly proper_score_total: number;
  readonly proper_score_decomposition: ProperScore;
  readonly proper_score_row_key: string;
  readonly proper_score_register_version: string;
  readonly proper_score_source_ref: string;
  readonly at_seq: string;
}): RecordedProperScore {
  return Object.freeze({
    outcomeRef: row.answer_outcome_id,
    modelId: row.model_id,
    modelVersion: row.model_version,
    provider: row.provider,
    taskClass: row.task_class,
    prior: Number(row.prior),
    posterior: Number(row.posterior),
    resolvedOutcome: row.resolved_outcome,
    ledgerSequence: Number(row.at_seq),
    ...row.proper_score_decomposition,
    total: Number(row.proper_score_total),
    definition: Object.freeze({
      rowKey: row.proper_score_row_key,
      registerVersion: Number(row.proper_score_register_version),
      sourceRef: row.proper_score_source_ref
    })
  });
}

// The repository owns persistence; the arithmetic above remains independently
// replayable and contains no I/O, clock, randomness, or model call.
export class SettlementRepository {
  constructor(private readonly pool: Pool) {}

  async settle(input: SettlementOutcomeInput, policy: SettlementPolicy): Promise<SettlementResult> {
    validateSettlement(input, policy);
    const leasedContent = await prepareLeasedContentEncryptionForRun(this.pool, input.runId);
    const preparedContent = leasedContent.prepared;
    try {
      return await withWriteTransaction(this.pool, async (client) => {
      const terminal = await client.query(
        `SELECT 1 FROM core.run_progress_event WHERE run_id=$1 AND kind='TERMINAL' LIMIT 1`,
        [input.runId]
      );
      if (terminal.rowCount === 0) return Object.freeze({ kind: "INCOMPLETE_RUN_SKIPPED" as const, runId: input.runId });
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`settlement:${input.answerId}:${input.answerVersion}:${input.asOf.toISOString()}`]
      );
      const priorWinner = await client.query<{ answer_outcome_id: string }>(
        `SELECT answer_outcome_id FROM scorecard.answer_outcome
         WHERE answer_id=$1 AND answer_version=$2 AND as_of=$3 AND accepted
         ORDER BY at_seq LIMIT 1`,
        [input.answerId, input.answerVersion, input.asOf]
      );
      const winner = priorWinner.rows[0];
      const accepted = winner === undefined;
      const score = accepted && input.scoreability === "SCOREABLE"
        ? recordProperScore({
          outcomeRef: input.outcomeAttemptId,
          modelId: input.modelId,
          modelVersion: input.modelVersion,
          provider: input.provider,
          taskClass: input.taskClass,
          prior: input.prior,
          posterior: input.posterior,
          resolvedOutcome: input.resolvedOutcome,
          ledgerSequence: 1,
          definition: policy.properScore
        })
        : null;
      await client.query(
        `INSERT INTO scorecard.model_identity (
           provider, model_id, model_version, observed_as_of, provenance_ref, at_seq
         ) VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (provider, model_id, model_version, observed_as_of) DO NOTHING`,
        [
          input.provider, input.modelId, input.modelVersion, input.asOf,
          input.provenanceRef, await allocateSequence(client)
        ]
      );
      const outcomeSequence = await allocateSequence(client);
      const inserted = await client.query<{ answer_outcome_id: string }>(
        `INSERT INTO scorecard.answer_outcome (
           outcome_attempt_id, answer_id, answer_version, as_of, run_id,
           model_id, model_version, provider, task_class, prior, posterior, basis,
           resolver_ref, resolver_is_external, resolved_outcome, resolved_at,
           provenance_ref, scoreability, accepted, superseded_by_answer_outcome_id,
           proper_score_total, proper_score_decomposition, proper_score_row_key,
           proper_score_register_version, proper_score_source_ref, at_seq
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
           $21,$22::jsonb,$23,$24,$25,$26
         ) RETURNING answer_outcome_id`,
        [
          input.outcomeAttemptId, input.answerId, input.answerVersion, input.asOf, input.runId,
          input.modelId, input.modelVersion, input.provider, input.taskClass, input.prior, input.posterior,
          input.basis, input.resolverRef, input.resolverIsExternal, input.resolvedOutcome, input.resolvedAt,
          input.provenanceRef, input.scoreability, accepted, winner?.answer_outcome_id ?? null,
          score?.total ?? null, score === null ? null : JSON.stringify({
            total: score.total,
            reliability: score.reliability,
            resolution: score.resolution,
            uncertainty: score.uncertainty
          }),
          score?.definition.rowKey ?? null, score?.definition.registerVersion ?? null,
          score?.definition.sourceRef ?? null, outcomeSequence
        ]
      );
      const answerOutcomeId = inserted.rows[0]!.answer_outcome_id;
      const readBack = await client.query<{
        outcome_attempt_id: string;
        answer_id: string;
        answer_version: number;
        as_of: Date;
        run_id: string;
        model_id: string;
        model_version: string;
        provider: string;
        task_class: string;
        prior: number;
        posterior: number;
        basis: string;
        resolver_ref: string;
        resolver_is_external: boolean;
        resolved_outcome: boolean;
        resolved_at: Date;
        provenance_ref: string;
        scoreability: Scoreability;
        accepted: boolean;
        superseded_by_answer_outcome_id: string | null;
        proper_score_total: number | null;
        proper_score_decomposition: ProperScore | null;
        proper_score_row_key: string | null;
        proper_score_register_version: string | null;
        proper_score_source_ref: string | null;
        at_seq: string;
      }>(
        `SELECT outcome_attempt_id, answer_id, answer_version, as_of, run_id,
                model_id, model_version, provider, task_class, prior, posterior, basis,
                resolver_ref, resolver_is_external, resolved_outcome, resolved_at,
                provenance_ref, scoreability, accepted, superseded_by_answer_outcome_id,
                proper_score_total, proper_score_decomposition, proper_score_row_key,
                proper_score_register_version::text, proper_score_source_ref, at_seq::text
         FROM scorecard.answer_outcome WHERE answer_outcome_id=$1`,
        [answerOutcomeId]
      );
      const verified = readBack.rows[0];
      if (verified === undefined
        || verified.outcome_attempt_id !== input.outcomeAttemptId
        || verified.answer_id !== input.answerId
        || verified.answer_version !== input.answerVersion
        || verified.as_of.getTime() !== input.asOf.getTime()
        || verified.run_id !== input.runId
        || verified.model_id !== input.modelId
        || verified.model_version !== input.modelVersion
        || verified.provider !== input.provider
        || verified.task_class !== input.taskClass
        || Number(verified.prior) !== input.prior
        || Number(verified.posterior) !== input.posterior
        || verified.basis !== input.basis
        || verified.resolver_ref !== input.resolverRef
        || verified.resolver_is_external !== input.resolverIsExternal
        || verified.resolved_outcome !== input.resolvedOutcome
        || verified.resolved_at.getTime() !== input.resolvedAt.getTime()
        || verified.provenance_ref !== input.provenanceRef
        || verified.scoreability !== input.scoreability
        || verified.accepted !== accepted
        || verified.superseded_by_answer_outcome_id !== (winner?.answer_outcome_id ?? null)
        || Number(verified.at_seq) !== outcomeSequence
        || (score === null) !== (verified.proper_score_total === null)
        || (score !== null && (
          Number(verified.proper_score_total) !== score.total
          || verified.proper_score_decomposition?.total !== score.total
          || verified.proper_score_decomposition.reliability !== score.reliability
          || verified.proper_score_decomposition.resolution !== score.resolution
          || verified.proper_score_decomposition.uncertainty !== score.uncertainty
          || verified.proper_score_row_key !== score.definition.rowKey
          || Number(verified.proper_score_register_version) !== score.definition.registerVersion
          || verified.proper_score_source_ref !== score.definition.sourceRef
        ))) {
        throw new TypedDomainError("SETTLEMENT_READ_BACK_FAILED", "Q60 could not read back the settlement record byte-for-byte");
      }
      const inputHash = settlementHash({ ...input, asOf: input.asOf.toISOString(), resolvedAt: input.resolvedAt.toISOString() });
      const contractHash = settlementHash({
        properScore: {
          rowKey: policy.properScore.rowKey,
          registerVersion: policy.properScore.registerVersion,
          sourceRef: policy.properScore.sourceRef
        },
        calibration: {
          rowKey: policy.calibration.rowKey,
          registerVersion: policy.calibration.registerVersion,
          sourceRef: policy.calibration.sourceRef
        }
      });
      await appendSettlementLedger(client, preparedContent, {
        runId: input.runId,
        actionKind: accepted ? "SETTLEMENT_OUTCOME_RECORDED" : "SETTLEMENT_ATTEMPT_SUPERSEDED",
        subjectItemId: answerOutcomeId,
        actorRef: input.actorRef,
        inputHash,
        contractHash,
        at: input.resolvedAt
      });
      const readBackLedger = await appendSettlementLedger(client, preparedContent, {
        runId: input.runId,
        actionKind: "SETTLEMENT_READ_BACK_VERIFIED",
        subjectItemId: answerOutcomeId,
        actorRef: input.actorRef,
        inputHash,
        contractHash,
        at: input.resolvedAt
      });
      if (!accepted) {
        return Object.freeze({
          kind: "SUPERSEDED_ATTEMPT" as const,
          answerOutcomeId,
          supersededByAnswerOutcomeId: winner.answer_outcome_id,
          readBackLedgerEntryId: readBackLedger.id
        });
      }
      if (score === null) {
        return Object.freeze({ kind: "SETTLED" as const, answerOutcomeId, readBackLedgerEntryId: readBackLedger.id, scorecardCellId: null });
      }
      const ledgerScores = await client.query<{
        answer_outcome_id: string;
        model_id: string;
        model_version: string;
        provider: string;
        task_class: string;
        prior: number;
        posterior: number;
        resolved_outcome: boolean;
        proper_score_total: number;
        proper_score_decomposition: ProperScore;
        proper_score_row_key: string;
        proper_score_register_version: string;
        proper_score_source_ref: string;
        at_seq: string;
      }>(
        `SELECT answer_outcome_id, model_id, model_version, provider, task_class,
                prior, posterior, resolved_outcome, proper_score_total,
                proper_score_decomposition, proper_score_row_key,
                proper_score_register_version, proper_score_source_ref, at_seq
         FROM scorecard.answer_outcome
         WHERE accepted AND scoreability='SCOREABLE'
           AND model_id=$1 AND model_version=$2 AND provider=$3 AND task_class=$4
         ORDER BY at_seq`,
        [input.modelId, input.modelVersion, input.provider, input.taskClass]
      );
      const cell = deriveScorecardCell(
        ledgerScores.rows.map(databaseScore),
        {
          modelId: input.modelId,
          modelVersion: input.modelVersion,
          provider: input.provider,
          taskClass: input.taskClass,
          metric: policy.metric,
          asOf: input.asOf.toISOString()
        },
        policy.calibration
      );
      const previousVersion = await client.query<{ version: string }>(
        `SELECT coalesce(max(derivation_version),0)::text AS version
         FROM scorecard.scorecard_cell
         WHERE model_id=$1 AND model_version=$2 AND provider=$3 AND task_class=$4 AND metric=$5`,
        [cell.modelId, cell.modelVersion, cell.provider, cell.taskClass, cell.metric]
      );
      const derivationVersion = Number(previousVersion.rows[0]!.version) + 1;
      const cellSequence = await allocateSequence(client);
      const materialised = await client.query<{ scorecard_cell_id: string }>(
        `INSERT INTO scorecard.scorecard_cell (
           derivation_version, model_id, model_version, provider, task_class, metric, as_of,
           value, n, interval_lower, interval_upper, settled_count, unsettled_count,
           permanently_unscoreable_count, abstained_count, basis, proper_score_decomposition,
           derivation_input, derivation_hash, strategy_row_key, strategy_register_version,
           strategy_source_ref, at_seq
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18::jsonb,$19,$20,$21,$22,$23)
         RETURNING scorecard_cell_id`,
        [
          derivationVersion, cell.modelId, cell.modelVersion, cell.provider, cell.taskClass,
          cell.metric, new Date(cell.asOf), cell.value, cell.n, cell.interval?.lower ?? null,
          cell.interval?.upper ?? null, cell.population.settled, cell.population.unsettled,
          cell.population.permanentlyUnscoreable, cell.population.abstained, cell.basis,
          JSON.stringify(cell.decomposition), JSON.stringify(cell.derivationInput), cell.derivationHash,
          cell.strategy.rowKey, cell.strategy.registerVersion, cell.strategy.sourceRef, cellSequence
        ]
      );
      const scorecardCellId = materialised.rows[0]!.scorecard_cell_id;
      await appendSettlementLedger(client, preparedContent, {
        runId: input.runId,
        actionKind: "SCORECARD_DERIVED_FROM_LEDGER",
        subjectItemId: scorecardCellId,
        actorRef: input.actorRef,
        inputHash: cell.derivationHash,
        contractHash,
        at: input.resolvedAt
      });
      return Object.freeze({ kind: "SETTLED" as const, answerOutcomeId, readBackLedgerEntryId: readBackLedger.id, scorecardCellId });
      });
    } finally {
      await leasedContent.close();
    }
  }

  async recordRoutingDecision(input: {
    readonly executionRef: string;
    readonly selectedModelVersion: string | null;
    readonly selectedProvider: string;
    readonly decision: RoutingDecision;
  }): Promise<string> {
    assertNonBlank(input.executionRef, "executionRef");
    assertNonBlank(input.selectedProvider, "selectedProvider");
    return withWriteTransaction(this.pool, async (client) => {
      const decisionSequence = await allocateSequence(client);
      const lane = input.decision.kind === "UNIFORM_PANEL" ? "UNIFORM_PANEL"
        : input.decision.kind === "CRITIC_EXEMPT" ? "CRITIC_EXEMPT" : "SERVED";
      const decision = await client.query<{ routing_decision_id: string }>(
        `INSERT INTO scorecard.routing_decision (
           session_id, task_class, lane, selected_model_id, selected_model_version,
           propensity, guard_trail, policy_row_key, policy_register_version,
           policy_source_ref, at_seq
         ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11)
         RETURNING routing_decision_id`,
        [
          input.executionRef, input.decision.taskClass, lane, input.decision.selectedModelId,
          input.selectedModelVersion, input.decision.propensity, JSON.stringify(input.decision.guardTrail),
          input.decision.policy.rowKey, input.decision.policy.registerVersion,
          input.decision.policy.sourceRef, decisionSequence
        ]
      );
      const routingDecisionId = decision.rows[0]!.routing_decision_id;
      if (input.selectedModelVersion !== null) {
        await client.query(
          `INSERT INTO scorecard.session_assignment (
             session_id, task_class, model_id, model_version, provider,
             routing_decision_id, at_seq
           ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            input.executionRef, input.decision.taskClass, input.decision.selectedModelId,
            input.selectedModelVersion, input.selectedProvider, routingDecisionId,
            await allocateSequence(client)
          ]
        );
      }
      return routingDecisionId;
    });
  }

  async readScorecards(asOf: Date): Promise<readonly DerivedScorecardCell[]> {
    const result = await this.pool.query<{
      model_id: string; model_version: string; provider: string; task_class: string; metric: string;
      as_of: Date; value: number | null; n: number; interval_lower: number | null; interval_upper: number | null;
      settled_count: number; unsettled_count: number; permanently_unscoreable_count: number; abstained_count: number;
      basis: ScorecardBasis; proper_score_decomposition: ProperScore | null; derivation_input: string[]; derivation_hash: string;
      strategy_row_key: string; strategy_register_version: string; strategy_source_ref: string;
    }>(
      `SELECT DISTINCT ON (model_id, model_version, provider, task_class, metric)
              model_id, model_version, provider, task_class, metric, as_of, value, n,
              interval_lower, interval_upper, settled_count, unsettled_count,
              permanently_unscoreable_count, abstained_count, basis,
              proper_score_decomposition, derivation_input, derivation_hash,
              strategy_row_key, strategy_register_version, strategy_source_ref
       FROM scorecard.scorecard_cell WHERE as_of <= $1
       ORDER BY model_id, model_version, provider, task_class, metric, derivation_version DESC`,
      [asOf]
    );
    return Object.freeze(result.rows.map((row) => Object.freeze({
      modelId: row.model_id,
      modelVersion: row.model_version,
      provider: row.provider,
      taskClass: row.task_class,
      metric: row.metric,
      asOf: row.as_of.toISOString(),
      value: row.value === null ? null : Number(row.value),
      n: Number(row.n),
      interval: row.interval_lower === null || row.interval_upper === null ? null : Object.freeze({ lower: Number(row.interval_lower), upper: Number(row.interval_upper) }),
      population: Object.freeze({ settled: Number(row.settled_count), unsettled: Number(row.unsettled_count), permanentlyUnscoreable: Number(row.permanently_unscoreable_count), abstained: Number(row.abstained_count) }),
      basis: row.basis === "MEASURED_OUTCOME" ? "MEASURED_OUTCOME" as const : "NONE" as const,
      decomposition: row.proper_score_decomposition,
      derivationInput: Object.freeze([...row.derivation_input]),
      derivationHash: row.derivation_hash,
      strategy: Object.freeze({ rowKey: row.strategy_row_key, registerVersion: Number(row.strategy_register_version), sourceRef: row.strategy_source_ref })
    })));
  }
}
